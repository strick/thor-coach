import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync, readdirSync, unlinkSync, copyFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { THOR_PLAN_ID, DEFAULT_USER_ID } from "./config.js";
import { FOOD_CATALOG } from "./data/foods.js";

// Test runs must never open the real database or touch the real backup mirror.
// (Static imports are hoisted above env setup, so a test that imports src/
// directly instead of through test/helpers/env.js trips this.)
if (process.env.THOR_TEST === "1" && (!process.env.THOR_DB_PATH || !process.env.THOR_BACKUP_MIRROR)) {
  throw new Error("THOR_TEST=1 requires THOR_DB_PATH and THOR_BACKUP_MIRROR (use test/helpers/env.js)");
}

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dbPath = process.env.THOR_DB_PATH || path.join(root, "data", "workout.db");
/** Directory holding the database; uploads and backups live beside it. */
export const dataDir = path.dirname(dbPath);
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath);
// WAL needs shared memory, which network filesystems (Azure App Service /home,
// SMB mounts) don't provide — fall back rather than fail to boot there.
// THOR_SQLITE_JOURNAL forces a mode explicitly (WAL | DELETE | TRUNCATE | PERSIST).
const journal = ["WAL", "DELETE", "TRUNCATE", "PERSIST"].includes((process.env.THOR_SQLITE_JOURNAL || "").toUpperCase())
  ? process.env.THOR_SQLITE_JOURNAL.toUpperCase()
  : "WAL";
try {
  db.exec(`PRAGMA journal_mode = ${journal}`);
} catch (err) {
  console.error(`[db] journal_mode ${journal} unavailable (${err.message}); using DELETE`);
  db.exec("PRAGMA journal_mode = DELETE");
}
db.exec("PRAGMA busy_timeout = 5000");
db.exec("PRAGMA foreign_keys = ON");

export const uuid = () => randomUUID();

