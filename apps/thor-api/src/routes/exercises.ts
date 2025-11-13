import express from "express";
import * as exerciseController from "../controllers/exerciseController.js";

export const exerciseRoutes = express.Router();

// Get exercises for a specific day
exerciseRoutes.get("/day/:dow", exerciseController.getDayPlan);

// Get all exercises (optionally filtered by planId and day)
exerciseRoutes.get("/exercises", exerciseController.getExercises);

// Get exercise history and stats
exerciseRoutes.get("/exercises/:exerciseId/history", exerciseController.getExerciseHistory);
