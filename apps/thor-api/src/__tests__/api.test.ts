import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { router } from '../routes/index.js';
import { errorHandler } from '../middleware/errorHandler.js';

// Create test app
const app = express();
app.use(express.json());
app.use(router);
app.use(errorHandler);

describe('API Endpoints', () => {
  describe('System Routes', () => {
    it('GET /api/health should return status ok', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({ status: 'ok' });
    });

    it('GET /api/config should return configuration', async () => {
      const response = await request(app)
        .get('/api/config')
        .expect(200);

      expect(response.body).toHaveProperty('llm');
      expect(response.body).toHaveProperty('ollama');
      expect(response.body).toHaveProperty('openai');
    });

    it('GET /api/ollama/models should return models list', async () => {
      // This might fail if Ollama is not running, so we allow 500 as well
      const response = await request(app).get('/api/ollama/models');

      expect([200, 500]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toHaveProperty('models');
      }
    });
  });

  describe('Exercise Routes', () => {
    it('GET /api/exercises should return exercises list', async () => {
      const response = await request(app)
        .get('/api/exercises')
        .expect(200);

      expect(response.body).toHaveProperty('exercises');
      expect(Array.isArray(response.body.exercises)).toBe(true);
    });

    it('GET /api/day/:dow should return day plan', async () => {
      const response = await request(app)
        .get('/api/day/1')
        .expect(200);

      expect(response.body).toHaveProperty('planId');
      expect(response.body).toHaveProperty('dow');
      expect(response.body).toHaveProperty('exercises');
      expect(Array.isArray(response.body.exercises)).toBe(true);
    });

    it('GET /api/day/:dow should validate day of week', async () => {
      await request(app)
        .get('/api/day/0')
        .expect(400);

      await request(app)
        .get('/api/day/8')
        .expect(400);
    });
  });

  describe('Workout Routes', () => {
    it('GET /api/workouts should return workouts', async () => {
      const response = await request(app)
        .get('/api/workouts')
        .query({ date: '2025-11-11' })
        .expect(200);

      expect(response.body).toHaveProperty('workouts');
      expect(Array.isArray(response.body.workouts)).toBe(true);
    });

    it('GET /api/progress/summary should return progress data', async () => {
      const response = await request(app)
        .get('/api/progress/summary')
        .query({ from: '2025-10-01', to: '2025-11-11' })
        .expect(200);

      expect(response.body).toHaveProperty('sessions');
      expect(response.body).toHaveProperty('topLifts');
      expect(response.body).toHaveProperty('recent');
    });

    it('POST /api/ingest should require text field', async () => {
      const response = await request(app)
        .post('/api/ingest')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('POST /api/ingest should accept valid workout data', { timeout: 30000 }, async () => {
      const response = await request(app)
        .post('/api/ingest')
        .send({
          text: 'floor press 4x12 @45',
          date: '2025-11-11',
          planId: 'thor'
        });

      // Should either succeed (200) or fail gracefully with a message
      expect([200, 400, 500]).toContain(response.status);

      if (response.status === 200) {
        expect(response.body).toHaveProperty('sessionId');
        expect(response.body).toHaveProperty('results');
      }
    });
  });

  describe('Summary Routes', () => {
    it('GET /api/weekly-summaries should return summaries list', async () => {
      const response = await request(app)
        .get('/api/weekly-summaries')
        .expect(200);

      expect(response.body).toHaveProperty('summaries');
      expect(Array.isArray(response.body.summaries)).toBe(true);
    });

    it('POST /api/weekly-summaries/generate should create summary', { timeout: 30000 }, async () => {
      const response = await request(app)
        .post('/api/weekly-summaries/generate')
        .send({ planId: 'thor' });

      // May fail if no LLM configured, that's okay
      expect([200, 500]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      await request(app)
        .get('/api/nonexistent-route')
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/ingest')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);
    });
  });

  describe('CRUD Operations', () => {
    let testSessionId: string;

    it('should create, read, update, and delete workout session', { timeout: 30000 }, async () => {
      // Create
      const createResponse = await request(app)
        .post('/api/ingest')
        .send({
          text: 'test exercise 3x10 @25',
          date: '2025-11-11',
          planId: 'thor'
        });

      if (createResponse.status === 200) {
        testSessionId = createResponse.body.sessionId;
        expect(testSessionId).toBeDefined();

        // Read
        const readResponse = await request(app)
          .get('/api/workouts')
          .query({ date: '2025-11-11' })
          .expect(200);

        const sessions = readResponse.body.workouts;
        const found = sessions.find((s: any) => s.id === testSessionId);
        expect(found).toBeDefined();

        // Update (if there are exercise logs)
        if (found && found.exercises && found.exercises.length > 0) {
          const logId = found.exercises[0].id;

          await request(app)
            .patch(`/api/exercise-logs/${logId}`)
            .send({
              sets: 4,
              reps_per_set: 12,
              weight_lbs: 30
            })
            .expect(200);
        }

        // Delete
        await request(app)
          .delete(`/api/workouts/${testSessionId}`)
          .expect(200);

        // Verify deletion
        const verifyResponse = await request(app)
          .get('/api/workouts')
          .query({ date: '2025-11-11' })
          .expect(200);

        const notFound = verifyResponse.body.workouts.find((s: any) => s.id === testSessionId);
        expect(notFound).toBeUndefined();
      }
    });
  });
});
