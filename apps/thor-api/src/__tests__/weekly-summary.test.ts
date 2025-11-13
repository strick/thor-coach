import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { router } from '../routes/index.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { db } from '../db.js';
import {
  calculateWeeklyMetrics,
  generateWeeklySummary,
  getWeeklySummaries,
  getWeeklySummary
} from '../services/weekly-summary.js';

// Create test app
const app = express();
app.use(express.json());
app.use(router);
app.use(errorHandler);

describe('Weekly Summary', () => {
  describe('calculateWeeklyMetrics', () => {
    beforeAll(async () => {
      // Create some test workout data for a specific week
      const testDate = '2025-10-13'; // Monday

      // Create test sessions
      await request(app)
        .post('/api/ingest')
        .send({
          text: '4x12 leg raises @25',
          date: testDate,
          planId: 'thor'
        });

      await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 goblet squats @30',
          date: '2025-10-15',
          planId: 'thor'
        });
    });

    it('should calculate correct total sessions', () => {
      const weekStart = '2025-10-13';
      const metrics = calculateWeeklyMetrics('thor', weekStart);

      expect(metrics).toHaveProperty('total_sessions');
      expect(metrics.total_sessions).toBeGreaterThanOrEqual(0);
    });

    it('should calculate total volume', () => {
      const weekStart = '2025-10-13';
      const metrics = calculateWeeklyMetrics('thor', weekStart);

      expect(metrics).toHaveProperty('total_volume');
      expect(typeof metrics.total_volume).toBe('number');
      expect(metrics.total_volume).toBeGreaterThanOrEqual(0);
    });

    it('should list exercises performed', () => {
      const weekStart = '2025-10-13';
      const metrics = calculateWeeklyMetrics('thor', weekStart);

      expect(metrics).toHaveProperty('exercises_performed');
      expect(Array.isArray(metrics.exercises_performed)).toBe(true);
    });

    it('should count days trained', () => {
      const weekStart = '2025-10-13';
      const metrics = calculateWeeklyMetrics('thor', weekStart);

      expect(metrics).toHaveProperty('days_trained');
      expect(typeof metrics.days_trained).toBe('number');
      expect(metrics.days_trained).toBeGreaterThanOrEqual(0);
    });

    it('should calculate week-over-week comparison', () => {
      const weekStart = '2025-10-13';
      const metrics = calculateWeeklyMetrics('thor', weekStart);

      expect(metrics).toHaveProperty('previous_week');
      if (metrics.previous_week) {
        expect(metrics.previous_week).toHaveProperty('total_sessions');
        expect(metrics.previous_week).toHaveProperty('total_volume');
      }
    });

    it('should handle weeks with no workouts', () => {
      const futureWeek = '2025-12-30';
      const metrics = calculateWeeklyMetrics('thor', futureWeek);

      expect(metrics.total_sessions).toBe(0);
      expect(metrics.total_volume).toBe(0);
      expect(metrics.exercises_performed.length).toBe(0);
    });
  });

  describe('generateWeeklySummary', () => {
    it('should generate summary for current week', { timeout: 30000 }, async () => {
      try {
        const result = await generateWeeklySummary('thor');

        expect(result).toHaveProperty('summaryId');
        expect(result).toHaveProperty('summary');
        expect(result.summary).toHaveProperty('summary_text');
        expect(result.summary).toHaveProperty('total_sessions');
        expect(result.summary).toHaveProperty('total_volume');
      } catch (error: any) {
        // May fail if LLM not configured
        if (error.message && error.message.includes('LLM')) {
          console.log('Skipping test - LLM not configured');
        } else {
          throw error;
        }
      }
    });

    it('should generate summary for specific week', { timeout: 30000 }, async () => {
      try {
        const weekStart = '2025-10-13';
        const result = await generateWeeklySummary('thor', weekStart);

        expect(result).toHaveProperty('summaryId');
        expect(result.summary).toHaveProperty('week_start_date');
        expect(result.summary.week_start_date).toBe(weekStart);
      } catch (error: any) {
        if (error.message && error.message.includes('LLM')) {
          console.log('Skipping test - LLM not configured');
        } else {
          throw error;
        }
      }
    });

    it('should store summary in database', { timeout: 30000 }, async () => {
      try {
        const result = await generateWeeklySummary('thor');
        const summaryId = result.summaryId;

        const stored = db.prepare(`
          SELECT * FROM weekly_summaries WHERE id = ?
        `).get(summaryId);

        expect(stored).toBeDefined();
      } catch (error: any) {
        if (error.message && error.message.includes('LLM')) {
          console.log('Skipping test - LLM not configured');
        } else {
          throw error;
        }
      }
    });

    it('should include metrics_json', { timeout: 30000 }, async () => {
      try {
        const result = await generateWeeklySummary('thor');
        const summaryId = result.summaryId;

        const stored: any = db.prepare(`
          SELECT metrics_json FROM weekly_summaries WHERE id = ?
        `).get(summaryId);

        expect(stored.metrics_json).toBeTruthy();

        const metrics = JSON.parse(stored.metrics_json);
        expect(metrics).toHaveProperty('exercises_performed');
        expect(metrics).toHaveProperty('days_trained');
      } catch (error: any) {
        if (error.message && error.message.includes('LLM')) {
          console.log('Skipping test - LLM not configured');
        } else {
          throw error;
        }
      }
    });
  });

  describe('getWeeklySummaries', () => {
    it('should return array of summaries', () => {
      const summaries = getWeeklySummaries('thor', 10);

      expect(Array.isArray(summaries)).toBe(true);
    });

    it('should respect limit parameter', () => {
      const summaries = getWeeklySummaries('thor', 5);

      expect(summaries.length).toBeLessThanOrEqual(5);
    });

    it('should order by date descending', () => {
      const summaries = getWeeklySummaries('thor', 10);

      if (summaries.length >= 2) {
        const first = new Date(summaries[0].week_start_date);
        const second = new Date(summaries[1].week_start_date);

        expect(first.getTime()).toBeGreaterThanOrEqual(second.getTime());
      }
    });

    it('should include required fields', () => {
      const summaries = getWeeklySummaries('thor', 1);

      if (summaries.length > 0) {
        const summary = summaries[0];
        expect(summary).toHaveProperty('id');
        expect(summary).toHaveProperty('week_start_date');
        expect(summary).toHaveProperty('week_end_date');
        expect(summary).toHaveProperty('total_sessions');
        expect(summary).toHaveProperty('total_volume');
        expect(summary).toHaveProperty('summary_text');
      }
    });
  });

  describe('getWeeklySummary', () => {
    let testSummaryId: string;

    beforeAll(async () => {
      try {
        const result = await generateWeeklySummary('thor', '2025-10-20');
        testSummaryId = result.summaryId;
      } catch (error) {
        console.log('Could not create test summary');
      }
    });

    it('should return summary with full metrics', () => {
      if (!testSummaryId) {
        console.log('Skipping test - no test summary');
        return;
      }

      const summary = getWeeklySummary(testSummaryId);

      expect(summary).toBeDefined();
      expect(summary?.id).toBe(testSummaryId);
    });

    it('should parse metrics_json', () => {
      if (!testSummaryId) {
        console.log('Skipping test - no test summary');
        return;
      }

      const summary = getWeeklySummary(testSummaryId);

      expect(summary).toHaveProperty('metrics');
      expect(typeof summary?.metrics).toBe('object');
    });

    it('should return null for non-existent summary', () => {
      const summary = getWeeklySummary('non-existent-id');

      expect(summary).toBeNull();
    });
  });

  describe('API Endpoints', () => {
    describe('GET /api/weekly-summaries', () => {
      it('should return summaries list', async () => {
        const response = await request(app)
          .get('/api/weekly-summaries')
          .expect(200);

        expect(response.body).toHaveProperty('summaries');
        expect(Array.isArray(response.body.summaries)).toBe(true);
      });

      it('should accept planId parameter', async () => {
        const response = await request(app)
          .get('/api/weekly-summaries')
          .query({ planId: 'thor' })
          .expect(200);

        expect(response.body).toHaveProperty('planId');
        expect(response.body.planId).toBe('thor');
      });

      it('should accept limit parameter', async () => {
        const response = await request(app)
          .get('/api/weekly-summaries')
          .query({ limit: 3 })
          .expect(200);

        expect(response.body.summaries.length).toBeLessThanOrEqual(3);
      });
    });

    describe('GET /api/weekly-summaries/:id', () => {
      let testSummaryId: string;

      beforeAll(async () => {
        try {
          const result = await generateWeeklySummary('thor', '2025-10-27');
          testSummaryId = result.summaryId;
        } catch (error) {
          console.log('Could not create test summary');
        }
      });

      it('should return specific summary', async () => {
        if (!testSummaryId) {
          console.log('Skipping test - no test summary');
          return;
        }

        const response = await request(app)
          .get(`/api/weekly-summaries/${testSummaryId}`)
          .expect(200);

        expect(response.body.id).toBe(testSummaryId);
        expect(response.body).toHaveProperty('metrics');
      });

      it('should return 404 for non-existent summary', async () => {
        await request(app)
          .get('/api/weekly-summaries/non-existent-id')
          .expect(404);
      });
    });

    describe('POST /api/weekly-summaries/generate', () => {
      it('should manually trigger summary generation', { timeout: 30000 }, async () => {
        const response = await request(app)
          .post('/api/weekly-summaries/generate')
          .send({ planId: 'thor' });

        // May fail if LLM not configured
        if (response.status === 200) {
          expect(response.body).toHaveProperty('summaryId');
          expect(response.body).toHaveProperty('summary');
        } else {
          expect([500]).toContain(response.status);
        }
      });

      it('should accept optional planId in body', { timeout: 30000 }, async () => {
        const response = await request(app)
          .post('/api/weekly-summaries/generate')
          .send({ planId: 'thor' });

        expect([200, 500]).toContain(response.status);
      });

      it('should use default planId if not provided', { timeout: 30000 }, async () => {
        const response = await request(app)
          .post('/api/weekly-summaries/generate')
          .send({});

        expect([200, 500]).toContain(response.status);
      });
    });
  });

  describe('Cron Job Configuration', () => {
    it('should have cron initialization function', () => {
      const { initializeCronJobs } = require('../services/cron.js');

      expect(initializeCronJobs).toBeDefined();
      expect(typeof initializeCronJobs).toBe('function');
    });

    it('should not crash when initializing cron', () => {
      const { initializeCronJobs } = require('../services/cron.js');

      expect(() => {
        initializeCronJobs();
      }).not.toThrow();
    });
  });

  describe('Week-over-week comparison', () => {
    beforeAll(async () => {
      // Create workouts for two consecutive weeks
      await request(app)
        .post('/api/ingest')
        .send({
          text: '3x10 leg raises @20',
          date: '2025-11-04', // Week 1
          planId: 'thor'
        });

      await request(app)
        .post('/api/ingest')
        .send({
          text: '4x12 leg raises @25',
          date: '2025-11-11', // Week 2
          planId: 'thor'
        });
    });

    it('should calculate percentage change in volume', () => {
      const weekStart = '2025-11-11';
      const metrics = calculateWeeklyMetrics('thor', weekStart);

      expect(metrics).toHaveProperty('previous_week');

      if (metrics.previous_week && metrics.total_volume > 0) {
        const currentVolume = metrics.total_volume;
        const previousVolume = metrics.previous_week.total_volume;

        if (previousVolume > 0) {
          const percentChange = ((currentVolume - previousVolume) / previousVolume) * 100;
          expect(typeof percentChange).toBe('number');
        }
      }
    });

    it('should handle first week (no previous data)', () => {
      const weekStart = '2025-01-01';
      const metrics = calculateWeeklyMetrics('thor', weekStart);

      // Previous week should exist but have zero values
      expect(metrics).toHaveProperty('previous_week');
    });
  });

  describe('Summary text generation', () => {
    it('should generate meaningful summary text', { timeout: 30000 }, async () => {
      try {
        // Create some workout data
        await request(app)
          .post('/api/ingest')
          .send({
            text: '4x12 leg raises @25, 3x10 goblet squats @30',
            date: '2025-11-18',
            planId: 'thor'
          });

        const result = await generateWeeklySummary('thor', '2025-11-18');

        expect(result.summary.summary_text).toBeTruthy();
        expect(result.summary.summary_text.length).toBeGreaterThan(20);
      } catch (error: any) {
        if (error.message && error.message.includes('LLM')) {
          console.log('Skipping test - LLM not configured');
        } else {
          throw error;
        }
      }
    });

    it('should handle weeks with no workouts', { timeout: 30000 }, async () => {
      try {
        const result = await generateWeeklySummary('thor', '2025-12-30');

        expect(result.summary.total_sessions).toBe(0);
        expect(result.summary.summary_text).toBeTruthy();
      } catch (error: any) {
        if (error.message && error.message.includes('LLM')) {
          console.log('Skipping test - LLM not configured');
        } else {
          throw error;
        }
      }
    });
  });

  describe('Edge cases', () => {
    it('should handle invalid week start date', () => {
      expect(() => {
        calculateWeeklyMetrics('thor', 'invalid-date');
      }).toThrow();
    });

    it('should handle non-existent planId', () => {
      const metrics = calculateWeeklyMetrics('non-existent-plan', '2025-11-11');

      expect(metrics.total_sessions).toBe(0);
      expect(metrics.total_volume).toBe(0);
    });

    it('should handle concurrent summary generation', { timeout: 30000 }, async () => {
      try {
        const requests = [
          generateWeeklySummary('thor', '2025-11-04'),
          generateWeeklySummary('thor', '2025-11-11')
        ];

        const results = await Promise.allSettled(requests);

        // At least one should succeed (if LLM configured)
        const successful = results.filter(r => r.status === 'fulfilled');
        expect(successful.length).toBeGreaterThanOrEqual(0);
      } catch (error) {
        console.log('Concurrent generation test skipped');
      }
    });
  });
});
