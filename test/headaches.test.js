import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv } from "./helpers/env.js";

const env = await setupTestEnv();
after(() => env.close());
const { ensureSchemaAndSeed, db, setSetting } = await import("../src/db.js");
const { todayISO } = await import("../src/config.js");
const { addDays } = await import("../src/util.js");
const today = todayISO();

test("legacy migraine events migrate once, and deletions stick", () => {
  db.prepare("INSERT INTO health_events (id, date, category, intensity, notes) VALUES (?, ?, 'migraine', ?, ?)").run("ev-1", "2026-06-28", 8, null);
  db.prepare("INSERT INTO health_events (id, date, category, intensity, notes) VALUES (?, ?, 'migraine', ?, ?)").run("ev-2", "2026-07-07", 7, "Bad sleep");
  db.prepare("INSERT INTO health_events (id, date, category, intensity) VALUES (?, ?, 'sleep', ?)").run("ev-3", "2026-07-07", 3);
  setSetting("migration.headaches_from_events", "pending"); // as if this DB predates the migration
  ensureSchemaAndSeed();
  const rows = db.prepare("SELECT * FROM headaches WHERE legacy_event_id IS NOT NULL ORDER BY date").all();
  assert.equal(rows.length, 2);
  assert.equal(rows[0].type, "migraine");
  assert.equal(rows[1].peak_severity, 7);
  assert.equal(rows[1].notes, "Bad sleep");

  ensureSchemaAndSeed(); // idempotent
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM headaches WHERE legacy_event_id IS NOT NULL").get().n, 2);
  db.prepare("DELETE FROM headaches WHERE legacy_event_id = 'ev-1'").run();
  ensureSchemaAndSeed();
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM headaches WHERE legacy_event_id IS NOT NULL").get().n, 1, "deleted stays deleted");
});

test("health events: migraine moved to /api/headaches and hidden from the old list", async () => {
  assert.equal((await env.request("/api/health-events", { method: "POST", body: { category: "migraine" } })).status, 400);
  const list = (await env.request("/api/health-events")).json;
  assert.deepEqual(list.map((e) => e.category), ["sleep"]);
  assert.equal((await env.request("/api/health-events?include_legacy=1")).json.length, 3);
});

