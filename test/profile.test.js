import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv } from "./helpers/env.js";

const env = await setupTestEnv();
after(() => env.close());

const latestDietStyle = () =>
  env.db.prepare("SELECT diet_style FROM nutrition_goals ORDER BY created_at DESC, rowid DESC LIMIT 1").get()?.diet_style;

test("profile is seeded from the facts the old prompts hard-coded", async () => {
  const r = await env.request("/api/profile");
  assert.equal(r.status, 200);
  assert.match(r.json.conditions, /High cholesterol/);
  assert.match(r.json.goals, /Fat loss/);
  assert.equal(r.json.diet_style, "DASH");
  assert.ok(r.json.options.diet_styles.includes("Mediterranean"));
});

test("updating the profile computes age and syncs diet style to nutrition goals", async () => {
  const r = await env.request("/api/profile", {
    method: "PUT",
    body: { birth_date: "1980-05-01", sex: "male", height_in: 70, diet_style: "Mediterranean", allergies: "  " },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.sex, "male");
  assert.equal(r.json.allergies, null, "blank text is stored as null");
  assert.ok(r.json.age >= 46);
  assert.equal(latestDietStyle(), "Mediterranean");
});

test("saving nutrition goals without a diet style keeps the current one", async () => {
  const r = await env.request("/api/nutrition/goals", { method: "POST", body: { daily_protein_target_g: 160 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.diet_style, "Mediterranean");
});

test("profile validation", async () => {
  assert.equal((await env.request("/api/profile", { method: "PUT", body: { sex: "robot" } })).status, 400);
  assert.equal((await env.request("/api/profile", { method: "PUT", body: { birth_date: "May 1" } })).status, 400);
  assert.equal((await env.request("/api/profile", { method: "PUT", body: { diet_style: "Carnivore" } })).status, 400);
});

test("medications: add, list active, stop, delete", async () => {
  const statin = (await env.request("/api/medications", {
    method: "POST",
    body: { name: "Atorvastatin", dose: "20 mg", frequency: "daily", purpose: "cholesterol" },
  })).json;
  assert.equal(statin.kind, "med");
  assert.equal(statin.active, 1);
  const prn = (await env.request("/api/medications", {
    method: "POST",
    body: { name: "Ibuprofen", dose: "400 mg", kind: "med", as_needed: true, purpose: "headaches" },
  })).json;
  assert.equal(prn.as_needed, 1);
  assert.equal((await env.request("/api/medications", { method: "POST", body: { dose: "1" } })).status, 400);
  assert.equal((await env.request("/api/medications", { method: "POST", body: { name: "X", kind: "pill" } })).status, 400);

  const stopped = (await env.request(`/api/medications/${prn.id}`, { method: "PATCH", body: { active: false } })).json;
  assert.equal(stopped.active, 0);
  assert.match(stopped.stopped_on, /^\d{4}-\d{2}-\d{2}$/);

  const active = (await env.request("/api/medications?active=1")).json;
  assert.deepEqual(active.map((m) => m.name), ["Atorvastatin"]);
  assert.equal((await env.request("/api/medications")).json.length, 2);

  assert.equal((await env.request(`/api/medications/${prn.id}`, { method: "DELETE" })).status, 200);
  assert.equal((await env.request(`/api/medications/${prn.id}`, { method: "DELETE" })).status, 404);
});