export function tx(fn) {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function ensureSchemaAndSeed() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    ms_oid TEXT,
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    name TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  );

  CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    session_date TEXT NOT NULL,
    day_of_week INTEGER NOT NULL,
    llm_provider TEXT,
    llm_model TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  );

  CREATE TABLE IF NOT EXISTS exercise_logs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    exercise_id TEXT NOT NULL,
    sets INTEGER,
    reps_per_set TEXT,
    weight_lbs REAL,
    notes TEXT,
    FOREIGN KEY(session_id) REFERENCES workout_sessions(id),
    FOREIGN KEY(exercise_id) REFERENCES exercises(id)
  );

  CREATE TABLE IF NOT EXISTS weekly_summaries (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL,
    week_start_date TEXT NOT NULL,
    week_end_date TEXT NOT NULL,
    total_sessions INTEGER NOT NULL DEFAULT 0,
    total_volume REAL NOT NULL DEFAULT 0,
    summary_text TEXT,
    metrics_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(plan_id) REFERENCES plans(id)
  );
  CREATE INDEX IF NOT EXISTS idx_weekly_summaries_dates ON weekly_summaries(week_start_date, week_end_date);

  CREATE TABLE IF NOT EXISTS health_events (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('migraine', 'sleep', 'yardwork', 'run', 'other')),
    intensity INTEGER CHECK(intensity BETWEEN 1 AND 10),
    duration_minutes INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_health_events_date ON health_events(date);

  CREATE TABLE IF NOT EXISTS nutrition_goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    daily_protein_target_g INTEGER,
    max_daily_sodium_mg INTEGER,
    max_daily_saturated_fat_g INTEGER,
    min_daily_fiber_g INTEGER,
    max_daily_cholesterol_mg INTEGER,
    max_daily_added_sugar_g INTEGER,
    min_daily_fiber_goal_g INTEGER,
    diet_style TEXT DEFAULT 'DASH',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS nutrition_days (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    date_local TEXT NOT NULL,
    timezone TEXT DEFAULT 'America/New_York',
    source TEXT DEFAULT 'manual_entry',
    notes TEXT,
    diet_style TEXT DEFAULT 'DASH',
    high_cholesterol BOOLEAN DEFAULT 1,
    high_protein_goal BOOLEAN DEFAULT 1,
    recompute_required BOOLEAN DEFAULT 1,
    last_computed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    UNIQUE(user_id, date_local)
  );
  CREATE INDEX IF NOT EXISTS idx_nutrition_days_date ON nutrition_days(date_local);

  CREATE TABLE IF NOT EXISTS nutrition_day_targets (
    id TEXT PRIMARY KEY,
    nutrition_day_id TEXT NOT NULL UNIQUE,
    calories_kcal INTEGER DEFAULT 0,
    protein_g INTEGER,
    fiber_g INTEGER,
    sodium_mg_max INTEGER,
    sat_fat_g_max INTEGER,
    added_sugar_g_max INTEGER,
    cholesterol_mg_max INTEGER,
    FOREIGN KEY(nutrition_day_id) REFERENCES nutrition_days(id)
  );

  CREATE TABLE IF NOT EXISTS nutrition_day_totals (
    id TEXT PRIMARY KEY,
    nutrition_day_id TEXT NOT NULL UNIQUE,
    calories_kcal REAL DEFAULT 0,
    protein_g REAL DEFAULT 0,
    carbs_g REAL DEFAULT 0,
    fat_g REAL DEFAULT 0,
    fiber_g REAL DEFAULT 0,
    sugar_g REAL DEFAULT 0,
    added_sugar_g REAL DEFAULT 0,
    sodium_mg REAL DEFAULT 0,
    sat_fat_g REAL DEFAULT 0,
    cholesterol_mg REAL DEFAULT 0,
    potassium_mg REAL DEFAULT 0,
    calcium_mg REAL DEFAULT 0,
    FOREIGN KEY(nutrition_day_id) REFERENCES nutrition_days(id)
  );

  CREATE TABLE IF NOT EXISTS nutrition_meals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    nutrition_day_id TEXT NOT NULL,
    meal_id TEXT NOT NULL,
    meal_type TEXT NOT NULL CHECK(meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
    time_local TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(nutrition_day_id) REFERENCES nutrition_days(id)
  );
  CREATE INDEX IF NOT EXISTS idx_nutrition_meals_day ON nutrition_meals(nutrition_day_id);

  CREATE TABLE IF NOT EXISTS nutrition_meal_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    meal_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    food_name TEXT NOT NULL,
    brand TEXT,
    serving_quantity REAL,
    serving_unit TEXT,
    serving_display TEXT,
    calories_kcal REAL DEFAULT 0,
    protein_g REAL DEFAULT 0,
    carbs_g REAL DEFAULT 0,
    fat_g REAL DEFAULT 0,
    fiber_g REAL DEFAULT 0,
    sugar_g REAL DEFAULT 0,
    added_sugar_g REAL DEFAULT 0,
    sodium_mg REAL DEFAULT 0,
    sat_fat_g REAL DEFAULT 0,
    cholesterol_mg REAL DEFAULT 0,
    potassium_mg REAL DEFAULT 0,
    calcium_mg REAL DEFAULT 0,
    high_sodium BOOLEAN DEFAULT 0,
    high_sat_fat BOOLEAN DEFAULT 0,
    processed BOOLEAN DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id),
    FOREIGN KEY(meal_id) REFERENCES nutrition_meals(id)
  );
  CREATE INDEX IF NOT EXISTS idx_nutrition_meal_items_meal ON nutrition_meal_items(meal_id);

  CREATE TABLE IF NOT EXISTS nutrition_meal_totals (
    id TEXT PRIMARY KEY,
    meal_id TEXT NOT NULL UNIQUE,
    calories_kcal REAL DEFAULT 0,
    protein_g REAL DEFAULT 0,
    carbs_g REAL DEFAULT 0,
    fat_g REAL DEFAULT 0,
    fiber_g REAL DEFAULT 0,
    sodium_mg REAL DEFAULT 0,
    sat_fat_g REAL DEFAULT 0,
    cholesterol_mg REAL DEFAULT 0,
    FOREIGN KEY(meal_id) REFERENCES nutrition_meals(id)
  );

  CREATE TABLE IF NOT EXISTS food_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    log_date TEXT NOT NULL,
    description TEXT NOT NULL,
    calories INTEGER,
    protein_g REAL,
    sodium_mg REAL,
    saturated_fat_g REAL,
    fiber_g REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS running_sessions (
    id TEXT PRIMARY KEY,
    session_date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    distance_miles REAL NOT NULL,
    duration_minutes INTEGER NOT NULL,
    pace_min_per_mile REAL,
    elevation_gain_ft INTEGER,
    elevation_loss_ft INTEGER,
    avg_heart_rate INTEGER,
    max_heart_rate INTEGER,
    calories_burned INTEGER,
    weather TEXT,
    surface TEXT CHECK(surface IN ('road', 'trail', 'track', 'treadmill', 'mixed')),
    effort_level TEXT CHECK(effort_level IN ('easy', 'moderate', 'hard', 'tempo')),
    notes TEXT,
    location TEXT,
    gps_file_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_running_sessions_date ON running_sessions(session_date);

  CREATE TABLE IF NOT EXISTS daily_summaries (
    date TEXT PRIMARY KEY,
    markdown TEXT NOT NULL,
    sections JSON NOT NULL,
    generated_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_reflections (
    date TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS nutrition_templates (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    meal_type TEXT,
    items_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    created_date TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS body_metrics (
    date TEXT PRIMARY KEY,
    weight_lbs REAL,
    waist_in REAL,
    body_fat_pct REAL,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS water_intake (
    date TEXT PRIMARY KEY,
    glasses INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS food_catalog (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    serving_display TEXT NOT NULL,
    calories_kcal REAL DEFAULT 0,
    protein_g REAL DEFAULT 0,
    carbs_g REAL DEFAULT 0,
    fat_g REAL DEFAULT 0,
    fiber_g REAL DEFAULT 0,
    sugar_g REAL DEFAULT 0,
    added_sugar_g REAL DEFAULT 0,
    sodium_mg REAL DEFAULT 0,
    sat_fat_g REAL DEFAULT 0,
    cholesterol_mg REAL DEFAULT 0,
    potassium_mg REAL DEFAULT 0,
    calcium_mg REAL DEFAULT 0,
    aliases TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL DEFAULT 'seed',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_food_catalog_name ON food_catalog(name);
  CREATE INDEX IF NOT EXISTS idx_food_catalog_category ON food_catalog(category);

  CREATE TABLE IF NOT EXISTS strava_sync_runs (
    id TEXT PRIMARY KEY,
    sync_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('started', 'success', 'failed')),
    activities_synced INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT
  );

  -- Health profile: what the AI needs to know about you. Multi-value fields
  -- (conditions, allergies, family_history, goals) are newline-separated text.
  CREATE TABLE IF NOT EXISTS health_profile (
    user_id TEXT PRIMARY KEY DEFAULT '${DEFAULT_USER_ID}',
    birth_date TEXT,
    sex TEXT,
    height_in REAL,
    conditions TEXT,
    allergies TEXT,
    family_history TEXT,
    goals TEXT,
    diet_style TEXT,
    doctor_notes TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS medications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '${DEFAULT_USER_ID}',
    name TEXT NOT NULL,
    dose TEXT,
    frequency TEXT,
    kind TEXT NOT NULL DEFAULT 'med',
    purpose TEXT,
    as_needed INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    started_on TEXT,
    stopped_on TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_medications_user ON medications(user_id, active);

  -- Headaches: structured entries. Enum-like columns (type, locations,
  -- symptoms, red_flags, triggers) are validated in the service, not by CHECK.
  -- started_at / ended_at are local 'YYYY-MM-DDTHH:MM'; ended_at NULL with a
  -- start = still going. date is the local onset date (drives correlations).
  CREATE TABLE IF NOT EXISTS headaches (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '${DEFAULT_USER_ID}',
    date TEXT NOT NULL,
    started_at TEXT,
    ended_at TEXT,
    duration_minutes INTEGER,
    peak_severity INTEGER CHECK(peak_severity BETWEEN 0 AND 10),
    type TEXT NOT NULL DEFAULT 'unknown',
    locations TEXT NOT NULL DEFAULT '[]',
    aura INTEGER NOT NULL DEFAULT 0,
    symptoms TEXT NOT NULL DEFAULT '[]',
    red_flags TEXT NOT NULL DEFAULT '[]',
    meds TEXT NOT NULL DEFAULT '[]',
    triggers TEXT NOT NULL DEFAULT '[]',
    notes TEXT,
    legacy_event_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_headaches_date ON headaches(user_id, date);

  -- Daily check-in: sleep_hours is the night that ended on the morning of date.
  CREATE TABLE IF NOT EXISTS daily_checkins (
    user_id TEXT NOT NULL DEFAULT '${DEFAULT_USER_ID}',
    date TEXT NOT NULL,
    sleep_hours REAL CHECK(sleep_hours BETWEEN 0 AND 24),
    sleep_quality INTEGER CHECK(sleep_quality BETWEEN 1 AND 5),
    stress INTEGER CHECK(stress BETWEEN 1 AND 5),
    energy INTEGER CHECK(energy BETWEEN 1 AND 5),
    caffeine_servings REAL CHECK(caffeine_servings >= 0),
    alcohol_drinks REAL CHECK(alcohol_drinks >= 0),
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, date),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  -- Blood work. A report is a draft until you've reviewed the extracted rows
  -- and confirmed it; only confirmed results feed trends and advice.
  CREATE TABLE IF NOT EXISTS lab_reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '${DEFAULT_USER_ID}',
    collected_on TEXT,
    reported_on TEXT,
    lab_name TEXT,
    ordering_provider TEXT,
    source TEXT NOT NULL,
    raw_text TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    extraction_json TEXT,
    llm_provider TEXT,
    llm_model TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_lab_reports_user ON lab_reports(user_id, collected_on);

  CREATE TABLE IF NOT EXISTS lab_report_files (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '${DEFAULT_USER_ID}',
    report_id TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    original_filename TEXT,
    mime_type TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    page_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(report_id) REFERENCES lab_reports(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_lab_files_report ON lab_report_files(report_id);
  CREATE INDEX IF NOT EXISTS idx_lab_files_sha ON lab_report_files(sha256);

  CREATE TABLE IF NOT EXISTS lab_results (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '${DEFAULT_USER_ID}',
    report_id TEXT NOT NULL,
    marker_key TEXT,
    name_on_report TEXT NOT NULL,
    value_num REAL,
    value_text TEXT,
    unit TEXT,
    ref_low REAL,
    ref_high REAL,
    ref_text TEXT,
    flag TEXT,
    canonical_value REAL,
    canonical_unit TEXT,
    canonical_ref_low REAL,
    canonical_ref_high REAL,
    collected_on TEXT,
    sort_order INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(report_id) REFERENCES lab_reports(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_lab_results_report ON lab_results(report_id);
  CREATE INDEX IF NOT EXISTS idx_lab_results_marker ON lab_results(user_id, marker_key, collected_on);

  -- Guides: AI-written explainers kept in a library — lab explainers, weekly
  -- reviews and on-demand deep dives. context_json snapshots what the model saw.
  CREATE TABLE IF NOT EXISTS guides (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '${DEFAULT_USER_ID}',
    kind TEXT NOT NULL,
    title TEXT NOT NULL,
    topic TEXT,
    period_start TEXT,
    period_end TEXT,
    lab_report_id TEXT,
    markdown TEXT NOT NULL,
    context_json TEXT,
    llm_provider TEXT,
    llm_model TEXT,
    pinned INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY(lab_report_id) REFERENCES lab_reports(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_guides_kind ON guides(user_id, kind, created_at);

  -- Ask Thor history, kept across reloads. Order by rowid: datetime('now') has
  -- one-second resolution and a question + reply land in the same second.
  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '${DEFAULT_USER_ID}',
    thread_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_chat_thread ON chat_messages(user_id, thread_id);

  -- Long-term memory: durable facts and preferences you asked Thor to keep.
  CREATE TABLE IF NOT EXISTS user_memories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL DEFAULT '${DEFAULT_USER_ID}',
    content TEXT NOT NULL,
    category TEXT,
    source TEXT NOT NULL DEFAULT 'chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `);

  // Additive migration for databases created before Microsoft sign-in existed
  // (CREATE TABLE IF NOT EXISTS never alters an existing table).
  const userCols = new Set(db.prepare("PRAGMA table_info(users)").all().map((c) => c.name));
  if (!userCols.has("ms_oid")) db.exec("ALTER TABLE users ADD COLUMN ms_oid TEXT");
  if (!userCols.has("last_login_at")) db.exec("ALTER TABLE users ADD COLUMN last_login_at TEXT");

  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (userCount === 0) {
    db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)").run(DEFAULT_USER_ID, "Main User", null);
  }

  // Reconcile built-in foods on every boot. Earlier builds seeded these rows
  // only once, so corrected macro values never reached an existing database.
  // Custom foods are deliberately excluded and remain entirely user-owned.
  const foodValues = (f) => [
    f.category, f.serving_display, f.calories_kcal, f.protein_g, f.carbs_g, f.fat_g,
    f.fiber_g, f.sugar_g, f.added_sugar_g, f.sodium_mg, f.sat_fat_g, f.cholesterol_mg,
    f.potassium_mg, f.calcium_mg, JSON.stringify(f.aliases || []),
  ];
  const updateFood = db.prepare(
    `UPDATE food_catalog SET category = ?, serving_display = ?, calories_kcal = ?, protein_g = ?, carbs_g = ?, fat_g = ?,
       fiber_g = ?, sugar_g = ?, added_sugar_g = ?, sodium_mg = ?, sat_fat_g = ?, cholesterol_mg = ?,
       potassium_mg = ?, calcium_mg = ?, aliases = ?
     WHERE source = 'seed' AND name = ?`
  );
  const insertFood = db.prepare(
    `INSERT INTO food_catalog (id, name, category, serving_display, calories_kcal, protein_g, carbs_g, fat_g,
       fiber_g, sugar_g, added_sugar_g, sodium_mg, sat_fat_g, cholesterol_mg, potassium_mg, calcium_mg, aliases, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed')`
  );
  tx(() => {
    for (const f of FOOD_CATALOG) {
      const result = updateFood.run(...foodValues(f), f.name);
      if (!result.changes) insertFood.run(randomUUID(), f.name, ...foodValues(f));
    }
  });

  runDataMigrations();

  // NOTE: everything below runs only on a brand-new database. New migrations
  // and seeds belong in runDataMigrations() above.
  const planExists = db.prepare("SELECT 1 FROM plans WHERE id = ?").get(THOR_PLAN_ID);
  if (planExists) return;

  db.prepare("INSERT INTO plans (id, name) VALUES (?, ?)").run(THOR_PLAN_ID, "Thor (Dumbbell-only)");

  const seed = [
    ["Dumbbell Floor Press", 1, ["DB floor press", "floor press"]],
    ["Dumbbell Incline Press", 1, ["incline press"]],
    ["Dumbbell Flys", 1, ["db fly", "flyes"]],
    ["Dumbbell Triceps Overhead Extensions", 1, ["tricep OH", "OH extensions"]],
    ["Push-ups", 1, ["pushups", "push ups"]],
    ["Leg Raises", 1, ["hanging leg raises", "lying leg raises"]],
    ["Dumbbell Bent-Over Rows", 2, ["db rows", "bent over rows"]],
    ["Dumbbell Romanian Deadlifts", 2, ["RDL", "romanian deadlift"]],
    ["Dumbbell Reverse Flys", 2, ["reverse fly"]],
    ["Dumbbell Bicep Curls", 2, ["db curls", "bicep curl"]],
    ["Hammer Curls", 2, ["hammer curl"]],
    ["Dumbbell Plank Rows", 2, ["renegade rows", "plank rows"]],
    ["Dumbbell Goblet Squat", 3, ["goblet squat"]],
    ["Dumbbell Bulgarian Split Squat", 3, ["bulgarian split", "split squat"]],
    ["Dumbbell Step-Ups", 3, ["step ups", "stepups"]],
    ["Leg Raises", 3, ["leg raise", "lying leg raises"]],
    ["Russian Twists", 3, ["russian twist"]],
    ["Dumbbell Goblet Squat (Alt)", 3, ["goblet alt"]],
    ["Dumbbell Shoulder Press", 4, ["db shoulder press", "overhead press"]],
    ["Dumbbell Lateral Raises", 4, ["lateral raise", "lat raises"]],
    ["Dumbbell Front Raises", 4, ["front raise"]],
    ["Dumbbell Shrugs", 4, ["shrugs"]],
    ["Dumbbell Skull Crushers", 4, ["skull crushers"]],
    ["Dumbbell Curls (Accessory)", 4, ["curls accessory"]],
    ["Dumbbell Thrusters", 5, ["thrusters"]],
    ["Dumbbell Renegade Rows", 5, ["renegade rows", "plank rows"]],
    ["Dumbbell Swings", 5, ["kettlebell style swings"]],
    ["Squat Jumps", 5, ["squat jump", "jump squat"]],
    ["Burpees", 5, ["burpee"]],
    ["Mountain Climbers", 5, ["mountain climber"]],
  ];
  const ins = db.prepare("INSERT INTO exercises (id, plan_id, name, day_of_week, aliases) VALUES (?, ?, ?, ?, ?)");
  for (const [name, day, aliases] of seed) {
    ins.run(randomUUID(), THOR_PLAN_ID, name, day, JSON.stringify(aliases));
  }
}

/** Run a one-shot data migration exactly once (flagged in app_settings). */
function once(name, fn) {
  const key = `migration.${name}`;
  if (getSetting(key) === "done") return;
  tx(() => {
    fn();
    setSetting(key, "done");
  });
}

/**
 * Idempotent data migrations and seeds for existing databases. Runs on every
 * boot, before the brand-new-database seed in ensureSchemaAndSeed().
 */
function runDataMigrations() {
  // Health profile: turn the facts the old prompts hard-coded into editable data.
  once("health_profile_seed", () => {
    const user = db.prepare("SELECT id FROM users WHERE id = ?").get(DEFAULT_USER_ID);
    if (!user) return;
    const dietStyle =
      db.prepare("SELECT diet_style FROM nutrition_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
        .get(DEFAULT_USER_ID)?.diet_style || "DASH";
    db.prepare(
      `INSERT OR IGNORE INTO health_profile (user_id, conditions, goals, diet_style) VALUES (?, ?, ?, ?)`
    ).run(DEFAULT_USER_ID, "High cholesterol (watching)", "Fat loss while keeping muscle\nConsistency", dietStyle);
  });

  // Migraines logged as generic health events become structured headaches.
  // The originals stay in health_events (hidden from that list). The flag
  // means a migrated headache you later delete never comes back.
  once("headaches_from_events", () => {
    if (!db.prepare("SELECT id FROM users WHERE id = ?").get(DEFAULT_USER_ID)) return;
    const ins = db.prepare(
      `INSERT OR IGNORE INTO headaches (id, user_id, date, duration_minutes, peak_severity, type, notes, legacy_event_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'migraine', ?, ?, ?)`
    );
    for (const e of db.prepare("SELECT * FROM health_events WHERE category = 'migraine'").all()) {
      ins.run(randomUUID(), DEFAULT_USER_ID, e.date, e.duration_minutes, e.intensity, e.notes, e.id, e.created_at);
    }
  });
}

/**
 * Daily backup via VACUUM INTO (consistent snapshot, WAL-safe), kept 14 days,
 * plus a best-effort mirror to an off-VM location (defaults to the Windows
 * G: drive, the household's established backup disk). Called hourly from
 * server.js; no-ops if today's backup already exists.
 */
const BACKUP_NAME_RE = /^workout-\d{4}-\d{2}-\d{2}\.db$/;
const localBackupDir = path.join(path.dirname(dbPath), "backups");
const mirrorDir = process.env.THOR_BACKUP_MIRROR || "/mnt/g/backups/thor";

function prune(dir, keep = 14) {
  const backups = readdirSync(dir).filter((f) => BACKUP_NAME_RE.test(f)).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    unlinkSync(path.join(dir, old));
  }
}

function mirrorBackup(file) {
  // Mirror root (e.g. /mnt/g) must already exist — never create a fake mount point.
  const mountRoot = path.dirname(path.dirname(mirrorDir));
  if (!existsSync(mountRoot)) return false;
  mkdirSync(mirrorDir, { recursive: true });
  copyFileSync(file, path.join(mirrorDir, path.basename(file)));
  prune(mirrorDir);
  return true;
}

/** Uploaded files (lab PDFs/photos) live here, next to the database. */
export const uploadsDir = path.join(dataDir, "uploads");

/**
 * Uploads aren't inside the VACUUM INTO snapshot, so copy any new ones to the
 * mirror too. Incremental (names are unique UUIDs) and never pruned.
 */
function mirrorUploads() {
  const mountRoot = path.dirname(path.dirname(mirrorDir));
  if (!existsSync(mountRoot) || !existsSync(uploadsDir)) return 0;
  let copied = 0;
  const walk = (rel) => {
    for (const name of readdirSync(path.join(uploadsDir, rel))) {
      const relPath = path.join(rel, name);
      const src = path.join(uploadsDir, relPath);
      if (statSync(src).isDirectory()) {
        walk(relPath);
        continue;
      }
      const dest = path.join(mirrorDir, "uploads", relPath);
      if (existsSync(dest)) continue;
      mkdirSync(path.dirname(dest), { recursive: true });
      copyFileSync(src, dest);
      copied += 1;
    }
  };
  walk("");
  return copied;
}

export function runDailyBackup({ force = false } = {}) {
  mkdirSync(localBackupDir, { recursive: true });
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const file = path.join(localBackupDir, `workout-${stamp}.db`);
  if (existsSync(file) && !force) return { skipped: true, file };
  if (existsSync(file)) unlinkSync(file);
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  prune(localBackupDir);
  let mirrored = false;
  try {
    mirrored = mirrorBackup(file);
    if (mirrored) {
      const n = mirrorUploads();
      if (n) console.log(`[backup] mirrored ${n} new upload file(s)`);
    }
  } catch (err) {
    console.error("[backup] mirror failed:", err.message);
  }
  console.log(`[backup] wrote ${file}${mirrored ? ` (mirrored to ${mirrorDir})` : " (no mirror)"}`);
  return { skipped: false, file, mirrored };
}

export function backupStatus() {
  const list = (dir) => {
    try {
      return readdirSync(dir).filter((f) => BACKUP_NAME_RE.test(f)).sort().reverse()
        .map((f) => ({ file: f, bytes: statSync(path.join(dir, f)).size }));
    } catch {
      return [];
    }
  };
  return {
    local_dir: localBackupDir,
    local: list(localBackupDir),
    mirror_dir: mirrorDir,
    mirror_available: existsSync(path.dirname(path.dirname(mirrorDir))),
    mirror: list(mirrorDir),
  };
}

export function getSetting(key) {
  return db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key)?.value;
}

export function setSetting(key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, value);
}
