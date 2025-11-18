import Database from "better-sqlite3";

// Use /app/data for Docker volume mount
export const db = new Database(process.env.NODE_ENV === 'production' ? '/app/data/workout.db' : 'workout.db');
db.pragma("journal_mode = WAL");
