// "Ask Thor": conversational health pal with tool calling. Replaces the old
// thor-agent, health-agent, meta-runner and health-mcp containers with one loop.
import { db, uuid, tx, getSetting, setSetting } from "../db.js";
import { chatCompletion } from "../llm.js";
import { HttpError } from "../http.js";
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
import * as labs from "./labs.js";
import * as memory from "./memory.js";
import * as guides from "./guides.js";
import { labsContext } from "./labs.js";
import { LAB_MARKERS } from "../data/labMarkers.js";

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
    name: "get_lab_results",
    description:
      "Get the user's confirmed blood-work results: latest value per marker (with the previous one) grouped by panel, or the full history of one marker. " +
      `Marker keys: ${LAB_MARKERS.map((m) => m.key).join(", ")}.`,
    parameters: { type: "object", properties: { marker: { type: "string", description: "A marker key for its full history" } } },
    run: ({ marker }) => (marker ? labs.trend(marker) : labs.latestResults()),
  },
  {
    name: "get_lab_reports",
    description: "List the user's lab reports (date, lab, status, counts), or one report's full results by id.",
    parameters: { type: "object", properties: { id: { type: "string" } } },
    run: ({ id }) => (id ? labs.getReport(id) : labs.listReports()),
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
  {
    name: "remember",
    description:
      "Save a durable fact, preference, or doctor instruction to long-term memory (e.g. 'Doctor wants LDL under 100 by March', 'Prefers morning runs', 'Lactose intolerant'). " +
      "Use only when the user asks you to remember something or states something lasting and important — never for trivia or one-off details. Tell them what you saved.",
    parameters: {
      type: "object",
      properties: { content: { type: "string" }, category: { type: "string", enum: memory.MEMORY_CATEGORIES } },
      required: ["content"],
    },
    run: ({ content, category }) => memory.addMemory({ content, category }),
  },
  {
    name: "list_memories",
    description: "List everything in long-term memory (with ids).",
    parameters: { type: "object", properties: {} },
    run: () => memory.listMemories(),
  },
  {
    name: "forget_memory",
    description: "Delete a memory by id when the user asks you to forget it or it's out of date.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    run: ({ id }) => memory.deleteMemory(id),
  },
  {
    name: "get_guides",
    description: "List saved guides (weekly reviews, lab explainers, deep dives) with titles and short excerpts, or read one in full by id.",
    parameters: { type: "object", properties: { id: { type: "string" }, kind: { type: "string", enum: guides.GUIDE_KINDS } } },
    run: ({ id, kind }) => (id ? guides.getGuide(id) : guides.listGuides({ kind, limit: 20 })),
  },
  {
    name: "get_weekly_review",
    description: "Get the most recent weekly health review.",
    parameters: { type: "object", properties: {} },
    run: () => guides.latestWeeklyReview() || { none: "No weekly review yet." },
  },
];

const SYSTEM = () => {
  const context = buildHealthContext({ sections: ["profile", "medications", "memories", "today"] });
  const labs = labsContext();
  const outOfRange = labs?.results.filter((r) => r.flag);
  const recentHeadaches = headacheSummary();
  return systemPrompt(`Chat with the user. Through tools you can read and log their workouts, food, runs, weight, water, headaches and daily check-ins (sleep, stress, energy, caffeine, alcohol), read their lab results and saved guides, and look at headache patterns.
Today is ${todayISO()} (day-of-week ${getDOW()} where Monday=1..Sunday=7).
- Use tools to read or log data instead of guessing. After logging something, confirm exactly what you logged.
- Keep replies short and conversational unless they ask for depth: a few sentences or a short list, answering the question first. Don't use report-style section headings (like "What went well") in chat. Use their numbers.
- Long-term memory: things the user asked you to keep are under "memories" below — use them. Call remember only when the user asks you to remember something or tells you something durable (a doctor's instruction, a lasting preference or condition), and tell them what you saved. Never store trivia.
- Their profile, medications, memories and today's data so far (JSON): ${JSON.stringify(context)}
${outOfRange?.length ? `- Lab results currently out of range (most recent draw ${labs.most_recent_draw}): ${JSON.stringify(outOfRange)}` : ""}
${recentHeadaches ? `- Headaches, last 30 days: ${JSON.stringify(recentHeadaches)}` : ""}`);
};

function headacheSummary() {
  const h = headaches.headachesContext(todayISO());
  if (!h || !h.headaches_last_30d) return null;
  return {
    headaches: h.headaches_last_30d,
    headache_days: h.headache_days_last_30d,
    most_recent: h.most_recent,
    medication_overuse: h.medication_overuse.status,
  };
}

// --- Persistent conversation ---------------------------------------------------

const HISTORY_TURNS = 20;

export function currentThread() {
  let id = getSetting("chat.thread");
  if (!id) {
    id = uuid();
    setSetting("chat.thread", id);
  }
  return id;
}

export function newThread() {
  const id = uuid();
  setSetting("chat.thread", id);
  return { thread_id: id };
}

export function chatHistory({ limit = 50 } = {}, userId = DEFAULT_USER_ID) {
  const thread = currentThread();
  const rows = db
    .prepare("SELECT id, role, content, tool_calls, created_at FROM chat_messages WHERE user_id = ? AND thread_id = ? ORDER BY rowid DESC LIMIT ?")
    .all(userId, thread, Math.min(200, Number(limit) || 50))
    .reverse()
    .map((m) => ({ ...m, tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : [] }));
  return { thread_id: thread, messages: rows };
}

/**
 * One chat turn. The server keeps the conversation: `message` is the new user
 * text (the legacy `{messages}` shape is accepted — its last user message is used).
 * The question and reply are saved together only when the turn succeeds.
 */
export async function chat({ message, messages } = {}, userId = DEFAULT_USER_ID) {
  const text = String(message ?? [...(messages || [])].reverse().find((m) => m.role === "user")?.content ?? "").trim();
  if (!text) throw new HttpError(400, "message is required");
  if (text.length > 4000) throw new HttpError(400, "Message is too long");
  const thread = currentThread();
  const history = db
    .prepare("SELECT role, content FROM chat_messages WHERE user_id = ? AND thread_id = ? ORDER BY rowid DESC LIMIT ?")
    .all(userId, thread, HISTORY_TURNS)
    .reverse();

  const toolDefs = TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
  const convo = [{ role: "system", content: SYSTEM() }, ...history, { role: "user", content: text }];
  const toolCallsMade = [];
  let reply = null;

  for (let round = 0; round < 6 && reply == null; round += 1) {
    const { message: m } = await chatCompletion("chat", { messages: convo, tools: toolDefs });
    convo.push(m);
    const calls = m.tool_calls || [];
    if (!calls.length) {
      reply = m.content ?? "";
      break;
    }
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
  reply ??= "I hit my tool-call limit for this turn — try a more specific question.";

  const pills = toolCallsMade.map((t) => ({ name: t.name, error: t.error ? true : undefined }));
  tx(() => {
    const ins = db.prepare("INSERT INTO chat_messages (id, user_id, thread_id, role, content, tool_calls) VALUES (?, ?, ?, ?, ?, ?)");
    ins.run(uuid(), userId, thread, "user", text, null);
    ins.run(uuid(), userId, thread, "assistant", reply, pills.length ? JSON.stringify(pills) : null);
  });
  return {
    reply,
    tool_calls: toolCallsMade,
    thread_id: thread,
    memory_saved: toolCallsMade.some((t) => t.name === "remember" && !t.error) || undefined,
  };
}
