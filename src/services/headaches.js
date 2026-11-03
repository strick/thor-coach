// Structured headache log, the day-record loader for pattern analysis, and the
// headache context section for prompts. The analysis itself is in
// headacheInsights.js (pure).
import { db, uuid, getSetting } from "../db.js";
import { DEFAULT_USER_ID, todayISO } from "../config.js";
import { HttpError } from "../http.js";
import { addDays, minutesBetween, avg, round } from "../util.js";
import { classifyMed, classLabel, COMMON_HEADACHE_MEDS } from "../data/headacheMeds.js";
import {
  analyzeHeadacheFactors, analyzeMedicationOveruse, headacheDaysByWeek, parseMealTime, CAVEAT,
  MIN_EXPOSED, MIN_UNEXPOSED, MIN_HEADACHE_DAYS,
} from "./headacheInsights.js";
import { getWorkouts } from "./workouts.js";
import { hrMaxEstimate } from "./running.js";
import { listMedications } from "./profile.js";

export const TYPES = ["migraine", "tension", "cluster", "sinus", "unknown"];
export const LOCATIONS = [
  ["forehead", "Forehead"], ["temples", "Temples"], ["behind_eyes", "Behind the eyes"], ["top", "Top of head"],
  ["back_of_head", "Back of head"], ["neck", "Neck"], ["left_side", "Left side"], ["right_side", "Right side"],
  ["whole_head", "Whole head"],
];
export const SYMPTOMS = [
  ["nausea", "Nausea"], ["vomiting", "Vomiting"], ["light_sensitivity", "Light sensitivity"],
  ["sound_sensitivity", "Sound sensitivity"], ["smell_sensitivity", "Smell sensitivity"], ["dizziness", "Dizziness"],
  ["neck_pain", "Neck pain"], ["fatigue", "Fatigue"], ["brain_fog", "Brain fog"],
];
export const TRIGGERS = [
  ["poor_sleep", "Poor sleep"], ["stress", "Stress"], ["skipped_meal", "Skipped meal"], ["dehydration", "Not enough water"],
  ["alcohol", "Alcohol"], ["caffeine", "Caffeine"], ["screen_time", "Screen time"], ["bright_light", "Bright light"],
  ["weather", "Weather change"], ["hard_workout", "Hard workout"], ["strong_smell", "Strong smell"],
];
export const RED_FLAGS = [
  ["thunderclap", "Sudden, severe onset — the worst headache of my life"],
  ["one_sided_weakness", "Weakness or numbness on one side of the body"],
  ["speech_confusion", "Trouble speaking, or confusion"],
  ["fever_stiff_neck", "Fever with a stiff neck"],
  ["head_injury", "Started after a head injury"],
  ["vision_loss", "Vision loss that isn't my usual aura"],
  ["new_pattern_over_50", "A new or very different headache pattern, and I'm over 50"],
];
export const RELIEF = ["none", "some", "good", "complete"];
export const SEEK_CARE_MESSAGE =
  "These symptoms can be a sign of something serious. Please get medical care now — call 911 (or your local emergency number) if it's severe or sudden, or go to urgent care / the ER. Don't wait to see if it passes.";

const keysOf = (pairs) => pairs.map(([k]) => k);
const labelOf = (pairs, key) => pairs.find(([k]) => k === key)?.[1] || key;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function normDateTime(v, field) {
  if (v == null || v === "") return null;
  const s = String(v).trim().replace(" ", "T").slice(0, 16);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s) || Number.isNaN(new Date(s).getTime())) {
    throw new HttpError(400, `${field} must be YYYY-MM-DDTHH:MM (local time)`);
  }
  return s;
}

const pickKnown = (values, allowed) =>
  [...new Set((Array.isArray(values) ? values : []).map((v) => String(v).trim()).filter((v) => allowed.includes(v)))];

function cleanTriggers(values) {
  // Known keys, plus short free-text triggers ("red wine", "long drive").
  return [...new Set((Array.isArray(values) ? values : [])
    .map((v) => String(v).trim().toLowerCase().slice(0, 40))
    .filter(Boolean))].slice(0, 12);
}

