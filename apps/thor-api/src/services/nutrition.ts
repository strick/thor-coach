import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { getLLMConfigForUsage } from "./llm-config.js";

/**
 * Parsed nutrition data from LLM
 */
interface ParsedNutrition {
  description: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  sodium_mg?: number;
  saturated_fat_g?: number;
  fiber_g?: number;
  sugar_g?: number;
  added_sugar_g?: number;
  cholesterol_mg?: number;
  potassium_mg?: number;
  calcium_mg?: number;
  serving_quantity?: number;
  serving_unit?: string;
  serving_display?: string;
}

/**
 * Parse natural language food text using LLM
 * Always returns consistent structure with items array
 */
export async function parseNutritionText(text: string): Promise<{ items: ParsedNutrition[] }> {
  const llmConfig = getLLMConfigForUsage("nutrition_parsing");

  if (!llmConfig) {
    throw new Error("No LLM config available for nutrition parsing");
  }

  const systemPrompt = `You are a nutrition parser. The user will describe food they ate.
Extract EACH food item mentioned and return a JSON response ONLY (no other text):

{
  "items": [
    {
      "description": "food name",
      "serving_display": "serving size like 1 cup or 170g",
      "serving_quantity": number,
      "serving_unit": "g, cup, oz, etc",
      "calories": number,
      "protein_g": number,
      "carbs_g": number,
      "fat_g": number,
      "fiber_g": number,
      "sugar_g": number,
      "added_sugar_g": number,
      "sodium_mg": number,
      "saturated_fat_g": number,
      "cholesterol_mg": number,
      "potassium_mg": number,
      "calcium_mg": number
    }
  ]
}

Rules:
- Parse EACH item the user mentioned separately
- Use realistic nutrition values from USDA data
- All numbers must be realistic, never zero
- Include all 16 fields for each item
- Return ONLY the JSON object, nothing else`;

  const userPrompt = text;

  let result: { items: ParsedNutrition[] };

  if (llmConfig.provider === "ollama") {
    if (!llmConfig.url) {
      throw new Error("Ollama URL is required for ollama provider");
    }
    result = await parseWithOllama(systemPrompt, userPrompt, llmConfig.model, llmConfig.url);
  } else if (llmConfig.provider === "openai") {
    if (!llmConfig.apiKey) {
      throw new Error("OpenAI API key is required for openai provider");
    }
    result = await parseWithOpenAI(systemPrompt, userPrompt, llmConfig.model, llmConfig.apiKey);
  } else {
    throw new Error("Invalid LLM provider in runtime config");
  }

  return result;
}

/**
 * Parse with Ollama
 */
async function parseWithOllama(
  system: string,
  user: string,
  model: string,
  url: string
): Promise<{ items: ParsedNutrition[] }> {
  const resp = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model,
      format: "json",
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      options: { temperature: 0 }
    })
  });

  const raw = await resp.text();
  if (!resp.ok) throw new Error(`Ollama ${resp.status}: ${raw}`);

  try {
    const data = JSON.parse(raw);
    return JSON.parse(data?.message?.content || "{}");
  } catch {
    // NDJSON fallback
    const parts: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const j = JSON.parse(t);
        if (j?.message?.content) parts.push(j.message.content);
      } catch {}
    }
    return JSON.parse(parts.join("") || "{}");
  }
}

/**
 * Parse with OpenAI
 */
async function parseWithOpenAI(
  system: string,
  user: string,
  model: string,
  apiKey: string
): Promise<{ items: ParsedNutrition[] }> {
  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey });

  console.log("[Nutrition] Calling OpenAI with prompt:", user);

  const resp = await client.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0
  });

  const content = resp.choices[0]?.message?.content ?? "{}";
  console.log("[Nutrition] OpenAI raw response:", content);
  
  const parsed = JSON.parse(content);
  console.log("[Nutrition] Parsed response:", JSON.stringify(parsed));
  
  return parsed;
}

/**
 * Log food from natural language text
 */
