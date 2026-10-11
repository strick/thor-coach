// Strava integration: OAuth token refresh (refresh token persisted in DB and
// rotated automatically), activity fetch, and sync into running_sessions.
import { db, uuid, getSetting, setSetting } from "../db.js";
import { BASE_URL, STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } from "../config.js";
import { HttpError } from "../http.js";

const REFRESH_TOKEN_KEY = "strava.refresh_token";
const OAUTH_STATE_KEY = "strava.oauth_state";
const SCOPE_KEY = "strava.scope";

let cachedAccessToken = null;
let tokenExpiresAt = 0;

const storedRefreshToken = () => getSetting(REFRESH_TOKEN_KEY) || STRAVA_REFRESH_TOKEN;

export function stravaStatus() {
  const clientConfigured = Boolean(STRAVA_CLIENT_ID && STRAVA_CLIENT_SECRET);
  const missing = [
    STRAVA_CLIENT_ID ? null : "STRAVA_CLIENT_ID",
    STRAVA_CLIENT_SECRET ? null : "STRAVA_CLIENT_SECRET",
    storedRefreshToken() ? null : "STRAVA_REFRESH_TOKEN",
  ].filter(Boolean);
  return {
    configured: missing.length === 0,
    can_connect: clientConfigured,
    missing,
    token_source: getSetting(REFRESH_TOKEN_KEY) ? "database" : STRAVA_REFRESH_TOKEN ? "env" : "none",
    scope: getSetting(SCOPE_KEY) || null,
  };
}

const isSecure = (req) =>
  (req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https" || Boolean(req.socket?.encrypted);
const baseUrl = (req) => BASE_URL || `${isSecure(req) ? "https" : "http"}://${req.headers.host || "localhost"}`;
const redirectUri = (req) => `${baseUrl(req)}/auth/strava/callback`;

/** Begin a one-time OAuth flow so stale/revoked tokens can be repaired in the UI. */
export function stravaConnectUrl(req) {
  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET) {
    throw new HttpError(400, "Set STRAVA_CLIENT_ID and STRAVA_CLIENT_SECRET before connecting Strava");
  }
  const state = uuid();
  setSetting(OAUTH_STATE_KEY, JSON.stringify({ state, expires_at: Date.now() + 10 * 60 * 1000 }));
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", STRAVA_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri(req));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("approval_prompt", "force");
  url.searchParams.set("scope", "read,activity:read_all");
  url.searchParams.set("state", state);
  return { url: url.href };
}

function stravaErrorDetail(data, fallback) {
  const details = Array.isArray(data?.errors)
    ? data.errors.map((e) => [e.resource, e.field, e.code].filter(Boolean).join(" ")).filter(Boolean).join(", ")
    : "";
  return String(data?.message || data?.error_description || data?.error || details || fallback).slice(0, 240);
}

/** Finish OAuth, persist Strava's newest refresh token, and prime the access-token cache. */
export async function finishStravaConnect(req, query) {
  let flow;
  try { flow = JSON.parse(getSetting(OAUTH_STATE_KEY) || "null"); } catch { flow = null; }
  setSetting(OAUTH_STATE_KEY, "");
  if (query.error) throw new HttpError(400, query.error_description || query.error);
  if (!flow || flow.expires_at < Date.now() || !query.state || query.state !== flow.state) {
    throw new HttpError(400, "Strava connection attempt expired or state did not match — try again");
  }
  if (!query.code) throw new HttpError(400, "Strava did not return an authorization code");

  const response = await fetchWithRetry("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: query.code,
      redirect_uri: redirectUri(req),
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.refresh_token || !data.access_token) {
    throw new HttpError(400, `Strava connection failed: ${stravaErrorDetail(data, `${response.status} ${response.statusText}`)}`);
  }
  const granted = String(query.scope || data.scope || "");
  if (granted && !granted.split(/[ ,]+/).some((s) => s === "activity:read" || s === "activity:read_all")) {
    throw new HttpError(400, "Strava activity access was not granted — reconnect and allow activity access");
  }
  setSetting(REFRESH_TOKEN_KEY, data.refresh_token);
  if (granted) setSetting(SCOPE_KEY, granted);
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Number(data.expires_at) || 0;
  return { connected: true };
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
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    const detail = stravaErrorDetail(data, `${response.status} ${response.statusText}`);
    if ([400, 401, 403].includes(response.status)) {
      throw new HttpError(502, `Strava authorization is stale or revoked (${detail}). Reconnect Strava and try again.`);
    }
    throw new HttpError(502, `Failed to refresh Strava authorization: ${detail}`);
  }
  if (!data.access_token) throw new HttpError(502, "Strava token refresh returned no access token");
  cachedAccessToken = data.access_token;
  tokenExpiresAt = Number(data.expires_at) || 0;
  if (data.refresh_token) setSetting(REFRESH_TOKEN_KEY, data.refresh_token);
  if (data.scope) setSetting(SCOPE_KEY, String(data.scope));
  return cachedAccessToken;
}

async function fetchAuthorized(url) {
  let accessToken = await getAccessToken();
  let response = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  // A cached access token can be invalidated before its advertised expiry.
  // Force one refresh; repeated auth failures need an explicit reconnect.
  if (response.status === 401) {
    cachedAccessToken = null;
    tokenExpiresAt = 0;
    accessToken = await getAccessToken();
    response = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  }
  return response;
}

async function assertActivitiesResponse(response) {
  if (response.ok) return response.json();
  const data = await response.json().catch(() => ({}));
  const detail = stravaErrorDetail(data, `${response.status} ${response.statusText}`);
  if (response.status === 403) {
    throw new HttpError(502, `Strava denied activity access (${detail}). Reconnect Strava and grant activity access.`);
  }
  if (response.status === 401) {
    throw new HttpError(502, `Strava authorization expired (${detail}). Reconnect Strava and try again.`);
  }
  if (response.status === 429) throw new HttpError(503, "Strava rate limit reached — wait a few minutes and try again");
  throw new HttpError(502, `Strava activities request failed: ${detail}`);
}

async function fetchActivitiesByDate(date) {
  const [year, month, day] = date.split("-").map(Number);
  // 36-hour window centered on noon UTC covers the local day in any timezone;
  // results are filtered exactly by start_date_local afterwards.
  const reference = Math.floor(Date.UTC(year, month - 1, day, 12) / 1000);
  const response = await fetchAuthorized(
    `https://www.strava.com/api/v3/athlete/activities?after=${reference - 64800}&before=${reference + 64800}`
  );
  const activities = await assertActivitiesResponse(response);
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
    const after = Math.floor(Date.UTC(...start.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v))) / 1000) - 86400;
    const before = Math.floor(Date.UTC(...end.split("-").map(Number).map((v, i) => (i === 1 ? v - 1 : v))) / 1000) + 2 * 86400;

    const all = [];
    for (let page = 1; page <= 5; page += 1) {
      const resp = await fetchAuthorized(
        `https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}&per_page=100&page=${page}`
      );
      const batch = await assertActivitiesResponse(resp);
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
