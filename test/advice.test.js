// Every advice prompt goes out with the health-pal persona, the user's
// profile and meds, and none of the old drill-sergeant framing.
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv } from "./helpers/env.js";

const env = await setupTestEnv();
after(() => env.close());
const { todayISO } = await import("../src/config.js");
const today = todayISO();
const BANNED = /Goggins|James Cameron|Doing Wrong|long-distance running|Tell him/i;

before(async () => {
  await env.request("/api/medications", { method: "POST", body: { name: "Atorvastatin", dose: "20 mg", frequency: "daily" } });
  await env.request("/api/body", { method: "PUT", body: { date: today, weight_lbs: 188.4 } });
  await env.request("/api/running/sessions", {
    method: "POST",
    body: { session_date: today, distance_miles: 8.2, duration_minutes: 78, avg_heart_rate: 142, max_heart_rate: 171 },
  });
});

test("daily summary: persona, profile, meds, running context and new headings", async () => {
  env.stub.reset();
  env.stub.replyJSON({ markdown: "## Today at a glance\nGood day.\n\n## Try tomorrow\n- Walk after lunch" });
  const r = await env.request("/api/daily-summary", { method: "POST", body: { date: today } });
  assert.equal(r.status, 200);
  assert.match(r.json.markdown, /Today at a glance/);

  const [system, user] = env.stub.last.messages.map((m) => m.content);
  assert.match(system, /health pal/);
  assert.match(system, /## Today at a glance/);
  assert.match(system, /## Try tomorrow/);
  assert.match(system, /Never tell the user to start, stop, or change the dose/);
  assert.doesNotMatch(system, BANNED);
  assert.match(user, /High cholesterol/);
  assert.match(user, /Atorvastatin/);
  assert.match(user, /"running_8w"/);
  assert.match(user, /188\.4/);
  assert.equal(env.stub.last.response_format.type, "json_object");

  const stored = (await env.request(`/api/daily-summary/${today}`)).json;
  assert.match(stored.markdown, /Good day/);
});

test("chat: persona + profile in the system prompt, profile tool available", async () => {
  env.stub.reset();
  env.stub.replyToolCalls([{ name: "get_health_profile", args: {} }]);
  env.stub.reply("You're on **atorvastatin** 20 mg.");
  const r = await env.request("/api/chat", { method: "POST", body: { messages: [{ role: "user", content: "what meds am I on?" }] } });
  assert.equal(r.status, 200);
  assert.match(r.json.reply, /atorvastatin/);
  assert.deepEqual(r.json.tool_calls.map((t) => t.name), ["get_health_profile"]);

  const first = env.stub.requests[0].body;
  assert.match(first.messages[0].content, /health pal/);
  assert.match(first.messages[0].content, /Atorvastatin/);
  assert.doesNotMatch(first.messages[0].content, BANNED);
  assert.ok(first.tools.some((t) => t.function.name === "get_health_profile"));
  const toolResult = env.stub.requests[1].body.messages.find((m) => m.role === "tool");
  assert.match(toolResult.content, /High cholesterol/);
});

test("weekly summary uses the persona and the weekly_review job", async () => {
  env.stub.reset();
  env.stub.replyJSON({ summary: "Solid week." });
  const r = await env.request("/api/weekly-summaries/generate", { method: "POST", body: {} });
  assert.equal(r.status, 200);
  assert.equal(r.json.summary_text, "Solid week.");
  assert.match(env.stub.last.messages[0].content, /health pal/);
  assert.doesNotMatch(env.stub.last.messages[0].content, BANNED);
  assert.match(env.stub.last.messages[1].content, /long_run_miles/);
});
