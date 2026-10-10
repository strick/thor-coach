// Guides: AI explainers kept in a library. Lab explainers (one per confirmed
// report), weekly health reviews (one per week), and on-demand deep dives.
import { db, uuid, tx, getSetting } from "../db.js";
import { DEFAULT_USER_ID, todayISO, getDOW } from "../config.js";
import { HttpError } from "../http.js";
import { chatJSON } from "../llm.js";
import { addDays, weekStartOf, round, avg, median, isHardRun } from "../util.js";
import { systemPrompt } from "./persona.js";
import { buildHealthContext } from "./healthContext.js";
import { explainerInput, labsContext } from "./labs.js";
import { getWorkouts } from "./workouts.js";
import { hrMaxEstimate } from "./running.js";
import { getGoals } from "./nutrition.js";
import { listHeadaches, headachesContext } from "./headaches.js";
import { listCheckins } from "./checkins.js";
import { classifyMed } from "../data/headacheMeds.js";

export const GUIDE_KINDS = ["lab_explainer", "weekly_review", "deep_dive"];

const fmtDate = (iso) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
const fmtShort = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function getGuide(id) {
  const g = db.prepare("SELECT * FROM guides WHERE id = ?").get(id);
  if (!g) throw new HttpError(404, "Guide not found");
  return { ...g, pinned: Boolean(g.pinned), context_json: undefined, has_context: Boolean(g.context_json) };
}

/** The data snapshot the model saw when it wrote this guide. */
export function getGuideContext(id) {
  const g = db.prepare("SELECT context_json FROM guides WHERE id = ?").get(id);
  if (!g) throw new HttpError(404, "Guide not found");
  return g.context_json ? JSON.parse(g.context_json) : null;
}

const excerpt = (md) =>
  String(md || "").split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#") && !l.startsWith(">"))?.replace(/\*\*/g, "").slice(0, 180) || "";

export function listGuides({ kind, limit, pinned } = {}, userId = DEFAULT_USER_ID) {
  if (kind && !GUIDE_KINDS.includes(kind)) throw new HttpError(400, `kind must be one of ${GUIDE_KINDS.join(", ")}`);
  const where = ["user_id = ?"];
  const args = [userId];
  if (kind) { where.push("kind = ?"); args.push(kind); }
  if (pinned === "1" || pinned === true) where.push("pinned = 1");
  return db
    .prepare(
      `SELECT id, kind, title, topic, period_start, period_end, lab_report_id, pinned, created_at, updated_at, markdown
       FROM guides WHERE ${where.join(" AND ")} ORDER BY pinned DESC, COALESCE(period_end, created_at) DESC, created_at DESC LIMIT ?`
    )
    .all(...args, Math.min(200, Number(limit) || 60))
    .map(({ markdown, ...g }) => ({ ...g, pinned: Boolean(g.pinned), excerpt: excerpt(markdown) }));
}

export function updateGuide(id, patch = {}) {
  getGuide(id);
  if ("pinned" in patch) db.prepare("UPDATE guides SET pinned = ? WHERE id = ?").run(patch.pinned ? 1 : 0, id);
  if (patch.title != null) {
    const t = String(patch.title).trim().slice(0, 140);
    if (!t) throw new HttpError(400, "title can't be empty");
    db.prepare("UPDATE guides SET title = ?, updated_at = datetime('now') WHERE id = ?").run(t, id);
  }
  return getGuide(id);
}

export function deleteGuide(id) {
  const r = db.prepare("DELETE FROM guides WHERE id = ?").run(id);
  if (!r.changes) throw new HttpError(404, "Guide not found");
  return { deleted: id };
}

