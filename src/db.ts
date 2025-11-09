import Database from "better-sqlite3";

export const db = new Database("workout.db");
db.pragma("journal_mode = WAL");
