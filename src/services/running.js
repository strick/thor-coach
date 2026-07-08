import { db, uuid } from "../db.js";
import { HttpError } from "../http.js";

const FIELDS = [
  "session_date", "start_time", "end_time", "distance_miles", "duration_minutes", "pace_min_per_mile",
  "elevation_gain_ft", "elevation_loss_ft", "avg_heart_rate", "max_heart_rate", "calories_burned",
  "weather", "surface", "effort_level", "notes", "location", "gps_file_url",
];

export function listSessions({ start, end, limit } = {}) {
  return db.prepare(
    "SELECT * FROM running_sessions WHERE session_date BETWEEN ? AND ? ORDER BY session_date DESC, start_time DESC LIMIT ?"
  ).all(start || "0000-01-01", end || "9999-12-31", Number(limit) || 200);
}

export function getSession(id) {
  const s = db.prepare("SELECT * FROM running_sessions WHERE id = ?").get(id);
  if (!s) throw new HttpError(404, "Running session not found");
  return s;
}

export function createSession(body) {
  if (!body.session_date || body.distance_miles == null || body.duration_minutes == null) {
    throw new HttpError(400, "session_date, distance_miles and duration_minutes are required");
  }
  const id = body.id || uuid();
  const pace = body.pace_min_per_mile ?? (body.distance_miles > 0 ? Number((body.duration_minutes / body.distance_miles).toFixed(2)) : null);
  db.prepare(
    `INSERT INTO running_sessions (id, ${FIELDS.join(", ")}) VALUES (?, ${FIELDS.map(() => "?").join(", ")})`
  ).run(id, ...FIELDS.map((f) => (f === "pace_min_per_mile" ? pace : body[f] ?? null)));
  return getSession(id);
}

export function updateSession(id, patch) {
  getSession(id);
  const updates = FIELDS.filter((f) => patch[f] !== undefined);
  if (!updates.length) throw new HttpError(400, "No updatable fields in body");
  db.prepare(
    `UPDATE running_sessions SET ${updates.map((f) => `${f} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`
  ).run(...updates.map((f) => patch[f]), id);
  return getSession(id);
}

export function deleteSession(id) {
  const r = db.prepare("DELETE FROM running_sessions WHERE id = ?").run(id);
  if (!r.changes) throw new HttpError(404, "Running session not found");
  return { deleted: id };
}

export function stats(start, end) {
  return db.prepare(
    `SELECT COUNT(*) AS total_sessions, COALESCE(SUM(distance_miles),0) AS total_distance,
            COALESCE(SUM(duration_minutes),0) AS total_duration, AVG(pace_min_per_mile) AS avg_pace,
            COALESCE(SUM(elevation_gain_ft),0) AS total_elevation_gain, AVG(avg_heart_rate) AS avg_heart_rate,
            COALESCE(SUM(calories_burned),0) AS total_calories
     FROM running_sessions WHERE session_date BETWEEN ? AND ?`
  ).get(start || "0000-01-01", end || "9999-12-31");
}

export function weeklyStats(weeks = 12) {
  return db.prepare(
    `SELECT strftime('%Y-W%W', session_date) AS week, MIN(session_date) AS start_date,
            COUNT(*) AS sessions, ROUND(SUM(distance_miles), 1) AS distance,
            SUM(duration_minutes) AS duration, ROUND(AVG(pace_min_per_mile), 2) AS avg_pace
     FROM running_sessions GROUP BY week ORDER BY start_date DESC LIMIT ?`
  ).all(weeks);
}