/** Insert or update the single guide matching `match` (one explainer per report, one review per week). */
function upsertGuide(match, fields, userId = DEFAULT_USER_ID) {
  return tx(() => {
    const where = Object.keys(match);
    const existing = db
      .prepare(`SELECT id FROM guides WHERE user_id = ? AND ${where.map((k) => `${k} = ?`).join(" AND ")} LIMIT 1`)
      .get(userId, ...where.map((k) => match[k]));
    const row = { ...match, ...fields };
    const cols = Object.keys(row);
    if (existing) {
      db.prepare(`UPDATE guides SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`)
        .run(...cols.map((c) => row[c]), existing.id);
      return existing.id;
    }
    const id = uuid();
    db.prepare(`INSERT INTO guides (id, user_id, ${cols.join(", ")}) VALUES (?, ?, ${cols.map(() => "?").join(", ")})`)
      .run(id, userId, ...cols.map((c) => row[c]));
    return id;
  });
}

// --- Lab explainers ------------------------------------------------------------

const LAB_TASK = `Explain the user's lab results in plain English, using their profile, medications, food, training and running data to make it personal. Return JSON: {"markdown": string}.

Use these headings in order (skip "What changed since last time" if nothing has a previous value):
## The big picture
2–3 sentences: overall, how do these results look?
## Out of range
For each flagged result: the value against the lab's range, what the marker measures (one sentence), the most common reasons it can be off (including the confounders listed in marker_notes and anything in their meds or recent training that fits), how far out it is, and how much it matters. If nothing is out of range, say so in one line.
## What changed since last time
Meaningful moves versus the previous values, and plausible reasons from their data.
## In range and worth knowing
At most 3 bullets on in-range results that are relevant to their goals or conditions (e.g. LDL at the edge of the range for someone watching cholesterol).
## Levers you control
2–4 specific actions tied to their actual numbers — e.g. their 30-day average saturated fat vs. target for LDL, fiber intake, alcohol for triglycerides, training timing before the next draw. Say how strong the evidence is.
## Questions for your doctor
2–4 specific questions to bring to their next appointment.

Rules: never diagnose; never suggest starting, stopping or changing a prescription — frame those as questions for the doctor. Don't repeat the full table of numbers. About 300–450 words. End with one short line that this doesn't replace their doctor's review.`;

export async function generateLabExplainer(reportId, userId = DEFAULT_USER_ID) {
  const { report, results, notes, critical } = explainerInput(reportId);
  const context = buildHealthContext({ sections: ["profile", "medications", "nutrition_30d", "training_4w", "running_8w", "body"] });
  const payload = {
    report: { collected_on: report.collected_on, lab: report.lab_name },
    results,
    marker_notes: notes,
    user_context: context,
  };
  const { data, provider, model } = await chatJSON("guides", systemPrompt(LAB_TASK, { json: true }), JSON.stringify(payload));
  // Urgent values get a fixed banner from the server, not model wording.
  const banner = critical.length
    ? `> **Contact your doctor promptly.** ${critical.join("; ")} ${critical.length > 1 ? "are" : "is"} in the range labs treat as urgent. If your care team hasn't already reached out, call them today — or seek urgent care if you feel unwell.\n\n`
    : "";
  const id = upsertGuide(
    { kind: "lab_explainer", lab_report_id: reportId },
    {
      title: `Your lab results from ${fmtDate(report.collected_on)}`,
      topic: report.lab_name || null,
      period_start: report.collected_on,
      period_end: report.collected_on,
      markdown: banner + (data.markdown || ""),
      context_json: JSON.stringify(payload),
      llm_provider: provider,
      llm_model: model,
    },
    userId
  );
  return getGuide(id);
}

// --- Weekly health review --------------------------------------------------------

/** Sunday: this week. Any other day: the last full week (Mon–Sun). */
export function defaultReviewWeek(today = todayISO()) {
  return getDOW(new Date(today + "T12:00:00")) === 7 ? weekStartOf(today) : weekStartOf(addDays(today, -7));
}

const weightOn = (d) =>
  db.prepare("SELECT date, weight_lbs FROM body_metrics WHERE weight_lbs IS NOT NULL AND date <= ? ORDER BY date DESC LIMIT 1").get(d);