test("headache CRUD: duration from times, onset date, validation", async () => {
  const created = await env.request("/api/headaches", {
    method: "POST",
    body: {
      started_at: `${today}T08:15`, peak_severity: 6, type: "tension", locations: ["temples", "nowhere"],
      meds: [{ name: "Ibuprofen", dose: "400 mg", time: "08:30", relief: "some" }], triggers: ["poor_sleep", "Long Drive"],
    },
  });
  assert.equal(created.status, 200);
  const h = created.json;
  assert.equal(h.date, today);
  assert.equal(h.ongoing, true);
  assert.deepEqual(h.locations, ["temples"], "unknown locations are dropped");
  assert.deepEqual(h.triggers, ["poor_sleep", "long drive"], "free-text triggers kept, lower-cased");
  assert.equal(h.meds[0].class, "simple");
  assert.equal(h.alert, undefined);

  assert.equal((await env.request("/api/headaches/ongoing")).json.ongoing.id, h.id);
  const ended = (await env.request(`/api/headaches/${h.id}`, { method: "PATCH", body: { ended_at: `${today}T10:45` } })).json;
  assert.equal(ended.duration_minutes, 150);
  assert.equal(ended.ongoing, false);
  assert.equal((await env.request("/api/headaches/ongoing")).json.ongoing, null);

  const bad = [
    { started_at: `${today}T10:00`, ended_at: `${today}T09:00` },
    { peak_severity: 11 },
    { type: "hangover" },
    { started_at: "yesterday-ish" },
    { meds: [{ name: "x", relief: "lots" }] },
  ];
  for (const body of bad) assert.equal((await env.request("/api/headaches", { method: "POST", body })).status, 400, JSON.stringify(body));

  assert.equal((await env.request(`/api/headaches/${h.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await env.request(`/api/headaches/${h.id}`)).status, 404);
});

test("red-flag symptoms come back with a seek-care alert", async () => {
  const r = (await env.request("/api/headaches", {
    method: "POST",
    body: { date: today, peak_severity: 10, red_flags: ["thunderclap", "made_up"] },
  })).json;
  assert.deepEqual(r.red_flags, ["thunderclap"]);
  assert.match(r.alert.message, /medical care now/);
  assert.match(r.alert.red_flags[0], /worst headache/);
  await env.request(`/api/headaches/${r.id}`, { method: "DELETE" });
});

test("options list own meds first, then common OTC ones", async () => {
  await env.request("/api/medications", { method: "POST", body: { name: "Rizatriptan", dose: "10 mg", as_needed: true } });
  const o = (await env.request("/api/headaches/options")).json;
  assert.equal(o.meds[0].name, "Rizatriptan");
  assert.equal(o.meds[0].dose, "10 mg");
  assert.ok(o.meds.some((m) => m.name === "Ibuprofen"));
  assert.ok(o.red_flags.length >= 6);
});

test("check-ins: partial upsert keeps other fields; null clears; ranges enforced", async () => {
  await env.request("/api/checkins", { method: "PUT", body: { date: today, sleep_hours: 7.5 } });
  let c = (await env.request("/api/checkins", { method: "PUT", body: { date: today, stress: 4, caffeine_servings: 2 } })).json;
  assert.equal(c.sleep_hours, 7.5);
  assert.equal(c.stress, 4);
  c = (await env.request("/api/checkins", { method: "PUT", body: { date: today, stress: null } })).json;
  assert.equal(c.stress, null);
  assert.equal(c.caffeine_servings, 2);
  assert.equal((await env.request("/api/checkins", { method: "PUT", body: { date: today, stress: 6 } })).status, 400);
  assert.equal((await env.request("/api/checkins", { method: "PUT", body: { date: "today", stress: 2 } })).status, 400);
  assert.equal((await env.request(`/api/checkins/${today}`)).json.sleep_hours, 7.5);
  assert.equal((await env.request(`/api/checkins/${addDays(today, -400)}`)).json.empty, true);
});

test("streak counts a check-in", async () => {
  const s = (await env.request("/api/streak")).json;
  assert.equal(s.today_active, true);
});

test("insights endpoint finds a sleep pattern in logged data", async () => {
  // 24 days: short sleep on 8 days with headaches on 6 of them; normal sleep on 16 with 1 headache.
  for (let i = 1; i <= 24; i += 1) {
    const date = addDays(today, -i);
    const short = i % 3 === 0;
    await env.request("/api/checkins", { method: "PUT", body: { date, sleep_hours: short ? 5 : 7.5, stress: 2 } });
    if ((short && i <= 18) || i === 1) await env.request("/api/headaches", { method: "POST", body: { date, peak_severity: 5 } });
  }
  const r = (await env.request("/api/headache-insights?days=90")).json;
  const sleep = r.factors.find((f) => f.key === "short_sleep");
  assert.equal(sleep.strength, "strong");
  assert.equal(sleep.exposed.days, 8);
  assert.equal(sleep.exposed.headache_days, 6);
  assert.equal(r.coverage.checkin_days, 25);
  // Earlier tests left a migrated migraine from before the 90-day window, so the window is the full 90 days.
  assert.equal(r.window.start, addDays(today, -89));
  assert.equal(r.overuse.status, "ok");
  assert.equal(r.weekly.length, 12);
});

test("daily summary gets headache + check-in context and the section", async () => {
  env.stub.reset();
  env.stub.replyJSON({ markdown: "## Today at a glance\nok" });
  await env.request("/api/daily-summary", { method: "POST", body: { date: today } });
  const [system, user] = env.stub.last.messages.map((m) => m.content);
  assert.match(system, /## Headaches & sleep/);
  assert.match(user, /"headaches_90d"/);
  assert.match(user, /Short sleep/);
  assert.match(user, /"checkins_14d"/);
});

test("chat can log a headache and a check-in", async () => {
  env.stub.reset();
  env.stub.replyToolCalls([
    { name: "log_headache", args: { started_at: `${today}T14:00`, peak_severity: 4, type: "migraine", meds: [{ name: "Excedrin" }] } },
    { name: "log_checkin", args: { date: today, energy: 2 } },
  ]);
  env.stub.reply("Logged your migraine and energy.");
  const r = await env.request("/api/chat", { method: "POST", body: { messages: [{ role: "user", content: "migraine since 2, took excedrin, wiped out" }] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.tool_calls.map((t) => t.name), ["log_headache", "log_checkin"]);
  const logged = db.prepare("SELECT * FROM headaches WHERE started_at = ?").get(`${today}T14:00`);
  assert.equal(logged.type, "migraine");
  assert.equal((await env.request(`/api/checkins/${today}`)).json.energy, 2);
});
