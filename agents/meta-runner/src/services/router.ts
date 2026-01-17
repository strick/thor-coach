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
  const lowerText = text.toLowerCase();

  // Infer intent from text even when mode is specified
  let intent = 'log_workout';
  
  if (target === 'NUTRITION') {
    // Check for query keywords in nutrition
    if (lowerText.includes('when') || lowerText.includes('show') || lowerText.includes('list') || lowerText.includes('history')) {
      intent = 'get_meals';
    } else {
      intent = 'log_meal';
    }
  } else if (target === 'HEALTH_LOG') {
    // Check for query keywords in health
    if (lowerText.includes('when') || lowerText.includes('was') || lowerText.includes('show') || lowerText.includes('history') || lowerText.includes('past')) {
      intent = 'get_health_events';
    } else if (lowerText.includes('delete') || lowerText.includes('remove')) {
      intent = 'delete_health_event';
    } else {
      intent = 'log_event';
    }
  } else if (target === 'OVERVIEW') {
    intent = 'get_summary';
  } else if (target === 'WORKOUT') {
    // Check for query/update keywords in workouts
    if (lowerText.includes('when') || lowerText.includes('show') || lowerText.includes('list') || lowerText.includes('history') || lowerText.includes('past')) {
      intent = 'get_workouts';
    } else if (lowerText.includes('update') || lowerText.includes('edit') || lowerText.includes('change')) {
      intent = 'update_workout';
    } else {
      intent = 'log_workout';
    }
  }

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
  // TEMPORARY: Skip LLM for speed (2min response time), use heuristics only
  console.log(`[Router] Skipping LLM, using fallback heuristics for: "${text}"`);
  const fallbackResult = fallbackClassify(text);
  console.log(`[Router] Fallback result:`, fallbackResult);
  return fallbackResult;

  // Original LLM code (disabled for now due to slow performance)
  /* const systemPrompt = `You are a health domain classifier. Analyze the user's natural language input and classify it into one of these domains:

DOMAINS:
- WORKOUT: Actively logging a NEW workout happening NOW or in the immediate past (e.g., "did 3x8 bench", "just ran 5 miles", "benched 225 today")
- NUTRITION: Meals, food, macros, calorie tracking (e.g., "ate a chicken salad", "had breakfast")
- HEALTH_LOG: ANYTHING related to health events - both LOGGING and QUERYING (migraines, headaches, sleep, yard work, runs, pain)
  * Logging: "had a migraine", "slept 8 hours", "did yardwork"
  * Querying: "when was my last migraine?", "how did I sleep?", "show my migraines"
  * Keywords: migraine, headache, pain, sleep, slept, health event, health log, yardwork, yard work
- OVERVIEW: Reviewing, checking, or asking about WORKOUT data from the past, or general fitness progress/stats (e.g., "I need to log yesterdays workout", "did I work out yesterday?", "how am I doing with lifting?", "what's my week like?")

**CRITICAL RULES:**
- If the message contains "migraine", "headache", "sleep", "pain", "health" → ALWAYS classify as HEALTH_LOG
- "When was my last migraine?" = HEALTH_LOG (querying health data, not workout overview)
- "How did I sleep?" = HEALTH_LOG (querying health data)
- "Show my workouts" = OVERVIEW (querying workout data)
- "I worked out yesterday" = OVERVIEW (reviewing past workout data)
- "Did 3x8 bench press" = WORKOUT (actively logging right now)

INTENTS:
- For WORKOUT: "log_workout"
- For NUTRITION: "log_meal"
- For HEALTH_LOG: "log_event" (use for both logging AND querying)
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
    console.log(`[Router] LLM classified "${text}" as:`, result);
    return result as RouterResult;
  } catch (error) {
    console.error('Router LLM error:', error);
    console.log(`[Router] Falling back to heuristic classification for: "${text}"`);
    // Fallback to simple heuristic classification
    const fallbackResult = fallbackClassify(text);
    console.log(`[Router] Fallback classification:`, fallbackResult);
    return fallbackResult;
  }
  */
}

/**
 * Fallback classification using simple heuristics
 * Now detects different intents, not just one per domain
 */