function cleanMeds(values) {
  if (!Array.isArray(values)) throw new HttpError(400, "meds must be an array");
  return values
    .filter((m) => m && String(m.name || "").trim())
    .slice(0, 10)
    .map((m) => {
      const time = m.time ? String(m.time).trim().replace(" ", "T").slice(0, 16) : null;
      if (time && !/^(\d{4}-\d{2}-\d{2}T)?\d{2}:\d{2}$/.test(time)) throw new HttpError(400, "med time must be HH:MM or YYYY-MM-DDTHH:MM");
      const relief = m.relief || null;
      if (relief && !RELIEF.includes(relief)) throw new HttpError(400, `relief must be one of ${RELIEF.join(", ")}`);
      return {
        name: String(m.name).trim().slice(0, 80),
        dose: m.dose ? String(m.dose).trim().slice(0, 40) : null,
        time,
        relief,
        medication_id: m.medication_id || null,
      };
    });
}

/** Validate a create/patch body. Returns only the columns present in `input`. */
function cleanEntry(input) {
  const out = {};
  if ("started_at" in input) out.started_at = normDateTime(input.started_at, "started_at");
  if ("ended_at" in input) out.ended_at = normDateTime(input.ended_at, "ended_at");
  if ("date" in input && input.date != null) {
    if (!ISO_DATE.test(input.date)) throw new HttpError(400, "date must be YYYY-MM-DD");
    out.date = input.date;
  }
  if ("peak_severity" in input) {
    const v = input.peak_severity;
    if (v == null || v === "") out.peak_severity = null;
    else {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 10) throw new HttpError(400, "peak_severity must be a whole number 0–10");
      out.peak_severity = n;
    }
  }
  if ("type" in input) {
    const t = input.type || "unknown";
    if (!TYPES.includes(t)) throw new HttpError(400, `type must be one of ${TYPES.join(", ")}`);
    out.type = t;
  }
  if ("duration_minutes" in input) {
    const v = input.duration_minutes;
    out.duration_minutes = v == null || v === "" ? null : Math.max(0, Math.round(Number(v))) || null;
  }
  if ("aura" in input) out.aura = input.aura ? 1 : 0;
  if ("locations" in input) out.locations = JSON.stringify(pickKnown(input.locations, keysOf(LOCATIONS)));
  if ("symptoms" in input) out.symptoms = JSON.stringify(pickKnown(input.symptoms, keysOf(SYMPTOMS)));
  if ("red_flags" in input) out.red_flags = JSON.stringify(pickKnown(input.red_flags, keysOf(RED_FLAGS)));
  if ("triggers" in input) out.triggers = JSON.stringify(cleanTriggers(input.triggers));
  if ("meds" in input) out.meds = JSON.stringify(cleanMeds(input.meds || []));
  if ("notes" in input) out.notes = input.notes ? String(input.notes).trim().slice(0, 2000) || null : null;
  return out;
}

/** Fill derived columns (date from start, duration from start/end) on the merged row. */
function derive(row) {
  if (row.started_at) row.date = row.started_at.slice(0, 10);
  if (row.started_at && row.ended_at) {
    const mins = minutesBetween(row.started_at, row.ended_at);
    if (mins < 0) throw new HttpError(400, "ended_at is before started_at");
    row.duration_minutes = mins;
  }
  return row;
}

const parse = (s) => {
  try {
    return JSON.parse(s || "[]");
  } catch {
    return [];
  }
};

/** DB row → API shape. */
export function present(row) {
  if (!row) return null;
  const redFlags = parse(row.red_flags);
  return {
    ...row,
    aura: Boolean(row.aura),
    locations: parse(row.locations),
    symptoms: parse(row.symptoms),
    red_flags: redFlags,
    triggers: parse(row.triggers),
    meds: parse(row.meds).map((m) => ({ ...m, class: classifyMed(m.name), class_label: classLabel(classifyMed(m.name)) })),
    ongoing: Boolean(row.started_at && !row.ended_at),
    alert: redFlags.length ? { red_flags: redFlags.map((k) => labelOf(RED_FLAGS, k)), message: SEEK_CARE_MESSAGE } : undefined,
  };
}

