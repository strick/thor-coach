/**
 * Plans service tests - exercise normalization and retrieval
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDb, type TestDatabase } from '../helpers/db.js';
import { getDayExercises, normalizeExercise } from '../../src/services/plans.js';

describe('Plans Service', () => {
  let testDb: TestDatabase;

  beforeEach(() => {
    testDb = setupTestDb();
  });

  afterEach(() => {
    testDb.cleanup();
  });

  describe('getDayExercises', () => {
    it('should return exercises for a specific day', () => {
      const exercises = getDayExercises('thor', 1); // Monday

      expect(exercises).toBeDefined();
      expect(exercises.length).toBeGreaterThan(0);
      expect(exercises[0]).toHaveProperty('id');
      expect(exercises[0]).toHaveProperty('name');
      expect(exercises[0]).toHaveProperty('aliases');
    });

    it('should return empty array for invalid day', () => {
      const exercises = getDayExercises('thor', 0); // Invalid day

      expect(exercises).toEqual([]);
    });

    it('should return different exercises for different days', () => {
      const monday = getDayExercises('thor', 1);
      const tuesday = getDayExercises('thor', 2);

      // Assuming different exercises per day
      const mondayNames = monday.map(e => e.name).sort();
      const tuesdayNames = tuesday.map(e => e.name).sort();

      expect(mondayNames).not.toEqual(tuesdayNames);
    });
  });

  describe('normalizeExercise', () => {
    const candidates = [
      { id: '1', plan_id: 'thor', day_of_week: 1, name: 'floor press', aliases: JSON.stringify(['db floor press', 'dumbbell floor press']) },
      { id: '2', plan_id: 'thor', day_of_week: 2, name: 'rows', aliases: JSON.stringify(['db rows', 'dumbbell rows']) },
      { id: '3', plan_id: 'thor', day_of_week: 1, name: 'bench press', aliases: JSON.stringify(['db bench', 'dumbbell bench']) },
    ];

    it('should match exact name', () => {
      const result = normalizeExercise('floor press', candidates);

      expect(result.match).toBeDefined();
      expect(result.match?.id).toBe('1');
      expect(result.match?.name).toBe('floor press');
      expect(result.normalized).toBe('floor press');
    });

    it('should match exact name (case insensitive)', () => {
      const result = normalizeExercise('FLOOR PRESS', candidates);

      expect(result.match).toBeDefined();
      expect(result.match?.id).toBe('1');
      expect(result.match?.name).toBe('floor press');
      expect(result.normalized).toBe('floor press');
    });

    it('should match by alias', () => {
      const result = normalizeExercise('db floor press', candidates);

      expect(result.match).toBeDefined();
      expect(result.match?.id).toBe('1');
      expect(result.match?.name).toBe('floor press');
      expect(result.normalized).toBe('floor press');
    });

    it('should match by substring', () => {
      const result = normalizeExercise('press', candidates);

      expect(result.match).toBeDefined();
      expect(result.match?.id).toBe('1');
      expect(result.match?.name).toBe('floor press');
      expect(result.normalized).toBe('floor press');
    });

    it('should prioritize exact match over alias', () => {
      const result = normalizeExercise('floor press', candidates);

      expect(result.match?.id).toBe('1');
    });

    it('should prioritize alias match over substring', () => {
      const result = normalizeExercise('dumbbell rows', candidates);

      expect(result.match?.id).toBe('2');
    });

    it('should return null for no match', () => {
      const result = normalizeExercise('squats', candidates);

      expect(result.match).toBeUndefined();
      expect(result.normalized).toBeUndefined();
    });

    it('should handle empty input', () => {
      const result = normalizeExercise('', candidates);

      // Empty string matches first candidate via substring match (empty string is in all strings)
      expect(result.match).toBeDefined();
      expect(result.normalized).toBe('floor press');
    });

    it('should handle partial matches correctly', () => {
      const result = normalizeExercise('bench', candidates);

      expect(result.normalized).toBe('bench press');
    });
  });
});