function fallbackClassify(text: string): RouterResult {
  const lowerText = text.toLowerCase();

  // Check for health log patterns FIRST (highest priority)
  if (
    lowerText.includes('migraine') ||
    lowerText.includes('headache') ||
    lowerText.includes('sleep') ||
    lowerText.includes('slept') ||
    lowerText.includes('yardwork') ||
    lowerText.includes('yard work') ||
    lowerText.includes('pain') ||
    lowerText.includes('health event') ||
    lowerText.includes('health log')
  ) {
    // Determine intent: logging vs querying
    let intent = 'log_event'; // default to logging
    if (
      lowerText.includes('when') ||
      lowerText.includes('was') ||
      lowerText.includes('were') ||
      lowerText.includes('did') ||
      lowerText.includes('have i') ||
      lowerText.includes('show') ||
      lowerText.includes('display') ||
      lowerText.includes('list') ||
      lowerText.includes('history') ||
      lowerText.includes('last') ||
      lowerText.includes('recent') ||
      lowerText.includes('past') ||
      lowerText.includes('previous') ||
      lowerText.includes('all my')
    ) {
      intent = 'get_health_events'; // user is querying, not logging
    } else if (
      lowerText.includes('delete') ||
      lowerText.includes('remove') ||
      lowerText.includes('forget')
    ) {
      intent = 'delete_health_event';
    }

    return {
      target: 'HEALTH_LOG',
      intent,
      cleaned_text: text,
      confidence: 0.8
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
    // Determine intent: logging vs querying
    let intent = 'log_meal'; // default to logging
    if (
      lowerText.includes('when') ||
      lowerText.includes('show') ||
      lowerText.includes('list') ||
      lowerText.includes('history') ||
      lowerText.includes('past')
    ) {
      intent = 'get_meals'; // user is querying
    }

    return {
      target: 'NUTRITION',
      intent,
      cleaned_text: text,
      confidence: 0.7
    };
  }

  // Check for workout PLAN queries (what should I do today?)
  // "what is my workout today?", "what should I do today?", "what exercises today?", "what are todays workouts"
  // "what is mondays workout?", "what exercises on tuesday?"
  const hasWorkoutKeyword = lowerText.includes('workout') || lowerText.includes('exercise') || lowerText.includes('lift');
  const hasTodayKeyword = lowerText.includes('today') || lowerText.includes('todays');
  const hasDayKeyword = lowerText.includes('monday') || lowerText.includes('tuesday') ||
                        lowerText.includes('wednesday') || lowerText.includes('thursday') ||
                        lowerText.includes('friday') || lowerText.includes('saturday') ||
                        lowerText.includes('sunday');
  const hasWhatKeyword = lowerText.includes('what') || lowerText.includes('show');
  const hasPlanKeyword = lowerText.includes('supposed to') || lowerText.includes('should') ||
                         lowerText.includes('plan') || lowerText.includes('scheduled');

  const isPlanQuery = hasWorkoutKeyword && (
    (hasPlanKeyword) ||  // "what should I do today"
    (hasWhatKeyword && hasTodayKeyword) ||  // "what are todays workouts", "what exercises today"
    (hasWhatKeyword && hasDayKeyword)  // "what is mondays workout", "what exercises on tuesday"
  );

  if (isPlanQuery) {
    return {
      target: 'WORKOUT',
      intent: 'get_plan',  // New intent for plan queries
      cleaned_text: text,
      confidence: 0.8
    };
  }

  // Check for workout HISTORY queries (what did I do yesterday?)
  // "what did I do yesterday", "what workout did I do today", "show my workout from monday"
  const isWorkoutQuery =
    lowerText.includes('workout') || lowerText.includes('exercise') || lowerText.includes('lift');
  const isDateQuery =
    lowerText.includes('yesterday') || lowerText.includes('today') ||
    lowerText.includes('monday') || lowerText.includes('tuesday') || lowerText.includes('wednesday') ||
    lowerText.includes('thursday') || lowerText.includes('friday') || lowerText.includes('saturday') ||
    lowerText.includes('sunday') || lowerText.includes('last');
  const isHistoryPhrase =
    lowerText.includes('did i') || lowerText.includes('what did') ||
    lowerText.includes('logged') || lowerText.includes('completed');

  // Route to WORKOUT with get_workouts intent ONLY for history queries
  if (
    (isWorkoutQuery && isDateQuery && isHistoryPhrase) ||
    (isHistoryPhrase && isDateQuery && !lowerText.includes('migraine') && !lowerText.includes('sleep') && !lowerText.includes('health'))
  ) {
    return {
      target: 'WORKOUT',
      intent: 'get_workouts',
      cleaned_text: text,
      confidence: 0.8
    };
  }

  // Check for overview patterns (general progress, not specific date queries)
  if (
    lowerText.includes('how am i doing') ||
    lowerText.includes('summary') ||
    lowerText.includes('progress') ||
    lowerText.includes("what's my") ||
    lowerText.includes("how's my") ||
    lowerText.includes('need to log')
  ) {
    return {
      target: 'OVERVIEW',
      intent: 'get_summary',
      cleaned_text: text,
      confidence: 0.7
    };
  }

  // Check for workout patterns
  let workoutIntent = 'log_workout'; // default
  if (
    lowerText.includes('when') ||
    lowerText.includes('show') ||
    lowerText.includes('list') ||
    lowerText.includes('past') ||
    lowerText.includes('history')
  ) {
    workoutIntent = 'get_workouts'; // user is querying
  } else if (
    lowerText.includes('update') ||
    lowerText.includes('edit') ||
    lowerText.includes('change')
  ) {
    workoutIntent = 'update_workout';
  }

  // Default to workout
  return {
    target: 'WORKOUT',
    intent: workoutIntent,
    cleaned_text: text,
    confidence: 0.5
  };
}
