// Pure pattern engine — no database needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMealTime, fisherOneSided, relativeRisk, analyzeHeadacheFactors, analyzeMedicationOveruse, headacheDaysByWeek,
} from "../src/services/headacheInsights.js";
import { classifyMed } from "../src/data/headacheMeds.js";
import { addDays } from "../src/util.js";

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("meal times parse in both stored formats", () => {
  assert.equal(parseMealTime("07:42 AM"), 7 * 60 + 42);
  assert.equal(parseMealTime("12:05 PM"), 12 * 60 + 5);
  assert.equal(parseMealTime("12:30 am"), 30);
  assert.equal(parseMealTime("9:15pm"), 21 * 60 + 15);
  assert.equal(parseMealTime("21:45"), 21 * 60 + 45);
  assert.equal(parseMealTime("08:00:00"), 480);
  assert.equal(parseMealTime(null), null);
  assert.equal(parseMealTime("lunchtime"), null);
});

test("Fisher exact one-sided p matches hand-computed hypergeometric tails", () => {
  close(fisherOneSided(3, 1, 1, 3), 17 / 70); // (C(4,3)C(4,1) + C(4,4)C(4,0)) / C(8,4)
  close(fisherOneSided(5, 0, 0, 5), 1 / 252);
  close(fisherOneSided(0, 5, 5, 0), 1);
});

test("relative risk applies Haldane correction only with a zero cell", () => {
  close(relativeRisk(4, 4, 2, 8), (4 / 8) / (2 / 10));
  close(relativeRisk(5, 0, 0, 5), (5.5 / 6) / (0.5 / 6));
});

const day = (i, extra = {}) => ({
  date: addDays("2026-01-01", i), headache: false, sleep_hours: null, sleep_quality: null, stress: null, prev_stress: null,
  caffeine: null, prev_alcohol: null, sodium_over: null, prev_sodium_over: null, water_ratio: null,
  meals_logged: 0, has_breakfast: false, first_meal_minutes: null, lifting_volume: null, runs: [], ...extra,
});
const factor = (result, key) => result.factors.find((f) => f.key === key);

test("a real effect is flagged strong; unrelated factors aren't", () => {
  const records = [];
  for (let i = 0; i < 30; i += 1) {
    const short = i < 10;
    // headaches on 8 of 10 short-sleep days, 2 of 20 normal days
    const headache = short ? i < 8 : i === 15 || i === 25;
    records.push(day(i, { sleep_hours: short ? 5.5 : 7.5, stress: i % 2 ? 4 : 2, headache }));
  }
  const r = analyzeHeadacheFactors(records);
  const sleep = factor(r, "short_sleep");
  assert.equal(sleep.strength, "strong");
  assert.equal(sleep.exposed.days, 10);
  assert.equal(sleep.exposed.headache_days, 8);
  assert.equal(sleep.unexposed.headache_days, 2);
  assert.ok(sleep.relative_risk > 5);
  assert.ok(sleep.p_value < 0.001);
  assert.equal(factor(r, "high_stress").strength, "no_clear_link");
  assert.equal(r.factors[0].key, "short_sleep", "strongest first");
  assert.match(r.caveat, /not proof of cause/);
});

test("small samples are 'insufficient' with a reason", () => {
  const records = [];
  for (let i = 0; i < 12; i += 1) records.push(day(i, { sleep_hours: i < 4 ? 5 : 8, headache: i < 3 }));
  const sleep = factor(analyzeHeadacheFactors(records), "short_sleep");
  assert.equal(sleep.strength, "insufficient");
  assert.match(sleep.needs, /now 4 \/ 8 \/ 3/);
  // Never-tracked factors are insufficient too, not "no link".
  assert.equal(factor(analyzeHeadacheFactors(records), "water_under_goal").strength, "insufficient");
});

test("caffeine baseline needs 10 check-ins; meal-timing is marked low confidence", () => {
  const few = [day(0, { caffeine: 1 }), day(1, { caffeine: 4 })];
  assert.equal(factor(analyzeHeadacheFactors(few), "caffeine_above_baseline").exposed.days, 0);
  const meals = factor(analyzeHeadacheFactors(few), "skipped_or_late_first_meal");
  assert.match(meals.low_confidence, /logged/);
});

