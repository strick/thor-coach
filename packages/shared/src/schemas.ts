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
