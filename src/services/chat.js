// "Ask Thor": conversational health pal with tool calling. Replaces the old
// thor-agent, health-agent, meta-runner and health-mcp containers with one loop.
import { db } from "../db.js";
import { chatCompletion } from "../llm.js";
import { DEFAULT_USER_ID, todayISO, getDOW } from "../config.js";
import * as workouts from "./workouts.js";
import * as nutrition from "./nutrition.js";
import * as running from "./running.js";
import { syncStrava } from "./strava.js";
import { systemPrompt } from "./persona.js";
import { buildHealthContext } from "./healthContext.js";
import { getProfile, listMedications } from "./profile.js";

const TOOLS = [
  {
    name: "get_health_profile",
    description: "Get the user's health profile (age, conditions, allergies, family history, goals, diet style, doctor notes) and their medications & supplements.",
    parameters: { type: "object", properties: { include_inactive_meds: { type: "boolean" } } },
    run: ({ include_inactive_meds }) => ({
      profile: getProfile(),
      medications: listMedications({ active: include_inactive_meds ? undefined : true }),
    }),
  },
  {
    name: "get_today_plan",
    description: "Get the planned exercises for a date (defaults to today).",
    parameters: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" } } },
    run: ({ date }) => {
      const d = date ? new Date(date + "T12:00:00") : new Date();
      return workouts.getDayExercises(getDOW(d)).map((e) => e.name);
    },
  },
  {
    name: "log_workout",
    description: "Log a workout from natural language, e.g. '3x12 floor press @45, 20 15 10 pushups'.",
    parameters: { type: "object", properties: { text: { type: "string" }, date: { type: "string" } }, required: ["text"] },
    run: ({ text, date }) => workouts.ingestWorkout(text, date),
  },
  {
    name: "get_workouts",
    description: "Get logged workouts with exercises between two dates (inclusive).",
    parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
    run: ({ start, end }) => workouts.getWorkouts(start || todayISO(), end || todayISO()),
  },
  {
    name: "get_progress_summary",
    description: "Progress overview: totals, per-exercise progression, weekly volume.",
    parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
    run: ({ start, end }) => workouts.progressSummary(start, end),
  },
  {
    name: "log_food",
    description: "Log food from natural language, e.g. 'greek yogurt with berries and 2 eggs for breakfast'.",
    parameters: { type: "object", properties: { text: { type: "string" }, date: { type: "string" }, meal_type: { type: "string", enum: ["breakfast", "lunch", "dinner", "snack"] } }, required: ["text"] },
    run: ({ text, date, meal_type }) => nutrition.logFoodText(DEFAULT_USER_ID, text, date, meal_type),
  },
  {
    name: "get_nutrition_day",
    description: "Get a day's nutrition: meals, items, totals vs targets.",
    parameters: { type: "object", properties: { date: { type: "string" } } },
    run: ({ date }) => nutrition.getDay(DEFAULT_USER_ID, date || todayISO()),
  },
  {
    name: "get_runs",
    description: "Get running sessions between two dates.",
    parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
    run: ({ start, end }) => running.listSessions({ start, end }),
  },
  {
    name: "sync_strava",
    description: "Sync runs from Strava for a date (defaults to today).",
    parameters: { type: "object", properties: { date: { type: "string" } } },
    run: ({ date }) => syncStrava(date || todayISO()),
  },
  {
    name: "log_health_event",
    description: "Log a health event (migraine, sleep, yardwork, run, other).",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string" },
        category: { type: "string", enum: ["migraine", "sleep", "yardwork", "run", "other"] },
        intensity: { type: "integer", minimum: 1, maximum: 10 },
        duration_minutes: { type: "integer" },
        notes: { type: "string" },
      },
      required: ["category"],
    },
    run: ({ date, category, intensity, duration_minutes, notes }) => {
      const id = crypto.randomUUID();
      db.prepare("INSERT INTO health_events (id, date, category, intensity, duration_minutes, notes) VALUES (?, ?, ?, ?, ?, ?)").run(
        id, date || todayISO(), category, intensity ?? null, duration_minutes ?? null, notes ?? null
      );
      return { logged: id };
    },
  },
  {
    name: "log_weight",
    description: "Record a body weigh-in (upserts by date).",
    parameters: {
      type: "object",
      properties: { date: { type: "string" }, weight_lbs: { type: "number" }, waist_in: { type: "number" } },
      required: ["weight_lbs"],
    },
    run: ({ date, weight_lbs, waist_in }) => {
      const d = date || todayISO();
      db.prepare(
        `INSERT INTO body_metrics (date, weight_lbs, waist_in, updated_at) VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(date) DO UPDATE SET weight_lbs = excluded.weight_lbs,
           waist_in = COALESCE(excluded.waist_in, body_metrics.waist_in), updated_at = excluded.updated_at`
      ).run(d, weight_lbs, waist_in ?? null);
      return { logged: d, weight_lbs };
    },
  },
  {
    name: "get_body_metrics",
    description: "Get body weight / waist history between two dates.",
    parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
    run: ({ start, end }) =>
      db.prepare("SELECT * FROM body_metrics WHERE date BETWEEN ? AND ? ORDER BY date").all(start || "0000-01-01", end || "9999-12-31"),
  },
  {
    name: "log_water",
    description: "Add glasses of water (8 oz each) for a date, or set an absolute count. Positive delta adds, negative removes.",
    parameters: {
      type: "object",
      properties: { date: { type: "string" }, delta: { type: "integer" }, glasses: { type: "integer" } },
    },
    run: ({ date, delta, glasses }) => {
      const d = date || todayISO();
      const current = db.prepare("SELECT glasses FROM water_intake WHERE date = ?").get(d)?.glasses ?? 0;
      const next = Math.max(0, glasses != null ? glasses : current + (delta != null ? delta : 1));
      db.prepare(
        `INSERT INTO water_intake (date, glasses, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(date) DO UPDATE SET glasses = excluded.glasses, updated_at = excluded.updated_at`
      ).run(d, next);
      return { date: d, glasses: next, oz: next * 8 };
    },
  },
  {
    name: "get_water",
    description: "Get water intake (glasses) for a date, defaults to today.",
    parameters: { type: "object", properties: { date: { type: "string" } } },
    run: ({ date }) => {
      const d = date || todayISO();
      return { date: d, glasses: db.prepare("SELECT glasses FROM water_intake WHERE date = ?").get(d)?.glasses ?? 0 };
    },
  },
  {
    name: "get_health_events",
    description: "Get health events between two dates.",
    parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
    run: ({ start, end }) =>
      db.prepare("SELECT * FROM health_events WHERE date BETWEEN ? AND ? ORDER BY date DESC").all(start || "0000-01-01", end || "9999-12-31"),
  },
];

