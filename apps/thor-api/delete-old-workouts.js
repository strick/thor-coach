import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'workout.db');
const db = new Database(dbPath);

const cutoffDate = '2025-11-20';

try {
  // Count workouts to be deleted
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM workout_sessions WHERE session_date < ?');
  const { count } = countStmt.get(cutoffDate);

  console.log(`Found ${count} workout sessions before ${cutoffDate}`);

  if (count > 0) {
    // Delete exercise logs first (foreign key constraint)
    const deleteLogsStmt = db.prepare(`
      DELETE FROM exercise_logs
      WHERE session_id IN (
        SELECT id FROM workout_sessions WHERE session_date < ?
      )
    `);
    const logsResult = deleteLogsStmt.run(cutoffDate);
    console.log(`Deleted ${logsResult.changes} exercise logs`);

    // Then delete workout sessions
    const deleteSessionsStmt = db.prepare('DELETE FROM workout_sessions WHERE session_date < ?');
    const sessionsResult = deleteSessionsStmt.run(cutoffDate);
    console.log(`Deleted ${sessionsResult.changes} workout sessions`);

    console.log('✓ Successfully deleted old workouts');
  } else {
    console.log('No workouts to delete');
  }
} catch (error) {
  console.error('Error deleting workouts:', error);
  process.exit(1);
} finally {
  db.close();
}
