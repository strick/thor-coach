import { z } from "zod";

/**
 * Ingest request schema
 */
export const IngestReq = z.object({
  text: z.string().min(3),
  date: z.string().optional(), // YYYY-MM-DD
  planId: z.string().optional().default("thor")
});

/**
 * Meal schema
 */
export const MealSchema = z.object({
  id: z.string().optional(),
  date: z.string(),           // YYYY-MM-DD
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  description: z.string().min(1),
  calories: z.number().optional(),
  protein_g: z.number().optional(),
  fat_g: z.number().optional(),
  sat_fat_g: z.number().optional(),
  carbs_g: z.number().optional(),
  fiber_g: z.number().optional(),
  sodium_mg: z.number().optional(),
  cholesterol_mg: z.number().optional()
});

/**
 * Health event schema
 */
export const HealthEventSchema = z.object({
  id: z.string().optional(),
  date: z.string(),           // YYYY-MM-DD
  category: z.enum(["migraine", "run", "sleep", "yardwork", "other"]),
  intensity: z.number().min(1).max(10).optional(),
  duration_minutes: z.number().optional(),
  notes: z.string().optional()
});

/**
 * Router result schema
 */
export const RouterResultSchema = z.object({
  target: z.enum(["WORKOUT", "NUTRITION", "HEALTH_LOG", "OVERVIEW"]),
  intent: z.string(),
  cleaned_text: z.string(),
  confidence: z.number().optional()
});

/**
 * Meta-runner request schema
 */
export const MetaRunnerRequestSchema = z.object({
  text: z.string().min(1),
  mode: z.enum(["auto", "thor", "nutrition", "health", "overview"]).optional(),
  periodDays: z.number().optional().default(14)
});

/**
 * Meta-runner response schema
 */
export const MetaRunnerResponseSchema = z.object({
  agent: z.enum(["thor", "nutrition", "health", "overview"]),
  intent: z.string(),
  actions: z.array(z.string()),
  message: z.string(),
  rawToolResults: z.any().optional()
});

/**
 * Daily Summary Schemas
 */

export const DailySummaryUserProfileSchema = z.object({
  age: z.number(),
  sex: z.enum(["male", "female", "other"]),
  weight_lbs: z.number().positive(),
  diet: z.string(),
  cholesterolNotes: z.string().optional(),
  goals: z.array(z.string())
});

export const DailySummaryNutritionItemSchema = z.object({
  name: z.string(),
  quantity: z.string(),
  calories: z.number().nonnegative().optional().default(0),
  protein_g: z.number().nonnegative().optional().default(0),
  carbs_g: z.number().nonnegative().optional().default(0),
  fat_g: z.number().nonnegative().optional().default(0),
  sat_fat_g: z.number().nonnegative().optional().default(0),
  fiber_g: z.number().nonnegative().optional().default(0),
  sodium_mg: z.number().nonnegative().optional().default(0)
});

export const DailySummaryMealSchema = z.object({
  time: z.string(), // HH:MM
  items: z.array(DailySummaryNutritionItemSchema),
  notes: z.string().optional()
});

export const DailySummaryNutritionTotalsSchema = z.object({
  calories: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carbs_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  sat_fat_g: z.number().nonnegative(),
  fiber_g: z.number().nonnegative(),
  sodium_mg: z.number().nonnegative(),
  water_oz: z.number().nonnegative().optional().default(0)
});

export const DailySummaryNutritionSchema = z.object({
  meals: z.array(DailySummaryMealSchema).optional().default([]),
  totals: DailySummaryNutritionTotalsSchema
});

export const DailySummaryExerciseSetSchema = z.object({
  reps: z.number().positive().optional(),
  weight_lbs_each: z.number().nonnegative().optional(),
  rpe: z.number().min(1).max(10).optional()
});

export const DailySummaryExerciseSchema = z.object({
  name: z.string(),
  sets: z.array(DailySummaryExerciseSetSchema),
  notes: z.string().optional()
});

export const DailySummaryWorkoutSchema = z.object({
  planName: z.string(),
  day: z.number(),
  title: z.string(),
  exercises: z.array(DailySummaryExerciseSchema),
  duration_min: z.number().nonnegative()
});

export const DailySummaryRunSchema = z.object({
  distance_miles: z.number().nonnegative(),
  pace_min_per_mile: z.string().optional(), // MM:SS
  avg_hr: z.number().nonnegative().optional(),
  max_hr: z.number().nonnegative().optional(),
  duration_min: z.number().nonnegative(),
  conditions: z.string().optional(),
  notes: z.string().optional()
});

export const DailySummaryTrainingSchema = z.object({
  workout: DailySummaryWorkoutSchema.optional(),
  run: DailySummaryRunSchema.optional()
});

export const DailySummaryActivitySchema = z.object({
  steps: z.number().nonnegative().optional().default(0),
  active_minutes: z.number().nonnegative().optional().default(0)
});

export const DailySummarySleepSchema = z.object({
  duration_hours: z.number().nonnegative().optional(),
  quality: z.string().optional()
});

export const DailySummaryInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
  timezone: z.string().optional().default("America/New_York"),
  userProfile: DailySummaryUserProfileSchema,
  nutrition: DailySummaryNutritionSchema,
  training: DailySummaryTrainingSchema.optional(),
  activity: DailySummaryActivitySchema.optional(),
  sleep: DailySummarySleepSchema.optional(),
  notes: z.string().optional()
});

export const DailySummarySectionsSchema = z.object({
  highlights: z.array(z.string()),
  dashHeartHealthy: z.string(),
  proteinRecovery: z.string(),
  training: z.string(),
  redFlags: z.string(),
  tomorrowPriorities: z.string()
});

export const DailySummaryOutputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  markdown: z.string(),
  sections: DailySummarySectionsSchema,
  generatedAt: z.string() // ISO 8601
});
