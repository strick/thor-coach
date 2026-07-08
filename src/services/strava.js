// Strava integration: OAuth token refresh (refresh token persisted in DB and
// rotated automatically), activity fetch, and sync into running_sessions.
import { db, uuid, getSetting, setSetting } from "../db.js";
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } from "../config.js";
import { HttpError } from "../http.js";

const REFRESH_TOKEN_KEY = "strava.refresh_token";

let cachedAccessToken = null;
let tokenExpiresAt = 0;

const storedRefreshToken = () => getSetting(REFRESH_TOKEN_KEY) || STRAVA_REFRESH_TOKEN;

export function stravaStatus() {
  const missing = [
    STRAVA_CLIENT_ID ? null : "STRAVA_CLIENT_ID",
    STRAVA_CLIENT_SECRET ? null : "STRAVA_CLIENT_SECRET",
    storedRefreshToken() ? null : "STRAVA_REFRESH_TOKEN",
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    missing,
    token_source: getSetting(REFRESH_TOKEN_KEY) ? "database" : STRAVA_REFRESH_TOKEN ? "env" : "none",
  };
}

async function fetchWithRetry(url, init, attempts = 2) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt === attempts) return response;
    } catch (err) {
      lastError = err;
      if (attempt === attempts) throw err;
    }
    await new Promise((r) => setTimeout(r, 250 * attempt));
  }
  throw lastError ?? new Error("Strava request failed");
}

async function getAccessToken() {
  if (cachedAccessToken && Date.now() / 1000 < tokenExpiresAt - 300) return cachedAccessToken;

  const refreshToken = storedRefreshToken();
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !refreshToken) {
    throw new HttpError(400, "Strava is not configured. Set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET and STRAVA_REFRESH_TOKEN in .env");
  }

  const response = await fetchWithRetry("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok) throw new HttpError(502, `Failed to refresh Strava token: ${response.status} ${response.statusText}`);

  const data = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = data.expires_at;
  if (data.refresh_token) setSetting(REFRESH_TOKEN_KEY, data.refresh_token);
  return cachedAccessToken;
}

async function fetchActivitiesByDate(date) {
  const accessToken = await getAccessToken();
  const [year, month, day] = date.split("-").map(Number);
  // 36-hour window centered on noon UTC covers the local day in any timezone;
  // results are filtered exactly by start_date_local afterwards.
  const reference = Math.floor(Date.UTC(year, month - 1, day, 12) / 1000);
  const response = await fetchWithRetry(
    `https://www.strava.com/api/v3/athlete/activities?after=${reference - 64800}&before=${reference + 64800}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) throw new HttpError(502, `Failed to fetch Strava activities: ${response.status} ${response.statusText}`);
  const activities = await response.json();
  return activities.filter((a) => a.type === "Run" && a.start_date_local?.startsWith(date));
}

function toSession(activity) {
  const distanceMiles = activity.distance / 1609.34;
  const durationMinutes = Math.round(activity.moving_time / 60);
  const startTime = activity.start_date_local.match(/T(\d{2}:\d{2})/)?.[1] ?? "00:00";
  const [h, m] = startTime.split(":").map(Number);
  const endTotal = h * 60 + m + durationMinutes;
  const endTime = `${String(Math.floor(endTotal / 60) % 24).padStart(2, "0")}:${String(endTotal % 60).padStart(2, "0")}`;

  let calories = activity.calories || null;
  if (!calories && distanceMiles > 0) {
    calories = Math.round(distanceMiles * 100);
    if (activity.average_heartrate > 150) calories = Math.round(calories * 1.1);
    else if (activity.average_heartrate && activity.average_heartrate < 140) calories = Math.round(calories * 0.9);
  }

  return {
    id: `strava-${activity.id}`,
    session_date: activity.start_date_local.slice(0, 10),
    start_time: startTime,
    end_time: endTime,
    distance_miles: Number(distanceMiles.toFixed(2)),
    duration_minutes: durationMinutes,
    pace_min_per_mile: distanceMiles > 0 ? Number((durationMinutes / distanceMiles).toFixed(2)) : null,
    elevation_gain_ft: Math.round((activity.total_elevation_gain || 0) * 3.28084),
    avg_heart_rate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    max_heart_rate: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
    calories_burned: calories,
    notes: `Synced from Strava: ${activity.name}`,
    gps_file_url: `https://www.strava.com/activities/${activity.id}`,
  };
}

