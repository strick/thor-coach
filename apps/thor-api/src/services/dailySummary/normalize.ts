/**
 * Daily Summary Normalization
 * Handles missing fields, defaults, and unit conversions
 */

import type {
  DailySummaryInput,
  DailySummaryNutrition,
  DailySummaryTraining,
  DailySummaryActivity,
  DailySummarySleep
} from "@thor/shared";

/**
 * Normalize daily summary data
 * - Fills in missing optional fields with sensible defaults
 * - Validates numeric fields are non-negative
 * - Returns cleaned data ready for LLM processing
 */
export function normalizeDailySummaryData(input: DailySummaryInput): DailySummaryInput {
  return {
    ...input,
    timezone: input.timezone || "America/New_York",
    nutrition: normalizeNutrition(input.nutrition),
    training: input.training ? normalizeTraining(input.training) : undefined,
    activity: normalizeActivity(input.activity),
    sleep: normalizeSleep(input.sleep),
    notes: input.notes || ""
  };
}

/**
 * Normalize nutrition data
 */
function normalizeNutrition(nutrition: DailySummaryNutrition): DailySummaryNutrition {
  return {
    meals: nutrition.meals || [],
    totals: {
      calories: Math.max(0, nutrition.totals.calories || 0),
      protein_g: Math.max(0, nutrition.totals.protein_g || 0),
      carbs_g: Math.max(0, nutrition.totals.carbs_g || 0),
      fat_g: Math.max(0, nutrition.totals.fat_g || 0),
      sat_fat_g: Math.max(0, nutrition.totals.sat_fat_g || 0),
      fiber_g: Math.max(0, nutrition.totals.fiber_g || 0),
      sodium_mg: Math.max(0, nutrition.totals.sodium_mg || 0),
      water_oz: Math.max(0, nutrition.totals.water_oz || 0)
    }
  };
}

/**
 * Normalize training data
 */
function normalizeTraining(training: DailySummaryTraining): DailySummaryTraining {
  return {
    workout: training.workout
      ? {
          ...training.workout,
          duration_min: Math.max(0, training.workout.duration_min || 0)
        }
      : undefined,
    run: training.run
      ? {
          ...training.run,
          distance_miles: Math.max(0, training.run.distance_miles || 0),
          avg_hr: training.run.avg_hr ? Math.max(0, training.run.avg_hr) : undefined,
          max_hr: training.run.max_hr ? Math.max(0, training.run.max_hr) : undefined,
          duration_min: Math.max(0, training.run.duration_min || 0)
        }
      : undefined
  };
}

/**
 * Normalize activity data
 */
function normalizeActivity(activity?: DailySummaryActivity): DailySummaryActivity {
  return {
    steps: activity?.steps ? Math.max(0, activity.steps) : 0,
    active_minutes: activity?.active_minutes ? Math.max(0, activity.active_minutes) : 0
  };
}

/**
 * Normalize sleep data
 */
function normalizeSleep(sleep?: DailySummarySleep): DailySummarySleep | undefined {
  if (!sleep) return undefined;
  return {
    duration_hours: sleep.duration_hours ? Math.max(0, sleep.duration_hours) : undefined,
    quality: sleep.quality || undefined
  };
}

/**
 * Calculate protein target based on weight and goals
 * Standard: ~1.6-2.2g per lb for fat loss + muscle building
 */
export function estimateProteinTarget(weight_lbs: number): number {
  return Math.round(weight_lbs * 1.8);
}

/**
 * Estimate daily caloric goals (very rough, for context only)
 * For fat loss: ~13-14 cal per lb
 * For muscle: slightly higher
 */
export function estimateCalorieTarget(weight_lbs: number): number {
  return Math.round(weight_lbs * 13.5);
}

/**
 * Check if nutrition data is significantly incomplete
 */
export function isNutritionIncomplete(nutrition: DailySummaryNutrition): {
  incomplete: boolean;
  missingFields: string[];
} {
  const missingFields: string[] = [];

  if (nutrition.totals.calories === 0) missingFields.push("calories");
  if (nutrition.totals.protein_g === 0) missingFields.push("protein");
  if (nutrition.totals.sodium_mg === 0) missingFields.push("sodium");
  if (nutrition.totals.fiber_g === 0) missingFields.push("fiber");

  return {
    incomplete: missingFields.length > 0,
    missingFields
  };
}
