/**
 * Daily Summary Controller
 * Handles HTTP requests for daily summary endpoints
 */

import express from "express";
import { generateDailySummary, retrieveDailySummary } from "../services/dailySummary/index.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";

type Request = express.Request;
type Response = express.Response;

/**
 * POST /api/daily-summary
 * Generate a new daily summary for a given date
 */
export const postDailySummary = asyncHandler(async (req: Request, res: Response) => {
  const { date } = req.body;

  // Validate date format
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, `Invalid date format. Expected YYYY-MM-DD. Received: ${date}`);
  }

  try {
    const summary = await generateDailySummary(date);
    res.status(200).json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate daily summary";
    throw new ApiError(500, message);
  }
});

/**
 * GET /api/daily-summaries/:date
 * Retrieve a stored daily summary
 */
export const getDailySummary = asyncHandler(async (req: Request, res: Response) => {
  const { date } = req.params;

  // Validate date format
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, `Invalid date format. Expected YYYY-MM-DD. Received: ${date}`);
  }

  const summary = retrieveDailySummary(date);

  if (!summary) {
    throw new ApiError(404, `No daily summary found for ${date}`);
  }

  res.status(200).json(summary);
});
