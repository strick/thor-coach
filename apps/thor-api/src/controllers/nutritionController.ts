import express from "express";

type Request = express.Request;
type Response = express.Response;

import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import {
  logFoodFromText,
  getDailyNutritionSummary,
  getNutritionSummaryRange,
  getNutritionRangeFromDays,
  setNutritionGoals,
  getNutritionGoals,
  getOrCreateNutritionDay,
  addMealToDay,
  addItemToMeal,
  computeTotals,
  getNutritionDay,
  parseNutritionText,
  deleteItemFromMeal,
  deleteMealFromDay,
  updateItemInMeal
} from "../services/nutrition.js";

/**
 * POST /api/nutrition/log
 * Log food from natural language
 */
export const logFood = asyncHandler(async (req: Request, res: Response) => {
  const { text, date } = req.body;

  if (!text || typeof text !== "string") {
    throw new ApiError(400, "Missing or invalid 'text' field");
  }

  if (date && typeof date !== "string") {
    throw new ApiError(400, "Invalid 'date' field");
  }

  const foodLogId = await logFoodFromText(text, date);

  res.json({
    status: "logged",
    foodLogId,
    date: date || new Date().toISOString().slice(0, 10)
  });
});

/**
 * GET /api/nutrition/today?date=YYYY-MM-DD
 * Get daily nutrition summary for a specific date (defaults to today)
 */
export const getDailyNutrition = asyncHandler(async (req: Request, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  const summary = getDailyNutritionSummary(date);
  res.json(summary);
});

/**
 * GET /api/nutrition/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Get nutrition summary for a date range (aggregated from daily nutrition data)
 */
export const getNutritionSummary = asyncHandler(async (req: Request, res: Response) => {
  const from = req.query.from as string;
  const to = req.query.to as string;

  if (!from || !to) {
    throw new ApiError(400, "Missing 'from' or 'to' query parameters");
  }

  // Validate date formats
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  const summary = getNutritionRangeFromDays(from, to);
  res.json(summary);
});

/**
 * GET /api/nutrition/goals
 * Get current nutrition goals
 */
export const getGoals = asyncHandler(async (req: Request, res: Response) => {
  const goals = getNutritionGoals();
  res.json(goals || { message: "No nutrition goals set" });
});

/**
 * POST /api/nutrition/goals
 * Set or update nutrition goals
 */
export const updateGoals = asyncHandler(async (req: Request, res: Response) => {
  const {
    daily_protein_target_g,
    max_daily_sodium_mg,
    max_daily_saturated_fat_g,
    min_daily_fiber_g,
    max_daily_cholesterol_mg,
    max_daily_added_sugar_g,
    diet_style
  } = req.body;

  // Validate that at least one goal is provided
  if (
    daily_protein_target_g === undefined &&
    max_daily_sodium_mg === undefined &&
    max_daily_saturated_fat_g === undefined &&
    min_daily_fiber_g === undefined &&
    max_daily_cholesterol_mg === undefined &&
    max_daily_added_sugar_g === undefined
  ) {
    throw new ApiError(400, "At least one nutrition goal must be provided");
  }

  const goalId = setNutritionGoals({
    daily_protein_target_g,
    max_daily_sodium_mg,
    max_daily_saturated_fat_g,
    min_daily_fiber_g,
    max_daily_cholesterol_mg,
    max_daily_added_sugar_g,
    diet_style
  });

  res.json({
    status: "goals_updated",
    goalId,
    goals: {
      daily_protein_target_g,
      max_daily_sodium_mg,
      max_daily_saturated_fat_g,
      min_daily_fiber_g,
      max_daily_cholesterol_mg,
      max_daily_added_sugar_g,
      diet_style: diet_style || 'DASH'
    }
  });
});

/**
 * GET /api/nutrition/day?date=YYYY-MM-DD
 * Get full nutrition day with meals and items
 */
export const getDayNutrition = asyncHandler(async (req: Request, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  const day = getNutritionDay(date);
  if (!day) {
    getOrCreateNutritionDay(date);
    const newDay = getNutritionDay(date);
    return res.json(newDay);
  }

  res.json(day);
});

/**
 * POST /api/nutrition/meal
 * Add a meal to a date
 */
