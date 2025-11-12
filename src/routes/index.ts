import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workoutRoutes } from "./workouts.js";
import { exerciseRoutes } from "./exercises.js";
import { summaryRoutes } from "./summaries.js";
import { systemRoutes } from "./system.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const router = express.Router();

// Mount route modules
router.use("/api", workoutRoutes);
router.use("/api", exerciseRoutes);
router.use("/api", summaryRoutes);
router.use("/api", systemRoutes);

// Serve static files (HTML, CSS, JS)
router.use(express.static(path.join(__dirname, "..", "..", "public")));
