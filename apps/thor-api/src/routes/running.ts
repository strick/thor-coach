import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../db.js";

const router = Router();

/**
 * GET /api/running/sessions - Get all running sessions
 */
router.get("/sessions", (req, res) => {
  try {
    const sessions = db
      .prepare(
        `SELECT * FROM running_sessions ORDER BY session_date DESC, created_at DESC`
      )
      .all();
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

export { router as runningRouter };
