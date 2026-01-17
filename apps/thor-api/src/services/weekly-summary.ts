import { randomUUID } from "node:crypto";
import { db } from "../db.js";
import { getLLMConfigForUsage } from "./llm-config.js";

/**
 * Deserialize reps from database TEXT column
 */
function deserializeReps(repsValue: any): number | number[] | null {
  if (repsValue == null) return null;
  const str = String(repsValue).trim();
  if (!str) return null;
  if (str.startsWith('[')) {
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  const num = Number(str);
  return isNaN(num) ? null : num;
}

/**
 * Calculate volume for a single exercise log
 */
function calculateVolume(sets: number | null, reps: number | number[] | null, weight: number | null): number {
  if (!weight) return 0;
  if (!sets && !Array.isArray(reps)) return 0;

  if (Array.isArray(reps)) {
    // For arrays, sum all reps and multiply by weight
    const totalReps = reps.reduce((sum, r) => sum + r, 0);
    return totalReps * weight;
  } else if (typeof reps === 'number' && sets) {
    // For single numbers, multiply sets * reps * weight
    return sets * reps * weight;
  }
  return 0;
}

type WeeklyMetrics = {
  week_start: string;
  week_end: string;
  total_sessions: number;
  total_volume: number;
  total_sets: number;
  exercises_performed: Array<{
    name: string;
    count: number;
    total_volume: number;
    avg_weight: number;
  }>;
  days_trained: number[];
  previous_week_volume?: number;
  volume_change_pct?: number;
};

/**
 * Get the start of the week (Monday) for a given date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // If Sunday (0), go back 6 days, else go to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the end of the week (Sunday) for a given date
 */
function getWeekEnd(date: Date): Date {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Format date as YYYY-MM-DD
 */
function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Calculate metrics for a specific week
 */
export function calculateWeeklyMetrics(planId: string, weekStart: Date): WeeklyMetrics {
  const weekEnd = getWeekEnd(weekStart);
  const startISO = toISODate(weekStart);
  const endISO = toISODate(weekEnd);

  // Total sessions
  const sessionCount = db.prepare<[string, string, string], { count: number }>(`
    SELECT COUNT(DISTINCT s.id) as count
    FROM workout_sessions s
    WHERE s.plan_id = ? AND s.session_date BETWEEN ? AND ?
  `).get(planId, startISO, endISO);

  const totalSessions = sessionCount?.count || 0;

  // Total volume and sets
  const volumeData = db.prepare<[string, string, string], { total_volume: number; total_sets: number }>(`
    SELECT
      COALESCE(SUM(l.sets * l.reps_per_set * l.weight_lbs), 0) as total_volume,
      COALESCE(SUM(l.sets), 0) as total_sets
    FROM exercise_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    WHERE s.plan_id = ? AND s.session_date BETWEEN ? AND ?
      AND l.sets IS NOT NULL AND l.reps_per_set IS NOT NULL AND l.weight_lbs IS NOT NULL
  `).get(planId, startISO, endISO);

  const totalVolume = volumeData?.total_volume || 0;
  const totalSets = volumeData?.total_sets || 0;

  // Exercises performed
  const exercises = db.prepare<[string, string, string], {
    name: string;
    count: number;
    total_volume: number;
    avg_weight: number;
  }>(`
    SELECT
      e.name,
      COUNT(*) as count,
      COALESCE(SUM(l.sets * l.reps_per_set * l.weight_lbs), 0) as total_volume,
      COALESCE(AVG(l.weight_lbs), 0) as avg_weight
    FROM exercise_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    JOIN exercises e ON e.id = l.exercise_id
    WHERE s.plan_id = ? AND s.session_date BETWEEN ? AND ?
    GROUP BY e.name
    ORDER BY total_volume DESC
  `).all(planId, startISO, endISO);

  // Days trained (day of week)
  const daysTrained = db.prepare<[string, string, string], { day_of_week: number }>(`
    SELECT DISTINCT day_of_week
    FROM workout_sessions
    WHERE plan_id = ? AND session_date BETWEEN ? AND ?
    ORDER BY day_of_week
  `).all(planId, startISO, endISO).map((r: any) => r.day_of_week);

  // Previous week comparison
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekEnd = getWeekEnd(prevWeekStart);
  const prevStartISO = toISODate(prevWeekStart);
  const prevEndISO = toISODate(prevWeekEnd);

  const prevVolumeData = db.prepare<[string, string, string], { total_volume: number }>(`
    SELECT COALESCE(SUM(l.sets * l.reps_per_set * l.weight_lbs), 0) as total_volume
    FROM exercise_logs l
    JOIN workout_sessions s ON s.id = l.session_id
    WHERE s.plan_id = ? AND s.session_date BETWEEN ? AND ?
      AND l.sets IS NOT NULL AND l.reps_per_set IS NOT NULL AND l.weight_lbs IS NOT NULL
  `).get(planId, prevStartISO, prevEndISO);

  const previousWeekVolume = prevVolumeData?.total_volume || 0;
  const volumeChangePct = previousWeekVolume > 0
    ? ((totalVolume - previousWeekVolume) / previousWeekVolume) * 100
    : undefined;

  return {
    week_start: startISO,
    week_end: endISO,
    total_sessions: totalSessions,
    total_volume: totalVolume,
    total_sets: totalSets,
    exercises_performed: exercises,
    days_trained: daysTrained,
    previous_week_volume: previousWeekVolume,
    volume_change_pct: volumeChangePct,
  };
}

/**
 * Generate summary text using LLM
 */
async function generateSummaryText(metrics: WeeklyMetrics): Promise<string> {
  const llmConfig = getLLMConfigForUsage("weekly_summary");

  if (!llmConfig) {
    return generateFallbackSummary(metrics);
  }

  const prompt = `You are a fitness coach analyzing a client's weekly workout performance.

Week: ${metrics.week_start} to ${metrics.week_end}

Metrics:
- Total Sessions: ${metrics.total_sessions}
- Total Volume: ${metrics.total_volume.toFixed(0)} lbs
- Total Sets: ${metrics.total_sets}
- Days Trained: ${metrics.days_trained.join(", ")}
${metrics.volume_change_pct !== undefined ? `- Volume Change from Previous Week: ${metrics.volume_change_pct > 0 ? '+' : ''}${metrics.volume_change_pct.toFixed(1)}%` : ''}

Top Exercises:
${metrics.exercises_performed.slice(0, 5).map((e, i) =>
  `${i + 1}. ${e.name}: ${e.count}x logged, ${e.total_volume.toFixed(0)} lbs total volume, ${e.avg_weight.toFixed(1)} lbs avg`
).join('\n')}

Write a concise 3-4 sentence summary highlighting:
1. Overall performance and consistency
2. Notable strengths or achievements
3. A specific recommendation for next week

Keep it motivational but realistic. Use second person ("You").`;

  try {
    if (llmConfig.provider === "ollama") {
      if (!llmConfig.url) {
        throw new Error("Ollama URL is required");
      }
      return await generateWithOllama(prompt, llmConfig.model, llmConfig.url);
    } else {
      if (!llmConfig.apiKey) {
        throw new Error("OpenAI API key is required");
      }
      return await generateWithOpenAI(prompt, llmConfig.model, llmConfig.apiKey);
    }
  } catch (error) {
    console.error("Failed to generate LLM summary, using fallback:", error);
    return generateFallbackSummary(metrics);
  }
}

async function generateWithOllama(prompt: string, model: string, url: string): Promise<string> {
  const resp = await fetch(`${url}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model,
      stream: false,
      messages: [
        { role: "system", content: "You are a concise fitness coach. Keep responses to 3-4 sentences." },
        { role: "user", content: prompt }
      ],
      options: { temperature: 0.7 }
    })
  });

  if (!resp.ok) {
    throw new Error(`Ollama ${resp.status}: ${await resp.text()}`);
  }

  const data = await resp.json();
  return data?.message?.content || generateFallbackSummary({ week_start: "", week_end: "", total_sessions: 0, total_volume: 0, total_sets: 0, exercises_performed: [], days_trained: [] });
}

async function generateWithOpenAI(prompt: string, model: string, apiKey: string): Promise<string> {
  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: apiKey });

  const resp = await client.chat.completions.create({
    model: model,
    messages: [
      { role: "system", content: "You are a concise fitness coach. Keep responses to 3-4 sentences." },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 200
  });

  return resp.choices[0]?.message?.content || generateFallbackSummary({ week_start: "", week_end: "", total_sessions: 0, total_volume: 0, total_sets: 0, exercises_performed: [], days_trained: [] });
}

function generateFallbackSummary(metrics: WeeklyMetrics): string {
  let summary = `Week of ${metrics.week_start}: You completed ${metrics.total_sessions} session${metrics.total_sessions !== 1 ? 's' : ''} `;
  summary += `with ${metrics.total_sets} total sets and ${metrics.total_volume.toFixed(0)} lbs volume. `;

  if (metrics.volume_change_pct !== undefined && metrics.volume_change_pct !== 0) {
    summary += `That's ${metrics.volume_change_pct > 0 ? 'a' : 'a'} ${Math.abs(metrics.volume_change_pct).toFixed(1)}% ${metrics.volume_change_pct > 0 ? 'increase' : 'decrease'} from last week. `;
  }

  if (metrics.exercises_performed.length > 0) {
    summary += `Top exercise: ${metrics.exercises_performed[0].name}.`;
  }

  return summary;
}

/**
 * Generate and store a weekly summary
 */
export async function generateWeeklySummary(planId: string, weekStart?: Date): Promise<string> {
  const targetDate = weekStart || new Date();
  const weekStartDate = getWeekStart(targetDate);
  const metrics = calculateWeeklyMetrics(planId, weekStartDate);

  // Generate summary text using LLM
  const summaryText = await generateSummaryText(metrics);

  // Store in database
  const summaryId = randomUUID();
  db.prepare(`
    INSERT INTO weekly_summaries (id, plan_id, week_start_date, week_end_date, total_sessions, total_volume, summary_text, metrics_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    summaryId,
    planId,
    metrics.week_start,
    metrics.week_end,
    metrics.total_sessions,
    metrics.total_volume,
    summaryText,
    JSON.stringify(metrics)
  );

  return summaryId;
}

/**
 * Get all weekly summaries for a plan
 */
export function getWeeklySummaries(planId: string, limit = 10) {
  return db.prepare<[string, number], {
    id: string;
    week_start_date: string;
    week_end_date: string;
    total_sessions: number;
    total_volume: number;
    summary_text: string;
    created_at: string;
  }>(`
    SELECT id, week_start_date, week_end_date, total_sessions, total_volume, summary_text, created_at
    FROM weekly_summaries
    WHERE plan_id = ?
    ORDER BY week_start_date DESC
    LIMIT ?
  `).all(planId, limit);
}

/**
 * Get a specific weekly summary with full metrics
 */
export function getWeeklySummary(summaryId: string) {
  return db.prepare<[string], {
    id: string;
    plan_id: string;
    week_start_date: string;
    week_end_date: string;
    total_sessions: number;
    total_volume: number;
    summary_text: string;
    metrics_json: string;
    created_at: string;
  }>(`
    SELECT *
    FROM weekly_summaries
    WHERE id = ?
  `).get(summaryId);
}
