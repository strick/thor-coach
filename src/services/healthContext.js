// Builds the data snapshot every advice prompt reasons over. Each section is a
// small function returning compact JSON (or null when there's nothing to say),
// so prompts pick only the sections they need and new domains just add one.
import { db, getSetting } from "../db.js";
import { DEFAULT_USER_ID, todayISO } from "../config.js";
import { addDays, weekStartOf, round, median, avg, isHardRun, daysBetween } from "../util.js";
import { getDay, getGoals } from "./nutrition.js";
import { getWorkouts } from "./workouts.js";
import { hrMaxEstimate } from "./running.js";
import { getProfile, profileForPrompt, medicationsForPrompt } from "./profile.js";
import { headachesContext } from "./headaches.js";
import { checkinsContext } from "./checkins.js";
import { labsContext } from "./labs.js";

// --- Sections -------------------------------------------------------------

function latestWeight(onOrBefore) {
  return db
    .prepare("SELECT date, weight_lbs FROM body_metrics WHERE weight_lbs IS NOT NULL AND date <= ? ORDER BY date DESC LIMIT 1")
    .get(onOrBefore);
}

function profileSection({ end }) {
  const p = profileForPrompt();
  const height = getProfile().height_in;
  const w = latestWeight(end)?.weight_lbs;
  if (height && w) {
    p.bmi = round((703 * w) / (height * height), 1);
    p.bmi_note = "BMI overstates body fat for muscular people; read it alongside waist and trend.";
  }
  return Object.keys(p).length ? p : null;
}

function medicationsSection() {
  const meds = medicationsForPrompt();
  return meds.length ? meds : null;
}