/** Deterministic numbers for one Mon–Sun window — the review narrates these, it doesn't compute them. */
export function weekMetrics(start, userId = DEFAULT_USER_ID) {
  const end = addDays(start, 6);
  const sessions = getWorkouts(start, end);
  const runs = db
    .prepare(
      `SELECT session_date, distance_miles, duration_minutes, pace_min_per_mile, avg_heart_rate, effort_level
       FROM running_sessions WHERE session_date BETWEEN ? AND ? ORDER BY session_date`
    )
    .all(start, end);
  const medianPace = median(
    db.prepare("SELECT pace_min_per_mile AS p FROM running_sessions WHERE session_date BETWEEN ? AND ?").all(addDays(end, -55), end).map((r) => r.p)
  );
  const hrMax = hrMaxEstimate();
  const goals = getGoals();
  const proteinTarget = goals?.daily_protein_target_g ?? 150;
  const food = db
    .prepare(
      `SELECT d.date_local, t.calories_kcal, t.protein_g, t.fiber_g, t.sodium_mg, t.sat_fat_g, t.added_sugar_g, tg.sodium_mg_max
       FROM nutrition_days d JOIN nutrition_day_totals t ON t.nutrition_day_id = d.id
       LEFT JOIN nutrition_day_targets tg ON tg.nutrition_day_id = d.id
       WHERE d.user_id = ? AND d.date_local BETWEEN ? AND ? AND t.calories_kcal > 0`
    )
    .all(userId, start, end);
  const headaches = listHeadaches({ start, end }, userId);
  const checkins = listCheckins(start, end, userId);
  const labs = db
    .prepare("SELECT collected_on, lab_name FROM lab_reports WHERE user_id = ? AND status = 'confirmed' AND collected_on BETWEEN ? AND ?")
    .all(userId, start, end);
  const water = db.prepare("SELECT AVG(glasses) AS avg, COUNT(*) AS n FROM water_intake WHERE date BETWEEN ? AND ?").get(start, end);
  const wEnd = weightOn(end);
  const wStart = weightOn(addDays(start, -1));
  const medDays = new Set(
    headaches.flatMap((h) => h.meds.filter((m) => !["other", "gepant"].includes(classifyMed(m.name))).map(() => h.date))
  ).size;
  const mean = (rows, k, d = 0) => round(avg(rows.map((r) => r[k])), d);
  const weekly = JSON.parse(getSetting("goals.weekly") || "{}");

  return {
    week: `${start}..${end}`,
    lifting: {
      sessions: sessions.length,
      goal_sessions: weekly.weekly_workouts ?? undefined,
      volume_lbs: Math.round(sessions.reduce((a, s) => a + s.total_volume, 0)),
      exercises_logged: sessions.reduce((a, s) => a + s.logs.length, 0),
    },
    running: {
      runs: runs.length,
      miles: round(runs.reduce((a, r) => a + (r.distance_miles || 0), 0), 1),
      goal_miles: weekly.weekly_miles ?? undefined,
      long_run_miles: round(Math.max(0, ...runs.map((r) => r.distance_miles || 0)), 1),
      avg_pace_min_per_mile: mean(runs, "pace_min_per_mile", 2),
      avg_hr: mean(runs, "avg_heart_rate"),
      hard_runs: runs.filter((r) => isHardRun(r, { hrMax, medianPace })).length,
    },
    food: food.length
      ? {
          days_logged: `${food.length} of 7`,
          avg_calories: mean(food, "calories_kcal"),
          avg_protein_g: mean(food, "protein_g"),
          protein_target_g: proteinTarget,
          protein_target_hit: `${food.filter((d) => d.protein_g >= proteinTarget).length} of ${food.length} logged days`,
          avg_fiber_g: mean(food, "fiber_g"),
          avg_sodium_mg: mean(food, "sodium_mg"),
          over_sodium_limit: `${food.filter((d) => d.sodium_mg > (d.sodium_mg_max || 2300)).length} of ${food.length} logged days`,
          avg_sat_fat_g: mean(food, "sat_fat_g", 1),
          avg_added_sugar_g: mean(food, "added_sugar_g", 1),
        }
      : { days_logged: "0 of 7" },
    water: water.n ? { days_logged: water.n, avg_glasses: round(water.avg, 1), goal: Number(getSetting("goals.water_glasses") || 8) } : undefined,
    headaches: {
      count: headaches.length,
      days: new Set(headaches.map((h) => h.date)).size,
      avg_peak_severity: mean(headaches, "peak_severity", 1),
      days_with_acute_meds: medDays,
    },
    checkins: checkins.length
      ? {
          days: `${checkins.length} of 7`,
          avg_sleep_hours: mean(checkins, "sleep_hours", 1),
          avg_stress_1to5: mean(checkins, "stress", 1),
          avg_energy_1to5: mean(checkins, "energy", 1),
          total_alcohol_drinks: round(checkins.reduce((a, c) => a + (c.alcohol_drinks || 0), 0), 1),
        }
      : undefined,
    weight: wEnd && wStart && wEnd.date >= start ? { start_lbs: wStart.weight_lbs, end_lbs: wEnd.weight_lbs, change_lbs: round(wEnd.weight_lbs - wStart.weight_lbs, 1) } : undefined,
    new_lab_reports: labs.length ? labs : undefined,
  };
}

