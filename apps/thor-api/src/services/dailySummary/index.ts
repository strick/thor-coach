/**
 * Daily Summary Service
 * Main orchestrator for daily summary generation
 */

import { db } from "../../db.js";
import type {
  DailySummaryInput,
  DailySummaryOutput
} from "@thor/shared";
import { DailySummaryInputSchema } from "@thor/shared";
import { normalizeDailySummaryData } from "./normalize.js";
import { buildDailySummaryPrompt } from "./promptBuilder.js";
import { callLLMForDailySummary } from "./llmCall.js";
import { parseDailySummaryOutput, validateSummaryOutput, reconstructMarkdown } from "./outputParser.js";
import { storeDailySummary, getDailySummary } from "./storage.js";

/**
 * Generate a daily summary for a given date
 * Collects data from DB, validates, calls LLM, stores result
 */
export async function generateDailySummary(date: string): Promise<DailySummaryOutput> {
  console.log(`[Daily Summary] Starting generation for ${date}`);

  // Check if already exists
  const existing = getDailySummary(date);
  if (existing) {
    console.log(`[Daily Summary] Found existing summary for ${date}, regenerating...`);
  }

  // Collect data from database
  const payload = collectDailyData(date);
  console.log(`[Daily Summary] Collected data for ${date}`);

  // Validate payload
  const validationResult = DailySummaryInputSchema.safeParse(payload);
  if (!validationResult.success) {
    console.error(`[Daily Summary] Validation failed: ${validationResult.error.message}`);
    throw new Error(`Invalid daily summary payload: ${validationResult.error.message}`);
  }

  const normalizedData = normalizeDailySummaryData(payload);
  console.log(`[Daily Summary] Normalized data for ${date}`);

  // Build prompts
  const { system, user } = buildDailySummaryPrompt(normalizedData);
  console.log(`[Daily Summary] Built prompts for ${date}`);

  // Call LLM
  console.log(`[Daily Summary] Calling LLM for ${date}...`);
  let llmResponse: string;
  try {
    llmResponse = await callLLMForDailySummary(system, user);
  } catch (error) {
    console.error(`[Daily Summary] LLM call failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }

  // Parse output
  const sections = parseDailySummaryOutput(llmResponse);
  const validation = validateSummaryOutput(sections);

  if (!validation.valid) {
    console.warn(`[Daily Summary] Incomplete summary sections: ${validation.errors.join(", ")}`);
  }

  // Reconstruct markdown for consistency
  const markdown = reconstructMarkdown(sections);

  const output: DailySummaryOutput = {
    date,
    markdown,
    sections,
    generatedAt: new Date().toISOString()
  };

  // Store result
  storeDailySummary(output);

  console.log(`[Daily Summary] Successfully generated and stored summary for ${date}`);
  return output;
}

/**
 * Retrieve a previously generated daily summary
 */
export function retrieveDailySummary(date: string): DailySummaryOutput | null {
  return getDailySummary(date);
}

/**
 * Collect all data for a given date from the database
 */
function collectDailyData(date: string): DailySummaryInput {
  // Collect nutrition data
  const meals = collectMeals(date);
  const nutritionTotals = collectNutritionTotals(date);

  // Collect training data
  const { workout, run } = collectTrainingData(date);

  // Collect activity data
  const activity = collectActivityData(date);

  // Collect sleep data
  const sleep = collectSleepData(date);

  // Get user profile and goals from database
  const userGoals = db.prepare(`
    SELECT daily_protein_target_g, max_daily_sodium_mg, min_daily_fiber_g, max_daily_saturated_fat_g
    FROM nutrition_goals
    WHERE user_id = ?
  `).get('user-main') as any;

  const userProfile = {
    age: 41,
    sex: "male" as const,
    weight_lbs: 195,
    diet: "DASH",
    cholesterolNotes: "genetically high cholesterol; LDL under 70 with meds",
    goals: ["fat loss", "muscle building", "better consistency"],
    // Use actual user goals from database if available
    proteinTarget: userGoals?.daily_protein_target_g || 195 * 1.8
  };

  return {
    date,
    timezone: "America/New_York",
    userProfile,
    nutrition: {
      meals,
      totals: nutritionTotals
    },
    training: { workout, run },
    activity,
    sleep,
    notes: ""
  };
}

/**
 * Collect meal data for a date
 */
function collectMeals(date: string) {
  // Get all meals and their items for the given date
  const stmt = db.prepare(`
    SELECT 
      m.id,
      m.meal_type,
      m.time_local,
      mi.food_name,
      mi.calories_kcal,
      mi.protein_g,
      mi.carbs_g,
      mi.fat_g,
      mi.sat_fat_g,
      mi.fiber_g,
      mi.sodium_mg,
      mi.serving_display
    FROM nutrition_meals m
    JOIN nutrition_meal_items mi ON m.id = mi.meal_id
    JOIN nutrition_days nd ON m.nutrition_day_id = nd.id
    WHERE nd.date_local = ? AND nd.user_id = 'user-main'
    ORDER BY m.time_local ASC, mi.created_at ASC
  `);

  const rows = stmt.all(date) as Array<{
    id: string;
    meal_type: string;
    time_local: string;
    food_name: string;
    calories_kcal?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    sat_fat_g?: number;
    fiber_g?: number;
    sodium_mg?: number;
    serving_display?: string;
  }>;

  if (rows.length === 0) {
    return [];
  }

  // Group meals by meal_id and time_local
  const mealMap = new Map<string, Array<any>>();
  const mealTimes = new Map<string, string>();

  rows.forEach((row) => {
    const mealKey = row.id;
    if (!mealMap.has(mealKey)) {
      mealMap.set(mealKey, []);
      mealTimes.set(mealKey, row.time_local);
    }
    mealMap.get(mealKey)!.push(row);
  });

  return Array.from(mealMap.entries()).map(([mealId, items]) => ({
    time: mealTimes.get(mealId) || "00:00",
    items: items.map((row) => ({
      name: row.food_name,
      quantity: row.serving_display || "1 serving",
      calories: row.calories_kcal || 0,
      protein_g: row.protein_g || 0,
      carbs_g: row.carbs_g || 0,
      fat_g: row.fat_g || 0,
      sat_fat_g: row.sat_fat_g || 0,
      fiber_g: row.fiber_g || 0,
      sodium_mg: row.sodium_mg || 0
    })),
    notes: ""
  }));
}

/**
 * Collect aggregated nutrition totals for a date
 */
function collectNutritionTotals(date: string) {
  // Compute totals directly from meal items since nutrition_day_totals might not be updated
  const stmt = db.prepare(`
    SELECT
      COALESCE(SUM(mi.calories_kcal), 0) as calories_kcal,
      COALESCE(SUM(mi.protein_g), 0) as protein_g,
      COALESCE(SUM(mi.carbs_g), 0) as carbs_g,
      COALESCE(SUM(mi.fat_g), 0) as fat_g,
      COALESCE(SUM(mi.sat_fat_g), 0) as sat_fat_g,
      COALESCE(SUM(mi.fiber_g), 0) as fiber_g,
      COALESCE(SUM(mi.sodium_mg), 0) as sodium_mg
    FROM nutrition_meal_items mi
    JOIN nutrition_meals m ON mi.meal_id = m.id
    JOIN nutrition_days nd ON m.nutrition_day_id = nd.id
    WHERE nd.date_local = ? AND nd.user_id = 'user-main'
  `);

  const row = stmt.get(date) as {
    calories_kcal: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    sat_fat_g: number;
    fiber_g: number;
    sodium_mg: number;
  } | undefined;

  return {
    calories: row?.calories_kcal || 0,
    protein_g: row?.protein_g || 0,
    carbs_g: row?.carbs_g || 0,
    fat_g: row?.fat_g || 0,
    sat_fat_g: row?.sat_fat_g || 0,
    fiber_g: row?.fiber_g || 0,
    sodium_mg: row?.sodium_mg || 0,
    water_oz: 0
  };
}

/**
 * Collect training data (workouts and runs) for a date
 */
function collectTrainingData(date: string) {
  // Get workout
  const workoutStmt = db.prepare(`
    SELECT ws.id, ws.session_date
    FROM workout_sessions ws
    WHERE ws.session_date = ?
    LIMIT 1
  `);

  const workoutRow = workoutStmt.get(date) as { id: string; session_date: string } | undefined;

  let workout = undefined;
  if (workoutRow) {
    // Get exercises for this session
    const exStmt = db.prepare(`
      SELECT el.exercise_id, el.sets, el.reps_per_set, el.weight_lbs, el.notes, e.name
      FROM exercise_logs el
      JOIN exercises e ON el.exercise_id = e.id
      WHERE el.session_id = ?
    `);

    const exercises = exStmt.all(workoutRow.id) as Array<{
      exercise_id: string;
      sets?: number;
      reps_per_set?: string;
      weight_lbs?: number;
      notes?: string;
      name: string;
    }>;

    workout = {
      planName: "Thor Dumbbell-Only",
      day: 1,
      title: "Strength Training",
      exercises: exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets
          ? [
              {
                reps: ex.sets,
                weight_lbs_each: ex.weight_lbs || 0,
                rpe: 7
              }
            ]
          : [],
        notes: ex.notes || ""
      })),
      duration_min: 45
    };
  }

  // Get run (from running_sessions table)
  const runStmt = db.prepare(`
    SELECT distance_miles, duration_minutes, pace_min_per_mile, notes
    FROM running_sessions
    WHERE session_date = ?
    LIMIT 1
  `);

  const runRow = runStmt.get(date) as { distance_miles?: number; duration_minutes?: number; pace_min_per_mile?: number; notes?: string } | undefined;

  const run = runRow
    ? {
        distance_miles: runRow.distance_miles || 0,
        duration_min: runRow.duration_minutes || 0,
        notes: runRow.notes || ""
      }
    : undefined;

  return { workout, run };
}

/**
 * Collect activity data (steps, active minutes) for a date
 */
function collectActivityData(date: string) {
  // This would integrate with health event tracking
  // For now, return defaults
  return {
    steps: 0,
    active_minutes: 0
  };
}

/**
 * Collect sleep data for a date
 */
function collectSleepData(date: string) {
  const stmt = db.prepare(`
    SELECT duration_minutes, notes
    FROM health_events
    WHERE date = ? AND category = 'sleep'
    LIMIT 1
  `);

  const row = stmt.get(date) as { duration_minutes?: number; notes?: string } | undefined;

  if (!row) {
    return undefined;
  }

  return {
    duration_hours: row.duration_minutes ? row.duration_minutes / 60 : undefined,
    quality: row.notes || undefined
  };
}