export async function logFoodFromText(userId: string, text: string, date?: string): Promise<string[]> {
  const result = await parseNutritionText(text);
  const logDate = date || new Date().toISOString().slice(0, 10);
  const foodLogIds: string[] = [];

  for (const item of result.items) {
    const foodLogId = randomUUID();
    
    db.prepare(`
      INSERT INTO food_logs (id, user_id, log_date, description, calories, protein_g, sodium_mg, saturated_fat_g, fiber_g)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      foodLogId,
      userId,
      logDate,
      item.description,
      item.calories ?? null,
      item.protein_g ?? null,
      item.sodium_mg ?? null,
      item.saturated_fat_g ?? null,
      item.fiber_g ?? null
    );
    
    foodLogIds.push(foodLogId);
  }

  return foodLogIds;
}

/**
 * Get daily nutrition summary for a specific date
 */
export function getDailyNutritionSummary(userId: string, date: string) {
  const totals = db.prepare<[string, string], {
    total_calories: number;
    total_protein_g: number;
    total_sodium_mg: number;
    total_saturated_fat_g: number;
    total_fiber_g: number;
    food_count: number;
  }>(`
    SELECT
      COALESCE(SUM(calories), 0) as total_calories,
      COALESCE(SUM(protein_g), 0) as total_protein_g,
      COALESCE(SUM(sodium_mg), 0) as total_sodium_mg,
      COALESCE(SUM(saturated_fat_g), 0) as total_saturated_fat_g,
      COALESCE(SUM(fiber_g), 0) as total_fiber_g,
      COUNT(*) as food_count
    FROM food_logs
    WHERE user_id = ? AND log_date = ?
  `).get(userId, date);

  const foods = db.prepare<[string, string], {
    id: string;
    description: string;
    calories: number | null;
    protein_g: number | null;
    sodium_mg: number | null;
    saturated_fat_g: number | null;
    fiber_g: number | null;
    created_at: string;
  }>(`
    SELECT id, description, calories, protein_g, sodium_mg, saturated_fat_g, fiber_g, created_at
    FROM food_logs
    WHERE user_id = ? AND log_date = ?
    ORDER BY created_at ASC
  `).all(userId, date);

  // Get nutrition goals (if set)
  const goals = db.prepare<[], {
    daily_protein_target_g: number | null;
    max_daily_sodium_mg: number | null;
    max_daily_saturated_fat_g: number | null;
    min_daily_fiber_g: number | null;
  }>(`
    SELECT daily_protein_target_g, max_daily_sodium_mg, max_daily_saturated_fat_g, min_daily_fiber_g
    FROM nutrition_goals
    ORDER BY created_at DESC
    LIMIT 1
  `).get();

  return {
    date,
    totals: totals || {
      total_calories: 0,
      total_protein_g: 0,
      total_sodium_mg: 0,
      total_saturated_fat_g: 0,
      total_fiber_g: 0,
      food_count: 0
    },
    goals: goals || null,
    foods
  };
}

/**
 * Get nutrition summary for a date range
 */
/**
 * Get nutrition summary aggregated from daily nutrition data
 * This pulls from the new nutrition_days schema instead of old food_logs
 */
export function getNutritionRangeFromDays(userId: string, from: string, to: string) {
  const daily: any[] = [];
  const totals = {
    total_calories_kcal: 0,
    total_protein_g: 0,
    total_carbs_g: 0,
    total_fat_g: 0,
    total_fiber_g: 0,
    total_sugar_g: 0,
    total_added_sugar_g: 0,
    total_sodium_mg: 0,
    total_sat_fat_g: 0,
    total_cholesterol_mg: 0,
    total_potassium_mg: 0,
    total_calcium_mg: 0,
    total_food_count: 0,
    days_logged: 0
  };

  // Get all dates in range
  const currentDate = new Date(from);
  const endDate = new Date(to);
  const datesInRange: string[] = [];
  
  while (currentDate <= endDate) {
    const dateStr = currentDate.toISOString().slice(0, 10);
    datesInRange.push(dateStr);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // Load data for each date
  let daysWithData = 0;
  for (const dateLocal of datesInRange) {
    const day = getNutritionDay(userId, dateLocal);
    if (day && day.totals) {
      daily.push({
        date_local: dateLocal,
        ...day.totals
      });

      // Accumulate totals
      totals.total_calories_kcal += day.totals.calories_kcal || 0;
      totals.total_protein_g += day.totals.protein_g || 0;
      totals.total_carbs_g += day.totals.carbs_g || 0;
      totals.total_fat_g += day.totals.fat_g || 0;
      totals.total_fiber_g += day.totals.fiber_g || 0;
      totals.total_sugar_g += day.totals.sugar_g || 0;
      totals.total_added_sugar_g += day.totals.added_sugar_g || 0;
      totals.total_sodium_mg += day.totals.sodium_mg || 0;
      totals.total_sat_fat_g += day.totals.sat_fat_g || 0;
      totals.total_cholesterol_mg += day.totals.cholesterol_mg || 0;
      totals.total_potassium_mg += day.totals.potassium_mg || 0;
      totals.total_calcium_mg += day.totals.calcium_mg || 0;
      totals.total_food_count += day.totals.total_food_count || 0;
      daysWithData++;
    }
  }

  totals.days_logged = daysWithData;

  // Get nutrition goals
  const goals = getNutritionGoals(userId);

  return {
    from,
    to,
    daily,
    totals,
    goals: goals || null
  };
}

export function getNutritionSummaryRange(from: string, to: string) {
  const dailyData = db.prepare<[string, string], {
    log_date: string;
    total_calories: number;
    total_protein_g: number;
    total_sodium_mg: number;
    total_saturated_fat_g: number;
    total_fiber_g: number;
    food_count: number;
  }>(`
    SELECT
      log_date,
      COALESCE(SUM(calories), 0) as total_calories,
      COALESCE(SUM(protein_g), 0) as total_protein_g,
      COALESCE(SUM(sodium_mg), 0) as total_sodium_mg,
      COALESCE(SUM(saturated_fat_g), 0) as total_saturated_fat_g,
      COALESCE(SUM(fiber_g), 0) as total_fiber_g,
      COUNT(*) as food_count
    FROM food_logs
    WHERE log_date BETWEEN ? AND ?
    GROUP BY log_date
    ORDER BY log_date ASC
  `).all(from, to);

  const rangeTotals = db.prepare<[string, string], {
    total_calories: number;
    total_protein_g: number;
    total_sodium_mg: number;
    total_saturated_fat_g: number;
    total_fiber_g: number;
    total_food_count: number;
    days_logged: number;
  }>(`
    SELECT
      COALESCE(SUM(calories), 0) as total_calories,
      COALESCE(SUM(protein_g), 0) as total_protein_g,
      COALESCE(SUM(sodium_mg), 0) as total_sodium_mg,
      COALESCE(SUM(saturated_fat_g), 0) as total_saturated_fat_g,
      COALESCE(SUM(fiber_g), 0) as total_fiber_g,
      COUNT(*) as total_food_count,
      COUNT(DISTINCT log_date) as days_logged
    FROM food_logs
    WHERE log_date BETWEEN ? AND ?
  `).get(from, to);

  // Get nutrition goals
  const goals = db.prepare<[], {
    daily_protein_target_g: number | null;
    max_daily_sodium_mg: number | null;
    max_daily_saturated_fat_g: number | null;
    min_daily_fiber_g: number | null;
  }>(`
    SELECT daily_protein_target_g, max_daily_sodium_mg, max_daily_saturated_fat_g, min_daily_fiber_g
    FROM nutrition_goals
    ORDER BY created_at DESC
    LIMIT 1
  `).get();

  return {
    from,
    to,
    daily: dailyData,
    totals: rangeTotals || {
      total_calories: 0,
      total_protein_g: 0,
      total_sodium_mg: 0,
      total_saturated_fat_g: 0,
      total_fiber_g: 0,
      total_food_count: 0,
      days_logged: 0
    },
    goals: goals || null
  };
}

/**
 * Set or update nutrition goals
 */
export function setNutritionGoals(userId: string, goals: {
  daily_protein_target_g?: number;
  max_daily_sodium_mg?: number;
  max_daily_saturated_fat_g?: number;
  min_daily_fiber_g?: number;
  max_daily_cholesterol_mg?: number;
  max_daily_added_sugar_g?: number;
  diet_style?: string;
}): string {
  const goalId = randomUUID();

  db.prepare(`
    INSERT INTO nutrition_goals (
      id,
      user_id,
      daily_protein_target_g,
      max_daily_sodium_mg,
      max_daily_saturated_fat_g,
      min_daily_fiber_g,
      max_daily_cholesterol_mg,
      max_daily_added_sugar_g,
      diet_style
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    goalId,
    userId,
    goals.daily_protein_target_g ?? null,
    goals.max_daily_sodium_mg ?? null,
    goals.max_daily_saturated_fat_g ?? null,
    goals.min_daily_fiber_g ?? null,
    goals.max_daily_cholesterol_mg ?? null,
    goals.max_daily_added_sugar_g ?? null,
    goals.diet_style ?? 'DASH'
  );

  return goalId;
}

/**
 * Get current nutrition goals
 */
export function getNutritionGoals(userId: string) {
  return db.prepare<[string], {
    id: string;
    daily_protein_target_g: number | null;
    max_daily_sodium_mg: number | null;
    max_daily_saturated_fat_g: number | null;
    min_daily_fiber_g: number | null;
    max_daily_cholesterol_mg: number | null;
    max_daily_added_sugar_g: number | null;
    diet_style: string;
    created_at: string;
  }>(`
    SELECT *
    FROM nutrition_goals
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(userId);
}

/**
 * Get or create nutrition day record
 */
export function getOrCreateNutritionDay(userId: string, dateLocal: string) {
  let day = db.prepare<[string, string], { id: string }>(`
    SELECT id FROM nutrition_days WHERE user_id = ? AND date_local = ?
  `).get(userId, dateLocal);

  if (!day) {
    const dayId = randomUUID();
    db.prepare(`
      INSERT INTO nutrition_days (
        id, user_id, date_local, timezone, source, diet_style, high_cholesterol, high_protein_goal
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(dayId, userId, dateLocal, 'America/New_York', 'manual_entry', 'DASH', 1, 1);

    // Create targets and totals records
    db.prepare(`
      INSERT INTO nutrition_day_targets (
        id, nutrition_day_id, calories_kcal, protein_g, fiber_g,
        sodium_mg_max, sat_fat_g_max, added_sugar_g_max, cholesterol_mg_max
      )
      VALUES (?, ?, 0, 200, 30, 2300, 20, 25, 200)
    `).run(randomUUID(), dayId);

    db.prepare(`
      INSERT INTO nutrition_day_totals (id, nutrition_day_id)
      VALUES (?, ?)
    `).run(randomUUID(), dayId);

    return dayId;
  }

  return day.id;
}

/**
 * Add a meal to a nutrition day
 */
export function addMealToDay(userId: string, dateLocal: string, mealType: string, timeLocal?: string) {
  const dayId = getOrCreateNutritionDay(userId, dateLocal);
  const mealId = randomUUID();
  const meal = {
    id: mealId,
    meal_id: `${mealType}-${new Date().getTime()}`,
    meal_type: mealType,
    time_local: timeLocal || ''
  };

  db.prepare(`
    INSERT INTO nutrition_meals (
      id, user_id, nutrition_day_id, meal_id, meal_type, time_local
    )
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(meal.id, userId, dayId, meal.meal_id, meal.meal_type, meal.time_local);

  db.prepare(`
    INSERT INTO nutrition_meal_totals (id, meal_id)
    VALUES (?, ?)
  `).run(randomUUID(), mealId);

  return meal;
}

/**
 * Add item to a meal
 */
export function addItemToMeal(userId: string, mealId: string, foodName: string, nutrition: any, servingInfo: any) {
  const itemId = randomUUID();
  const itemRecord = {
    id: itemId,
    item_id: `item-${new Date().getTime()}`,
    food_name: foodName,
    ...nutrition,
    ...servingInfo
  };

  console.log("[Nutrition] Adding item to meal:", {
    userId,
    mealId,
    foodName,
    nutrition,
    servingInfo
  });

  db.prepare(`
    INSERT INTO nutrition_meal_items (
      id, user_id, meal_id, item_id, food_name, brand, serving_quantity, serving_unit,
      serving_display, calories_kcal, protein_g, carbs_g, fat_g, fiber_g,
      sugar_g, added_sugar_g, sodium_mg, sat_fat_g, cholesterol_mg,
      potassium_mg, calcium_mg, high_sodium, high_sat_fat, processed, notes
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    itemId,
    userId,
    mealId,
    itemRecord.item_id,
    itemRecord.food_name,
    itemRecord.brand || null,
    itemRecord.serving_quantity || null,
    itemRecord.serving_unit || null,
    itemRecord.serving_display || null,
    nutrition.calories_kcal || 0,
    nutrition.protein_g || 0,
    nutrition.carbs_g || 0,
    nutrition.fat_g || 0,
    nutrition.fiber_g || 0,
    nutrition.sugar_g || 0,
    nutrition.added_sugar_g || 0,
    nutrition.sodium_mg || 0,
    nutrition.sat_fat_g || 0,
    nutrition.cholesterol_mg || 0,
    nutrition.potassium_mg || 0,
    nutrition.calcium_mg || 0,
    0, 0, 0, null
  );

  console.log("[Nutrition] Item added successfully:", itemId);
  return itemRecord;
}

/**
 * Compute totals for a meal and day
 */
export function computeTotals(userId: string, dateLocal: string) {
  const dayId = db.prepare<[string, string], { id: string }>(`
    SELECT id FROM nutrition_days WHERE user_id = ? AND date_local = ?
  `).get(userId, dateLocal)?.id;

  if (!dayId) return;

  // Compute meal totals
  const meals = db.prepare<[string], { id: string }>(`
    SELECT DISTINCT meal_id FROM nutrition_meal_items
    WHERE meal_id IN (
      SELECT id FROM nutrition_meals WHERE nutrition_day_id = ?
    )
  `).all(dayId);

  for (const meal of meals) {
    const totals = db.prepare<[string], any>(`
      SELECT
        COALESCE(SUM(calories_kcal), 0) as calories_kcal,
        COALESCE(SUM(protein_g), 0) as protein_g,
        COALESCE(SUM(carbs_g), 0) as carbs_g,
        COALESCE(SUM(fat_g), 0) as fat_g,
        COALESCE(SUM(fiber_g), 0) as fiber_g,
        COALESCE(SUM(sodium_mg), 0) as sodium_mg,
        COALESCE(SUM(sat_fat_g), 0) as sat_fat_g,
        COALESCE(SUM(cholesterol_mg), 0) as cholesterol_mg
      FROM nutrition_meal_items WHERE meal_id = ?
    `).get(meal.id);

    db.prepare(`
      UPDATE nutrition_meal_totals SET
        calories_kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?,
        fiber_g = ?, sodium_mg = ?, sat_fat_g = ?, cholesterol_mg = ?
      WHERE meal_id = ?
    `).run(
      totals.calories_kcal, totals.protein_g, totals.carbs_g, totals.fat_g,
      totals.fiber_g, totals.sodium_mg, totals.sat_fat_g, totals.cholesterol_mg,
      meal.id
    );
  }

  // Compute day totals
  const dayTotals = db.prepare<[string], any>(`
    SELECT
      COALESCE(SUM(calories_kcal), 0) as calories_kcal,
      COALESCE(SUM(protein_g), 0) as protein_g,
      COALESCE(SUM(carbs_g), 0) as carbs_g,
      COALESCE(SUM(fat_g), 0) as fat_g,
      COALESCE(SUM(fiber_g), 0) as fiber_g,
      COALESCE(SUM(sugar_g), 0) as sugar_g,
      COALESCE(SUM(added_sugar_g), 0) as added_sugar_g,
      COALESCE(SUM(sodium_mg), 0) as sodium_mg,
      COALESCE(SUM(sat_fat_g), 0) as sat_fat_g,
      COALESCE(SUM(cholesterol_mg), 0) as cholesterol_mg,
      COALESCE(SUM(potassium_mg), 0) as potassium_mg,
      COALESCE(SUM(calcium_mg), 0) as calcium_mg
    FROM nutrition_meal_items
    WHERE meal_id IN (
      SELECT id FROM nutrition_meals WHERE nutrition_day_id = ?
    )
  `).get(dayId);

  db.prepare(`
    UPDATE nutrition_day_totals SET
      calories_kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?,
      fiber_g = ?, sugar_g = ?, added_sugar_g = ?, sodium_mg = ?,
      sat_fat_g = ?, cholesterol_mg = ?, potassium_mg = ?, calcium_mg = ?
    WHERE nutrition_day_id = ?
  `).run(
    dayTotals.calories_kcal, dayTotals.protein_g, dayTotals.carbs_g, dayTotals.fat_g,
    dayTotals.fiber_g, dayTotals.sugar_g, dayTotals.added_sugar_g, dayTotals.sodium_mg,
    dayTotals.sat_fat_g, dayTotals.cholesterol_mg, dayTotals.potassium_mg, dayTotals.calcium_mg,
    dayId
  );

  db.prepare(`
    UPDATE nutrition_days SET
      recompute_required = 0, last_computed_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(dayId);
}

/**
 * Get full nutrition day with all meals and items
 */
export function getNutritionDay(userId: string, dateLocal: string) {
  const dayId = db.prepare<[string, string], { id: string }>(`
    SELECT id FROM nutrition_days WHERE user_id = ? AND date_local = ?
  `).get(userId, dateLocal)?.id;

  if (!dayId) return null;

  const day = db.prepare<[string], any>(`
    SELECT * FROM nutrition_days WHERE id = ?
  `).get(dayId);

  const targets = db.prepare<[string], any>(`
    SELECT * FROM nutrition_day_targets WHERE nutrition_day_id = ?
  `).get(dayId);

  const totals = db.prepare<[string], any>(`
    SELECT * FROM nutrition_day_totals WHERE nutrition_day_id = ?
  `).get(dayId);

  const meals = db.prepare<[string], any>(`
    SELECT * FROM nutrition_meals
    WHERE nutrition_day_id = ?
    ORDER BY time_local
  `).all(dayId);

  const mealsWithItems = meals.map((meal: any) => {
    const items = db.prepare<[string], any>(`
      SELECT * FROM nutrition_meal_items WHERE meal_id = ?
    `).all(meal.id);
    
    // Compute meal totals from items
    const mealTotals = {
      calories_kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      added_sugar_g: 0,
      sodium_mg: 0,
      sat_fat_g: 0,
      cholesterol_mg: 0,
      potassium_mg: 0,
      calcium_mg: 0
    };
    
    items.forEach((item: any) => {
      mealTotals.calories_kcal += item.calories_kcal || 0;
      mealTotals.protein_g += item.protein_g || 0;
      mealTotals.carbs_g += item.carbs_g || 0;
      mealTotals.fat_g += item.fat_g || 0;
      mealTotals.fiber_g += item.fiber_g || 0;
      mealTotals.sugar_g += item.sugar_g || 0;
      mealTotals.added_sugar_g += item.added_sugar_g || 0;
      mealTotals.sodium_mg += item.sodium_mg || 0;
      mealTotals.sat_fat_g += item.sat_fat_g || 0;
      mealTotals.cholesterol_mg += item.cholesterol_mg || 0;
      mealTotals.potassium_mg += item.potassium_mg || 0;
      mealTotals.calcium_mg += item.calcium_mg || 0;
    });
    
    return { ...meal, items, ...mealTotals };
  });

  // Compute daily totals from all meals
  const dayTotals = {
    calories_kcal: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    added_sugar_g: 0,
    sodium_mg: 0,
    sat_fat_g: 0,
    cholesterol_mg: 0,
    potassium_mg: 0,
    calcium_mg: 0
  };

  mealsWithItems.forEach((meal: any) => {
    dayTotals.calories_kcal += meal.calories_kcal || 0;
    dayTotals.protein_g += meal.protein_g || 0;
    dayTotals.carbs_g += meal.carbs_g || 0;
    dayTotals.fat_g += meal.fat_g || 0;
    dayTotals.fiber_g += meal.fiber_g || 0;
    dayTotals.sugar_g += meal.sugar_g || 0;
    dayTotals.added_sugar_g += meal.added_sugar_g || 0;
    dayTotals.sodium_mg += meal.sodium_mg || 0;
    dayTotals.sat_fat_g += meal.sat_fat_g || 0;
    dayTotals.cholesterol_mg += meal.cholesterol_mg || 0;
    dayTotals.potassium_mg += meal.potassium_mg || 0;
    dayTotals.calcium_mg += meal.calcium_mg || 0;
  });

  return {
    ...day,
    targets,
    totals: dayTotals,
    meals: mealsWithItems
  };
}

/**
 * Delete an item from a meal
 */
export function deleteItemFromMeal(itemId: string): boolean {
  // Get the item with its meal info
  const item = db
    .prepare(
      `SELECT nmi.id, nmi.meal_id, nm.nutrition_day_id 
       FROM nutrition_meal_items nmi
       JOIN nutrition_meals nm ON nmi.meal_id = nm.id
       WHERE nmi.id = ?`
    )
    .get(itemId) as { nutrition_day_id: string } | undefined;

  if (!item) {
    return false;
  }

  // Delete the item
  db.prepare(`DELETE FROM nutrition_meal_items WHERE id = ?`).run(itemId);

  // Recompute meal and day totals
  const dayRecord = db
    .prepare(`SELECT user_id, date_local FROM nutrition_days WHERE id = ?`)
    .get(item.nutrition_day_id) as { user_id: string; date_local: string } | undefined;

  if (dayRecord) {
    computeTotals(dayRecord.user_id, dayRecord.date_local);
  }

  return true;
}

/**
 * Update a nutrition meal item
 */
export function updateItemInMeal(
  itemId: string,
  updates: {
    food_name?: string;
    serving_quantity?: number;
    serving_unit?: string;
    serving_display?: string;
    calories_kcal?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    fiber_g?: number;
    sugar_g?: number;
    added_sugar_g?: number;
    sodium_mg?: number;
    sat_fat_g?: number;
    cholesterol_mg?: number;
    potassium_mg?: number;
    calcium_mg?: number;
  }
): any {
  console.log('[Nutrition] updateItemInMeal called with itemId:', itemId, 'updates:', updates);
  
  // Get the item with its meal and day info
  const item = db
    .prepare(
      `SELECT nmi.*, nm.nutrition_day_id 
       FROM nutrition_meal_items nmi
       JOIN nutrition_meals nm ON nmi.meal_id = nm.id
       WHERE nmi.id = ?`
    )
    .get(itemId) as any;

  if (!item) {
    console.log('[Nutrition] Item not found:', itemId);
    return null;
  }

  console.log('[Nutrition] Found item to update:', item);

  // Build update query dynamically based on provided fields
  const fields: string[] = [];
  const values: any[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined && value !== null) {
      fields.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (fields.length === 0) {
    console.log('[Nutrition] No fields to update');
    return item; // No updates provided
  }

  values.push(itemId);

  const query = `UPDATE nutrition_meal_items SET ${fields.join(', ')} WHERE id = ?`;
  console.log('[Nutrition] Executing update query:', query, 'with values:', values);
  
  try {
    db.prepare(query).run(...values);
    console.log('[Nutrition] Update successful');
  } catch (error) {
    console.error('[Nutrition] Update error:', error);
    throw error;
  }

  // Recompute meal and day totals
  const dayRecord = db
    .prepare(`SELECT user_id, date_local FROM nutrition_days WHERE id = ?`)
    .get(item.nutrition_day_id) as { user_id: string; date_local: string } | undefined;

  if (dayRecord) {
    console.log('[Nutrition] Recomputing totals for date:', dayRecord.date_local);
    computeTotals(dayRecord.user_id, dayRecord.date_local);
  }

  // Return updated item
  const updated = db.prepare(`SELECT * FROM nutrition_meal_items WHERE id = ?`).get(itemId);
  console.log('[Nutrition] Returning updated item:', updated);
  return updated;
}

/**
 * Delete a meal from a day
 */
export function deleteMealFromDay(mealId: string): boolean {
  // Get the meal with its day info
  const meal = db
    .prepare(
      `SELECT id, nutrition_day_id FROM nutrition_meals WHERE id = ?`
    )
    .get(mealId) as { nutrition_day_id: string } | undefined;

  if (!meal) {
    return false;
  }

  // Delete all items in the meal first
  db.prepare(`DELETE FROM nutrition_meal_items WHERE meal_id = ?`).run(mealId);

  // Delete meal totals if they exist
  db.prepare(`DELETE FROM nutrition_meal_totals WHERE meal_id = ?`).run(mealId);

  // Delete the meal
  db.prepare(`DELETE FROM nutrition_meals WHERE id = ?`).run(mealId);

  // Recompute day totals
  const dayRecord = db
    .prepare(`SELECT user_id, date_local FROM nutrition_days WHERE id = ?`)
    .get(meal.nutrition_day_id) as { user_id: string; date_local: string } | undefined;

  if (dayRecord) {
    computeTotals(dayRecord.user_id, dayRecord.date_local);
  }

  return true;
}
