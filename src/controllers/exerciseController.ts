import express from "express";

type Request = express.Request;
type Response = express.Response;
import { db } from "../db.js";
import { getDayExercises } from "../services/plans.js";
import { THOR_PLAN_ID } from "../config.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";

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
    `).get(r.id);

    return {
      id: r.id,
      name: r.name,
      aliases: JSON.parse(r.aliases || "[]"),
      lastSession: lastSession || null,
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

  const history = db.prepare(`
    SELECT l.id, l.sets, l.reps_per_set, l.weight_lbs, l.notes, s.session_date, s.day_of_week
    FROM exercise_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    WHERE l.exercise_id = ?
    ORDER BY s.session_date DESC
    LIMIT ?
  `).all(exerciseId, limit);

  // Calculate stats
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_sessions,
      SUM(l.sets) as total_sets,
      MAX(l.weight_lbs) as max_weight,
      AVG(l.weight_lbs) as avg_weight,
      SUM(l.sets * l.reps_per_set * l.weight_lbs) as total_volume
    FROM exercise_logs l
    WHERE l.exercise_id = ?
  `).get(exerciseId);

  res.json({ exercise, history, stats });
});
