import express from "express";
import * as healthController from "../controllers/healthController.js";

export const healthRoutes = express.Router();

// Log a health event
healthRoutes.post("/health-events", healthController.logHealthEvent);

// Get health events (with optional filtering)
healthRoutes.get("/health-events", healthController.getHealthEvents);

// Delete a health event
healthRoutes.delete("/health-events/:eventId", healthController.deleteHealthEvent);
