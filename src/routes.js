import { db, uuid, backupStatus, runDailyBackup, getSetting, setSetting } from "./db.js";
import { HttpError } from "./http.js";
import { DEFAULT_USER_ID, todayISO, getDOW, LLM_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_ADVICE_MODEL } from "./config.js";
import { getLLMConfig, updateLLMConfig, resetLLMConfig, listOllamaModels, listOpenAIModels } from "./llm.js";
import * as workouts from "./services/workouts.js";
import * as nutrition from "./services/nutrition.js";
import * as running from "./services/running.js";
import * as strava from "./services/strava.js";
import * as summary from "./services/dailySummary.js";
import * as profileApi from "./api/profile.js";
import * as guidesApi from "./api/guides.js";
import * as headachesApi from "./api/headaches.js";
import * as labsApi from "./api/labs.js";
import * as alerts from "./services/alerts.js";

export function registerRoutes(app) {
  // --- System ---
  app.get("/api/health", () => ({ ok: true, now: new Date().toISOString() }));
  app.get("/api/config", () => ({
    provider: LLM_PROVIDER,
    openai_configured: Boolean(OPENAI_API_KEY),
    model: OPENAI_MODEL,
    advice_model: OPENAI_ADVICE_MODEL,
    strava: strava.stravaStatus(),
    today: todayISO(),
    day_of_week: getDOW(),
  }));
  app.get("/api/config/llm", () => getLLMConfig());
  app.post("/api/config/llm", ({ body }) => {
    if (body.reset) return resetLLMConfig();
    return updateLLMConfig(body.usage, { provider: body.provider, model: body.model });
  });
  app.get("/api/ollama/models", async () => ({ models: await listOllamaModels() }));
  app.get("/api/openai/models", async () => ({ models: await listOpenAIModels() }));

  // --- Health profile, medications & supplements ---
  profileApi.register(app);

  // --- Headaches, daily check-ins, headache patterns ---
  headachesApi.register(app);
  // Care messages and critical labs that stay on Today until dismissed.
  app.get("/api/alerts", () => alerts.activeAlerts());
  app.post("/api/alerts/dismiss", ({ body }) => alerts.dismissAlert(body.key));

  // --- Blood work + lab explainers ---
  labsApi.register(app);
  app.get("/api/backups", () => backupStatus());
  app.post("/api/backups/run", () => runDailyBackup({ force: true }));

  // --- Users ---
  app.get("/api/users", () => db.prepare("SELECT * FROM users ORDER BY created_at").all());
  app.post("/api/users", ({ body }) => {
    if (!body.name?.trim()) throw new HttpError(400, "name is required");
    const id = uuid();
    db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)").run(id, body.name.trim(), body.email ?? null);
    return db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  });
  app.patch("/api/users/:id", ({ params, body }) => {
    const user = db.prepare("SELECT * FROM users WHERE id = ?").get(params.id);
    if (!user) throw new HttpError(404, "User not found");
    db.prepare("UPDATE users SET name = ?, email = ? WHERE id = ?").run(body.name ?? user.name, body.email ?? user.email, params.id);
    return db.prepare("SELECT * FROM users WHERE id = ?").get(params.id);
  });

  // --- Workouts ---
  app.get("/api/day/:dow", ({ params }) => workouts.getDayExercises(Number(params.dow)));
  app.get("/api/exercises", () => workouts.getAllExercises());
  app.get("/api/exercises/:id/latest", ({ params, query }) => workouts.latestForExercise(params.id, query.date || todayISO()));
  app.get("/api/progress/exercise/:id", ({ params }) => workouts.exerciseSeries(params.id));
  app.post("/api/exercises", ({ body }) => workouts.createExercise(body));
  app.patch("/api/exercises/:id", ({ params, body }) => workouts.updateExercise(params.id, body));
  app.delete("/api/exercises/:id", ({ params }) => workouts.deleteExercise(params.id));
  app.post("/api/ingest", ({ body }) => workouts.ingestWorkout(body.text, body.date));
  app.post("/api/log-manual", ({ body }) => workouts.logManual(body));
  app.get("/api/workouts", ({ query }) => workouts.getWorkouts(query.start, query.end));
  app.delete("/api/workouts/:id", ({ params }) => workouts.deleteWorkout(params.id));
  app.patch("/api/exercise-logs/:id", ({ params, body }) => workouts.updateExerciseLog(params.id, body));
  app.delete("/api/exercise-logs/:id", ({ params }) => workouts.deleteExerciseLog(params.id));
  app.get("/api/progress/summary", ({ query }) => workouts.progressSummary(query.start, query.end));
  app.get("/api/weekly-summaries", () => workouts.listWeeklySummaries());
  // POST /api/weekly-summaries/generate now makes a weekly health review (src/api/guides.js).

  // --- Food catalog ---
  app.get("/api/foods", ({ query }) => nutrition.searchFoods(query.q || "", query.category || ""));
  app.get("/api/foods/categories", () => nutrition.foodCategories());
  app.post("/api/foods", ({ body }) => nutrition.addCustomFood(body));
  app.delete("/api/foods/:id", ({ params }) => nutrition.deleteCustomFood(params.id));
  app.post("/api/nutrition/log-catalog", ({ body }) =>
    nutrition.logCatalogPicks(body.user_id || DEFAULT_USER_ID, body.date, body.meal_type, body.picks));
  app.post("/api/nutrition/template-from-catalog", ({ body }) =>
    nutrition.templateFromPicks(body.user_id || DEFAULT_USER_ID, body.name, body.meal_type, body.picks));
  app.get("/api/foods/frequent", ({ query }) => nutrition.frequentFoods(query.user_id || DEFAULT_USER_ID, query.limit));
  app.get("/api/foods/barcode/:code", ({ params }) => nutrition.barcodeLookup(params.code));
  // The photo is the raw request body (no multipart).
  app.post("/api/foods/barcode-photo", ({ body }) => nutrition.barcodeFromPhoto(body), { raw: true, maxBytes: 8 * 1024 * 1024 });
  app.post("/api/nutrition/copy-day", ({ body }) =>
    nutrition.copyDay(body.user_id || DEFAULT_USER_ID, body.from_date, body.to_date));

  // --- Nutrition ---
  app.post("/api/nutrition/parse", ({ body }) => nutrition.parseFood(body.text));
  app.post("/api/nutrition/log", ({ body }) => nutrition.logFoodText(body.user_id || DEFAULT_USER_ID, body.text, body.date, body.meal_type));
  app.get("/api/nutrition/day", ({ query }) => nutrition.getDay(query.user_id || DEFAULT_USER_ID, query.date || todayISO()));
  app.get("/api/nutrition/summary", ({ query }) => nutrition.getSummary(query.user_id || DEFAULT_USER_ID, query.start, query.end));
  app.get("/api/nutrition/goals", ({ query }) => nutrition.getGoals(query.user_id || DEFAULT_USER_ID));
  app.post("/api/nutrition/goals", ({ body }) => nutrition.upsertGoals(body.user_id || DEFAULT_USER_ID, body));
  app.post("/api/nutrition/meal", ({ body }) => nutrition.addMeal(body.user_id || DEFAULT_USER_ID, body.date || todayISO(), body.meal_type, body.time_local));
  app.post("/api/nutrition/item", ({ body }) => nutrition.addItems(body.user_id || DEFAULT_USER_ID, body.meal_id, body.items || [body.item])) ;
  app.put("/api/nutrition/item/:id", ({ params, body }) => nutrition.updateItem(params.id, body));
  app.patch("/api/nutrition/item/:id/servings", ({ params, body }) => nutrition.setItemServings(params.id, body.servings));
  app.delete("/api/nutrition/item/:id", ({ params }) => nutrition.deleteItem(params.id));
  app.delete("/api/nutrition/meal/:id", ({ params }) => nutrition.deleteMeal(params.id));
  app.get("/api/nutrition/templates", ({ query }) => nutrition.listTemplates(query.user_id || DEFAULT_USER_ID));
  app.post("/api/nutrition/template", ({ body }) => nutrition.saveTemplate(body.user_id || DEFAULT_USER_ID, body.name, body.meal_type, body.items));
  app.post("/api/nutrition/template/:id/apply", ({ params, body }) => nutrition.applyTemplate(body.user_id || DEFAULT_USER_ID, params.id, body.date, body.meal_type));
  app.patch("/api/nutrition/template/:id", ({ params, body }) => nutrition.updateTemplate(params.id, body));
  app.delete("/api/nutrition/template/:id", ({ params }) => nutrition.deleteTemplate(params.id));

  // --- Running / Strava ---
  app.get("/api/running/sessions", ({ query }) => running.listSessions(query));
  app.get("/api/running/sessions/:id", ({ params }) => running.getSession(params.id));
  app.post("/api/running/sessions", ({ body }) => running.createSession(body));
  app.put("/api/running/sessions/:id", ({ params, body }) => running.updateSession(params.id, body));
  app.delete("/api/running/sessions/:id", ({ params }) => running.deleteSession(params.id));
  app.get("/api/running/stats", ({ query }) => running.stats(query.start, query.end));
  app.get("/api/running/stats/weekly", () => running.weeklyStats());
  app.get("/api/running/strava/status", () => strava.stravaStatus());
  app.get("/api/running/strava/connect-url", ({ req }) => strava.stravaConnectUrl(req));
  app.get("/auth/strava/callback", async ({ req, res, query }) => {
    try {
      await strava.finishStravaConnect(req, query);
      res.writeHead(302, { Location: "/running.html?strava=connected" });
    } catch (err) {
      const message = String(err.message || "Strava connection failed").slice(0, 180);
      res.writeHead(302, { Location: `/running.html?strava_error=${encodeURIComponent(message)}` });
    }
    res.end();
  });
  app.get("/api/running/strava/sync-history", () => strava.syncHistory());
  app.post("/api/running/sync-strava", ({ body }) => strava.syncStrava(body.date || todayISO()));
  app.post("/api/running/auto-sync", ({ body }) => strava.autoSync(body.date || todayISO()));
  app.post("/api/running/backfill", ({ body }) => {
    const end = body.end || todayISO();
    const start = body.start || (() => { const d = new Date(end + "T12:00:00"); d.setDate(d.getDate() - 30); return todayISO(d); })();
    return strava.syncStravaRange(start, end);
  });

  // --- Body metrics (weight / waist / body fat) ---
  app.get("/api/body", ({ query }) =>
    db.prepare("SELECT * FROM body_metrics WHERE date BETWEEN ? AND ? ORDER BY date")
      .all(query.start || "0000-01-01", query.end || "9999-12-31"));
  app.put("/api/body", ({ body }) => {
    const date = body.date || todayISO();
    if (body.weight_lbs == null && body.waist_in == null && body.body_fat_pct == null) {
      throw new HttpError(400, "Provide at least one of weight_lbs, waist_in, body_fat_pct");
    }
    db.prepare(
      `INSERT INTO body_metrics (date, weight_lbs, waist_in, body_fat_pct, notes, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET
         weight_lbs = COALESCE(excluded.weight_lbs, body_metrics.weight_lbs),
         waist_in = COALESCE(excluded.waist_in, body_metrics.waist_in),
         body_fat_pct = COALESCE(excluded.body_fat_pct, body_metrics.body_fat_pct),
         notes = COALESCE(excluded.notes, body_metrics.notes),
         updated_at = excluded.updated_at`
    ).run(date, body.weight_lbs ?? null, body.waist_in ?? null, body.body_fat_pct ?? null, body.notes ?? null);
    return db.prepare("SELECT * FROM body_metrics WHERE date = ?").get(date);
  });
  app.delete("/api/body/:date", ({ params }) => {
    const r = db.prepare("DELETE FROM body_metrics WHERE date = ?").run(params.date);
    if (!r.changes) throw new HttpError(404, "No entry for that date");
    return { deleted: params.date };
  });

  // --- Water intake (glasses = 8 oz each) ---
  const waterGoal = () => Number(getSetting("goals.water_glasses") || 8);
  const waterFor = (date) => ({
    date,
    glasses: db.prepare("SELECT glasses FROM water_intake WHERE date = ?").get(date)?.glasses ?? 0,
    goal: waterGoal(),
  });
  app.get("/api/water", ({ query }) => {
    if (query.date || (!query.start && !query.end)) return waterFor(query.date || todayISO());
    return db.prepare("SELECT date, glasses FROM water_intake WHERE date BETWEEN ? AND ? ORDER BY date")
      .all(query.start || "0000-01-01", query.end || "9999-12-31");
  });
  // Adjust by delta (default +1) or set an absolute count; result never goes below 0.
  app.post("/api/water", ({ body }) => {
    const date = body.date || todayISO();
    const current = db.prepare("SELECT glasses FROM water_intake WHERE date = ?").get(date)?.glasses ?? 0;
    const next = Math.max(0, body.glasses != null ? Number(body.glasses) : current + (body.delta != null ? Number(body.delta) : 1));
    db.prepare(
      `INSERT INTO water_intake (date, glasses, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET glasses = excluded.glasses, updated_at = excluded.updated_at`
    ).run(date, next);
    return waterFor(date);
  });

  // --- Weekly goals ---
  app.get("/api/goals", () => ({ ...JSON.parse(getSetting("goals.weekly") || "{}"), water_glasses: waterGoal() }));
  app.post("/api/goals", ({ body }) => {
    const goals = {
      weekly_workouts: body.weekly_workouts != null ? Number(body.weekly_workouts) : null,
      weekly_miles: body.weekly_miles != null ? Number(body.weekly_miles) : null,
      weekly_volume_lbs: body.weekly_volume_lbs != null ? Number(body.weekly_volume_lbs) : null,
    };
    setSetting("goals.weekly", JSON.stringify(goals));
    if (body.water_glasses != null) setSetting("goals.water_glasses", String(Math.max(1, Number(body.water_glasses))));
    return { ...goals, water_glasses: waterGoal() };
  });

  // --- Data export ---
  const EXPORT_TABLES = [
    "users", "plans", "exercises", "workout_sessions", "exercise_logs", "weekly_summaries",
    "health_events", "nutrition_goals", "nutrition_days", "nutrition_day_targets", "nutrition_day_totals",
    "nutrition_meals", "nutrition_meal_items", "nutrition_meal_totals", "nutrition_templates",
    "running_sessions", "body_metrics", "water_intake", "daily_summaries", "daily_reflections", "food_catalog",
    "health_profile", "medications", "headaches", "daily_checkins",
    "lab_reports", "lab_report_files", "lab_results", "guides", "chat_messages", "user_memories",
  ];
  app.get("/api/export", () => ({
    exported_at: new Date().toISOString(),
    tables: Object.fromEntries(EXPORT_TABLES.map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all()])),
  }));

  const toCSV = (rows) => {
    if (!rows.length) return "";
    const cols = Object.keys(rows[0]);
    const cell = (v) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
    return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
  };
  const CSV_QUERIES = {
    workouts: `SELECT s.session_date AS date, e.name AS exercise, l.sets, l.reps_per_set AS reps, l.weight_lbs, l.notes
               FROM exercise_logs l JOIN workout_sessions s ON s.id = l.session_id JOIN exercises e ON e.id = l.exercise_id
               ORDER BY s.session_date`,
    nutrition: `SELECT d.date_local AS date, m.meal_type, i.food_name, i.serving_display, i.calories_kcal, i.protein_g,
                i.carbs_g, i.fat_g, i.fiber_g, i.sodium_mg, i.sat_fat_g, i.cholesterol_mg
                FROM nutrition_meal_items i JOIN nutrition_meals m ON m.id = i.meal_id
                JOIN nutrition_days d ON d.id = m.nutrition_day_id ORDER BY d.date_local, m.created_at`,
    running: "SELECT session_date AS date, distance_miles, duration_minutes, pace_min_per_mile, avg_heart_rate, max_heart_rate, calories_burned, elevation_gain_ft, notes FROM running_sessions ORDER BY session_date",
    body: "SELECT date, weight_lbs, waist_in, body_fat_pct, notes FROM body_metrics ORDER BY date",
    water: "SELECT date, glasses, glasses * 8 AS ounces FROM water_intake ORDER BY date",
    headaches: `SELECT date, started_at, ended_at, duration_minutes, peak_severity, type, locations, aura, symptoms,
                meds, triggers, red_flags, notes FROM headaches ORDER BY date, started_at`,
    checkins: `SELECT date, sleep_hours, sleep_quality, stress, energy, caffeine_servings, alcohol_drinks, notes
               FROM daily_checkins ORDER BY date`,
    labs: `SELECT x.collected_on AS date, r.lab_name, x.name_on_report, x.marker_key, x.value_num, x.value_text, x.unit,
             x.ref_low, x.ref_high, x.ref_text, x.flag, x.canonical_value, x.canonical_unit
           FROM lab_results x JOIN lab_reports r ON r.id = x.report_id WHERE r.status = 'confirmed'
           ORDER BY x.collected_on, x.sort_order`,
  };
  app.get("/api/export/csv/:name", ({ params, res }) => {
    const sql = CSV_QUERIES[params.name];
    if (!sql) throw new HttpError(404, `Unknown export: ${params.name}. Options: ${Object.keys(CSV_QUERIES).join(", ")}`);
    const csv = toCSV(db.prepare(sql).all());
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="thor-${params.name}-${todayISO()}.csv"`,
    });
    res.end(csv);
  });

  // --- Other health events (migraines moved to /api/headaches) ---
  app.get("/api/health-events", ({ query }) =>
    db.prepare(
      `SELECT * FROM health_events WHERE date BETWEEN ? AND ? ${query.include_legacy ? "" : "AND category != 'migraine'"}
       ORDER BY date DESC, created_at DESC`
    ).all(query.start || "0000-01-01", query.end || "9999-12-31")
  );
  app.post("/api/health-events", ({ body }) => {
    if (!body.category) throw new HttpError(400, "category is required");
    if (body.category === "migraine") throw new HttpError(400, "Log migraines and other headaches with POST /api/headaches");
    const id = uuid();
    db.prepare("INSERT INTO health_events (id, date, category, intensity, duration_minutes, notes) VALUES (?, ?, ?, ?, ?, ?)").run(
      id, body.date || todayISO(), body.category, body.intensity ?? null, body.duration_minutes ?? null, body.notes ?? null
    );
    return db.prepare("SELECT * FROM health_events WHERE id = ?").get(id);
  });
  app.delete("/api/health-events/:id", ({ params }) => {
    const r = db.prepare("DELETE FROM health_events WHERE id = ?").run(params.id);
    if (!r.changes) throw new HttpError(404, "Event not found");
    return { deleted: params.id };
  });

  // --- Daily summary & reflections ---
  app.get("/api/daily-summary/:date", ({ params }) => summary.getDailySummary(params.date) ?? { date: params.date, markdown: null });
  app.post("/api/daily-summary", ({ body }) => summary.generateDailySummary(body.date || todayISO()));
  app.get("/api/reflections/day", ({ query }) => summary.getReflection(query.date || todayISO()));
  app.put("/api/reflections/day", ({ body }) => summary.upsertReflection(body.date || todayISO(), body.body));

  // --- Streak: consecutive days with any logged activity ---
  app.get("/api/streak", () => {
    const active = new Set(
      db.prepare(
        `SELECT session_date AS d FROM workout_sessions
         UNION SELECT session_date FROM running_sessions
         UNION SELECT date FROM health_events
         UNION SELECT date FROM headaches
         UNION SELECT date FROM daily_checkins
         UNION SELECT d.date_local FROM nutrition_days d JOIN nutrition_meals m ON m.nutrition_day_id = d.id`
      ).all().map((r) => r.d)
    );
    const iso = (dt) => {
      const y = dt.getFullYear(), m = String(dt.getMonth() + 1).padStart(2, "0"), da = String(dt.getDate()).padStart(2, "0");
      return `${y}-${m}-${da}`;
    };
    const cursor = new Date();
    let streak = 0;
    const todayActive = active.has(iso(cursor));
    if (!todayActive) cursor.setDate(cursor.getDate() - 1); // grace: today isn't over yet
    while (active.has(iso(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return { streak, today_active: todayActive, total_active_days: active.size };
  });

  // --- Guides library, weekly review, Ask Thor (chat), long-term memory ---
  guidesApi.register(app);
}
