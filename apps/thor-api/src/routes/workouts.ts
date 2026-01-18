import express from "express";
import * as workoutController from "../controllers/workoutController.js";

export const workoutRoutes = express.Router();

// Workout ingestion
workoutRoutes.post("/ingest", workoutController.ingestWorkout);

// Log exercise manually (no AI parsing)
workoutRoutes.post("/log-manual", workoutController.logManualExercise);

// Get workouts (by date or recent)
workoutRoutes.get("/workouts", workoutController.getWorkouts);

// Delete workout session
workoutRoutes.delete("/workouts/:sessionId", workoutController.deleteWorkout);

// Update exercise log
workoutRoutes.patch("/exercise-logs/:logId", workoutController.updateExerciseLog);

// Get progress summary
workoutRoutes.get("/progress/summary", workoutController.getProgressSummary);

// Admin: Clear all logs
workoutRoutes.post("/admin/clear-logs", workoutController.clearLogs);
