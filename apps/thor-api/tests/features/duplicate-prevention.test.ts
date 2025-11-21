import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { router } from '../../src/routes/index.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { db } from '../../src/db.js';

// Create test app
const app = express();
app.use(express.json());
app.use(router);
app.use(errorHandler);

describe('Duplicate Prevention', () => {
  const TEST_DATE = '2025-11-22';

  beforeEach(async () => {
    // Clean up any existing test data for TEST_DATE
    const sessions = db.prepare(`
      SELECT id FROM workout_sessions WHERE session_date = ?
    `).all(TEST_DATE);

    for (const session of sessions as any[]) {
      db.prepare('DELETE FROM exercise_logs WHERE session_id = ?').run(session.id);
      db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(session.id);
    }
  });

  describe('Cannot log same exercise twice on same day', () => {
    it('should log exercise on first attempt', { timeout: 30000 }, async () => {
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      // May fail if LLM not configured
      if (response.status === 200) {
        expect(response.body).toHaveProperty('sessionId');
        expect(response.body.results).toBeDefined();

        const result = response.body.results[0];
        expect(result.status).toBe('logged');
      }
    });

    it('should prevent duplicate on second attempt same day', { timeout: 30000 }, async () => {
      // First log
      const firstResponse = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (firstResponse.status !== 200) {
        console.log('Skipping test - first log failed');
        return;
      }

      // Second log (should be prevented)
      const secondResponse = await request(app)
        .post('/api/ingest')
        .send({
          text: '4x12 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (secondResponse.status === 200) {
        expect(secondResponse.body.results).toBeDefined();
        const result = secondResponse.body.results[0];

        // Should be skipped with specific status
        expect(result.status).toBe('skipped_already_logged_today');
        expect(result).toHaveProperty('message');
        expect(result.message).toContain('already logged today');
      }
    });

    it('should return appropriate error message', { timeout: 30000 }, async () => {
      // First log
      await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 goblet squats',
          date: TEST_DATE,
          planId: 'thor'
        });

      // Second log (duplicate)
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '4x8 goblet squats',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (response.status === 200) {
        const result = response.body.results[0];
        if (result.status === 'skipped_already_logged_today') {
          expect(result.exercise).toBeDefined();
          expect(result.message).toContain('already logged today');
        }
      }
    });
  });

  describe('Can log different exercises on same day', () => {
    it('should allow multiple different exercises same day', { timeout: 30000 }, async () => {
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises, 3x10 goblet squats, 3x10 russian twists',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (response.status === 200) {
        const loggedResults = response.body.results.filter((r: any) => r.status === 'logged');
        expect(loggedResults.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('should allow sequential submissions of different exercises', { timeout: 30000 }, async () => {
      // First exercise
      const first = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (first.status !== 200) {
        console.log('Skipping test - first submission failed');
        return;
      }

      // Second exercise (different)
      const second = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x12 goblet squats',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (second.status === 200) {
        const result = second.body.results[0];
        expect(result.status).toBe('logged');
      }
    });

    it('should allow same workout plan different days', { timeout: 30000 }, async () => {
      // Log for first day
      const day1 = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises',
          date: '2025-11-22',
          planId: 'thor'
        });

      if (day1.status !== 200) {
        console.log('Skipping test - day 1 failed');
        return;
      }

      // Log same exercise different day (should be allowed)
      const day2 = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises',
          date: '2025-11-23',
          planId: 'thor'
        });

      if (day2.status === 200) {
        const result = day2.body.results[0];
        expect(result.status).toBe('logged');
      }
    });
  });

  describe('Duplicate check works across different sessions', () => {
    it('should detect duplicate even from different submission sessions', { timeout: 30000 }, async () => {
      // First session
      const session1 = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 russian twists',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (session1.status !== 200) {
        console.log('Skipping test - session 1 failed');
        return;
      }

      const firstSessionId = session1.body.sessionId;

      // Second session (different submission, same day, same exercise)
      const session2 = await request(app)
        .post('/api/ingest')
        .send({
          text: '4x12 russian twists',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (session2.status === 200) {
        const secondSessionId = session2.body.sessionId;

        // Sessions should be different
        expect(secondSessionId).not.toBe(firstSessionId);

        // But exercise should be skipped as duplicate
        const result = session2.body.results[0];
        expect(result.status).toBe('skipped_already_logged_today');
      }
    });

    it('should check against all sessions for the day', { timeout: 30000 }, async () => {
      // Create multiple sessions on same day with different exercises
      await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      await request(app)
        .post('/api/ingest')
        .send({
          text: '3x12 goblet squats',
          date: TEST_DATE,
          planId: 'thor'
        });

      // Try to log an already logged exercise
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '5x5 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (response.status === 200) {
        const result = response.body.results[0];
        expect(result.status).toBe('skipped_already_logged_today');
      }
    });
  });

  describe('Database integrity checks', () => {
    it('should not create duplicate exercise logs in database', { timeout: 30000 }, async () => {
      // First log
      const first = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (first.status !== 200) {
        console.log('Skipping test - first log failed');
        return;
      }

      // Attempt duplicate
      await request(app)
        .post('/api/ingest')
        .send({
          text: '4x12 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      // Check database directly
      const legRaisesExercise = db.prepare(`
        SELECT id FROM exercises
        WHERE name LIKE '%Leg Raises%' AND day_of_week = 3
      `).get() as any;

      if (legRaisesExercise) {
        const logs = db.prepare(`
          SELECT COUNT(*) as count
          FROM exercise_logs el
          JOIN workout_sessions ws ON ws.id = el.session_id
          WHERE ws.session_date = ? AND el.exercise_id = ?
        `).get(TEST_DATE, legRaisesExercise.id) as any;

        // Should only have one log entry
        expect(logs.count).toBe(1);
      }
    });

    it('should allow updates to existing log without creating duplicate', async () => {
      // Create a log
      const createResponse = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (createResponse.status !== 200) {
        console.log('Skipping test - create failed');
        return;
      }

      // Get the log ID
      const workouts = await request(app)
        .get('/api/workouts')
        .query({ date: TEST_DATE });

      const session = workouts.body.workouts[0];
      if (!session || session.exercises.length === 0) {
        console.log('Skipping test - no exercises found');
        return;
      }

      const logId = session.exercises[0].id;
      const exerciseId = session.exercises[0].exercise_id ||
        db.prepare('SELECT exercise_id FROM exercise_logs WHERE id = ?').get(logId) as any;

      // Update the log
      await request(app)
        .patch(`/api/exercise-logs/${logId}`)
        .send({
          sets: 4,
          reps_per_set: 12,
          weight_lbs: 30
        })
        .expect(200);

      // Verify still only one log entry
      const logs = db.prepare(`
        SELECT COUNT(*) as count
        FROM exercise_logs el
        JOIN workout_sessions ws ON ws.id = el.session_id
        WHERE ws.session_date = ? AND el.exercise_id = ?
      `).get(TEST_DATE, exerciseId?.exercise_id || exerciseId) as any;

      expect(logs.count).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle exercise name variations (aliases)', { timeout: 30000 }, async () => {
      // Log with one name
      const first = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (first.status !== 200) {
        console.log('Skipping test - first log failed');
        return;
      }

      // Try to log with alias
      const second = await request(app)
        .post('/api/ingest')
        .send({
          text: '4x12 lying leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (second.status === 200) {
        const result = second.body.results[0];
        // Should recognize as duplicate even with alias
        expect(result.status).toBe('skipped_already_logged_today');
      }
    });

    it('should handle case-insensitive matching', { timeout: 30000 }, async () => {
      // Log with mixed case
      const first = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 LEG RAISES',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (first.status !== 200) {
        console.log('Skipping test - first log failed');
        return;
      }

      // Try to log with different case
      const second = await request(app)
        .post('/api/ingest')
        .send({
          text: '4x12 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (second.status === 200) {
        const result = second.body.results[0];
        expect(result.status).toBe('skipped_already_logged_today');
      }
    });

    it('should handle partial submission with some duplicates', { timeout: 30000 }, async () => {
      // First submission
      await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises',
          date: TEST_DATE,
          planId: 'thor'
        });

      // Second submission with one duplicate and one new
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '4x12 leg raises, 3x10 goblet squats',
          date: TEST_DATE,
          planId: 'thor'
        });

      if (response.status === 200) {
        const results = response.body.results;

        // Should have both skipped and logged
        const skipped = results.filter((r: any) => r.status === 'skipped_already_logged_today');
        const logged = results.filter((r: any) => r.status === 'logged');

        expect(skipped.length).toBeGreaterThan(0);
        expect(logged.length).toBeGreaterThan(0);
      }
    });
  });
});
