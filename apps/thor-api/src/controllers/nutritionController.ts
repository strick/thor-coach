import express from "express";

type Request = express.Request;
type Response = express.Response;

import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import { db } from "../db.js";
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
 * Helper: Extract userId from query param or default to main user
 */
function getUserId(req: Request): string {
  return (req.query.userId as string) || 'user-main';
}

/**
 * POST /api/nutrition/log?userId=...
 * Log food from natural language
 */
export const logFood = asyncHandler(async (req: Request, res: Response) => {
  const { text, date } = req.body;
  const userId = getUserId(req);

  if (!text || typeof text !== "string") {
    throw new ApiError(400, "Missing or invalid 'text' field");
  }

  if (date && typeof date !== "string") {
    throw new ApiError(400, "Invalid 'date' field");
  }

  const foodLogId = await logFoodFromText(userId, text, date);

  res.json({
    status: "logged",
    foodLogId,
    userId,
    date: date || new Date().toISOString().slice(0, 10)
  });
});

/**
 * GET /api/nutrition/today?date=YYYY-MM-DD&userId=...
 * Get daily nutrition summary for a specific date (defaults to today)
 */
export const getDailyNutrition = asyncHandler(async (req: Request, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const userId = getUserId(req);

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  const summary = getDailyNutritionSummary(userId, date);
  res.json(summary);
});

/**
 * GET /api/nutrition/summary?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=...
 * Get nutrition summary for a date range (aggregated from daily nutrition data)
 */
export const getNutritionSummary = asyncHandler(async (req: Request, res: Response) => {
  const from = req.query.from as string;
  const to = req.query.to as string;
  const userId = getUserId(req);

  if (!from || !to) {
    throw new ApiError(400, "Missing 'from' or 'to' query parameters");
  }

  // Validate date formats
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  const summary = getNutritionRangeFromDays(userId, from, to);
  res.json(summary);
});

/**
 * GET /api/nutrition/goals?userId=...
 * Get current nutrition goals
 */
export const getGoals = asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  const goals = getNutritionGoals(userId);
  res.json(goals || { message: "No nutrition goals set" });
});

/**
 * POST /api/nutrition/goals?userId=...
 * Set or update nutrition goals
 */
