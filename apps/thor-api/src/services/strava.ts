import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN } from "../config.js";

interface StravaTokenResponse {
  access_token: string;
  expires_at: number;
  refresh_token: string;
}

interface StravaActivity {
  id: number;
  name: string;
  distance: number; // in meters
  moving_time: number; // in seconds
  elapsed_time: number; // in seconds
  total_elevation_gain: number; // in meters
  start_date_local: string; // ISO 8601 format
  type: string; // "Run", "Ride", etc.
  average_heartrate?: number;
  max_heartrate?: number;
  calories?: number;
}

interface RunningSyncResult {
  success: boolean;
  activitiesSynced: number;
  activities: Array<{
    id: string;
    name: string;
    distance: number;
    duration: number;
    date: string;
    session?: any; // Full session data
  }>;
  error?: string;
}

let cachedAccessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Get a valid Strava access token, refreshing if needed
 */
async function getAccessToken(): Promise<string> {
  // Return cached token if still valid (with 5 minute buffer)
  if (cachedAccessToken && Date.now() / 1000 < tokenExpiresAt - 300) {
    return cachedAccessToken;
  }

  if (!STRAVA_CLIENT_ID || !STRAVA_CLIENT_SECRET || !STRAVA_REFRESH_TOKEN) {
    throw new Error("Strava credentials not configured. Please set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN in environment variables.");
  }

  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: STRAVA_CLIENT_ID,
      client_secret: STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: STRAVA_REFRESH_TOKEN,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Strava token: ${response.statusText}`);
  }

  const data: StravaTokenResponse = await response.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = data.expires_at;

  return cachedAccessToken;
}

/**
 * Fetch Strava activities for a specific date
 */
async function fetchActivitiesByDate(date: string): Promise<StravaActivity[]> {
  const accessToken = await getAccessToken();

  // Parse the date and create start/end timestamps for the day
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  const after = Math.floor(startOfDay.getTime() / 1000);
  const before = Math.floor(endOfDay.getTime() / 1000);

  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${after}&before=${before}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch Strava activities: ${response.statusText}`);
  }

  const activities: StravaActivity[] = await response.json();

  // Filter to only running activities
  return activities.filter((activity) => activity.type === "Run");
}

/**
 * Convert Strava activity to running session format
 */
function convertStravaActivityToSession(activity: StravaActivity) {
  const distanceMiles = activity.distance / 1609.34; // meters to miles
  const durationMinutes = Math.round(activity.moving_time / 60); // seconds to minutes
  const paceMinPerMile = durationMinutes / distanceMiles;
  const elevationGainFt = Math.round(activity.total_elevation_gain * 3.28084); // meters to feet

  // Extract date and approximate times from start_date_local
  const startDate = new Date(activity.start_date_local);
  const sessionDate = startDate.toISOString().split("T")[0];
  const startTime = startDate.toTimeString().substring(0, 5); // HH:MM format

  const endDate = new Date(startDate.getTime() + activity.moving_time * 1000);
  const endTime = endDate.toTimeString().substring(0, 5);

  return {
    id: `strava-${activity.id}`,
    session_date: sessionDate,
    start_time: startTime,
    end_time: endTime,
    distance_miles: Number(distanceMiles.toFixed(2)),
    duration_minutes: durationMinutes,
    pace_min_per_mile: Number(paceMinPerMile.toFixed(2)),
    elevation_gain_ft: elevationGainFt,
    elevation_loss_ft: null,
    avg_heart_rate: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    max_heart_rate: activity.max_heartrate ? Math.round(activity.max_heartrate) : null,
    calories_burned: activity.calories || null,
    weather: null,
    surface: null,
    effort_level: null,
    notes: `Synced from Strava: ${activity.name}`,
    location: null,
    gps_file_url: `https://www.strava.com/activities/${activity.id}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Sync Strava activities for a specific date
 */
export async function syncStravaActivities(date: string): Promise<RunningSyncResult> {
  try {
    const activities = await fetchActivitiesByDate(date);

    if (activities.length === 0) {
      return {
        success: true,
        activitiesSynced: 0,
        activities: [],
      };
    }

    const sessions = activities.map(convertStravaActivityToSession);

    return {
      success: true,
      activitiesSynced: sessions.length,
      activities: sessions.map((s) => ({
        id: s.id,
        name: s.notes || "",
        distance: s.distance_miles,
        duration: s.duration_minutes,
        date: s.session_date,
        session: s, // Include full session data
      })),
    };
  } catch (error) {
    return {
      success: false,
      activitiesSynced: 0,
      activities: [],
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}

/**
 * Check if Strava is configured
 */
export function isStravaConfigured(): boolean {
  return Boolean(STRAVA_CLIENT_ID && STRAVA_CLIENT_SECRET && STRAVA_REFRESH_TOKEN);
}