/** Sync Strava runs for a date into running_sessions (idempotent by strava id). */
export async function syncStrava(date) {
  const runId = uuid();
  db.prepare("INSERT INTO strava_sync_runs (id, sync_date, status, started_at) VALUES (?, ?, 'started', datetime('now'))").run(runId, date);

  try {
    const sessions = (await fetchActivitiesByDate(date)).map(toSession);
    const inserted = insertSessions(sessions);
    db.prepare("UPDATE strava_sync_runs SET status = 'success', activities_synced = ?, finished_at = datetime('now') WHERE id = ?").run(inserted, runId);
    return { success: true, found: sessions.length, imported: inserted, sessions };
  } catch (err) {
    db.prepare("UPDATE strava_sync_runs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?").run(String(err.message || err), runId);
    throw err;
  }
}

const RUN_INSERT_SQL = `INSERT OR IGNORE INTO running_sessions
  (id, session_date, start_time, end_time, distance_miles, duration_minutes, pace_min_per_mile,
   elevation_gain_ft, avg_heart_rate, max_heart_rate, calories_burned, notes, gps_file_url, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;

function insertSessions(sessions) {
  const insert = db.prepare(RUN_INSERT_SQL);
  let inserted = 0;
  for (const s of sessions) {
    inserted += insert.run(
      s.id, s.session_date, s.start_time, s.end_time, s.distance_miles, s.duration_minutes,
      s.pace_min_per_mile, s.elevation_gain_ft, s.avg_heart_rate, s.max_heart_rate,
      s.calories_burned, s.notes, s.gps_file_url
    ).changes;
  }
  return inserted;
}

/** Backfill a date range (inclusive, max 90 days) in one paginated pass. */
export async function syncStravaRange(start, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) {
    throw new HttpError(400, "start and end must be YYYY-MM-DD with start <= end");
  }
  const days = (new Date(end) - new Date(start)) / 86400000;
  if (days > 90) throw new HttpError(400, "Backfill window is capped at 90 days");

  const label = `${start}..${end}`;
  const runId = uuid();
  db.prepare("INSERT INTO strava_sync_runs (id, sync_date, status, started_at) VALUES (?, ?, 'started', datetime('now'))").run(runId, label);

  try {
    const accessToken = await getAccessToken();
    const after = Math.floor(Date.UTC(...start.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v))) / 1000) - 86400;
    const before = Math.floor(Date.UTC(...end.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v))) / 1000) + 2 * 86400;

    const all = [];
    for (let page = 1; page <= 5; page += 1) {
      const resp = await fetchWithRetry(
        `https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=100&page=${page}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!resp.ok) throw new HttpError(502, `Strava activities fetch failed: ${resp.status} ${resp.statusText}`);
      const batch = await resp.json();
      all.push(...batch);
      if (batch.length < 100) break;
    }

    const sessions = all
      .filter((a) => a.type === "Run" && a.start_date_local >= start && a.start_date_local.slice(0, 10) <= end)
      .map(toSession);
    const inserted = insertSessions(sessions);

    db.prepare("UPDATE strava_sync_runs SET status = 'success', activities_synced = ?, finished_at = datetime('now') WHERE id = ?").run(inserted, runId);
    return { success: true, range: label, found: sessions.length, imported: inserted };
  } catch (err) {
    db.prepare("UPDATE strava_sync_runs SET status = 'failed', error = ?, finished_at = datetime('now') WHERE id = ?").run(String(err.message || err), runId);
    throw err;
  }
}

/** Throttled sync for automatic calls (dashboard open): no-op when unconfigured or recently synced. */
export async function autoSync(date) {
  if (!stravaStatus().configured) return { skipped: "not_configured" };
  const last = db.prepare(
    "SELECT started_at FROM strava_sync_runs WHERE sync_date = ? AND status = 'success' ORDER BY started_at DESC LIMIT 1"
  ).get(date);
  if (last && Date.now() - new Date(last.started_at.replace(" ", "T") + "Z").getTime() < 30 * 60 * 1000) {
    return { skipped: "recent" };
  }
  return syncStrava(date);
}

export function syncHistory(limit = 20) {
  return db.prepare("SELECT * FROM strava_sync_runs ORDER BY started_at DESC LIMIT ?").all(limit);
}
