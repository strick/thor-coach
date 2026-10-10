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
import * as headaches from "./headaches.js";
import * as checkins from "./checkins.js";

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
    name: "log_headache",
    description:
      "Log a headache or migraine. Times are local 'YYYY-MM-DDTHH:MM'. Leave ended_at empty if it's still going. " +
      "If the user describes any red-flag symptom (sudden worst-ever headache, one-sided weakness/numbness, trouble speaking or confusion, fever with stiff neck, after a head injury, new vision loss), include it in red_flags and tell them to seek care now.",
    parameters: {
      type: "object",
      properties: {
        started_at: { type: "string" },
        ended_at: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD if no start time is known" },
        peak_severity: { type: "integer", minimum: 0, maximum: 10 },
        type: { type: "string", enum: headaches.TYPES },
        locations: { type: "array", items: { type: "string", enum: headaches.LOCATIONS.map(([k]) => k) } },
        aura: { type: "boolean" },
        symptoms: { type: "array", items: { type: "string", enum: headaches.SYMPTOMS.map(([k]) => k) } },
        red_flags: { type: "array", items: { type: "string", enum: headaches.RED_FLAGS.map(([k]) => k) } },
        meds: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" }, dose: { type: "string" }, time: { type: "string", description: "HH:MM" },
              relief: { type: "string", enum: headaches.RELIEF },
            },
            required: ["name"],
          },
        },
        triggers: { type: "array", items: { type: "string" }, description: `Suspected triggers, e.g. ${headaches.TRIGGERS.map(([k]) => k).join(", ")}` },
        notes: { type: "string" },
      },
    },
    run: (args) => headaches.createHeadache(args),
  },
  {
    name: "update_headache",
    description: "Update a logged headache — e.g. set ended_at when it stops, add meds or relief, change severity. Get the id from get_headaches.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string" }, ended_at: { type: "string" }, peak_severity: { type: "integer", minimum: 0, maximum: 10 },
        type: { type: "string", enum: headaches.TYPES },
        meds: { type: "array", items: { type: "object" }, description: "Full replacement list of meds taken for this headache" },
        triggers: { type: "array", items: { type: "string" } }, notes: { type: "string" },
      },
      required: ["id"],
    },
    run: ({ id, ...patch }) => headaches.updateHeadache(id, patch),
  },
  {
    name: "get_headaches",
    description: "Get logged headaches between two dates (newest first).",
    parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
    run: ({ start, end }) => headaches.listHeadaches({ start, end, limit: 60 }),
  },
  {
    name: "get_headache_insights",
    description:
      "Headache pattern analysis from the user's own logs: which factors (sleep, stress, caffeine, alcohol, sodium, water, meals, training) line up with headache days, " +
      "plus a medication-overuse check. Present patterns as associations, never proof.",
    parameters: { type: "object", properties: { days: { type: "integer", minimum: 14, maximum: 365 } } },
    run: ({ days }) => {
      const r = headaches.getHeadacheInsights({ days: days || 90 });
      return { ...r, weekly: undefined };
    },
  },
  {
    name: "log_checkin",
    description: "Record the daily check-in (partial updates fine): last night's sleep hours, sleep quality 1-5, stress 1-5, energy 1-5, caffeine servings, alcohol drinks.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string" }, sleep_hours: { type: "number" }, sleep_quality: { type: "integer", minimum: 1, maximum: 5 },
        stress: { type: "integer", minimum: 1, maximum: 5 }, energy: { type: "integer", minimum: 1, maximum: 5 },
        caffeine_servings: { type: "number" }, alcohol_drinks: { type: "number" }, notes: { type: "string" },
      },
    },
    run: ({ date, ...fields }) => checkins.upsertCheckin(date, fields),
  },
  {
    name: "get_checkins",
    description: "Get daily check-ins (sleep, stress, energy, caffeine, alcohol) between two dates.",
    parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
    run: ({ start, end }) => checkins.listCheckins(start, end),
  },
  {
    name: "log_health_event",
    description: "Log another kind of health event (not headaches — use log_headache for those): sleep, yardwork, run, other.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string" },
        category: { type: "string", enum: ["sleep", "yardwork", "run", "other"] },
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
    description: "Get other (non-headache) health events between two dates.",
    parameters: { type: "object", properties: { start: { type: "string" }, end: { type: "string" } } },
    run: ({ start, end }) =>
      db.prepare("SELECT * FROM health_events WHERE date BETWEEN ? AND ? AND category != 'migraine' ORDER BY date DESC")
        .all(start || "0000-01-01", end || "9999-12-31"),
  },
];

const SYSTEM = () => {
  const context = buildHealthContext({ sections: ["profile", "medications", "today"] });
  return systemPrompt(`Chat with the user. Through tools you can read and log their workouts, food, runs, weight, water, headaches and daily check-ins (sleep, stress, energy, caffeine, alcohol), and look at headache patterns.
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
