import express from "express";
import * as summaryController from "../controllers/summaryController.js";

export const summaryRoutes = express.Router();

// Get list of weekly summaries
summaryRoutes.get("/weekly-summaries", summaryController.listWeeklySummaries);

// Get a specific weekly summary
summaryRoutes.get("/weekly-summaries/:id", summaryController.getSummaryById);

// Generate a new weekly summary
summaryRoutes.post("/weekly-summaries/generate", summaryController.generateSummary);
