// Lab flow end to end against the LLM stub (OpenAI path so PDFs are allowed).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { setupTestEnv } from "./helpers/env.js";

const env = await setupTestEnv({ env: { LLM_PROVIDER: "openai", OPENAI_API_KEY: "test-key" } });
after(() => env.close());
const { parseRange } = await import("../src/services/labs.js");
const llm = await import("../src/llm.js");

const RAW = `PATIENT: Sample, Pat Q   DOB 01/01/1980
LDL Chol Calc (NIH)  128  mg/dL  0-99  H
HDL Cholesterol 1.2 mmol/L >1.0
Potassium 6.8 mmol/L 3.5-5.1
Mystery Analyte 3`;

const EXTRACTED = {
  report: { collected_on: "2026-09-01", reported_on: "2026-09-02", lab_name: "Quest Diagnostics", ordering_provider: null },
  results: [
    { name_on_report: "LDL Chol Calc (NIH)", value: 128, unit: "mg/dL", ref_low: 0, ref_high: 99, ref_text: "0-99", flag: "high", marker_key: "ldl_c" },
    { name_on_report: "HDL Cholesterol", value: 1.2, unit: "mmol/L", ref_low: null, ref_high: null, ref_text: ">1.0", flag: null, marker_key: "hdl_c" },
    { name_on_report: "Potassium", value: 6.8, unit: "mmol/L", ref_low: 3.5, ref_high: 5.1, flag: null, marker_key: "potassium" },
    { name_on_report: "Mystery Analyte", value: 3, unit: null, flag: null, marker_key: "made_up_key" },
    { name_on_report: "Hepatitis C Ab", value: null, value_text: "Non-reactive", unit: null, flag: null, marker_key: null },
  ],
};

let reportId;

test("reference-range text parsing", () => {
  assert.deepEqual(parseRange("3.5-5.1"), { low: 3.5, high: 5.1 });
  assert.deepEqual(parseRange("3.5 – 5.1 mmol/L"), { low: 3.5, high: 5.1 });
  assert.deepEqual(parseRange("<100"), { low: null, high: 100 });
  assert.deepEqual(parseRange("> 39"), { low: 39, high: null });
  assert.deepEqual(parseRange("1,000-4,000"), { low: 1000, high: 4000 });
  assert.deepEqual(parseRange("Negative"), { low: null, high: null });
});

