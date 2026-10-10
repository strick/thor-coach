import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv } from "./helpers/env.js";

// Exercise the OpenAI code path against the stub.
const env = await setupTestEnv({
  env: { LLM_PROVIDER: "openai", OPENAI_API_KEY: "test-key", OPENAI_MODEL: "gpt-base", OPENAI_ADVICE_MODEL: "gpt-advice" },
});
after(() => env.close());
const llm = await import("../src/llm.js");
const { getSetting, setSetting } = await import("../src/db.js");

test("advice jobs default to the advice model, parsing jobs to the base model", () => {
  const cfg = llm.getLLMConfig();
  for (const k of ["chat", "daily_summary", "weekly_review", "guides", "lab_extraction"]) {
    assert.equal(cfg[k].model, "gpt-advice", k);
    assert.equal(cfg[k].advice, true);
  }
  assert.equal(cfg.workout_parsing.model, "gpt-base");
  assert.equal(cfg.nutrition_parsing.model, "gpt-base");
});

test("routing overrides persist and survive a re-init", async () => {
  const r = await env.request("/api/config/llm", { method: "POST", body: { usage: "chat", provider: "openai", model: "gpt-chatty" } });
  assert.equal(r.status, 200);
  assert.equal(r.json.chat.model, "gpt-chatty");
  assert.equal(r.json.chat.is_default, false);
  assert.deepEqual(JSON.parse(getSetting("llm.routing")).chat, { provider: "openai", model: "gpt-chatty" });

  llm.initLLMConfig(); // what a restart does
  assert.equal(llm.getLLMConfig().chat.model, "gpt-chatty");

  await env.request("/api/config/llm", { method: "POST", body: { reset: true } });
  assert.equal(llm.getLLMConfig().chat.model, "gpt-advice");
  assert.deepEqual(JSON.parse(getSetting("llm.routing")), {});
});

test("legacy weekly_summary routing maps to weekly_review; junk is dropped", () => {
  setSetting("llm.routing", JSON.stringify({ weekly_summary: { provider: "openai", model: "gpt-weekly" }, bogus: { provider: "openai" } }));
  const cfg = llm.initLLMConfig();
  assert.equal(cfg.weekly_review.model, "gpt-weekly");
  assert.equal(cfg.bogus, undefined);
  llm.resetLLMConfig();
});

test("a model that rejects temperature gets it stripped, and remembered", async () => {
  env.stub.reset();
  env.stub.fail(400, {
    message: "Unsupported value: 'temperature' does not support 0.3 with this model. Only the default (1) value is supported.",
    type: "invalid_request_error",
    param: "temperature",
    code: "unsupported_value",
  });
  env.stub.replyJSON({ ok: 1 });
  const { data, model } = await llm.chatJSON("daily_summary", "Reply in JSON.", "hi");
  assert.deepEqual(data, { ok: 1 });
  assert.equal(model, "gpt-advice");
  const [first, second] = env.stub.requests.map((r) => r.body);
  assert.equal(first.temperature, 0.3);
  assert.equal("temperature" in second, false);
  assert.equal(second.reasoning_effort, "low");

  env.stub.replyJSON({ ok: 2 });
  await llm.chatJSON("weekly_review", "Reply in JSON.", "again");
  assert.equal("temperature" in env.stub.last, false, "the rejection is cached per model");
});

test("an unrecognized reasoning_effort is stripped too", async () => {
  env.stub.reset();
  llm.updateLLMConfig("guides", { provider: "openai", model: "gpt-old" });
  env.stub.fail(400, { message: "Unrecognized request argument supplied: reasoning_effort", type: "invalid_request_error", param: null });
  env.stub.replyJSON({ ok: true });
  await llm.chatJSON("guides", "Reply in JSON.", "hi");
  assert.equal(env.stub.requests[0].body.reasoning_effort, "medium");
  assert.equal("reasoning_effort" in env.stub.requests[1].body, false);
  assert.equal(env.stub.requests[1].body.temperature, 0.3);
  llm.resetLLMConfig();
});

test("other API errors are not retried", async () => {
  env.stub.reset();
  env.stub.fail(400, { message: "Invalid 'messages': bad", param: "messages" });
  await assert.rejects(llm.chatJSON("chat", "JSON", "hi"), (err) => err.status === 502);
  assert.equal(env.stub.requests.length, 1);
});

test("PDF parts need an OpenAI model", async () => {
  llm.updateLLMConfig("lab_extraction", { provider: "ollama", model: "llava" });
  const parts = [{ type: "text", text: "extract" }, { type: "file", file: { filename: "a.pdf", file_data: "data:application/pdf;base64,JVBERi0=" } }];
  await assert.rejects(llm.chatJSON("lab_extraction", "JSON", parts), (err) => err.status === 400 && /OpenAI/.test(err.message));
  llm.resetLLMConfig();
});

test("content-part arrays are passed through to the API", async () => {
  env.stub.reset();
  env.stub.replyJSON({ ok: true });
  const parts = [{ type: "text", text: "extract" }, { type: "file", file: { filename: "a.pdf", file_data: "data:application/pdf;base64,JVBERi0=" } }];
  await llm.chatJSON("lab_extraction", "JSON", parts);
  assert.deepEqual(env.stub.last.messages[1].content, parts);
  assert.equal(env.stub.requests[0].headers.authorization, "Bearer test-key");
});

test("OpenAI model list is filtered to chat models", async () => {
  const r = await env.request("/api/openai/models");
  assert.deepEqual(r.json.models, ["gpt-stub", "gpt-stub-mini"]);
});

// Last: this marks gpt-advice as unavailable for the rest of the process.
test("a missing default advice model falls back to the base model", async () => {
  env.stub.reset();
  env.stub.fail(404, { message: "The model `gpt-advice` does not exist", code: "model_not_found" });
  env.stub.replyJSON({ ok: true });
  const { model } = await llm.chatJSON("chat", "JSON", "hi");
  assert.equal(model, "gpt-base");
  assert.equal(env.stub.requests[1].body.model, "gpt-base");
  assert.equal(llm.getLLMConfig().chat.model, "gpt-base");
});