function todaySection({ date }) {
  const nutrition = getDay(DEFAULT_USER_ID, date);
  const workouts = getWorkouts(date, date);
  const runs = db.prepare("SELECT * FROM running_sessions WHERE session_date = ?").all(date);
  const events = db.prepare("SELECT category, intensity, duration_minutes, notes FROM health_events WHERE date = ?").all(date);
  const reflection = db.prepare("SELECT body FROM daily_reflections WHERE date = ?").get(date)?.body || null;
  const water = db.prepare("SELECT glasses FROM water_intake WHERE date = ?").get(date)?.glasses ?? null;
  const n = nutrition.exists ? nutrition : null;
  return {
    date,
    nutrition: n
      ? {
          totals: Object.fromEntries(
            ["calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "added_sugar_g", "sodium_mg", "sat_fat_g", "cholesterol_mg", "potassium_mg"]
              .map((k) => [k, round(n.totals?.[k])])
          ),
          targets: n.targets && {
            protein_g: n.targets.protein_g, fiber_g: n.targets.fiber_g, sodium_mg_max: n.targets.sodium_mg_max,
            sat_fat_g_max: n.targets.sat_fat_g_max, added_sugar_g_max: n.targets.added_sugar_g_max,
            cholesterol_mg_max: n.targets.cholesterol_mg_max,
          },
          meals: n.meals.map((m) => ({ type: m.meal_type, time: m.time_local, items: m.items.map((i) => i.food_name) })),
        }
      : null,
    water: water == null ? null : { glasses: water, goal: Number(getSetting("goals.water_glasses") || 8) },
    lifting: workouts.map((w) => ({
      volume_lbs: Math.round(w.total_volume),
      exercises: w.logs.map((l) => ({ name: l.exercise, sets: l.sets, reps: l.reps, weight_lbs: l.weight_lbs, notes: l.notes || undefined })),
    })),
    runs: runs.map((r) => ({
      miles: round(r.distance_miles, 2), minutes: r.duration_minutes, pace_min_per_mile: round(r.pace_min_per_mile, 2),
      avg_hr: r.avg_heart_rate, max_hr: r.max_heart_rate, elevation_ft: r.elevation_gain_ft,
    })),
    other_health_events: events.length ? events : undefined,
    reflection,
  };
}

function last7Section({ date }) {
  const start = addDays(date, -6);
  const workouts = getWorkouts(start, date);
  const runs = db
    .prepare("SELECT session_date, distance_miles, pace_min_per_mile, avg_heart_rate FROM running_sessions WHERE session_date BETWEEN ? AND ? ORDER BY session_date")
    .all(start, date);
  const proteinTarget = getGoals()?.daily_protein_target_g ?? 150;
  const nutritionDays = db
    .prepare(
      `SELECT d.date_local AS date, t.protein_g, t.sodium_mg, t.calories_kcal, t.fiber_g, t.sat_fat_g
       FROM nutrition_days d JOIN nutrition_day_totals t ON t.nutrition_day_id = d.id
       WHERE d.user_id = ? AND d.date_local BETWEEN ? AND ? AND t.calories_kcal > 0 ORDER BY d.date_local`
    )
    .all(DEFAULT_USER_ID, start, date)
    .map((d) => ({
      date: d.date, calories: round(d.calories_kcal), protein_g: round(d.protein_g), fiber_g: round(d.fiber_g),
      sodium_mg: round(d.sodium_mg), sat_fat_g: round(d.sat_fat_g, 1),
    }));
  const weekly = JSON.parse(getSetting("goals.weekly") || "{}");
  return {
    window: `${start}..${date}`,
    lifting_days: workouts.map((w) => ({ date: w.session_date, volume_lbs: Math.round(w.total_volume), exercises: w.logs.length })),
    runs: runs.map((r) => ({ date: r.session_date, miles: round(r.distance_miles, 2), pace: round(r.pace_min_per_mile, 2), avg_hr: r.avg_heart_rate })),
    nutrition_days_logged: `${nutritionDays.length} of 7`,
    protein_target_g: proteinTarget,
    protein_target_hit: `${nutritionDays.filter((d) => d.protein_g >= proteinTarget).length} of ${nutritionDays.length} logged days`,
    nutrition_by_day: nutritionDays,
    weekly_goals: {
      targets: weekly,
      workouts_so_far: workouts.length,
      miles_so_far: round(runs.reduce((a, r) => a + (r.distance_miles || 0), 0), 1),
    },
  };
}

function nutrition30Section({ end }) {
  const start = addDays(end, -29);
  const days = db
    .prepare(
      `SELECT d.date_local, t.calories_kcal, t.protein_g, t.fiber_g, t.sodium_mg, t.sat_fat_g, t.cholesterol_mg,
              t.potassium_mg, t.added_sugar_g, tg.sodium_mg_max, tg.sat_fat_g_max, tg.fiber_g AS fiber_target
       FROM nutrition_days d JOIN nutrition_day_totals t ON t.nutrition_day_id = d.id
       LEFT JOIN nutrition_day_targets tg ON tg.nutrition_day_id = d.id
       WHERE d.user_id = ? AND d.date_local BETWEEN ? AND ? AND t.calories_kcal > 0`
    )
    .all(DEFAULT_USER_ID, start, end);
  if (!days.length) return null;
  const goals = getGoals();
  const proteinTarget = goals?.daily_protein_target_g ?? 150;
  const mean = (k, digits = 0) => round(avg(days.map((d) => Number(d[k]))), digits);
  return {
    window: `${start}..${end}`,
    days_logged: `${days.length} of 30`,
    note: days.length < 10 ? "Few days logged — averages may not reflect typical eating." : undefined,
    daily_averages_on_logged_days: {
      calories: mean("calories_kcal"), protein_g: mean("protein_g"), fiber_g: mean("fiber_g"),
      sodium_mg: mean("sodium_mg"), sat_fat_g: mean("sat_fat_g", 1), cholesterol_mg: mean("cholesterol_mg"),
      potassium_mg: mean("potassium_mg"), added_sugar_g: mean("added_sugar_g", 1),
    },
    targets: {
      protein_g: proteinTarget,
      fiber_g_min: goals?.min_daily_fiber_g ?? 30,
      sodium_mg_max: goals?.max_daily_sodium_mg ?? 2300,
      sat_fat_g_max: goals?.max_daily_saturated_fat_g ?? 15,
      cholesterol_mg_max: goals?.max_daily_cholesterol_mg ?? 200,
      added_sugar_g_max: goals?.max_daily_added_sugar_g ?? 30,
      diet_style: goals?.diet_style || null,
    },
    protein_target_hit: `${days.filter((d) => d.protein_g >= proteinTarget).length} of ${days.length} logged days`,
    over_sodium_limit: `${days.filter((d) => d.sodium_mg > (d.sodium_mg_max || 2300)).length} of ${days.length} logged days`,
    over_sat_fat_limit: `${days.filter((d) => d.sat_fat_g > (d.sat_fat_g_max || 15)).length} of ${days.length} logged days`,
    under_fiber_goal: `${days.filter((d) => d.fiber_g < (d.fiber_target || 30)).length} of ${days.length} logged days`,
  };
}

function training4wSection({ end }) {
  const start = addDays(weekStartOf(end), -21);
  const sessions = getWorkouts(start, end);
  if (!sessions.length) {
    const last = db.prepare("SELECT MAX(session_date) AS d FROM workout_sessions WHERE session_date <= ?").get(end)?.d;
    return last ? { sessions_in_window: 0, last_session: last } : null;
  }
  const weeks = {};
  for (const s of sessions) {
    const wk = weekStartOf(s.session_date);
    weeks[wk] ??= { week_of: wk, sessions: 0, volume_lbs: 0 };
    weeks[wk].sessions += 1;
    weeks[wk].volume_lbs += Math.round(s.total_volume);
  }
  const last = sessions[0].session_date;
  return {
    window: `${start}..${end}`,
    by_week: Object.values(weeks).sort((a, b) => a.week_of.localeCompare(b.week_of)),
    last_session: last,
    days_since_last: daysBetween(last, end),
  };
}

function running8wSection({ end }) {
  const start = addDays(weekStartOf(end), -49);
  const runs = db
    .prepare(
      `SELECT session_date, distance_miles, duration_minutes, pace_min_per_mile, avg_heart_rate, max_heart_rate, effort_level
       FROM running_sessions WHERE session_date BETWEEN ? AND ? ORDER BY session_date`
    )
    .all(start, end);
  const longest90 = db
    .prepare("SELECT MAX(distance_miles) AS m FROM running_sessions WHERE session_date BETWEEN ? AND ?")
    .get(addDays(end, -89), end)?.m;
  if (!runs.length) return longest90 ? { runs_in_window: 0, longest_run_90d: round(longest90, 1) } : null;

  const medianPace = median(runs.map((r) => r.pace_min_per_mile));
  const hrMax = hrMaxEstimate();
  const weeks = {};
  for (const r of runs) {
    const wk = weekStartOf(r.session_date);
    weeks[wk] ??= { week_of: wk, miles: 0, runs: 0, long_run: 0 };
    weeks[wk].miles += r.distance_miles || 0;
    weeks[wk].runs += 1;
    weeks[wk].long_run = Math.max(weeks[wk].long_run, r.distance_miles || 0);
  }
  const milesBetween = (a, b) => runs.filter((r) => r.session_date >= a && r.session_date <= b).reduce((s, r) => s + (r.distance_miles || 0), 0);
  const acute = milesBetween(addDays(end, -6), end);
  const chronicWeekly = milesBetween(addDays(end, -27), end) / 4;
  const ratio = chronicWeekly > 0 ? round(acute / chronicWeekly, 2) : null;
  const weeklyGoal = JSON.parse(getSetting("goals.weekly") || "{}").weekly_miles ?? null;
  return {
    window: `${start}..${end}`,
    by_week: Object.values(weeks)
      .sort((a, b) => a.week_of.localeCompare(b.week_of))
      .map((w) => ({ ...w, miles: round(w.miles, 1), long_run: round(w.long_run, 1) })),
    weekly_mileage_goal: weeklyGoal,
    longest_run_90d: round(longest90, 1),
    median_pace_min_per_mile: round(medianPace, 2),
    avg_hr: round(avg(runs.map((r) => r.avg_heart_rate))),
    hr_max_used: hrMax,
    pct_hard_runs: round((100 * runs.filter((r) => isHardRun(r, { hrMax, medianPace })).length) / runs.length),
    last_7d_miles: round(acute, 1),
    acute_chronic_ratio: ratio,
    ramp_flag: ratio != null && ratio > 1.3 ? "Mileage this week is well above your 4-week average — injury risk rises with sharp jumps." : undefined,
  };
}

function bodySection({ end }) {
  const latest = latestWeight(end);
  if (!latest) return null;
  const ago = (days) => latestWeight(addDays(end, -days))?.weight_lbs ?? null;
  const w7 = ago(7);
  const w30 = ago(30);
  const waist = db.prepare("SELECT date, waist_in FROM body_metrics WHERE waist_in IS NOT NULL AND date <= ? ORDER BY date DESC LIMIT 1").get(end);
  return {
    latest_weight_lbs: latest.weight_lbs,
    weighed_on: latest.date,
    change_7d_lbs: w7 != null ? round(latest.weight_lbs - w7, 1) : null,
    change_30d_lbs: w30 != null ? round(latest.weight_lbs - w30, 1) : null,
    waist_in: waist?.waist_in ?? undefined,
  };
}

const SECTIONS = {
  profile: profileSection,
  medications: medicationsSection,
  today: todaySection,
  last7: last7Section,
  nutrition_30d: nutrition30Section,
  training_4w: training4wSection,
  running_8w: running8wSection,
  body: bodySection,
  headaches_90d: ({ end }) => headachesContext(end),
  checkins_14d: ({ end }) => checkinsContext(end),
  labs: () => labsContext(),
};

export const SECTION_NAMES = Object.keys(SECTIONS);

/** Add a section from a later-phase module without editing this file's imports. */
export function registerSection(name, fn) {
  SECTIONS[name] = fn;
}

/**
 * @param {{ date?: string, end?: string, sections?: string[] }} opts
 *   date: the "today" for day-level sections; end: last day of rolling windows (defaults to date).
 */
export function buildHealthContext({ date = todayISO(), end, sections = Object.keys(SECTIONS) } = {}) {
  const ctx = { date: date, end: end || date };
  const out = {};
  for (const name of sections) {
    const fn = SECTIONS[name];
    if (!fn) throw new Error(`Unknown health context section: ${name}`);
    const value = fn(ctx);
    if (value != null) out[name] = value;
  }
  return out;
}