test("pasted text: extraction normalizes, flags, converts and warns", async () => {
  reportId = (await env.request("/api/labs/reports", { method: "POST", body: { source: "text", raw_text: RAW } })).json.id;
  env.stub.reset();
  env.stub.replyJSON(EXTRACTED);
  const r = await env.request(`/api/labs/reports/${reportId}/extract`, { method: "POST" });
  assert.equal(r.status, 200, r.text);
  const rep = r.json;

  const sent = env.stub.last;
  assert.equal(sent.model, "gpt-5-mini", "lab extraction is an advice-model job");
  assert.equal(typeof sent.messages[1].content, "string", "pasted text goes as plain text");
  assert.match(sent.messages[1].content, /LDL Chol Calc/);
  assert.match(sent.messages[1].content, /ldl_c: LDL cholesterol/);
  assert.match(sent.messages[0].content, /Leave out patient identifiers/);

  assert.equal(rep.status, "draft");
  assert.equal(rep.collected_on, "2026-09-01");
  assert.equal(rep.lab_name, "Quest Diagnostics");
  assert.equal(rep.raw_text, undefined, "raw text isn't sent back to the browser");
  const by = Object.fromEntries(rep.results.map((x) => [x.name_on_report, x]));
  assert.equal(by["LDL Chol Calc (NIH)"].flag, "high");
  assert.equal(by["HDL Cholesterol"].marker_key, "hdl_c");
  assert.ok(Math.abs(by["HDL Cholesterol"].canonical_value - 46.4) < 0.1);
  assert.equal(by["HDL Cholesterol"].ref_low, 1.0, "one-sided range parsed from ref_text");
  assert.ok(Math.abs(by["HDL Cholesterol"].canonical_ref_low - 38.67) < 0.01);
  assert.equal(by["HDL Cholesterol"].flag, "normal");
  assert.equal(by.Potassium.flag, "critical_high");
  assert.equal(by["Mystery Analyte"].marker_key, null, "invalid LLM marker keys are dropped");
  assert.equal(by["Hepatitis C Ab"].value_text, "Non-reactive");
  assert.ok(rep.warnings.some((w) => /aren't matched/.test(w)));
  assert.ok(rep.warnings.some((w) => /^Critical value: Potassium 6.8/.test(w)));
});

test("drafts never count toward latest values or trends", async () => {
  assert.deepEqual((await env.request("/api/labs/latest")).json, []);
  assert.deepEqual((await env.request("/api/labs/trends?marker=ldl_c")).json.points, []);
});

test("review: user's marker choice wins, and confirm needs a date", async () => {
  const rep = (await env.request(`/api/labs/reports/${reportId}`)).json;
  const rows = rep.results.map((r) => ({ ...r, value: r.value_num }));
  rows.find((r) => r.name_on_report === "Mystery Analyte").marker_key = "uric_acid";
  rows.find((r) => r.name_on_report === "Mystery Analyte").unit = "mg/dL";
  const noDate = await env.request(`/api/labs/reports/${reportId}`, { method: "PUT", body: { collected_on: "", results: rows, confirm: true } });
  assert.equal(noDate.status, 400);
  const ok = await env.request(`/api/labs/reports/${reportId}`, { method: "PUT", body: { collected_on: "2026-09-01", results: rows, confirm: true } });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(ok.json.status, "confirmed");
  assert.equal(ok.json.results.find((r) => r.name_on_report === "Mystery Analyte").marker_key, "uric_acid");
});

test("latest values by panel, then a second report adds a delta and a trend", async () => {
  let panels = (await env.request("/api/labs/latest")).json;
  const ldl = () => panels.flatMap((p) => p.markers).find((m) => m.key === "ldl_c");
  assert.equal(panels[0].panel, "Lipids");
  assert.equal(ldl().latest.value, 128);
  assert.equal(ldl().out_of_range, true);

  const second = (await env.request("/api/labs/reports", { method: "POST", body: { source: "manual" } })).json.id;
  await env.request(`/api/labs/reports/${second}`, {
    method: "PUT",
    body: { collected_on: "2026-10-01", results: [{ name_on_report: "LDL", value: 2.85, unit: "mmol/L", ref_high: 2.56 }], confirm: true },
  });
  panels = (await env.request("/api/labs/latest")).json;
  assert.ok(Math.abs(ldl().latest.value - 110.2) < 0.1, "converted to mg/dL");
  assert.equal(ldl().previous.value, 128);
  assert.ok(Math.abs(ldl().delta - -17.8) < 0.1);
  assert.equal(ldl().better, "lower");

  const t = (await env.request("/api/labs/trends?marker=ldl_c")).json;
  assert.deepEqual(t.points.map((p) => p.collected_on), ["2026-09-01", "2026-10-01"]);
  assert.ok(Math.abs(t.band.high - 99) < 0.1);
});

test("lab explainer: structured rows only, server-inserted critical banner, one per report", async () => {
  env.stub.reset();
  env.stub.replyJSON({ markdown: "## The big picture\nMostly fine." });
  const g = (await env.request(`/api/labs/reports/${reportId}/explain`, { method: "POST" })).json;
  assert.equal(g.kind, "lab_explainer");
  assert.match(g.markdown, /^> \*\*Contact your doctor promptly\.\*\* Potassium 6\.8/);
  assert.match(g.markdown, /Mostly fine/);
  const [system, user] = env.stub.last.messages.map((m) => m.content);
  assert.match(system, /## Questions for your doctor/);
  assert.match(system, /health pal/);
  assert.doesNotMatch(user, /PATIENT: Sample/, "raw report text never reaches the explainer");
  assert.match(user, /marker_notes/);
  assert.match(user, /hemolyzed/, "confounder notes for the markers present");

  env.stub.replyJSON({ markdown: "## The big picture\nRewritten." });
  const again = (await env.request(`/api/labs/reports/${reportId}/explain`, { method: "POST" })).json;
  assert.equal(again.id, g.id);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM guides WHERE kind = 'lab_explainer'").get().n, 1);
  assert.equal((await env.request(`/api/labs/reports/${reportId}`)).json.explainer_id, g.id);
});

test("PDFs go to the model as file parts, photos as images", async () => {
  const id = (await env.request("/api/labs/reports", { method: "POST", body: { source: "upload" } })).json.id;
  await env.request(`/api/labs/reports/${id}/files`, { method: "POST", body: Buffer.from("%PDF-1.4\nreport"), headers: { "Content-Type": "application/pdf" } });
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
  await env.request(`/api/labs/reports/${id}/files`, { method: "POST", body: jpeg, headers: { "Content-Type": "image/jpeg" } });
  env.stub.reset();
  env.stub.replyJSON({ report: {}, results: [{ name_on_report: "Glucose", value: 92, unit: "mg/dL", ref_low: 65, ref_high: 99 }] });
  const r = await env.request(`/api/labs/reports/${id}/extract`, { method: "POST" });
  assert.equal(r.status, 200, r.text);
  const parts = env.stub.last.messages[1].content;
  assert.equal(parts[0].type, "text");
  assert.equal(parts[1].type, "file");
  assert.match(parts[1].file.file_data, /^data:application\/pdf;base64,JVBERi0xLjQK/);
  assert.equal(parts[2].type, "image_url");
  assert.match(parts[2].image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(r.json.results[0].flag, "normal");

  // Routed to Ollama, PDFs get a clear error instead of a garbled read.
  llm.updateLLMConfig("lab_extraction", { provider: "ollama", model: "llava" });
  const blocked = await env.request(`/api/labs/reports/${id}/extract`, { method: "POST" });
  assert.equal(blocked.status, 400);
  assert.match(blocked.json.error, /OpenAI/);
  llm.resetLLMConfig();
});

test("an extraction with no results keeps the draft and says so", async () => {
  const id = (await env.request("/api/labs/reports", { method: "POST", body: { source: "text", raw_text: "nothing useful" } })).json.id;
  env.stub.reset();
  env.stub.replyJSON({ report: {}, results: [] });
  const r = await env.request(`/api/labs/reports/${id}/extract`, { method: "POST" });
  assert.equal(r.status, 502);
  assert.equal((await env.request(`/api/labs/reports/${id}`)).json.status, "draft");
});

test("labs reach the daily summary and chat", async () => {
  env.stub.reset();
  env.stub.replyJSON({ markdown: "## Today at a glance\nok" });
  await env.request("/api/daily-summary", { method: "POST", body: {} });
  assert.match(env.stub.last.messages[1].content, /"labs":\{"most_recent_draw":"2026-10-01"/);

  env.stub.reset();
  env.stub.replyToolCalls([{ name: "get_lab_results", args: { marker: "ldl_c" } }]);
  env.stub.reply("Your LDL dropped from 128 to 110.");
  const r = await env.request("/api/chat", { method: "POST", body: { messages: [{ role: "user", content: "how's my LDL trending?" }] } });
  assert.equal(r.status, 200);
  const tool = env.stub.requests[1].body.messages.find((m) => m.role === "tool");
  assert.match(tool.content, /"2026-09-01"/);
});

test("deleting a report removes its rows, files on disk and explainer", async () => {
  const files = env.db.prepare("SELECT stored_name FROM lab_report_files").all();
  const ids = env.db.prepare("SELECT id FROM lab_reports").all().map((r) => r.id);
  for (const id of ids) assert.equal((await env.request(`/api/labs/reports/${id}`, { method: "DELETE" })).status, 200);
  for (const f of files) assert.equal(existsSync(path.join(env.dir, "uploads", "labs", f.stored_name)), false);
  for (const t of ["lab_results", "lab_report_files", "guides"]) {
    assert.equal(env.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n, 0, t);
  }
});
