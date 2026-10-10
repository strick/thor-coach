import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv } from "./helpers/env.js";

const env = await setupTestEnv();
after(() => env.close());
const guides = await import("../src/services/guides.js");
const { renderMarkdown } = await import("../public/js/ui.js");

// --- Chat that remembers ------------------------------------------------------

test("chat history persists server-side and is sent back to the model", async () => {
  env.stub.reset();
  env.stub.reply("Hi! How can I help?");
  const first = await env.request("/api/chat", { method: "POST", body: { message: "hello" } });
  assert.equal(first.status, 200);
  const h = (await env.request("/api/chat/history")).json;
  assert.deepEqual(h.messages.map((m) => [m.role, m.content]), [["user", "hello"], ["assistant", "Hi! How can I help?"]]);

  env.stub.reply("Sure.");
  await env.request("/api/chat", { method: "POST", body: { message: "and again" } });
  const sent = env.stub.last.messages.map((m) => [m.role, m.content]);
  assert.deepEqual(sent.slice(1), [["user", "hello"], ["assistant", "Hi! How can I help?"], ["user", "and again"]]);
});

test("a failed turn saves nothing; the legacy {messages} body still works", async () => {
  const before = (await env.request("/api/chat/history")).json.messages.length;
  env.stub.reset();
  env.stub.fail(500, { message: "upstream down" });
  const r = await env.request("/api/chat", { method: "POST", body: { message: "will fail" } });
  assert.equal(r.status, 502);
  assert.equal((await env.request("/api/chat/history")).json.messages.length, before);

  env.stub.reply("ok");
  const legacy = await env.request("/api/chat", { method: "POST", body: { messages: [{ role: "user", content: "old client" }] } });
  assert.equal(legacy.status, 200);
  assert.equal((await env.request("/api/chat", { method: "POST", body: {} })).status, 400);
});

test("remember tool saves a memory that shows up in the next prompt; forget removes it", async () => {
  env.stub.reset();
  env.stub.replyToolCalls([{ name: "remember", args: { content: "Doctor wants LDL under 100 by March", category: "doctor" } }]);
  env.stub.reply("Got it — I'll keep that in mind.");
  const r = (await env.request("/api/chat", { method: "POST", body: { message: "remember my doctor wants LDL under 100 by March" } })).json;
  assert.equal(r.memory_saved, true);
  const mems = (await env.request("/api/memories")).json;
  assert.equal(mems.length, 1);
  assert.equal(mems[0].source, "chat");
  assert.equal(mems[0].category, "doctor");

  env.stub.reply("Noted.");
  await env.request("/api/chat", { method: "POST", body: { message: "what's my LDL goal?" } });
  assert.match(env.stub.last.messages[0].content, /Doctor wants LDL under 100 by March/);

  // and in the daily summary
  env.stub.replyJSON({ markdown: "## Today at a glance\nok" });
  await env.request("/api/daily-summary", { method: "POST", body: {} });
  assert.match(env.stub.last.messages[1].content, /Doctor wants LDL under 100/);

  assert.equal((await env.request(`/api/memories/${mems[0].id}`, { method: "DELETE" })).status, 200);
  assert.equal((await env.request("/api/memories")).json.length, 0);
});

test("memories: manual add, de-duplication, validation", async () => {
  const a = (await env.request("/api/memories", { method: "POST", body: { content: "Lactose intolerant" } })).json;
  assert.equal(a.source, "manual");
  const b = (await env.request("/api/memories", { method: "POST", body: { content: "  lactose   intolerant " } })).json;
  assert.equal(b.id, a.id, "same memory isn't stored twice");
  assert.equal((await env.request("/api/memories", { method: "POST", body: { content: "" } })).status, 400);
  assert.equal((await env.request("/api/memories", { method: "POST", body: { content: "x".repeat(501) } })).status, 400);
  const edited = (await env.request(`/api/memories/${a.id}`, { method: "PATCH", body: { content: "Lactose intolerant (mild)" } })).json;
  assert.equal(edited.content, "Lactose intolerant (mild)");
});

test("a new conversation starts empty but memories carry over", async () => {
  await env.request("/api/chat/new", { method: "POST" });
  assert.equal((await env.request("/api/chat/history")).json.messages.length, 0);
  env.stub.reset();
  env.stub.reply("Hello again.");
  await env.request("/api/chat", { method: "POST", body: { message: "hi" } });
  assert.equal(env.stub.last.messages.length, 2, "system + new message only");
  assert.match(env.stub.last.messages[0].content, /Lactose intolerant/);
});

// --- Weekly review ----------------------------------------------------------

test("default review week: Sunday reviews this week, other days the last full week", () => {
  assert.equal(guides.defaultReviewWeek("2026-10-11"), "2026-10-05"); // Sunday
  assert.equal(guides.defaultReviewWeek("2026-10-12"), "2026-10-05"); // Monday
  assert.equal(guides.defaultReviewWeek("2026-10-10"), "2026-09-28"); // Saturday
});

test("weekly metrics are computed, not guessed", async () => {
  await env.request("/api/running/sessions", { method: "POST", body: { session_date: "2026-09-29", distance_miles: 4, duration_minutes: 40 } });
  await env.request("/api/running/sessions", { method: "POST", body: { session_date: "2026-10-04", distance_miles: 8.5, duration_minutes: 90 } });
  await env.request("/api/headaches", { method: "POST", body: { date: "2026-10-01", peak_severity: 6, meds: [{ name: "Ibuprofen" }] } });
  await env.request("/api/checkins", { method: "PUT", body: { date: "2026-10-01", sleep_hours: 5.5, stress: 4 } });
  const m = guides.weekMetrics("2026-09-28");
  assert.equal(m.week, "2026-09-28..2026-10-04");
  assert.equal(m.running.runs, 2);
  assert.equal(m.running.miles, 12.5);
  assert.equal(m.running.long_run_miles, 8.5);
  assert.equal(m.headaches.count, 1);
  assert.equal(m.headaches.days_with_acute_meds, 1);
  assert.equal(m.checkins.avg_sleep_hours, 5.5);
  assert.equal(m.food.days_logged, "0 of 7");
});