const SYSTEM = () => {
  const context = buildHealthContext({ sections: ["profile", "medications", "today"] });
  return systemPrompt(`Chat with the user. You can read and log their workouts, food, runs, weight, water and health notes through tools.
Today is ${todayISO()} (day-of-week ${getDOW()} where Monday=1..Sunday=7).
- Use tools to read or log data instead of guessing. After logging something, confirm exactly what you logged.
- Keep replies short and conversational unless they ask for depth. Use their numbers.
- Their profile, medications and today's data so far (JSON): ${JSON.stringify(context)}`);
};

/**
 * messages: [{role:'user'|'assistant', content}] conversation history from the client.
 * Runs an OpenAI-compatible tool-calling loop (max 6 rounds) and returns the reply.
 */
export async function chat(messages) {
  const toolDefs = TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const convo = [{ role: "system", content: SYSTEM() }, ...messages.slice(-20)];
  const toolCallsMade = [];

  for (let round = 0; round < 6; round += 1) {
    const { message } = await chatCompletion("chat", { messages: convo, tools: toolDefs });
    convo.push(message);

    const calls = message.tool_calls || [];
    if (!calls.length) return { reply: message.content ?? "", tool_calls: toolCallsMade };

    for (const call of calls) {
      const tool = TOOLS.find((t) => t.name === call.function?.name);
      let result;
      try {
        const args = JSON.parse(call.function?.arguments || "{}");
        result = tool ? await tool.run(args) : { error: `Unknown tool ${call.function?.name}` };
        toolCallsMade.push({ name: call.function?.name, args });
      } catch (err) {
        result = { error: String(err.message || err) };
        toolCallsMade.push({ name: call.function?.name, error: result.error });
      }
      convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
    }
  }
  return { reply: "I hit my tool-call limit for this turn — try a more specific question.", tool_calls: toolCallsMade };
}
