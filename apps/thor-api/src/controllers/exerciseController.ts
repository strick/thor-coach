import express from "express";

type Request = express.Request;
type Response = express.Response;
import { db } from "../db.js";
import { getDayExercises } from "../services/plans.js";
import { THOR_PLAN_ID } from "../config.js";
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

export const getDayPlan = asyncHandler(async (req: Request, res: Response) => {
  const dow = parseInt(req.params.dow, 10);

  if (Number.isNaN(dow) || dow < 1 || dow > 7) {
    throw new ApiError(400, "Day of week must be between 1 and 7");
  }

  const rows = getDayExercises(THOR_PLAN_ID, dow).map((r: any) => {
    // Get last session data for this exercise
    const lastSession = db.prepare(`
      SELECT l.sets, l.reps_per_set, l.weight_lbs, s.session_date
      FROM exercise_logs l
      JOIN workout_sessions s ON s.id = l.session_id
      WHERE l.exercise_id = ?
      ORDER BY s.session_date DESC
      LIMIT 1
    `).get(r.id) as any;

    // Deserialize reps if lastSession exists
    const deserializedSession = lastSession ? {
      ...lastSession,
      reps_per_set: deserializeReps(lastSession.reps_per_set)
    } : null;

    return {
      id: r.id,
      name: r.name,
      aliases: JSON.parse(r.aliases || "[]"),
      lastSession: deserializedSession,
    };
  });

  res.json({ planId: THOR_PLAN_ID, dow, exercises: rows });
});

export const getExercises = asyncHandler(async (req: Request, res: Response) => {
  const planId = (req.query.planId as string) || THOR_PLAN_ID;
  const dow = req.query.dow ? parseInt(req.query.dow as string, 10) : null;

  let exercises;
  if (dow !== null) {
    exercises = db
      .prepare("SELECT * FROM exercises WHERE plan_id = ? AND day_of_week = ? ORDER BY name")
      .all(planId, dow);
  } else {
    exercises = db
      .prepare("SELECT * FROM exercises WHERE plan_id = ? ORDER BY day_of_week, name")
      .all(planId);
  }

  res.json({ planId, exercises });
});

export const getExerciseHistory = asyncHandler(async (req: Request, res: Response) => {
  const { exerciseId } = req.params;
  const limit = parseInt(req.query.limit as string, 10) || 50;

  const exercise = db.prepare("SELECT * FROM exercises WHERE id = ?").get(exerciseId);

  if (!exercise) {
    throw new ApiError(404, "Exercise not found");
  }

  const historyRaw = db.prepare(`
    SELECT l.id, l.sets, l.reps_per_set, l.weight_lbs, l.notes, s.session_date, s.day_of_week
    FROM exercise_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    WHERE l.exercise_id = ?
    ORDER BY s.session_date DESC
    LIMIT ?
  `).all(exerciseId, limit);

  // Deserialize reps for each history item
  const history = historyRaw.map((row: any) => ({
    ...row,
    reps_per_set: deserializeReps(row.reps_per_set)
  }));

  // Calculate stats (volume must be computed in application code for array reps)
  const statsRaw = db.prepare(`
    SELECT
      COUNT(*) as total_sessions,
      SUM(l.sets) as total_sets,
      MAX(l.weight_lbs) as max_weight,
      AVG(l.weight_lbs) as avg_weight
    FROM exercise_logs l
    WHERE l.exercise_id = ?
  `).get(exerciseId);

  // Calculate total volume in application code
  const allLogs = db.prepare(`
    SELECT l.sets, l.reps_per_set, l.weight_lbs
    FROM exercise_logs l
    WHERE l.exercise_id = ?
  `).all(exerciseId) as any[];

  let totalVolume = 0;
  for (const log of allLogs) {
    const reps = deserializeReps(log.reps_per_set);
    const weight = log.weight_lbs || 0;
    const sets = log.sets || 0;

    if (Array.isArray(reps)) {
      // For arrays, sum all reps and multiply by weight
      const totalReps = reps.reduce((sum, r) => sum + r, 0);
      totalVolume += totalReps * weight;
    } else if (typeof reps === 'number') {
      // For single numbers, multiply sets * reps * weight
      totalVolume += sets * reps * weight;
    }
  }

  const stats = { ...(statsRaw as any), total_volume: totalVolume };

  res.json({ exercise, history, stats });
});