test("weekly review: one per week, compares to last week, regenerates in place", async () => {
  env.stub.reset();
  env.stub.replyJSON({ markdown: "## The week in brief\nA solid running week." });
  const g = (await env.request("/api/guides/weekly-review", { method: "POST", body: { week_start: "2026-09-30" } })).json;
  assert.equal(g.kind, "weekly_review");
  assert.equal(g.period_start, "2026-09-28", "any day snaps to its Monday");
  assert.equal(g.title, "Week of Sep 28–Oct 4");
  const payload = JSON.parse(env.stub.last.messages[1].content);
  assert.equal(payload.this_week.running.miles, 12.5);
  assert.ok(payload.last_week.week.startsWith("2026-09-21"));
  assert.match(env.stub.last.messages[0].content, /## Headaches, sleep & stress/);

  env.stub.replyJSON({ markdown: "## The week in brief\nRewritten." });
  const again = (await env.request(`/api/guides/${g.id}/regenerate`, { method: "POST" })).json;
  assert.equal(again.id, g.id);
  assert.match(again.markdown, /Rewritten/);
  assert.equal(env.db.prepare("SELECT COUNT(*) AS n FROM guides WHERE kind = 'weekly_review'").get().n, 1);
  assert.equal((await env.request("/api/guides/weekly-review", { method: "POST", body: { week_start: "2099-01-05" } })).status, 400);
});

// --- Deep dives + library ---------------------------------------------------------

test("deep dive: personalized, saved with the data it saw, refreshable", async () => {
  env.stub.reset();
  env.stub.replyJSON({ title: "Your sleep and your headaches", markdown: "## The short answer\nShort nights line up with headaches." });
  const g = (await env.request("/api/guides/deep-dive", { method: "POST", body: { topic: "Is my sleep causing my headaches?" } })).json;
  assert.equal(g.kind, "deep_dive");
  assert.equal(g.title, "Your sleep and your headaches");
  assert.equal(g.has_context, true);
  const sys = env.stub.last.messages[0].content;
  assert.match(sys, /## What your data shows/);
  assert.match(sys, /health pal/);
  const ctx = (await env.request(`/api/guides/${g.id}/context`)).json;
  assert.equal(ctx.topic, "Is my sleep causing my headaches?");
  assert.ok(ctx.user_data.headaches_90d, "headache data included");
  assert.ok(ctx.user_data.memories, "memories included");

  env.stub.replyJSON({ title: "Sleep and headaches, revisited", markdown: "## The short answer\nStill true." });
  const again = (await env.request(`/api/guides/${g.id}/regenerate`, { method: "POST" })).json;
  assert.equal(again.id, g.id);
  assert.equal(again.title, "Sleep and headaches, revisited");

  assert.equal((await env.request("/api/guides/deep-dive", { method: "POST", body: { topic: "  " } })).status, 400);
});

test("library: filter, pin, rename, delete; suggestions", async () => {
  const all = (await env.request("/api/guides")).json;
  assert.equal(all.length, 2);
  assert.ok(all.every((g) => g.excerpt && !("markdown" in g) && !("context_json" in g)));
  assert.equal((await env.request("/api/guides?kind=deep_dive")).json.length, 1);
  assert.equal((await env.request("/api/guides?kind=nonsense")).status, 400);

  const dive = all.find((g) => g.kind === "deep_dive");
  await env.request(`/api/guides/${dive.id}`, { method: "PATCH", body: { pinned: true, title: "Sleep & headaches" } });
  const pinned = (await env.request("/api/guides?pinned=1")).json;
  assert.deepEqual(pinned.map((g) => g.title), ["Sleep & headaches"]);
  assert.equal((await env.request("/api/guides")).json[0].id, dive.id, "pinned first");

  const s = (await env.request("/api/guides/suggestions")).json.topics;
  assert.ok(s.length >= 2 && s.length <= 6);
  assert.ok(s.includes("Building my weekly mileage safely"));

  assert.equal((await env.request(`/api/guides/${dive.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await env.request(`/api/guides/${dive.id}`)).status, 404);
});

test("chat can read guides and the weekly review", async () => {
  env.stub.reset();
  env.stub.replyToolCalls([{ name: "get_weekly_review", args: {} }]);
  env.stub.reply("Your last review said it was a solid running week.");
  await env.request("/api/chat", { method: "POST", body: { message: "what did my weekly review say?" } });
  const tool = env.stub.requests[1].body.messages.find((m) => m.role === "tool");
  assert.match(tool.content, /Rewritten/);
});

// --- Markdown rendering ----------------------------------------------------------

test("markdown: numbered lists and callouts render; HTML stays escaped", () => {
  const html = renderMarkdown("## Try\n1. Walk\n2. Sleep\n- a\n> **Note:** call your doctor\n<script>alert(1)</script>");
  assert.match(html, /<ol>\n<li>Walk<\/li>\n<li>Sleep<\/li>\n<\/ol>/);
  assert.match(html, /<ul>\n<li>a<\/li>\n<\/ul>/);
  assert.match(html, /<blockquote>\n<p><strong>Note:<\/strong> call your doctor<\/p>\n<\/blockquote>/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
