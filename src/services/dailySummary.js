import { db } from "../db.js";
import { chatJSON } from "../llm.js";
import { todayISO } from "../config.js";
import { systemPrompt } from "./persona.js";
import { buildHealthContext } from "./healthContext.js";

export const DAILY_SECTIONS = [
  "profile", "medications", "today", "last7", "nutrition_30d", "training_4w", "running_8w", "body",
  "checkins_14d", "headaches_90d",
];

const TASK = `Write the user's end-of-day summary from the JSON data you're given. Return JSON: {"markdown": string}.

Use these headings, in this order. Skip a middle section entirely if there is nothing meaningful to say in it, but always include the first and last:
## Today at a glance
2–3 warm, honest sentences on how the day went overall.
## What went well
1–3 specific bullets with numbers (protein hit, a lift that moved up, a solid run, sodium under target...).
## Patterns worth noticing
Use the 7- and 30-day data. Name 1–3 real patterns (e.g. "protein under target on 4 of the 5 days you logged", "sodium over your limit on 9 of 22 logged days") and say in one sentence why each matters. Mention confidence only where it's genuinely uncertain (few logged days, mixed research). This is not a list of failures — frame it as useful information.
## Food & heart health
How eating lines up with their targets and diet style. For DASH / heart health focus on sodium, saturated fat, fiber and potassium; mention cholesterol if they have a cholesterol-related condition.
## Training & recovery
Lifting and running together: training rhythm, weekly mileage versus prior weeks, long run, easy/hard balance, heart rate, ramp warnings, and whether protein supports recovery.
## Headaches & sleep
Only if there is headache or check-in data. Recent headaches, sleep and stress. Mention a pattern only if it's marked "possible" or "strong" in patterns_in_logs, and always as an association in their own logs, not a cause. If medication_overuse status is "watch" or "warn", say so plainly and kindly, and suggest raising it with their doctor.
## Try tomorrow
1–2 small, concrete actions tied to what you saw today.

Rules:
- Use the numbers you're given. Don't invent data; if something important wasn't logged, say so once (e.g. "no food logged today").
- Keep it tight: about 200–250 words in total, readable in under a minute. Short bullets beat paragraphs.`;

export async function generateDailySummary(date = todayISO()) {
  const context = buildHealthContext({ date, sections: DAILY_SECTIONS });
  const user = `Data for ${date} (JSON):\n${JSON.stringify(context)}`;

  const { data: result, provider, model } = await chatJSON("daily_summary", systemPrompt(TASK, { json: true }), user);
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