const WEEKLY_TASK = `Write the user's weekly health review from the JSON: this week's numbers, last week's for comparison, and their profile. Return JSON: {"markdown": string}.

Use these headings in order; skip a middle section if there's nothing meaningful for it:
## The week in brief
2–3 warm, honest sentences on the week as a whole.
## Wins
1–3 specific bullets with numbers.
## Patterns worth noticing
1–3 patterns, comparing to last week where it helps, each with one sentence on why it matters. Mention confidence only where data is thin.
## Training & running
Lifting rhythm and volume; running miles vs last week and goal, long run, easy/hard balance, and any ramp concerns.
## Food
How eating lined up with targets and diet style; connect to lab results if relevant.
## Headaches, sleep & stress
Only if there's data. Associations from their own logs only; mention medication-overuse status if it isn't "ok".
## Focus for next week
1–2 concrete, doable priorities.

About 250–350 words. Use their numbers; don't invent any.`;

export async function generateWeeklyReview(weekStart, userId = DEFAULT_USER_ID) {
  const start = weekStart ? weekStartOf(weekStart) : defaultReviewWeek();
  const end = addDays(start, 6);
  if (start > todayISO()) throw new HttpError(400, "That week hasn't started yet");
  const payload = {
    this_week: weekMetrics(start, userId),
    last_week: weekMetrics(addDays(start, -7), userId),
    profile_and_context: buildHealthContext({ end, sections: ["profile", "medications", "labs"] }),
    headache_patterns: headachesContext(end, userId) || undefined,
  };
  const { data, provider, model } = await chatJSON("weekly_review", systemPrompt(WEEKLY_TASK, { json: true }), JSON.stringify(payload));
  const id = upsertGuide(
    { kind: "weekly_review", period_start: start },
    {
      title: `Week of ${fmtShort(start)}–${fmtShort(end)}`,
      period_end: end,
      markdown: data.markdown || "",
      context_json: JSON.stringify(payload),
      llm_provider: provider,
      llm_model: model,
    },
    userId
  );
  return getGuide(id);
}

export function latestWeeklyReview(userId = DEFAULT_USER_ID) {
  const g = db.prepare("SELECT id FROM guides WHERE user_id = ? AND kind = 'weekly_review' ORDER BY period_start DESC LIMIT 1").get(userId);
  return g ? getGuide(g.id) : null;
}

// --- Deep dives ----------------------------------------------------------------------

export const DEEP_DIVE_SECTIONS = [
  "profile", "medications", "memories", "labs", "nutrition_30d", "training_4w", "running_8w", "body", "checkins_14d", "headaches_90d",
];

