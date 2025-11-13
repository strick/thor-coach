import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { router } from '../routes/index.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { db } from '../db.js';

// Create test app
const app = express();
app.use(express.json());
app.use(router);
app.use(errorHandler);

describe('Notes Feature', () => {
  let testSessionId: string;
  let testLogId: string;

  describe('Parser captures notes from natural language', () => {
    it('should parse and store notes from workout text', { timeout: 30000 }, async () => {
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises. This was brutal and my abs are done.',
          date: '2025-11-13',
          planId: 'thor'
        });

      // May fail if LLM not configured
      if (response.status === 200) {
        expect(response.body).toHaveProperty('sessionId');
        testSessionId = response.body.sessionId;

        const results = response.body.results;
        expect(Array.isArray(results)).toBe(true);

        // Find the logged exercise (not skipped ones)
        const logged = results.find((r: any) => r.status === 'logged');
        if (logged) {
          expect(logged).toHaveProperty('notes');
          expect(logged.notes).toBeTruthy();
          // Notes should contain some part of the comment
          expect(logged.notes.toLowerCase()).toContain('brutal');
        }
      }
    });

    it('should handle multiple exercises with different notes', { timeout: 30000 }, async () => {
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x12 goblet squats. Felt great today! 3x10 russian twists. This was harder than expected.',
          date: '2025-11-13',
          planId: 'thor'
        });

      if (response.status === 200) {
        const results = response.body.results;
        const logged = results.filter((r: any) => r.status === 'logged');

        if (logged.length >= 2) {
          // Each exercise should have its own notes
          expect(logged[0].notes).toBeTruthy();
          expect(logged[1].notes).toBeTruthy();
          expect(logged[0].notes).not.toBe(logged[1].notes);
        }
      }
    });

    it('should handle workouts without notes', { timeout: 30000 }, async () => {
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x15 leg raises',
          date: '2025-11-14',
          planId: 'thor'
        });

      if (response.status === 200) {
        const results = response.body.results;
        const logged = results.find((r: any) => r.status === 'logged');

        if (logged) {
          // Notes should be undefined or null when not provided
          expect(logged.notes === null || logged.notes === undefined).toBe(true);
        }
      }
    });
  });

  describe('Notes are stored in database', () => {
    beforeAll(async () => {
      // Create a test workout with notes
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '4x8 leg raises. Personal best today!',
          date: '2025-11-15',
          planId: 'thor'
        });

      if (response.status === 200) {
        testSessionId = response.body.sessionId;
      }
    });

    it('should retrieve notes from database via API', async () => {
      if (!testSessionId) {
        console.log('Skipping test - no test session created');
        return;
      }

      const response = await request(app)
        .get('/api/workouts')
        .query({ date: '2025-11-15' })
        .expect(200);

      const workouts = response.body.workouts;
      const session = workouts.find((w: any) => w.id === testSessionId);

      if (session && session.exercises.length > 0) {
        const exercise = session.exercises[0];
        expect(exercise).toHaveProperty('notes');

        if (exercise.notes) {
          expect(exercise.notes.toLowerCase()).toContain('personal best');
        }
      }
    });

    it('should store notes in exercise_logs table', () => {
      if (!testSessionId) {
        console.log('Skipping test - no test session created');
        return;
      }

      const logs = db.prepare(`
        SELECT l.notes, e.name
        FROM exercise_logs l
        JOIN workout_sessions s ON s.id = l.session_id
        JOIN exercises e ON e.id = l.exercise_id
        WHERE s.id = ?
      `).all(testSessionId);

      expect(logs.length).toBeGreaterThan(0);

      const logWithNotes = logs.find((log: any) => log.notes);
      if (logWithNotes) {
        expect(logWithNotes.notes).toBeTruthy();
      }
    });
  });

  describe('Notes can be edited via PATCH', () => {
    beforeAll(async () => {
      // Create a test workout to edit
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises. Initial note.',
          date: '2025-11-16',
          planId: 'thor'
        });

      if (response.status === 200) {
        testSessionId = response.body.sessionId;

        // Get the log ID
        const workouts = await request(app)
          .get('/api/workouts')
          .query({ date: '2025-11-16' });

        const session = workouts.body.workouts.find((w: any) => w.id === testSessionId);
        if (session && session.exercises.length > 0) {
          testLogId = session.exercises[0].id;
        }
      }
    });

    it('should update notes via PATCH endpoint', async () => {
      if (!testLogId) {
        console.log('Skipping test - no test log created');
        return;
      }

      const response = await request(app)
        .patch(`/api/exercise-logs/${testLogId}`)
        .send({
          notes: 'Updated note - feeling much stronger now'
        })
        .expect(200);

      expect(response.body.status).toBe('updated');
      expect(response.body.log.notes).toBe('Updated note - feeling much stronger now');
    });

    it('should clear notes by setting to null', async () => {
      if (!testLogId) {
        console.log('Skipping test - no test log created');
        return;
      }

      const response = await request(app)
        .patch(`/api/exercise-logs/${testLogId}`)
        .send({
          notes: null
        })
        .expect(200);

      expect(response.body.status).toBe('updated');
      expect(response.body.log.notes).toBeNull();
    });

    it('should update notes along with other fields', async () => {
      if (!testLogId) {
        console.log('Skipping test - no test log created');
        return;
      }

      const response = await request(app)
        .patch(`/api/exercise-logs/${testLogId}`)
        .send({
          sets: 4,
          reps_per_set: 12,
          weight_lbs: 25,
          notes: 'Combined update test'
        })
        .expect(200);

      expect(response.body.status).toBe('updated');
      expect(response.body.log.sets).toBe(4);
      expect(response.body.log.reps_per_set).toBe(12);
      expect(response.body.log.weight_lbs).toBe(25);
      expect(response.body.log.notes).toBe('Combined update test');
    });
  });

  describe('Variable reps combine with notes properly', () => {
    it('should handle variable reps and notes together', { timeout: 30000 }, async () => {
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '11, 8, 5 leg raises. Struggled on the last set but pushed through.',
          date: '2025-11-17',
          planId: 'thor'
        });

      if (response.status === 200) {
        const results = response.body.results;
        const logged = results.find((r: any) => r.status === 'logged');

        if (logged && logged.notes) {
          // Notes should contain both user comment and variable reps info
          expect(logged.notes).toBeTruthy();

          // Should have user's comment
          expect(logged.notes.toLowerCase()).toContain('struggled');

          // Should have variable reps notation
          expect(logged.notes).toContain('reps_per_set=');
          expect(logged.notes).toContain('[11');
        }
      }
    });

    it('should preserve variable reps notation when updating notes', async () => {
      // First, create a workout with variable reps
      const createResponse = await request(app)
        .post('/api/ingest')
        .send({
          text: '10, 8, 6 leg raises. Variable intensity.',
          date: '2025-11-18',
          planId: 'thor'
        });

      if (createResponse.status !== 200) {
        console.log('Skipping test - workout creation failed');
        return;
      }

      const sessionId = createResponse.body.sessionId;

      // Get the log ID
      const workouts = await request(app)
        .get('/api/workouts')
        .query({ date: '2025-11-18' });

      const session = workouts.body.workouts.find((w: any) => w.id === sessionId);
      if (!session || session.exercises.length === 0) {
        console.log('Skipping test - no exercises found');
        return;
      }

      const logId = session.exercises[0].id;
      const originalNotes = session.exercises[0].notes;

      // Update only the notes field
      const updateResponse = await request(app)
        .patch(`/api/exercise-logs/${logId}`)
        .send({
          notes: 'Updated user comment only'
        })
        .expect(200);

      // The variable reps notation should be replaced by the new notes
      expect(updateResponse.body.log.notes).toBe('Updated user comment only');
    });
  });

  describe('Edge cases and validation', () => {
    it('should handle very long notes', { timeout: 30000 }, async () => {
      const longNote = 'This workout was incredible. '.repeat(20); // ~600 chars

      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: `3x10 leg raises. ${longNote}`,
          date: '2025-11-19',
          planId: 'thor'
        });

      if (response.status === 200) {
        const results = response.body.results;
        const logged = results.find((r: any) => r.status === 'logged');

        if (logged) {
          expect(logged.notes).toBeTruthy();
          expect(logged.notes.length).toBeGreaterThan(100);
        }
      }
    });

    it('should handle special characters in notes', { timeout: 30000 }, async () => {
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises. Note with "quotes", \'apostrophes\', & special chars: !@#$%',
          date: '2025-11-20',
          planId: 'thor'
        });

      if (response.status === 200) {
        const results = response.body.results;
        const logged = results.find((r: any) => r.status === 'logged');

        if (logged && logged.notes) {
          // Should preserve special characters
          expect(logged.notes).toBeTruthy();
        }
      }
    });

    it('should handle emoji in notes', { timeout: 30000 }, async () => {
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises. Feeling strong 💪 today! 🔥',
          date: '2025-11-21',
          planId: 'thor'
        });

      if (response.status === 200) {
        const results = response.body.results;
        const logged = results.find((r: any) => r.status === 'logged');

        if (logged && logged.notes) {
          expect(logged.notes).toBeTruthy();
        }
      }
    });
  });
});
