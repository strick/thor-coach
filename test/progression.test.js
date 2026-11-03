// Sets × one rep number counts every set, and the coach nudges reps before weight.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { setupTestEnv } from "./helpers/env.js";

const env = await setupTestEnv();
after(() => env.close());

const exercises = (await env.request("/api/exercises")).json;
const [exA, exB, exC] = exercises;
const log = (exercise_id, date, sets, reps, weight_lbs) =>
  env.request("/api/log-manual", { method: "POST", body: { exercise_id, date, sets, reps, weight_lbs } });
const latest = async (id, date = "2026-03-01") => (await env.request(`/api/exercises/${id}/latest?date=${date}`)).json;

test("3 sets with one rep number counts all three sets", async () => {
  await log(exA.id, "2026-01-05", 3, 10, 50);
  await log(exB.id, "2026-01-05", 3, [10], 50); // "10," in the reps box, or a one-element list from the parser
  const [day] = (await env.request("/api/workouts?start=2026-01-05&end=2026-01-05")).json;
  for (const l of day.logs) {
    assert.equal(l.sets, 3);
    assert.equal(l.reps, 10);
    assert.equal(l.volume, 1500);
  }
});

test("5 weeks of 3×6 at the same weight → push reps, not weight", async () => {
  for (const d of ["2026-01-08", "2026-01-15", "2026-01-22", "2026-01-29", "2026-02-05"]) await log(exC.id, d, 3, 6, 100);
  const { nudge } = await latest(exC.id);
  assert.equal(nudge.type, "reps");
  assert.equal(nudge.suggest, 100);
  assert.equal(nudge.suggest_reps, 7);
  assert.equal(nudge.sessions_at_weight, 5);
});

test("12 on every set → go up in weight and back to 6", async () => {
  await log(exC.id, "2026-02-20", 3, [12, 12, 12], 100);
  const { nudge } = await latest(exC.id);
  assert.equal(nudge.type, "weight");
  assert.equal(nudge.suggest, 105);
  assert.equal(nudge.suggest_reps, 6);
});

test("uneven sets push the weakest set up", async () => {
  await log(exC.id, "2026-02-25", 3, [12, 10, 8], 105);
  const { nudge } = await latest(exC.id);
  assert.equal(nudge.type, "reps");
  assert.equal(nudge.suggest_reps, 9);
});

test("the AI ingest path collapses a one-element rep list too", async () => {
  const { normalizeSetsReps } = await import("../src/services/workouts.js");
  assert.deepEqual(normalizeSetsReps(3, [8]), { sets: 3, reps: 8 });
  assert.deepEqual(normalizeSetsReps(null, [12, 10, 8]), { sets: 3, reps: [12, 10, 8] });
  assert.deepEqual(normalizeSetsReps(3, "10"), { sets: 3, reps: 10 });
});