const DEEP_DIVE_TASK = `The user asked for a deep dive on a topic. Write a personalized explainer that uses their own data where it's relevant. Return JSON: {"title": string, "markdown": string}.
title: a short, specific title (under 70 characters), e.g. "Your LDL and what actually moves it".
Use these headings in order; skip the doctor sections if they aren't relevant:
## The short answer
2–3 sentences that answer the question directly.
## What your data shows
The numbers from their logs, labs and profile that bear on this topic. If the relevant data isn't logged, say what to track.
## Why it matters
The science in plain language, with how strong the evidence is.
## What to try
1–3 specific, realistic actions tied to their numbers.
## When to talk to a doctor
Only if relevant: warning signs or thresholds that warrant a visit.
## Questions for your doctor
Only if relevant: 2–3 specific questions.
About 400–600 words.`;

export async function generateDeepDive(topic, { replaceId } = {}, userId = DEFAULT_USER_ID) {
  const t = String(topic || "").trim();
  if (!t) throw new HttpError(400, "What would you like to understand?");
  if (t.length > 300) throw new HttpError(400, "Keep the question under 300 characters");
  const payload = { topic: t, today: todayISO(), user_data: buildHealthContext({ sections: DEEP_DIVE_SECTIONS }) };
  const { data, provider, model } = await chatJSON("guides", systemPrompt(DEEP_DIVE_TASK, { json: true }), JSON.stringify(payload));
  const fields = {
    title: String(data.title || t).trim().slice(0, 140),
    topic: t,
    markdown: data.markdown || "",
    context_json: JSON.stringify(payload),
    llm_provider: provider,
    llm_model: model,
  };
  if (replaceId) {
    const cols = Object.keys(fields);
    db.prepare(`UPDATE guides SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`)
      .run(...cols.map((c) => fields[c]), replaceId);
    return getGuide(replaceId);
  }
  const id = uuid();
  const cols = ["kind", ...Object.keys(fields)];
  db.prepare(`INSERT INTO guides (id, user_id, ${cols.join(", ")}) VALUES (?, ?, ${cols.map(() => "?").join(", ")})`)
    .run(id, userId, "deep_dive", ...Object.values(fields));
  return getGuide(id);
}

/** Re-run a guide with fresh data (same row). */
export async function regenerateGuide(id) {
  const g = getGuide(id);
  if (g.kind === "weekly_review") return generateWeeklyReview(g.period_start);
  if (g.kind === "lab_explainer" && g.lab_report_id) return generateLabExplainer(g.lab_report_id);
  if (g.kind === "deep_dive") return generateDeepDive(g.topic, { replaceId: id });
  throw new HttpError(400, "This guide can't be regenerated");
}

/** Topic ideas drawn from the user's own data. */
export function suggestedTopics() {
  const out = [];
  const labs = labsContext();
  // "Total cholesterol" → "total cholesterol", but keep acronyms like "LDL".
  const inSentence = (s) => (/^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s);
  for (const r of (labs?.results || []).filter((x) => x.flag).slice(0, 2)) out.push(`My ${inSentence(r.marker)} and what moves it`);
  const h = headachesContext(todayISO());
  if (h?.headaches_last_30d >= 2) out.push("What might be behind my headaches");
  const ctx = buildHealthContext({ sections: ["nutrition_30d", "running_8w", "profile"] });
  const n = ctx.nutrition_30d;
  if (n) {
    const [over, of] = String(n.over_sodium_limit).split(" of ").map(Number);
    if (of && over / of >= 0.3) out.push("Cutting sodium without hating my food");
    const [hit, total] = String(n.protein_target_hit).split(" of ").map(Number);
    if (total && hit / total < 0.5) out.push("Hitting my protein target more often");
  }
  if (ctx.running_8w?.by_week?.length) out.push("Building my weekly mileage safely");
  if (ctx.profile?.conditions?.some((c) => /cholesterol|lipid/i.test(c))) out.push("Food changes that lower LDL the most");
  out.push("Recovering better between runs and lifting days", "How my sleep affects my training");
  return [...new Set(out)].slice(0, 6);
}
