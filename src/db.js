import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync, existsSync, readdirSync, unlinkSync, copyFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { THOR_PLAN_ID, DEFAULT_USER_ID } from "./config.js";
import { FOOD_CATALOG } from "./data/foods.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dbPath = process.env.THOR_DB_PATH || path.join(root, "data", "workout.db");
mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
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
  `);

  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (userCount === 0) {
    db.prepare("INSERT INTO users (id, name, email) VALUES (?, ?, ?)").run(DEFAULT_USER_ID, "Main User", null);
  }

  // Seed the food catalog once (user-added foods have source='custom' and survive re-seeds)
  const foodCount = db.prepare("SELECT COUNT(*) AS n FROM food_catalog WHERE source = 'seed'").get().n;
  if (foodCount === 0) {
    const insFood = db.prepare(
      `INSERT INTO food_catalog (id, name, category, serving_display, calories_kcal, protein_g, carbs_g, fat_g,
         fiber_g, sugar_g, added_sugar_g, sodium_mg, sat_fat_g, cholesterol_mg, potassium_mg, calcium_mg, aliases)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const f of FOOD_CATALOG) {
      insFood.run(
        randomUUID(), f.name, f.category, f.serving_display, f.calories_kcal, f.protein_g, f.carbs_g, f.fat_g,
        f.fiber_g, f.sugar_g, f.added_sugar_g, f.sodium_mg, f.sat_fat_g, f.cholesterol_mg, f.potassium_mg, f.calcium_mg,
        JSON.stringify(f.aliases || [])
      );
    }
    console.log(`[seed] food catalog: ${FOOD_CATALOG.length} items`);
  }

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
