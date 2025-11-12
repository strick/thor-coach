import express from "express";

type Request = express.Request;
type Response = express.Response;
import { getWeeklySummaries, getWeeklySummary } from "../services/weekly-summary.js";
import { triggerWeeklySummary } from "../services/cron.js";
import { THOR_PLAN_ID } from "../config.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";

export const listWeeklySummaries = asyncHandler(async (req: Request, res: Response) => {
  const planId = (req.query.planId as string) || THOR_PLAN_ID;
  const limit = parseInt(req.query.limit as string, 10) || 10;

  const summaries = getWeeklySummaries(planId, limit);
  res.json({ planId, summaries });
});

export const getSummaryById = asyncHandler(async (req: Request, res: Response) => {
  const summary = getWeeklySummary(req.params.id);

  if (!summary) {
    throw new ApiError(404, "Weekly summary not found");
  }

  // Parse metrics_json for better response
  const parsed = {
    ...summary,
    metrics: JSON.parse(summary.metrics_json),
  };

  res.json(parsed);
});

export const generateSummary = asyncHandler(async (req: Request, res: Response) => {
  const planId = req.body.planId || THOR_PLAN_ID;

  const summaryId = await triggerWeeklySummary(planId);
  const summary = getWeeklySummary(summaryId);

  res.json({ summaryId, summary });
});
