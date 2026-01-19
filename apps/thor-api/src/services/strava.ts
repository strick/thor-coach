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

  // Parse the date string - should be in YYYY-MM-DD format
  // Query a 48-hour window around the requested date to account for timezone variations
  // Strava's start_date_local is in the athlete's local timezone, so we need a wide range
  // date format: YYYY-MM-DD
  const [year, month, day] = date.split("-").map(Number);
  
  // Create timestamps using a simple approach: treat the date as a point in time
  // Use noon UTC on the requested date as the reference point
  const referenceDate = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  const referenceTimestamp = Math.floor(referenceDate.getTime() / 1000);

  // Query with a 36-hour window centered on the reference point
  // This catches activities from ~midnight to midnight in most timezones
  const adjustedAfter = referenceTimestamp - 64800; // ~18 hours before noon
  const adjustedBefore = referenceTimestamp + 64800; // ~18 hours after noon

  console.log(`[Strava] Fetching activities for date: ${date}, timestamp range: ${adjustedAfter} to ${adjustedBefore}`);

  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?after=${adjustedAfter}&before=${adjustedBefore}`,
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
  const paceMinPerMile = distanceMiles > 0 ? durationMinutes / distanceMiles : 0;
  const elevationGainFt = Math.round(activity.total_elevation_gain * 3.28084); // meters to feet

  // Extract date and approximate times from start_date_local
  // start_date_local is in ISO format but represents LOCAL time, not UTC
  // Parse it as local time by extracting the date portion directly
  const dateMatch = activity.start_date_local.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const sessionDate = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : new Date().toISOString().split("T")[0];
  
  const timeMatch = activity.start_date_local.match(/T(\d{2}):(\d{2}):(\d{2})/);
  const startTime = timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : "00:00"; // HH:MM format

  // Calculate end time by adding duration
  const [hours, minutes] = startTime.split(":").map(Number);
  const endMinutes = minutes + durationMinutes;
  const endHours = (hours + Math.floor(endMinutes / 60)) % 24;
  const endTime = `${String(endHours).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;

  // Calculate calories if not provided by Strava
  // Use a formula based on distance and heart rate if available, otherwise use distance-based estimate
  let caloriesBurned = activity.calories || null;
  if (!caloriesBurned && distanceMiles > 0) {
    // Estimate calories: ~100 calories per mile for average running
    // This varies by body weight and intensity, but ~100/mile is a reasonable average
    caloriesBurned = Math.round(distanceMiles * 100);
    
    // Adjust if heart rate data is available (higher HR = higher intensity = more calories)
    if (activity.average_heartrate && activity.average_heartrate > 150) {
      // High intensity running burns more calories
      caloriesBurned = Math.round(caloriesBurned * 1.1);
    } else if (activity.average_heartrate && activity.average_heartrate < 140) {
      // Lower intensity burns fewer calories
      caloriesBurned = Math.round(caloriesBurned * 0.9);
    }
  }

  // Use strava-prefixed ID to distinguish from manually logged sessions
  // and prevent duplicate imports
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
    calories_burned: caloriesBurned,
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

    console.log(`[Strava] Fetched ${activities.length} activities for date: ${date}`);
    
    // Filter to only activities from the requested date
    const filteredActivities = activities.filter((activity) => {
      const activityDate = activity.start_date_local.split("T")[0];
      const matches = activityDate === date;
      console.log(`[Strava] Activity ${activity.id}: ${activity.name}, start_date_local: ${activity.start_date_local}, extracted: ${activityDate}, matches requested ${date}: ${matches}`);
      return matches;
    });

    console.log(`[Strava] Filtered to ${filteredActivities.length} activities matching date ${date}`);

    if (filteredActivities.length === 0) {
      return {
        success: true,
        activitiesSynced: 0,
        activities: [],
      };
    }

    const sessions = filteredActivities.map(convertStravaActivityToSession);

    console.log(`[Strava] Converted to sessions:`, sessions.map(s => ({ id: s.id, session_date: s.session_date, start_time: s.start_time })));

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
    console.error(`[Strava] Error syncing activities:`, error);
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