export function getHeadache(id) {
  const row = db.prepare("SELECT * FROM headaches WHERE id = ?").get(id);
  if (!row) throw new HttpError(404, "Headache not found");
  return present(row);
}

export function listHeadaches({ start, end, limit } = {}, userId = DEFAULT_USER_ID) {
  return db
    .prepare(
      `SELECT * FROM headaches WHERE user_id = ? AND date BETWEEN ? AND ?
       ORDER BY date DESC, COALESCE(started_at, created_at) DESC LIMIT ?`
    )
    .all(userId, start || "0000-01-01", end || "9999-12-31", Number(limit) || 500)
    .map(present);
}

export function createHeadache(input = {}, userId = DEFAULT_USER_ID) {
  const row = derive({ type: "unknown", ...cleanEntry(input) });
  row.date ??= todayISO();
  const id = uuid();
  const cols = Object.keys(row);
  db.prepare(`INSERT INTO headaches (id, user_id, ${cols.join(", ")}) VALUES (?, ?, ${cols.map(() => "?").join(", ")})`)
    .run(id, userId, ...cols.map((c) => row[c]));
  return getHeadache(id);
}

export function updateHeadache(id, patch = {}) {
  const current = db.prepare("SELECT * FROM headaches WHERE id = ?").get(id);
  if (!current) throw new HttpError(404, "Headache not found");
  const changes = cleanEntry(patch);
  const merged = derive({ ...current, ...changes });
  for (const k of ["date", "duration_minutes"]) if (merged[k] !== current[k]) changes[k] = merged[k];
  const keys = Object.keys(changes);
  if (keys.length) {
    db.prepare(`UPDATE headaches SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => changes[k]), id);
  }
  return getHeadache(id);
}

export function deleteHeadache(id) {
  const r = db.prepare("DELETE FROM headaches WHERE id = ?").run(id);
  if (!r.changes) throw new HttpError(404, "Headache not found");
  return { deleted: id };
}

/** A headache started in the last 3 days that hasn't been ended. */
export function getOngoing(userId = DEFAULT_USER_ID) {
  return present(
    db.prepare(
      `SELECT * FROM headaches WHERE user_id = ? AND started_at IS NOT NULL AND ended_at IS NULL AND date >= ?
       ORDER BY started_at DESC LIMIT 1`
    ).get(userId, addDays(todayISO(), -2))
  );
}

export function headacheOptions() {
  const own = listMedications({ active: true })
    .sort((a, b) => b.as_needed - a.as_needed)
    .map((m) => ({ name: m.name, dose: m.dose, medication_id: m.id }));
  const common = COMMON_HEADACHE_MEDS.filter((n) => !own.some((m) => m.name.toLowerCase() === n.toLowerCase())).map((name) => ({ name }));
  return {
    types: TYPES,
    locations: LOCATIONS.map(([key, label]) => ({ key, label })),
    symptoms: SYMPTOMS.map(([key, label]) => ({ key, label })),
    triggers: TRIGGERS.map(([key, label]) => ({ key, label })),
    red_flags: RED_FLAGS.map(([key, label]) => ({ key, label })),
    relief: RELIEF,
    meds: [...own, ...common],
    seek_care_message: SEEK_CARE_MESSAGE,
  };
}

// --- Pattern analysis -------------------------------------------------------

/** First day anything was logged — patterns shouldn't count days before Thor was used. */
function firstLogDate(userId) {
  return db.prepare(
    `SELECT MIN(d) AS d FROM (
       SELECT MIN(date) AS d FROM headaches WHERE user_id = ?
       UNION ALL SELECT MIN(date) FROM daily_checkins WHERE user_id = ?
       UNION ALL SELECT MIN(date_local) FROM nutrition_days WHERE user_id = ?
       UNION ALL SELECT MIN(session_date) FROM workout_sessions
       UNION ALL SELECT MIN(session_date) FROM running_sessions)`
  ).get(userId, userId, userId)?.d;
}

/**
 * One record per day for the pattern engine. Prior-day values (stress,
 * alcohol, sodium) are attached so the analysis stays a pure per-day pass.
 */
export function loadDayRecords(start, end, userId = DEFAULT_USER_ID) {
  const prev = addDays(start, -1);
  const headacheDates = new Set(
    db.prepare("SELECT DISTINCT date FROM headaches WHERE user_id = ? AND date BETWEEN ? AND ?").all(userId, start, end).map((r) => r.date)
  );
  const checkins = new Map(
    db.prepare("SELECT * FROM daily_checkins WHERE user_id = ? AND date BETWEEN ? AND ?").all(userId, prev, end).map((r) => [r.date, r])
  );
  const sodium = new Map(
    db.prepare(
      `SELECT d.date_local AS date, t.sodium_mg, tg.sodium_mg_max
       FROM nutrition_days d JOIN nutrition_day_totals t ON t.nutrition_day_id = d.id
       LEFT JOIN nutrition_day_targets tg ON tg.nutrition_day_id = d.id
       WHERE d.user_id = ? AND d.date_local BETWEEN ? AND ?`
    ).all(userId, prev, end).map((r) => [r.date, r])
  );
  const meals = new Map();
  for (const m of db.prepare(
    `SELECT d.date_local AS date, m.meal_type, m.time_local FROM nutrition_meals m
     JOIN nutrition_days d ON d.id = m.nutrition_day_id
     WHERE d.user_id = ? AND d.date_local BETWEEN ? AND ?
       AND EXISTS (SELECT 1 FROM nutrition_meal_items i WHERE i.meal_id = m.id)`
  ).all(userId, prev, end)) {
    if (!meals.has(m.date)) meals.set(m.date, []);
    meals.get(m.date).push(m);
  }
  const water = new Map(db.prepare("SELECT date, glasses FROM water_intake WHERE date BETWEEN ? AND ?").all(start, end).map((r) => [r.date, r.glasses]));
  const waterGoal = Number(getSetting("goals.water_glasses") || 8);
  const lifting = new Map(getWorkouts(start, end).map((w) => [w.session_date, w.total_volume]));
  const runs = new Map();
  for (const r of db.prepare(
    `SELECT session_date, distance_miles, pace_min_per_mile, avg_heart_rate, effort_level
     FROM running_sessions WHERE session_date BETWEEN ? AND ?`
  ).all(start, end)) {
    if (!runs.has(r.session_date)) runs.set(r.session_date, []);
    runs.get(r.session_date).push(r);
  }

  const sodiumOver = (date) => {
    const s = sodium.get(date);
    if (!s || (meals.get(date) || []).length < 2) return null;
    return s.sodium_mg > (s.sodium_mg_max || 2300);
  };

  const records = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const ci = checkins.get(date);
    const prevCi = checkins.get(addDays(date, -1));
    const dayMeals = meals.get(date) || [];
    const times = dayMeals.map((m) => parseMealTime(m.time_local)).filter((t) => t != null);
    records.push({
      date,
      headache: headacheDates.has(date),
      sleep_hours: ci?.sleep_hours ?? null,
      sleep_quality: ci?.sleep_quality ?? null,
      stress: ci?.stress ?? null,
      prev_stress: prevCi?.stress ?? null,
      caffeine: ci?.caffeine_servings ?? null,
      prev_alcohol: prevCi?.alcohol_drinks ?? null,
      sodium_over: sodiumOver(date),
      prev_sodium_over: sodiumOver(addDays(date, -1)),
      water_ratio: water.has(date) ? water.get(date) / waterGoal : null,
      meals_logged: dayMeals.length,
      has_breakfast: dayMeals.some((m) => m.meal_type === "breakfast"),
      first_meal_minutes: times.length ? Math.min(...times) : null,
      lifting_volume: lifting.get(date) ?? null,
      runs: runs.get(date) || [],
    });
  }
  return records;
}

/** Full pattern report for the Health page and the chat tool. */
export function getHeadacheInsights({ days = 90, end = todayISO() } = {}, userId = DEFAULT_USER_ID) {
  const n = Math.min(365, Math.max(14, Number(days) || 90));
  const first = firstLogDate(userId);
  let start = addDays(end, -(n - 1));
  if (first && first > start) start = first;
  const records = start <= end ? loadDayRecords(start, end, userId) : [];
  const analysis = analyzeHeadacheFactors(records, { hrMax: hrMaxEstimate() });
  const recent = listHeadaches({ start: addDays(end, -89), end }, userId);
  const allDates = listHeadaches({ start: addDays(end, -7 * 12), end }, userId).map((h) => h.date);
  return {
    window: { start, end },
    ...analysis,
    coverage: {
      days: records.length,
      headache_days: analysis.headache_days,
      checkin_days: records.filter((r) => r.sleep_hours != null || r.stress != null || r.caffeine != null || r.sleep_quality != null).length,
      food_days: records.filter((r) => r.meals_logged > 0).length,
      water_days: records.filter((r) => r.water_ratio != null).length,
    },
    overuse: analyzeMedicationOveruse(recent, end),
    weekly: headacheDaysByWeek(allDates, end, 12),
    // What a factor needs before it is compared (the UI shows progress toward it).
    minimums: { exposed_days: MIN_EXPOSED, unexposed_days: MIN_UNEXPOSED, headache_days: MIN_HEADACHE_DAYS },
  };
}

/** Context section for prompts: recent headaches, patterns worth mentioning, overuse status. */
export function headachesContext(end = todayISO(), userId = DEFAULT_USER_ID) {
  const ever = db.prepare("SELECT COUNT(*) AS n FROM headaches WHERE user_id = ?").get(userId).n;
  if (!ever) return null;
  const recent = listHeadaches({ start: addDays(end, -89), end }, userId);
  if (!recent.length) return { headaches_last_90d: 0, note: "No headaches logged in the last 90 days." };
  const last30 = recent.filter((h) => h.date >= addDays(end, -29));
  const insights = getHeadacheInsights({ days: 90, end }, userId);
  const byType = {};
  for (const h of recent) byType[h.type] = (byType[h.type] || 0) + 1;
  const last = recent[0];
  const fmtFactor = (f) => ({
    factor: f.label,
    strength: f.strength,
    with_it: `${f.exposed.headache_days} headache days of ${f.exposed.days}`,
    without_it: `${f.unexposed.headache_days} headache days of ${f.unexposed.days}`,
    note: f.low_confidence,
  });
  return {
    headaches_last_30d: last30.length,
    headache_days_last_30d: new Set(last30.map((h) => h.date)).size,
    headaches_last_90d: recent.length,
    avg_peak_severity_0to10: round(avg(recent.map((h) => h.peak_severity)), 1),
    by_type: byType,
    most_recent: {
      date: last.date,
      peak_severity: last.peak_severity,
      type: last.type,
      duration_minutes: last.duration_minutes,
      meds: last.meds.map((m) => `${m.name}${m.relief ? ` (relief: ${m.relief})` : ""}`),
      suspected_triggers: last.triggers,
      ongoing: last.ongoing || undefined,
    },
    patterns_in_logs: insights.factors.filter((f) => f.strength === "strong" || f.strength === "possible").map(fmtFactor),
    checked_no_clear_link: insights.factors.filter((f) => f.strength === "no_clear_link").map((f) => f.label),
    not_enough_data_yet: insights.factors.filter((f) => f.strength === "insufficient").map((f) => f.label),
    medication_overuse: {
      status: insights.overuse.status,
      acute_med_days_last_30d: insights.overuse.acute_med_days_30d,
      message: insights.overuse.message || undefined,
    },
    coverage: insights.coverage,
    caveat: CAVEAT,
  };
}