test("long or hard runs use the runner's own median", () => {
  const records = [];
  for (let i = 0; i < 20; i += 1) {
    const long = i % 4 === 0; // 5 long runs
    records.push(day(i, { runs: [{ distance_miles: long ? 10 : 3, pace_min_per_mile: 10 }], headache: long && i < 16 }));
  }
  const runs = factor(analyzeHeadacheFactors(records), "long_or_hard_run");
  assert.equal(runs.exposed.days, 5);
  assert.equal(runs.exposed.headache_days, 4);
});

test("med classes: combos and opioid combos beat the simple analgesics they contain", () => {
  assert.equal(classifyMed("Excedrin Migraine"), "combination");
  assert.equal(classifyMed("Tylenol #3"), "opioid");
  assert.equal(classifyMed("Tylenol"), "simple");
  assert.equal(classifyMed("Advil Liqui-Gels"), "simple");
  assert.equal(classifyMed("sumatriptan 50mg"), "triptan");
  assert.equal(classifyMed("Nurtec ODT"), "gepant");
  assert.equal(classifyMed("Magnesium glycinate"), "other");
  assert.equal(classifyMed(""), "other");
});

const END = "2026-03-31";
const medDays = (name, n, offset = 0) =>
  Array.from({ length: n }, (_, i) => ({ date: addDays(END, -(i + offset)), meds: [{ name }] }));

test("medication overuse thresholds (ICHD-3 8.2)", () => {
  assert.equal(analyzeMedicationOveruse(medDays("sumatriptan", 7), END).status, "ok");
  assert.equal(analyzeMedicationOveruse(medDays("sumatriptan", 9), END).status, "watch");
  const triptan10 = analyzeMedicationOveruse(medDays("sumatriptan", 10), END);
  assert.equal(triptan10.status, "warn");
  assert.match(triptan10.message, /10 of the last 30 days/);
  assert.match(triptan10.message, /doctor/);
  assert.equal(analyzeMedicationOveruse(medDays("ibuprofen", 14), END).status, "watch");
  assert.equal(analyzeMedicationOveruse(medDays("ibuprofen", 15), END).status, "warn");
  // 5 triptan days + 5 different ibuprofen days: neither alone, but 10 days across 2 classes
  const mixed = analyzeMedicationOveruse([...medDays("rizatriptan", 5), ...medDays("ibuprofen", 5, 5)], END);
  assert.equal(mixed.status, "warn");
  assert.equal(mixed.acute_med_days_30d, 10);
  // Gepants aren't counted; old doses fall outside the 30-day window
  assert.equal(analyzeMedicationOveruse(medDays("Ubrelvy", 20), END).status, "ok");
  assert.equal(analyzeMedicationOveruse(medDays("sumatriptan", 12, 40), END).status, "ok");
});

test("sustained flag needs the 90-day average over the line too", () => {
  const recentOnly = analyzeMedicationOveruse(medDays("sumatriptan", 10), END);
  assert.equal(recentOnly.sustained, false);
  const sustained = analyzeMedicationOveruse(
    [0, 30, 60].flatMap((off) => medDays("sumatriptan", 11, off)),
    END
  );
  assert.equal(sustained.status, "warn");
  assert.equal(sustained.sustained, true);
});

test("analysis window never starts before the first logged day", async () => {
  // Covered via the API in headaches.test.js; here: an empty record set is safe.
  const r = analyzeHeadacheFactors([]);
  assert.equal(r.days, 0);
  assert.ok(r.factors.every((f) => f.strength === "insufficient"));
});

test("headache days by week", () => {
  const weeks = headacheDaysByWeek(["2026-03-30", "2026-03-31", "2026-03-31", "2026-03-24"], END, 3);
  assert.deepEqual(weeks.map((w) => w.headache_days), [0, 1, 2]);
  assert.equal(weeks.at(-1).week_of, "2026-03-30");
});
