/**
 * Daily Summary Routes
 */

import express from "express";
import * as dailySummaryController from "../controllers/dailySummaryController.js";

export const dailySummaryRoutes = express.Router();

// Generate a new daily summary
dailySummaryRoutes.post("/", dailySummaryController.postDailySummary);

// Retrieve a stored daily summary
dailySummaryRoutes.get("/:date", dailySummaryController.getDailySummary);
