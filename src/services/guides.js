// Guides: AI explainers kept in a library. Lab explainers (one per confirmed
// report), weekly health reviews, and on-demand deep dives.
import { db, uuid, tx } from "../db.js";
import { DEFAULT_USER_ID } from "../config.js";
import { HttpError } from "../http.js";
import { chatJSON } from "../llm.js";
import { systemPrompt } from "./persona.js";
import { buildHealthContext } from "./healthContext.js";
import { explainerInput } from "./labs.js";

export const GUIDE_KINDS = ["lab_explainer", "weekly_review", "deep_dive"];

const fmtDate = (iso) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

export function getGuide(id) {
  const g = db.prepare("SELECT * FROM guides WHERE id = ?").get(id);
  if (!g) throw new HttpError(404, "Guide not found");
  return { ...g, pinned: Boolean(g.pinned), context_json: undefined, has_context: Boolean(g.context_json) };
}

/** Insert or update the single guide matching `match` (e.g. one explainer per report). */
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
