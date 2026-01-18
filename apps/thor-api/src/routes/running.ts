import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { syncStravaActivities, isStravaConfigured } from "../services/strava.js";

const router = Router();

/**
 * GET /api/running/sessions - Get all running sessions
 * Query params: from (YYYY-MM-DD), to (YYYY-MM-DD), date (YYYY-MM-DD)
 */
router.get("/sessions", (req, res) => {
  try {
    const { from, to, date } = req.query;
    let query = `SELECT * FROM running_sessions`;
    const params: any[] = [];

    if (date) {
      query += ` WHERE session_date = ?`;
      params.push(date);
    } else if (from && to) {
      query += ` WHERE session_date >= ? AND session_date <= ?`;
      params.push(from, to);
    } else if (from) {
      query += ` WHERE session_date >= ?`;
      params.push(from);
    } else if (to) {
      query += ` WHERE session_date <= ?`;
      params.push(to);
    }

    query += ` ORDER BY session_date DESC, created_at DESC`;

    const sessions = db.prepare(query).all(...params);
    res.json({ sessions });
  } catch (error) {
    console.error("[Running] Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

/**
 * GET /api/running/sessions/:id - Get a specific running session
 */
router.get("/sessions/:id", (req, res) => {
  try {
    const session = db
      .prepare(`SELECT * FROM running_sessions WHERE id = ?`)
      .get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    res.json({ session });
  } catch (error) {
    console.error("[Running] Error fetching session:", error);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

/**
 * POST /api/running/sessions - Create a new running session
 */
router.post("/sessions", (req, res) => {
  try {
    const {
      session_date,
      start_time,
      end_time,
      distance_miles,
      duration_minutes,
      pace_min_per_mile,
      elevation_gain_ft,
      elevation_loss_ft,
      avg_heart_rate,
      max_heart_rate,
      calories_burned,
      weather,
      surface,
      effort_level,
      notes,
      location,
      gps_file_url,
    } = req.body;

    // Validate required fields
    if (!session_date || distance_miles === undefined || !duration_minutes) {
      return res
        .status(400)
        .json({ error: "Missing required fields: session_date, distance_miles, duration_minutes" });
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO running_sessions (
        id, session_date, start_time, end_time, distance_miles, duration_minutes,
        pace_min_per_mile, elevation_gain_ft, elevation_loss_ft, avg_heart_rate,
        max_heart_rate, calories_burned, weather, surface, effort_level, notes,
        location, gps_file_url, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      session_date,
      start_time || null,
      end_time || null,
      distance_miles,
      duration_minutes,
      pace_min_per_mile || null,
      elevation_gain_ft || null,
      elevation_loss_ft || null,
      avg_heart_rate || null,
      max_heart_rate || null,
      calories_burned || null,
      weather || null,
      surface || null,
      effort_level || null,
      notes || null,
      location || null,
      gps_file_url || null,
      now,
      now
    );

    const newSession = db
      .prepare(`SELECT * FROM running_sessions WHERE id = ?`)
      .get(id);
    res.status(201).json({ success: true, session: newSession });
  } catch (error) {
    console.error("[Running] Error creating session:", error);
    res.status(500).json({ error: "Failed to create session" });
  }
});

/**
 * PUT /api/running/sessions/:id - Update a running session
 */
router.put("/sessions/:id", (req, res) => {
  try {
    const { id } = req.params;

    // Check if session exists
    const existing = db.prepare(`SELECT * FROM running_sessions WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: "Session not found" });
    }

    const updates = req.body;
    const allowedFields = [
      "session_date",
      "start_time",
      "end_time",
      "distance_miles",
      "duration_minutes",
      "pace_min_per_mile",
      "elevation_gain_ft",
      "elevation_loss_ft",
      "avg_heart_rate",
      "max_heart_rate",
      "calories_burned",
      "weather",
      "surface",
      "effort_level",
      "notes",
      "location",
      "gps_file_url",
    ];

    // Build dynamic UPDATE query
    const updateFields: string[] = ["updated_at = ?"];
    const values: unknown[] = [new Date().toISOString()];

    for (const field of allowedFields) {
      if (field in updates) {
        updateFields.push(`${field} = ?`);
        values.push(updates[field]);
      }
    }

    values.push(id);

    const updateQuery = `UPDATE running_sessions SET ${updateFields.join(", ")} WHERE id = ?`;
    db.prepare(updateQuery).run(...values);

    const updatedSession = db
      .prepare(`SELECT * FROM running_sessions WHERE id = ?`)
      .get(id);
    res.json({ success: true, session: updatedSession });
  } catch (error) {
    console.error("[Running] Error updating session:", error);
    res.status(500).json({ error: "Failed to update session" });
  }
});

/**
 * DELETE /api/running/sessions/:id - Delete a running session
 */
router.delete("/sessions/:id", (req, res) => {
  try {
    const { id } = req.params;

    // Check if session exists
    const existing = db.prepare(`SELECT * FROM running_sessions WHERE id = ?`).get(id);
    if (!existing) {
      return res.status(404).json({ error: "Session not found" });
    }

    db.prepare(`DELETE FROM running_sessions WHERE id = ?`).run(id);
    res.json({ success: true, message: "Session deleted" });
  } catch (error) {
    console.error("[Running] Error deleting session:", error);
    res.status(500).json({ error: "Failed to delete session" });
  }
});

/**
 * GET /api/running/stats - Get running statistics
 */
router.get("/stats", (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_sessions,
        SUM(distance_miles) as total_distance,
        SUM(duration_minutes) as total_duration,
        AVG(pace_min_per_mile) as avg_pace,
        SUM(elevation_gain_ft) as total_elevation_gain,
        AVG(avg_heart_rate) as avg_heart_rate,
        SUM(calories_burned) as total_calories
      FROM running_sessions
    `).get();

    res.json({ stats });
  } catch (error) {
    console.error("[Running] Error fetching stats:", error);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

/**
 * GET /api/running/stats/weekly - Get weekly running statistics
 */
router.get("/stats/weekly", (req, res) => {
  try {
    const weeklyStats = db.prepare(`
      SELECT
        strftime('%Y-W%W', session_date) as week,
        COUNT(*) as sessions,
        SUM(distance_miles) as distance,
        SUM(duration_minutes) as duration,
        AVG(pace_min_per_mile) as avg_pace
      FROM running_sessions
      GROUP BY strftime('%Y-W%W', session_date)
      ORDER BY week DESC
      LIMIT 13
    `).all();

    res.json({ weeklyStats });
  } catch (error) {
    console.error("[Running] Error fetching weekly stats:", error);
    res.status(500).json({ error: "Failed to fetch weekly stats" });
  }
});

/**
 * POST /api/running/sync-strava - Sync Strava activities for a given date
 * Body: { date: "YYYY-MM-DD" }
 */
router.post("/sync-strava", async (req, res) => {
  try {
    // Check if Strava is configured
    if (!isStravaConfigured()) {
      return res.status(400).json({
        error: "Strava is not configured. Please set STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, and STRAVA_REFRESH_TOKEN environment variables.",
      });
    }

    const { date } = req.body;

    // Validate date
    if (!date) {
      return res.status(400).json({ error: "Date is required (format: YYYY-MM-DD)" });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD" });
    }

    // Sync activities from Strava
    const result = await syncStravaActivities(date);

    if (!result.success) {
      return res.status(500).json({ error: result.error || "Failed to sync Strava activities" });
    }

    // Insert synced activities into database
    const now = new Date().toISOString();
    const insertedSessions = [];

    for (const activity of result.activities) {
      // Check if activity already exists
      const existing = db.prepare(`SELECT id FROM running_sessions WHERE id = ?`).get(activity.id);

      if (existing) {
        console.log(`[Running] Skipping duplicate activity: ${activity.id}`);
        continue;
      }

      // Get the full session data
      const session = activity.session;
      if (!session) continue;

      // Insert the new activity
      const stmt = db.prepare(`
        INSERT INTO running_sessions (
          id, session_date, start_time, end_time, distance_miles, duration_minutes,
          pace_min_per_mile, elevation_gain_ft, elevation_loss_ft, avg_heart_rate,
          max_heart_rate, calories_burned, weather, surface, effort_level, notes,
          location, gps_file_url, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        session.id,
        session.session_date,
        session.start_time,
        session.end_time,
        session.distance_miles,
        session.duration_minutes,
        session.pace_min_per_mile,
        session.elevation_gain_ft,
        session.elevation_loss_ft,
        session.avg_heart_rate,
        session.max_heart_rate,
        session.calories_burned,
        session.weather,
        session.surface,
        session.effort_level,
        session.notes,
        session.location,
        session.gps_file_url,
        session.created_at,
        session.updated_at
      );

      insertedSessions.push(activity);
    }

    res.json({
      success: true,
      message: `Successfully synced ${insertedSessions.length} activities from Strava`,
      activitiesSynced: insertedSessions.length,
      activities: insertedSessions,
    });
  } catch (error) {
    console.error("[Running] Error syncing Strava activities:", error);
    res.status(500).json({ error: "Failed to sync Strava activities" });
  }
});

export { router as runningRouter };