export const updateGoals = asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
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

  const goalId = setNutritionGoals(userId, {
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
    userId,
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
 * GET /api/nutrition/day?date=YYYY-MM-DD&userId=...
 * Get full nutrition day with meals and items
 */
export const getDayNutrition = asyncHandler(async (req: Request, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const userId = getUserId(req);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  const day = getNutritionDay(userId, date);
  if (!day) {
    getOrCreateNutritionDay(userId, date);
    const newDay = getNutritionDay(userId, date);
    return res.json(newDay);
  }

  res.json(day);
});

/**
 * POST /api/nutrition/meal?userId=...
 * Add a meal to a date
 */
export const addMeal = asyncHandler(async (req: Request, res: Response) => {
  const { date, mealType, timeLocal } = req.body;
  const userId = getUserId(req);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  if (!mealType || !['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType)) {
    throw new ApiError(400, "Invalid meal_type. Must be breakfast, lunch, dinner, or snack");
  }

  const meal = addMealToDay(userId, date, mealType, timeLocal);
  res.json({ status: "meal_added", meal, userId });
});

/**
 * POST /api/nutrition/item?userId=...
 * Add item to a meal
 */
export const addItem = asyncHandler(async (req: Request, res: Response) => {
  const { mealId, foodName, nutrition, serving } = req.body;
  const userId = getUserId(req);

  if (!mealId) {
    throw new ApiError(400, "Missing mealId");
  }

  if (!foodName) {
    throw new ApiError(400, "Missing foodName");
  }

  const item = addItemToMeal(userId, mealId, foodName, nutrition || {}, serving || {});
  
  // Recompute totals - need to find the nutrition_day_id
  const mealRecord = (global as any).db?.prepare(
    `SELECT nutrition_day_id FROM nutrition_meals WHERE id = ?`
  ).get(mealId);
  
  if (mealRecord) {
    const dayRecord = (global as any).db?.prepare(
      `SELECT user_id, date_local FROM nutrition_days WHERE id = ?`
    ).get(mealRecord.nutrition_day_id);
    if (dayRecord) {
      computeTotals(dayRecord.user_id, dayRecord.date_local);
    }
  }

  res.json({ status: "item_added", item, userId });
});

/**
 * GET /api/nutrition/day/totals?date=YYYY-MM-DD&userId=...
 * Get summary totals vs targets for a day
 */
export const getDayTotals = asyncHandler(async (req: Request, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  const userId = getUserId(req);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new ApiError(400, "Invalid date format. Expected YYYY-MM-DD");
  }

  const day = getNutritionDay(userId, date);
  if (!day) {
    return res.json({ status: "no_data", date });
  }

  const goals = getNutritionGoals(userId);
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

/**
 * POST /api/nutrition/template?userId=...
 * Save a meal template from selected items
 */
export const saveMealTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { name, mealType, itemIds, date } = req.body;
  const userId = getUserId(req);

  console.log('[Template] Saving template with itemIds:', itemIds);
  console.log('[Template] Request body:', req.body);

  if (!name || !Array.isArray(itemIds) || itemIds.length === 0) {
    throw new ApiError(400, "Missing 'name' or 'itemIds'");
  }

  const items = [];
  
  // First, let's check what items exist in the meal_items table
  try {
    const allItems = db.prepare(
      `SELECT id, food_name FROM nutrition_meal_items WHERE user_id = ? LIMIT 10`
    ).all(userId) as any[];
    console.log('[Template] Sample items in DB:', allItems);
    
    for (const itemId of itemIds) {
      console.log('[Template] Looking for item:', itemId);
      const item = db.prepare(
        `SELECT * FROM nutrition_meal_items WHERE id = ? AND user_id = ?`
      ).get(itemId, userId) as any;
      
      if (item) {
        items.push(item);
        console.log('[Template] Found item:', item.food_name || item.name || 'unknown');
      } else {
        console.log('[Template] Item not found in DB by id:', itemId);
      }
    }

    console.log('[Template] Total items found:', items.length, 'out of', itemIds.length);

    if (items.length === 0) {
      throw new ApiError(404, `No items found for template. Looked for ${itemIds.length} items but found 0 in database.`);
    }
  } catch (error: any) {
    console.error('[Template] Database error:', error.message);
    throw new ApiError(500, `Database error: ${error.message}`);
  }

  // Create template record
  const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log('[Template] Creating table if not exists...');
  db.prepare(`
    CREATE TABLE IF NOT EXISTS nutrition_templates (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      meal_type TEXT,
      items_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      created_date TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();

  console.log('[Template] Inserting template with ID:', templateId);
  const result = db.prepare(`
    INSERT INTO nutrition_templates (id, user_id, name, meal_type, items_json, created_at, created_date)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(templateId, userId, name, mealType || 'meal', JSON.stringify(items), new Date().toISOString(), date);

  console.log('[Template] Insert result:', result);
  console.log('[Template] Saved template:', templateId);

  res.json({
    status: "template_saved",
    templateId,
    userId,
    name,
    itemCount: items.length
  });
});

/**
 * GET /api/nutrition/templates?userId=...
 * Get all saved meal templates for user
 */
export const getMealTemplates = asyncHandler(async (req: Request, res: Response) => {
  const userId = getUserId(req);
  console.log('[Template] Fetching templates for user:', userId);
  
  const templates = db.prepare(
    `SELECT id, name, meal_type, created_at, created_date, items_json FROM nutrition_templates WHERE user_id = ? ORDER BY created_at DESC`
  ).all(userId) as any[] || [];

  console.log('[Template] Found templates:', templates.length);
  
  // Parse items_json for each template
  const parsedTemplates = templates.map((t: any) => ({
    ...t,
    itemCount: JSON.parse(t.items_json || '[]').length
  }));

  res.json({
    status: "templates_retrieved",
    userId,
    templates: parsedTemplates
  });
});

/**
 * POST /api/nutrition/template/:id/apply?userId=...
 * Apply a template (add items from template to a meal)
 */
export const applyMealTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { mealId } = req.body;
  const userId = getUserId(req);

  if (!mealId) {
    throw new ApiError(400, "Missing 'mealId'");
  }
  
  // Get template
  const template = db.prepare(
    `SELECT items_json FROM nutrition_templates WHERE id = ? AND user_id = ?`
  ).get(id, userId) as any;

  if (!template) {
    throw new ApiError(404, "Template not found");
  }

  const items = JSON.parse(template.items_json || '[]');
  const addedItems = [];

  // Add each item from template to the meal
  for (const item of items) {
    const newItem = addItemToMeal(userId, mealId, item.food_name, {
      calories_kcal: item.calories_kcal,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      fiber_g: item.fiber_g,
      sugar_g: item.sugar_g,
      added_sugar_g: item.added_sugar_g,
      sodium_mg: item.sodium_mg,
      sat_fat_g: item.sat_fat_g,
      cholesterol_mg: item.cholesterol_mg
    }, {
      serving_quantity: item.serving_quantity,
      serving_unit: item.serving_unit,
      serving_display: item.serving_display
    });
    addedItems.push(newItem);
  }

  res.json({
    status: "template_applied",
    userId,
    itemsAdded: addedItems.length
  });
});

/**
 * DELETE /api/nutrition/template/:id?userId=...
 * Delete a meal template
 */
export const deleteMealTemplate = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const userId = getUserId(req);
  
  const result = db.prepare(
    `DELETE FROM nutrition_templates WHERE id = ? AND user_id = ?`
  ).run(id, userId) as any;

  if (!result || result.changes === 0) {
    throw new ApiError(404, "Template not found");
  }

  res.json({
    status: "template_deleted",
    userId,
    success: true
  });
});
