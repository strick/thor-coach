import express from "express";
import { workoutRoutes } from "./workouts.js";
import { exerciseRoutes } from "./exercises.js";
import { summaryRoutes } from "./summaries.js";
import { systemRoutes } from "./system.js";
import { testRoutes } from "./tests.js";

export const router = express.Router();

// Mount route modules
router.use("/api", workoutRoutes);
router.use("/api", exerciseRoutes);
router.use("/api", summaryRoutes);
router.use("/api", systemRoutes);
router.use("/api", testRoutes);
