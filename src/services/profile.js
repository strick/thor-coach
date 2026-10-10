// Health profile + medications & supplements: the standing facts every advice
// prompt is personalized with (replaces the profile the old prompts hard-coded).
import { db, uuid, tx } from "../db.js";
import { DEFAULT_USER_ID, todayISO } from "../config.js";
import { HttpError } from "../http.js";
import { getGoals, upsertGoals } from "./nutrition.js";

export const DIET_STYLES = ["DASH", "Mediterranean", "Balanced", "Lower-carb", "Vegetarian", "Vegan", "Other"];
export const SEXES = ["male", "female", "other"];
const PROFILE_FIELDS = [
  "birth_date", "sex", "height_in", "conditions", "allergies", "family_history", "goals", "diet_style", "doctor_notes",
];
const MED_KINDS = ["med", "supplement"];
const MED_FIELDS = ["name", "dose", "frequency", "kind", "purpose", "as_needed", "active", "started_on", "stopped_on", "notes"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function ageFrom(birthDate, today = todayISO()) {
  if (!birthDate || !ISO_DATE.test(birthDate)) return null;
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

const lines = (s) => String(s || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export function getProfile(userId = DEFAULT_USER_ID) {
  const row = db.prepare("SELECT * FROM health_profile WHERE user_id = ?").get(userId) || { user_id: userId };
  const dietStyle = row.diet_style || getGoals(userId)?.diet_style || null;
  return { ...row, diet_style: dietStyle, age: ageFrom(row.birth_date) };
}

export function updateProfile(patch = {}, userId = DEFAULT_USER_ID) {
  const clean = {};
  for (const f of PROFILE_FIELDS) {
    if (!(f in patch)) continue;
    let v = patch[f];
    if (typeof v === "string") v = v.trim();
    if (v === "") v = null;
    clean[f] = v;
  }
  if (clean.birth_date != null && !ISO_DATE.test(clean.birth_date)) throw new HttpError(400, "birth_date must be YYYY-MM-DD");
  if (clean.sex != null && !SEXES.includes(clean.sex)) throw new HttpError(400, `sex must be one of ${SEXES.join(", ")}`);
  if (clean.height_in != null) {
    clean.height_in = Number(clean.height_in);
    if (!(clean.height_in > 36 && clean.height_in < 96)) throw new HttpError(400, "height_in must be between 36 and 96");
  }
  if (clean.diet_style != null && !DIET_STYLES.includes(clean.diet_style)) {
    throw new HttpError(400, `diet_style must be one of ${DIET_STYLES.join(", ")}`);
  }

  return tx(() => {
    const current = db.prepare("SELECT * FROM health_profile WHERE user_id = ?").get(userId);
    if (!current) db.prepare("INSERT INTO health_profile (user_id) VALUES (?)").run(userId);
    const keys = Object.keys(clean);
    if (keys.length) {
      db.prepare(
        `UPDATE health_profile SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE user_id = ?`
      ).run(...keys.map((k) => clean[k]), userId);
    }
    // Diet style also drives nutrition targets: record it as a new goals row
    // (goals are append-only; the latest row wins).
    if (clean.diet_style && clean.diet_style !== getGoals(userId)?.diet_style) {
      upsertGoals(userId, { ...(getGoals(userId) || {}), diet_style: clean.diet_style });
    }
    return getProfile(userId);
  });
}

// --- Medications & supplements ---

function medRow(id) {
  return db.prepare("SELECT * FROM medications WHERE id = ?").get(id);
}

function cleanMed(input, { partial }) {
  const out = {};
  for (const f of MED_FIELDS) {
    if (!(f in input)) continue;
    let v = input[f];
    if (typeof v === "string") v = v.trim();
    if (v === "") v = null;
    out[f] = v;
  }
  if (!partial && !out.name) throw new HttpError(400, "name is required");
  if ("name" in out && !out.name) throw new HttpError(400, "name can't be empty");
  if (out.kind != null && !MED_KINDS.includes(out.kind)) throw new HttpError(400, "kind must be 'med' or 'supplement'");
  for (const b of ["as_needed", "active"]) if (b in out) out[b] = out[b] ? 1 : 0;
  for (const d of ["started_on", "stopped_on"]) {
    if (out[d] != null && !ISO_DATE.test(out[d])) throw new HttpError(400, `${d} must be YYYY-MM-DD`);
  }
  return out;
}

export function listMedications({ active } = {}, userId = DEFAULT_USER_ID) {
  const onlyActive = active === true || active === "1" || active === 1;
  return db
    .prepare(
      `SELECT * FROM medications WHERE user_id = ? ${onlyActive ? "AND active = 1" : ""}
       ORDER BY active DESC, kind, as_needed, name COLLATE NOCASE`
    )
    .all(userId);
}

export function addMedication(input, userId = DEFAULT_USER_ID) {
  const m = cleanMed(input, { partial: false });
  const id = uuid();
  const cols = ["id", "user_id", ...Object.keys(m)];
  db.prepare(`INSERT INTO medications (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`).run(
    id, userId, ...Object.values(m)
  );
  return medRow(id);
}

export function updateMedication(id, patch) {
  if (!medRow(id)) throw new HttpError(404, "Medication not found");
  const m = cleanMed(patch, { partial: true });
  // Turning something off records when, unless a date was given.
  if (m.active === 0 && !("stopped_on" in m) && !medRow(id).stopped_on) m.stopped_on = todayISO();
  const keys = Object.keys(m);
  if (keys.length) {
    db.prepare(`UPDATE medications SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`)
      .run(...keys.map((k) => m[k]), id);
  }
  return medRow(id);
}

export function deleteMedication(id) {
  const r = db.prepare("DELETE FROM medications WHERE id = ?").run(id);
  if (!r.changes) throw new HttpError(404, "Medication not found");
  return { deleted: id };
}

/** Compact profile for LLM context: only fields with content, lists split out. */
export function profileForPrompt(userId = DEFAULT_USER_ID) {
  const p = getProfile(userId);
  const out = {
    age: p.age,
    sex: p.sex,
    height_in: p.height_in,
    conditions: lines(p.conditions),
    allergies: lines(p.allergies),
    family_history: lines(p.family_history),
    goals: lines(p.goals),
    diet_style: p.diet_style,
    doctor_notes: p.doctor_notes,
  };
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)));
}

export function medicationsForPrompt(userId = DEFAULT_USER_ID) {
  return listMedications({ active: true }, userId).map((m) =>
    Object.fromEntries(
      Object.entries({
        name: m.name,
        dose: m.dose,
        frequency: m.frequency,
        kind: m.kind,
        as_needed: m.as_needed ? true : undefined,
        purpose: m.purpose,
        since: m.started_on,
      }).filter(([, v]) => v != null)
    )
  );
}
