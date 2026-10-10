// Daily check-in: ~20 seconds of sleep / stress / energy / caffeine / alcohol,
// the context headache patterns (and summaries) need.
import { db } from "../db.js";
import { DEFAULT_USER_ID, todayISO } from "../config.js";
import { HttpError } from "../http.js";
import { addDays, avg, round } from "../util.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const CHECKIN_FIELDS = {
  sleep_hours: { min: 0, max: 24 },
  sleep_quality: { min: 1, max: 5, int: true },
  stress: { min: 1, max: 5, int: true },
  energy: { min: 1, max: 5, int: true },
  caffeine_servings: { min: 0, max: 20 },
  alcohol_drinks: { min: 0, max: 30 },
  notes: { text: true },
};

export function getCheckin(date = todayISO(), userId = DEFAULT_USER_ID) {
  return db.prepare("SELECT * FROM daily_checkins WHERE user_id = ? AND date = ?").get(userId, date) || { date, user_id: userId, empty: true };
}

export function listCheckins(start, end, userId = DEFAULT_USER_ID) {
  return db
    .prepare("SELECT * FROM daily_checkins WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date DESC")
    .all(userId, start || "0000-01-01", end || "9999-12-31");
}

/** Partial upsert: fields present in `patch` overwrite (null clears); absent fields are kept. */
export function upsertCheckin(date, patch = {}, userId = DEFAULT_USER_ID) {
  const day = date || todayISO();
  if (!ISO_DATE.test(day)) throw new HttpError(400, "date must be YYYY-MM-DD");
  const clean = {};
  for (const [field, rule] of Object.entries(CHECKIN_FIELDS)) {
    if (!(field in patch)) continue;
    let v = patch[field];
    if (v === "" || v === undefined) v = null;
    if (v != null && rule.text) v = String(v).trim().slice(0, 500) || null;
    if (v != null && !rule.text) {
      v = Number(v);
      if (!Number.isFinite(v) || v < rule.min || v > rule.max) throw new HttpError(400, `${field} must be between ${rule.min} and ${rule.max}`);
      if (rule.int) v = Math.round(v);
    }
    clean[field] = v;
  }
  const keys = Object.keys(clean);
  db.prepare("INSERT OR IGNORE INTO daily_checkins (user_id, date) VALUES (?, ?)").run(userId, day);
  if (keys.length) {
    db.prepare(
      `UPDATE daily_checkins SET ${keys.map((k) => `${k} = ?`).join(", ")}, updated_at = datetime('now') WHERE user_id = ? AND date = ?`
    ).run(...keys.map((k) => clean[k]), userId, day);
  }
  return getCheckin(day, userId);
}

/** Context section: 14-day check-in averages and last night's sleep. */
export function checkinsContext(end = todayISO(), userId = DEFAULT_USER_ID) {
  const start = addDays(end, -13);
  const rows = listCheckins(start, end, userId);
  if (!rows.length) return null;
  const mean = (k, d = 1) => round(avg(rows.map((r) => r[k])), d);
  const today = rows.find((r) => r.date === end);
  return {
    days_checked_in: `${rows.length} of 14`,
    averages: {
      sleep_hours: mean("sleep_hours"),
      sleep_quality_1to5: mean("sleep_quality"),
      stress_1to5: mean("stress"),
      energy_1to5: mean("energy"),
      caffeine_servings: mean("caffeine_servings"),
      alcohol_drinks: mean("alcohol_drinks"),
    },
    nights_under_6_5h: rows.filter((r) => r.sleep_hours != null && r.sleep_hours < 6.5).length,
    today: today
      ? Object.fromEntries(Object.entries(today).filter(([k, v]) => v != null && k in CHECKIN_FIELDS))
      : undefined,
  };
}