export const addMeal = asyncHandler(async (req: Request, res: Response) => {
  const { date, mealType, timeLocal } = req.body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  if (!mealType || !['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType)) {
    throw new ApiError(400, "Invalid meal_type. Must be breakfast, lunch, dinner, or snack");
  }

  const meal = addMealToDay(date, mealType, timeLocal);
  res.json({ status: "meal_added", meal });
});

/**
 * POST /api/nutrition/item
 * Add item to a meal
 */
export const addItem = asyncHandler(async (req: Request, res: Response) => {
  const { mealId, foodName, nutrition, serving } = req.body;

  if (!mealId) {
    throw new ApiError(400, "Missing mealId");
  }

  if (!foodName) {
    throw new ApiError(400, "Missing foodName");
  }

  const item = addItemToMeal(mealId, foodName, nutrition || {}, serving || {});
  
  // Recompute totals - need to find the nutrition_day_id
  const mealRecord = (global as any).db?.prepare(
    `SELECT nutrition_day_id FROM nutrition_meals WHERE id = ?`
  ).get(mealId);
  
  if (mealRecord) {
    const dayRecord = (global as any).db?.prepare(
      `SELECT date_local FROM nutrition_days WHERE id = ?`
    ).get(mealRecord.nutrition_day_id);
    if (dayRecord) {
      computeTotals(dayRecord.date_local);
    }
  }

  res.json({ status: "item_added", item });
});

/**
 * GET /api/nutrition/day/totals?date=YYYY-MM-DD
 * Get summary totals vs targets for a day
 */
export const getDayTotals = asyncHandler(async (req: Request, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  const day = getNutritionDay(date);
  if (!day) {
    return res.json({ status: "no_data", date });
  }

  const goals = getNutritionGoals();
  const targets = day.targets || {};
  const totals = day.totals || {};

  const analysis = {
    date,
    totals,
    targets,
    goals,
    analysis: {
      protein: {
        actual: totals.protein_g || 0,
        target: targets.protein_g || 200,
        status: (totals.protein_g || 0) >= (targets.protein_g || 200) ? 'met' : 'below'
      },
      sodium: {
        actual: totals.sodium_mg || 0,
        target: targets.sodium_mg_max || 2300,
        status: (totals.sodium_mg || 0) <= (targets.sodium_mg_max || 2300) ? 'ok' : 'exceeded'
      },
      fiber: {
        actual: totals.fiber_g || 0,
        target: targets.fiber_g || 30,
        status: (totals.fiber_g || 0) >= (targets.fiber_g || 30) ? 'met' : 'below'
      },
      saturated_fat: {
        actual: totals.sat_fat_g || 0,
        target: targets.sat_fat_g_max || 20,
        status: (totals.sat_fat_g || 0) <= (targets.sat_fat_g_max || 20) ? 'ok' : 'exceeded'
      },
      cholesterol: {
        actual: totals.cholesterol_mg || 0,
        target: targets.cholesterol_mg_max || 200,
        status: (totals.cholesterol_mg || 0) <= (targets.cholesterol_mg_max || 200) ? 'ok' : 'exceeded'
      },
      added_sugar: {
        actual: totals.added_sugar_g || 0,
        target: targets.added_sugar_g_max || 25,
        status: (totals.added_sugar_g || 0) <= (targets.added_sugar_g_max || 25) ? 'ok' : 'exceeded'
      }
    }
  };

  res.json(analysis);
});

/**
 * POST /api/nutrition/parse
 * Parse natural language food description (handles single or multiple items)
 */
export const parseFood = asyncHandler(async (req: Request, res: Response) => {
  const { text } = req.body;

  if (!text || typeof text !== "string") {
    throw new ApiError(400, "Missing or invalid 'text' field");
  }

  const parsed = await parseNutritionText(text);
  res.json(parsed);
});
export const deleteItem = asyncHandler(async (req: Request, res: Response) => {
  const { itemId } = req.body;

  if (!itemId) {
    throw new ApiError(400, "Missing itemId");
  }

  const deleted = deleteItemFromMeal(itemId);
  
  if (!deleted) {
    throw new ApiError(404, "Item not found");
  }

  res.json({ success: true, message: "Item deleted successfully" });
});

export const deleteMeal = asyncHandler(async (req: Request, res: Response) => {
  const { mealId } = req.body;

  if (!mealId) {
    throw new ApiError(400, "Missing mealId");
  }

  const deleted = deleteMealFromDay(mealId);
  
  if (!deleted) {
    throw new ApiError(404, "Meal not found");
  }

  res.json({ success: true, message: "Meal deleted successfully" });
});

export const updateItem = asyncHandler(async (req: Request, res: Response) => {
  const { itemId, ...updates } = req.body;

  console.log('[Controller] updateItem called with itemId:', itemId, 'updates:', updates);

  if (!itemId) {
    throw new ApiError(400, "Missing itemId");
  }

  const updated = updateItemInMeal(itemId, updates);
  
  if (!updated) {
    throw new ApiError(404, "Item not found");
  }

  console.log('[Controller] updateItem succeeded, returning:', updated);
  res.json({ success: true, item: updated });
});
