import { callLLM } from '../utils/llm.js';
import type { Meal, HealthEvent } from '@thor/shared';

/**
 * Parse structured data from user input for each domain
 */

export interface ParsedWorkout {
  text: string;
  date?: string;
  planId?: string;
}

export interface ParsedMeal extends Meal {
  // inherits from Meal type
}

export interface ParsedHealthEvent extends HealthEvent {
  // inherits from HealthEvent type
}

/**
 * Parse workout text (delegates to existing ingest mechanism)
 */
export async function parseWorkout(text: string, date?: string): Promise<ParsedWorkout> {
  return {
    text,
    date: date || new Date().toISOString().split('T')[0],
    planId: 'thor'
  };
}

/**
 * Parse meal from natural language
 */
export async function parseMeal(text: string, date?: string): Promise<ParsedMeal> {
  const systemPrompt = `You are a nutrition logging assistant. Extract meal information from natural language.
Return a JSON object with:
{
  "date": "YYYY-MM-DD",
  "meal_type": "breakfast" | "lunch" | "dinner" | "snack",
  "description": "what they ate",
  "calories": number or null,
  "protein_g": number or null,
  "fat_g": number or null,
  "sat_fat_g": number or null,
  "carbs_g": number or null,
  "fiber_g": number or null,
  "sodium_mg": number or null,
  "cholesterol_mg": number or null
}
Only include macros if explicitly mentioned in the input. Otherwise set to null.`;

  const userMessage = `Log this meal: "${text}". Date: ${date || new Date().toISOString().split('T')[0]}`;

  try {
    const parsed = await callLLM(systemPrompt, userMessage);
    return {
      id: '',
      ...parsed
    };
  } catch (error) {
    console.error('Meal parsing error:', error);
    // Fallback: basic parsing
    return {
      id: '',
      date: date || new Date().toISOString().split('T')[0],
      meal_type: inferMealType(text),
      description: text
    };
  }
}

/**
 * Parse health event from natural language
 */
export async function parseHealthEvent(text: string, date?: string): Promise<ParsedHealthEvent> {
  const systemPrompt = `You are a health logging assistant. Extract health event information from natural language.
Return a JSON object with:
{
  "date": "YYYY-MM-DD",
  "category": "migraine" | "run" | "sleep" | "yardwork" | "other",
  "intensity": number (1-10) or null,
  "duration_minutes": number or null,
  "notes": "any additional details"
}
Only include fields that are explicitly mentioned or can be inferred.`;

  const userMessage = `Log this health event: "${text}". Date: ${date || new Date().toISOString().split('T')[0]}`;

  try {
    const parsed = await callLLM(systemPrompt, userMessage);
    return {
      id: '',
      ...parsed
    };
  } catch (error) {
    console.error('Health event parsing error:', error);
    // Fallback: basic parsing
    return {
      id: '',
      date: date || new Date().toISOString().split('T')[0],
      category: inferHealthCategory(text),
      notes: text
    };
  }
}

/**
 * Infer meal type from text (fallback)
 */
function inferMealType(text: string): "breakfast" | "lunch" | "dinner" | "snack" {
  const lower = text.toLowerCase();
  if (lower.includes('breakfast')) return 'breakfast';
  if (lower.includes('lunch')) return 'lunch';
  if (lower.includes('dinner')) return 'dinner';
  return 'snack';
}

/**
 * Infer health category from text (fallback)
 */
function inferHealthCategory(text: string): "migraine" | "run" | "sleep" | "yardwork" | "other" {
  const lower = text.toLowerCase();
  if (lower.includes('migraine') || lower.includes('headache')) return 'migraine';
  if (lower.includes('run') || lower.includes('jog')) return 'run';
  if (lower.includes('sleep') || lower.includes('slept')) return 'sleep';
  if (lower.includes('yard') || lower.includes('yardwork')) return 'yardwork';
  return 'other';
}
