import { callLLM } from '../utils/llm.js';
import type { RouterResult } from '@thor/shared';

/**
 * Route a user message to the appropriate domain
 * Returns classification and intent
 */
export async function routeQuery(text: string, modeOverride?: string): Promise<RouterResult> {
  // If explicit mode provided, use it
  if (modeOverride && modeOverride !== 'auto') {
    return classifyWithMode(text, modeOverride);
  }

  // Otherwise, use LLM to classify
  return classifyWithLLM(text);
}

/**
 * Direct classification based on explicit mode
 */
function classifyWithMode(text: string, mode: string): RouterResult {
  const modeMap: Record<string, RouterResult['target']> = {
    'thor': 'WORKOUT',
    'nutrition': 'NUTRITION',
    'health': 'HEALTH_LOG',
    'overview': 'OVERVIEW'
  };

  const target = modeMap[mode] || 'WORKOUT';

  // Infer intent from text (simple heuristics)
  let intent = 'log_workout';
  if (target === 'NUTRITION') intent = 'log_meal';
  if (target === 'HEALTH_LOG') intent = 'log_event';
  if (target === 'OVERVIEW') intent = 'get_summary';

  return {
    target,
    intent,
    cleaned_text: text,
    confidence: 1.0
  };
}

/**
 * Use LLM to classify the query
 */
async function classifyWithLLM(text: string): Promise<RouterResult> {
  const systemPrompt = `You are a health domain classifier. Analyze the user's natural language input and classify it into one of these domains:

DOMAINS:
- WORKOUT: Anything about exercise, strength training, cardio, fitness activities (e.g., "did 3x8 bench", "ran 5 miles")
- NUTRITION: Meals, food, macros, calorie tracking (e.g., "ate a chicken salad", "had breakfast")
- HEALTH_LOG: Health events, migraines, sleep, yard work, miscellaneous (e.g., "had a migraine", "slept well", "did yardwork")
- OVERVIEW: Summary queries, asking about stats or progress (e.g., "how am I doing?", "what's my week like?")

INTENTS:
- For WORKOUT: "log_workout"
- For NUTRITION: "log_meal"
- For HEALTH_LOG: "log_event"
- For OVERVIEW: "get_summary"

Return a JSON object with:
{
  "target": "WORKOUT" | "NUTRITION" | "HEALTH_LOG" | "OVERVIEW",
  "intent": string,
  "cleaned_text": string (cleaned/normalized version of input),
  "confidence": number (0.0-1.0)
}`;

  const userMessage = `Classify this message: "${text}"`;

  try {
    const result = await callLLM(systemPrompt, userMessage);
    // Validate result has required fields
    if (!result.target || !result.intent) {
      throw new Error('Invalid router response: missing target or intent');
    }
    return result as RouterResult;
  } catch (error) {
    console.error('Router LLM error:', error);
    // Fallback to simple heuristic classification
    return fallbackClassify(text);
  }
}

/**
 * Fallback classification using simple heuristics
 */
function fallbackClassify(text: string): RouterResult {
  const lowerText = text.toLowerCase();

  // Check for overview patterns
  if (
    lowerText.includes('how am i doing') ||
    lowerText.includes('summary') ||
    lowerText.includes('progress') ||
    lowerText.includes("what's my") ||
    lowerText.includes("how's my")
  ) {
    return {
      target: 'OVERVIEW',
      intent: 'get_summary',
      cleaned_text: text,
      confidence: 0.7
    };
  }

  // Check for nutrition patterns
  if (
    lowerText.includes('ate ') ||
    lowerText.includes('meal') ||
    lowerText.includes('food') ||
    lowerText.includes('breakfast') ||
    lowerText.includes('lunch') ||
    lowerText.includes('dinner') ||
    lowerText.includes('snack') ||
    lowerText.includes('calor')
  ) {
    return {
      target: 'NUTRITION',
      intent: 'log_meal',
      cleaned_text: text,
      confidence: 0.7
    };
  }

  // Check for health log patterns
  if (
    lowerText.includes('migraine') ||
    lowerText.includes('sleep') ||
    lowerText.includes('yardwork') ||
    lowerText.includes('yard work') ||
    lowerText.includes('pain')
  ) {
    return {
      target: 'HEALTH_LOG',
      intent: 'log_event',
      cleaned_text: text,
      confidence: 0.7
    };
  }

  // Default to workout
  return {
    target: 'WORKOUT',
    intent: 'log_workout',
    cleaned_text: text,
    confidence: 0.5
  };
}
