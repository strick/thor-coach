import express from "express";

type Request = express.Request;
type Response = express.Response;
import { IngestReq } from "../models.js";
import { handleIngest } from "../services/ingest.js";
import { db } from "../db.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";

/**
 * Deserialize reps from database TEXT column
 * Handles both JSON arrays (bodyweight exercises) and single numbers (weighted exercises)
 */
function deserializeReps(repsValue: any): number | number[] | null {
  if (repsValue == null) return null;

  const str = String(repsValue).trim();
  if (!str) return null;

  // Try to parse as JSON array first
  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Not valid JSON, fall through
    }
  }

  // Parse as single number
  const num = Number(str);
  return isNaN(num) ? null : num;
}

export const ingestWorkout = asyncHandler(async (req: Request, res: Response) => {
  const parsed = IngestReq.safeParse(req.body);

  if (!parsed.success) {
    throw new ApiError(400, "Invalid request body");
  }

  const result = await handleIngest(
    parsed.data.text,
    parsed.data.date,
    parsed.data.planId
  );

  res.json(result);
});

export const getWorkouts = asyncHandler(async (req: Request, res: Response) => {
  const date = req.query.date as string;

  if (date) {
    // Get workouts for specific date
    const sessions = db.prepare(`
      SELECT s.id, s.session_date, s.day_of_week, s.llm_provider, s.llm_model, s.created_at
      FROM workout_sessions s
      WHERE s.session_date = ?
      ORDER BY s.created_at DESC
    `).all(date);

    const workouts = sessions.map((session: any) => {
      const logs = db.prepare(`
        SELECT l.id, e.name as exercise, l.sets, l.reps_per_set, l.weight_lbs, l.notes
        FROM exercise_logs l
        JOIN exercises e ON e.id = l.exercise_id
        WHERE l.session_id = ?
      `).all(session.id);

      // Deserialize reps for each log
      const deserializedLogs = logs.map((log: any) => ({
        ...log,
        reps_per_set: deserializeReps(log.reps_per_set)
      }));

      return { ...session, exercises: deserializedLogs };
    });

    res.json({ date, workouts });
  } else {
    // Get recent workouts (last 30 days)
    const from = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);

    const sessions = db.prepare(`
      SELECT s.id, s.session_date, s.day_of_week, s.llm_provider, s.llm_model, COUNT(l.id) as exercise_count
      FROM workout_sessions s
      LEFT JOIN exercise_logs l ON l.session_id = s.id
      WHERE s.session_date BETWEEN ? AND ?
      GROUP BY s.id
      ORDER BY s.session_date DESC
    `).all(from, to);

    res.json({ from, to, sessions });
  }
});

export const deleteWorkout = asyncHandler(async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  const deleteLogsStmt = db.prepare("DELETE FROM exercise_logs WHERE session_id = ?");
  const deleteSessionStmt = db.prepare("DELETE FROM workout_sessions WHERE id = ?");

  const tx = db.transaction(() => {
    deleteLogsStmt.run(sessionId);
    const result = deleteSessionStmt.run(sessionId);
    return result.changes;
  });

  const changes = tx();

  if (changes === 0) {
    throw new ApiError(404, "Workout session not found");
  }

  res.json({ status: "deleted", sessionId });
});

export const updateExerciseLog = asyncHandler(async (req: Request, res: Response) => {
  const { logId } = req.params;
  const { sets, reps_per_set, weight_lbs, notes } = req.body;

  const updateStmt = db.prepare(`
    UPDATE exercise_logs
    SET sets = COALESCE(?, sets),
        reps_per_set = COALESCE(?, reps_per_set),
        weight_lbs = COALESCE(?, weight_lbs),
        notes = COALESCE(?, notes)
    WHERE id = ?
  `);

  const result = updateStmt.run(sets, reps_per_set, weight_lbs, notes, logId);

  if (result.changes === 0) {
    throw new ApiError(404, "Exercise log not found");
  }

  const updated = db.prepare("SELECT * FROM exercise_logs WHERE id = ?").get(logId);
  res.json({ status: "updated", log: updated });
});

export const getProgressSummary = asyncHandler(async (req: Request, res: Response) => {
  const from = (req.query.from as string) || "1970-01-01";
  const to = (req.query.to as string) || "2999-12-31";

  const sessions = db.prepare(`
    SELECT session_date, COUNT(*) AS logs
    FROM workout_sessions s
    JOIN exercise_logs l ON l.session_id = s.id
    WHERE s.session_date BETWEEN ? AND ?
    GROUP BY session_date
    ORDER BY session_date DESC
  `).all(from, to);

  const topLifts = db.prepare(`
    SELECT e.name, COUNT(*) AS cnt
    FROM exercise_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    JOIN exercises e ON e.id = l.exercise_id
    WHERE s.session_date BETWEEN ? AND ?
    GROUP BY e.name
    ORDER BY cnt DESC
    LIMIT 10
  `).all(from, to);

  const recentRaw = db.prepare(`
    SELECT s.session_date, e.name, l.sets, l.reps_per_set, l.weight_lbs
    FROM exercise_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    JOIN exercises e ON e.id = l.exercise_id
    WHERE s.session_date BETWEEN ? AND ?
    ORDER BY s.session_date DESC
    LIMIT 50
  `).all(from, to);

  // Deserialize reps for recent workouts
  const recent = recentRaw.map((row: any) => ({
    ...row,
    reps_per_set: deserializeReps(row.reps_per_set)
  }));

  res.json({ sessions, topLifts, recent });
});

export const clearLogs = asyncHandler(async (req: Request, res: Response) => {
  db.exec("DELETE FROM exercise_logs; DELETE FROM workout_sessions; VACUUM;");
  res.json({ status: "cleared_logs" });
});
