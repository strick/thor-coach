import { db, getSetting } from "../db.js";
import { chatJSON } from "../llm.js";
import { DEFAULT_USER_ID, todayISO } from "../config.js";
import { getDay, getGoals, getSummary as nutritionSummary } from "./nutrition.js";
import { getWorkouts } from "./workouts.js";

const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return todayISO(d);
};

const SYSTEM = `You are a fitness + nutrition coach specializing in DASH diet adherence, heart-healthy eating, and fat loss with muscle retention. You are not a doctor. Do not provide medical advice, diagnosis, or medication changes. Be direct and motivating (David Goggins / James Cameron vibe), but respectful and constructive.
Return JSON: {"markdown": string} where markdown is the full daily summary.`;

function gatherDayData(date) {
  const nutrition = getDay(DEFAULT_USER_ID, date);
  const workouts = getWorkouts(date, date);
  const runs = db.prepare("SELECT * FROM running_sessions WHERE session_date = ?").all(date);
  const healthEvents = db.prepare("SELECT * FROM health_events WHERE date = ?").all(date);
  const reflection = db.prepare("SELECT body FROM daily_reflections WHERE date = ?").get(date)?.body || null;
  return {
    date,
    nutrition: nutrition.exists ? { totals: nutrition.totals, targets: nutrition.targets, meals: nutrition.meals.map((m) => ({ type: m.meal_type, items: m.items.map((i) => i.food_name) })) } : null,
    training: workouts.map((w) => ({ date: w.session_date, total_volume: w.total_volume, exercises: w.logs.map((l) => ({ name: l.exercise, sets: l.sets, reps: l.reps, weight: l.weight_lbs, notes: l.notes })) })),
    runs: runs.map((r) => ({ miles: r.distance_miles, minutes: r.duration_minutes, pace: r.pace_min_per_mile, avg_hr: r.avg_heart_rate })),
    health_events: healthEvents,
    reflection,
  };
}

/** Last-7-days context so insights can call out patterns, not just today. */
function weekContext(date) {
  const start = addDays(date, -6);
  const workouts = getWorkouts(start, date);
  const runs = db.prepare("SELECT session_date, distance_miles, pace_min_per_mile FROM running_sessions WHERE session_date BETWEEN ? AND ?").all(start, date);
  const goals = getGoals();
  const proteinTarget = goals?.daily_protein_target_g ?? 150;
  const nutritionDays = nutritionSummary(DEFAULT_USER_ID, start, date).map((d) => ({
    date: d.date_local,
    protein_g: Math.round(d.protein_g),
    protein_hit: d.protein_g >= proteinTarget,
    sodium_mg: Math.round(d.sodium_mg),
    calories: Math.round(d.calories_kcal),
  }));
  // Body weight trend: latest vs ~7 and ~30 days ago
  const latestWeight = db.prepare("SELECT date, weight_lbs FROM body_metrics WHERE weight_lbs IS NOT NULL ORDER BY date DESC LIMIT 1").get();
  const weightAgo = (days) =>
    db.prepare("SELECT weight_lbs FROM body_metrics WHERE weight_lbs IS NOT NULL AND date <= ? ORDER BY date DESC LIMIT 1")
      .get(addDays(date, -days))?.weight_lbs ?? null;
  const body = latestWeight
    ? {
        latest_weight_lbs: latestWeight.weight_lbs,
        weighed_on: latestWeight.date,
        change_7d_lbs: weightAgo(7) != null ? Math.round((latestWeight.weight_lbs - weightAgo(7)) * 10) / 10 : null,
        change_30d_lbs: weightAgo(30) != null ? Math.round((latestWeight.weight_lbs - weightAgo(30)) * 10) / 10 : null,
      }
    : null;

  const weeklyGoals = JSON.parse(getSetting("goals.weekly") || "{}");
  return {
    window: `${start}..${date}`,
    training_days: workouts.map((w) => ({ date: w.session_date, volume_lbs: Math.round(w.total_volume), exercises: w.logs.length })),
    runs,
    nutrition_days_logged: nutritionDays.length,
    protein_days_hit: nutritionDays.filter((d) => d.protein_hit).length,
    protein_target_g: proteinTarget,
    nutrition_by_day: nutritionDays,
    body_weight: body,
    weekly_goals: {
      targets: weeklyGoals,
      this_week_workouts: workouts.length,
      this_week_miles: Number(runs.reduce((a, r) => a + (r.distance_miles || 0), 0).toFixed(1)),
    },
  };
}

export async function generateDailySummary(date = todayISO()) {
  const goals = getGoals();
  const data = gatherDayData(date);
  const week = weekContext(date);

  const user = `User profile:
- Diet: DASH, heart-healthy, watching cholesterol
- Protein target: ~${goals?.daily_protein_target_g ?? 150}g/day
- Goals: fat loss with muscle retention, consistency

Today's data (${date}):
${JSON.stringify(data, null, 2)}

Last 7 days context:
${JSON.stringify(week, null, 2)}

Tasks:
1) Produce a Daily Summary in MARKDOWN with these sections and exact headings:
## Your Day (Goggins Mode)
[2-3 sentences with a direct David Goggins / James Cameron vibe. Tell him how he did, what he crushed, what he left on the table. Be honest but motivating.]

## Highlights
## What You're Doing Wrong
[Use the 7-day context. Call out the recurring pattern, not just today — e.g. "protein under target 4 of 7 days", "no training since Tuesday", "zero nutrition logging 3 days straight". Be specific and direct.]

## DASH & Heart-Healthy Check
## Protein & Recovery
## Training Review
## Tomorrow's Priorities
[Max 3 bullets, concrete and small enough to actually do.]

2) Keep it concise and actionable. Use numbers when possible (protein, sodium, fiber).
3) If data is missing, say what's missing and what to track tomorrow — don't invent numbers.
4) Suggestions must be practical and not require long-distance running.
5) End with a brief disclaimer line about not being medical advice.`;

  const { data: result, provider, model } = await chatJSON("daily_summary", SYSTEM, user);
  const markdown = result.markdown || "";
  const sections = markdown.split(/^## /m).filter(Boolean).map((s) => "## " + s.trim());

  db.prepare(
    `INSERT INTO daily_summaries (date, markdown, sections, generated_at, updated_at)
     VALUES (?, ?, ?, datetime('now'), datetime('now'))
     ON CONFLICT(date) DO UPDATE SET markdown = excluded.markdown, sections = excluded.sections,
       generated_at = excluded.generated_at, updated_at = excluded.updated_at`
  ).run(date, markdown, JSON.stringify(sections));

  return { date, markdown, provider, model };
}

export function getDailySummary(date) {
  return db.prepare("SELECT * FROM daily_summaries WHERE date = ?").get(date) || null;
}

export function getReflection(date) {
  return db.prepare("SELECT * FROM daily_reflections WHERE date = ?").get(date) || { date, body: "" };
}

export function upsertReflection(date, body) {
  db.prepare(
    `INSERT INTO daily_reflections (date, body, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`
  ).run(date, body ?? "");
  return getReflection(date);
}
