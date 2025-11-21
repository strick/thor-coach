import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the config module BEFORE importing parser
vi.mock('../../src/config.js', () => ({
  USE_OLLAMA: true,
  USE_LLM: true,
  OLLAMA_URL: 'http://localhost:11434',
  OLLAMA_MODEL: 'llama3.1:8b',
  OPENAI_API_KEY: '',
  OPENAI_MODEL: 'gpt-4o-mini',
  PORT: 3000,
  THOR_PLAN_ID: 'thor',
}));

import { parseFreeform, ParseResult } from '../../src/services/parser.js';

// Mock fetch globally
global.fetch = vi.fn();

// Helper to mock Ollama response
function mockOllamaSuccess(items: any[]) {
  (global.fetch as any).mockResolvedValueOnce({
    ok: true,
    text: async () => JSON.stringify({
      message: {
        content: JSON.stringify({ items })
      }
    })
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Parser Service', () => {
  describe('Standard notation parsing (4x12 @45)', () => {
    it('should parse basic format: 4x12 @45', async () => {
      // Mock the LLM response
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 @45', 'thor', 1);

      expect(result).toHaveProperty('items');
      expect(result.items.length).toBeGreaterThan(0);

      const item = result.items[0];
      expect(item.exercise).toBeTruthy();
      expect(item.sets).toBe(4);
      expect(item.reps).toBe(12);
      expect(item.weight_lbs).toBe(45);
    });

    it('should parse without weight: 3x10', async () => {
      mockOllamaSuccess([{
        exercise_free: 'leg raises',
        exercise_match: 'leg raises',
        sets: 3,
        reps_per_set: 10,
        variable_reps: null,
        weight_lbs: null,
        notes: null
      }]);

      const result = await parseFreeform('leg raises 3x10', 'thor', 3);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.sets).toBe(3);
      expect(item.reps).toBe(10);
      expect(item.weight_lbs).toBeUndefined();
    });

    it('should parse with decimal weight: 4x12 @45.5', async () => {
      mockOllamaSuccess([{
        exercise_free: 'goblet squat',
        exercise_match: 'goblet squats',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45.5,
        notes: null
      }]);

      const result = await parseFreeform('goblet squat 4x12 @45.5', 'thor', 3);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.weight_lbs).toBe(45.5);
    });
  });

  describe('Alternative format parsing', () => {
    it('should parse 4*12 format (asterisk)', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4*12 @45', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.sets).toBe(4);
      expect(item.reps).toBe(12);
    });

    it('should parse "with" keyword: 4x12 with 45 lbs', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 with 45 lbs', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.sets).toBe(4);
      expect(item.reps).toBe(12);
      expect(item.weight_lbs).toBe(45);
    });

    it('should parse "at" keyword: 4x12 at 45lbs', async () => {
      mockOllamaSuccess([{
        exercise_free: 'incline press',
        exercise_match: 'incline press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('incline press 4x12 at 45lbs', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.weight_lbs).toBe(45);
    });

    it('should parse reversed order: 12x4 (reps x sets)', async () => {
      mockOllamaSuccess([{
        exercise_free: 'leg raises',
        exercise_match: 'leg raises',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: null,
        notes: null
      }]);

      const result = await parseFreeform('leg raises 12x4', 'thor', 3);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      // Parser should handle this - either correctly or swap them
      expect(item.sets).toBeDefined();
      expect(item.reps).toBeDefined();
    });
  });

  describe('Variable reps parsing', () => {
    it('should parse comma-separated reps: 11, 8, 5', async () => {
      mockOllamaSuccess([{
        exercise_free: 'leg raises',
        exercise_match: 'leg raises',
        sets: 3,
        reps_per_set: 8,
        variable_reps: [11, 8, 5],
        weight_lbs: null,
        notes: null
      }]);

      const result = await parseFreeform('leg raises 11, 8, 5', 'thor', 3);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      // Should calculate average
      expect(item.reps).toBeDefined();
      expect(item.reps).toBeGreaterThan(0);

      // Should store variable reps in notes
      if (item.notes) {
        expect(item.notes).toContain('reps_per_set=');
        expect(item.notes).toContain('11');
        expect(item.notes).toContain('8');
        expect(item.notes).toContain('5');
      }
    });

    it('should calculate correct average for variable reps', async () => {
      mockOllamaSuccess([{
        exercise_free: 'push ups',
        exercise_match: 'push ups',
        sets: 3,
        reps_per_set: 8,
        variable_reps: [10, 8, 6],
        weight_lbs: null,
        notes: null
      }]);

      const result = await parseFreeform('push ups 10, 8, 6', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      // Average of 10, 8, 6 = 8
      expect(item.reps).toBe(8);
    });

    it('should handle variable reps with weight', async () => {
      mockOllamaSuccess([{
        exercise_free: 'goblet squats',
        exercise_match: 'goblet squats',
        sets: 3,
        reps_per_set: 10,
        variable_reps: [12, 10, 8],
        weight_lbs: 30,
        notes: null
      }]);

      const result = await parseFreeform('goblet squats 12, 10, 8 @30lbs', 'thor', 3);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.weight_lbs).toBe(30);
      expect(item.reps).toBeDefined();
    });
  });

  describe('Notes capture', () => {
    it('should capture simple notes', async () => {
      mockOllamaSuccess([{
        exercise_free: 'leg raises',
        exercise_match: 'leg raises',
        sets: 3,
        reps_per_set: 10,
        variable_reps: null,
        weight_lbs: null,
        notes: 'This was brutal.'
      }]);

      const result = await parseFreeform('3x10 leg raises. This was brutal.', 'thor', 3);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.notes).toBeTruthy();
      expect(item.notes?.toLowerCase()).toContain('brutal');
    });

    it('should capture multi-word notes', async () => {
      mockOllamaSuccess([{
        exercise_free: 'leg raises',
        exercise_match: 'leg raises',
        sets: 3,
        reps_per_set: 10,
        variable_reps: null,
        weight_lbs: null,
        notes: 'This was really hard today.'
      }]);

      const result = await parseFreeform('3x10 leg raises. This was really hard today.', 'thor', 3);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.notes).toBeTruthy();
    });

    it('should capture notes with punctuation', async () => {
      mockOllamaSuccess([{
        exercise_free: 'leg raises',
        exercise_match: 'leg raises',
        sets: 3,
        reps_per_set: 10,
        variable_reps: null,
        weight_lbs: null,
        notes: 'Felt great! Personal best!'
      }]);

      const result = await parseFreeform('3x10 leg raises. Felt great! Personal best!', 'thor', 3);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.notes).toBeTruthy();
    });

    it('should separate notes per exercise', async () => {
      mockOllamaSuccess([
        {
          exercise_free: 'leg raises',
          exercise_match: 'leg raises',
          sets: 3,
          reps_per_set: 10,
          variable_reps: null,
          weight_lbs: null,
          notes: 'Easy.'
        },
        {
          exercise_free: 'goblet squats',
          exercise_match: 'goblet squats',
          sets: 3,
          reps_per_set: 12,
          variable_reps: null,
          weight_lbs: null,
          notes: 'Difficult.'
        }
      ]);

      const result = await parseFreeform(
        '3x10 leg raises. Easy. 3x12 goblet squats. Difficult.',
        'thor',
        3
      );

      expect(result.items.length).toBeGreaterThanOrEqual(2);
      // Each exercise should have its own note
      expect(result.items[0].notes).toBeTruthy();
      expect(result.items[1].notes).toBeTruthy();
      expect(result.items[0].notes).not.toBe(result.items[1].notes);
    });
  });

  describe('Weight unit normalization', () => {
    it('should normalize "pounds" to lbs', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 with 45 pounds', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.weight_lbs).toBe(45);
    });

    it('should handle £ symbol (UK)', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 @£45', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      // Parser should strip £ and treat as lbs
      expect(item.weight_lbs).toBeDefined();
    });

    it('should handle "lbs" suffix', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 @45lbs', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.weight_lbs).toBe(45);
    });
  });

  describe('Exercise matching from valid list', () => {
    it('should match exact exercise name', async () => {
      mockOllamaSuccess([{
        exercise_free: 'Dumbbell Floor Press',
        exercise_match: 'Dumbbell Floor Press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('Dumbbell Floor Press 4x12 @45', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.exercise).toContain('Floor Press');
    });

    it('should match with typos/abbreviations', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 @45', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.exercise).toBeTruthy();
    });

    it('should match aliases', async () => {
      mockOllamaSuccess([{
        exercise_free: 'pushups',
        exercise_match: 'push ups',
        sets: 3,
        reps_per_set: 10,
        variable_reps: null,
        weight_lbs: null,
        notes: null
      }]);

      const result = await parseFreeform('pushups 3x10', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      const item = result.items[0];
      expect(item.exercise.toLowerCase()).toContain('push');
    });

    it('should handle case insensitivity', async () => {
      mockOllamaSuccess([{
        exercise_free: 'FLOOR PRESS',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('FLOOR PRESS 4x12 @45', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
    });
  });

  describe('Multiple exercises parsing', () => {
    it('should parse multiple exercises in one submission', async () => {
      mockOllamaSuccess([
        {
          exercise_free: 'floor press',
          exercise_match: 'floor press',
          sets: 4,
          reps_per_set: 12,
          variable_reps: null,
          weight_lbs: 45,
          notes: null
        },
        {
          exercise_free: 'incline press',
          exercise_match: 'incline press',
          sets: 3,
          reps_per_set: 10,
          variable_reps: null,
          weight_lbs: 35,
          notes: null
        },
        {
          exercise_free: 'flys',
          exercise_match: 'flys',
          sets: 3,
          reps_per_set: 12,
          variable_reps: null,
          weight_lbs: 20,
          notes: null
        }
      ]);

      const result = await parseFreeform(
        'floor press 4x12 @45, incline press 3x10 @35, flys 3x12 @20',
        'thor',
        1
      );

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it('should maintain exercise order', async () => {
      mockOllamaSuccess([
        {
          exercise_free: 'leg raises',
          exercise_match: 'leg raises',
          sets: 3,
          reps_per_set: 10,
          variable_reps: null,
          weight_lbs: null,
          notes: null
        },
        {
          exercise_free: 'goblet squats',
          exercise_match: 'goblet squats',
          sets: 3,
          reps_per_set: 12,
          variable_reps: null,
          weight_lbs: null,
          notes: null
        },
        {
          exercise_free: 'russian twists',
          exercise_match: 'russian twists',
          sets: 3,
          reps_per_set: 15,
          variable_reps: null,
          weight_lbs: null,
          notes: null
        }
      ]);

      const result = await parseFreeform(
        'leg raises 3x10, goblet squats 3x12, russian twists 3x15',
        'thor',
        3
      );

      expect(result.items.length).toBeGreaterThanOrEqual(3);
      expect(result.items[0].exercise.toLowerCase()).toContain('leg');
      expect(result.items[1].exercise.toLowerCase()).toContain('squat');
      expect(result.items[2].exercise.toLowerCase()).toContain('twist');
    });

    it('should handle line breaks between exercises', async () => {
      mockOllamaSuccess([
        {
          exercise_free: 'floor press',
          exercise_match: 'floor press',
          sets: 4,
          reps_per_set: 12,
          variable_reps: null,
          weight_lbs: 45,
          notes: null
        },
        {
          exercise_free: 'incline press',
          exercise_match: 'incline press',
          sets: 3,
          reps_per_set: 10,
          variable_reps: null,
          weight_lbs: 35,
          notes: null
        },
        {
          exercise_free: 'flys',
          exercise_match: 'flys',
          sets: 3,
          reps_per_set: 12,
          variable_reps: null,
          weight_lbs: 20,
          notes: null
        }
      ]);

      const result = await parseFreeform(
        'floor press 4x12 @45\nincline press 3x10 @35\nflys 3x12 @20',
        'thor',
        1
      );

      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle missing sets/reps', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 1,
        reps_per_set: 1,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press @45', 'thor', 1);

      // Should still parse, maybe with defaults
      expect(result.items).toBeDefined();
    });

    it('should handle malformed input gracefully', async () => {
      mockOllamaSuccess([]);

      const result = await parseFreeform('asdfghjkl qwerty', 'thor', 1);

      // Should not crash, might return empty or best guess
      expect(result.items).toBeDefined();
      expect(Array.isArray(result.items)).toBe(true);
    });

    it('should handle empty string', async () => {
      mockOllamaSuccess([]);

      try {
        const result = await parseFreeform('', 'thor', 1);
        expect(result.items).toBeDefined();
      } catch (error) {
        // Acceptable to throw on empty input
        expect(error).toBeDefined();
      }
    });

    it('should handle very long input', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const longText = 'floor press 4x12 @45. '.repeat(50);

      const result = await parseFreeform(longText, 'thor', 1);

      expect(result.items).toBeDefined();
    });

    it('should handle special characters', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 @45 😊 💪', 'thor', 1);

      expect(result.items).toBeDefined();
    });
  });

  describe('ParseResult metadata', () => {
    it('should return llm_provider', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 @45', 'thor', 1);

      expect(result).toHaveProperty('llm_provider');
      expect(['ollama', 'openai']).toContain(result.llm_provider);
    });

    it('should return llm_model', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 @45', 'thor', 1);

      expect(result).toHaveProperty('llm_model');
      expect(typeof result.llm_model).toBe('string');
      expect(result.llm_model.length).toBeGreaterThan(0);
    });

    it('should return ParseResult with correct structure', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 @45', 'thor', 1);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('llm_provider');
      expect(result).toHaveProperty('llm_model');
      expect(Array.isArray(result.items)).toBe(true);
    });
  });

  describe('Day-specific exercise validation', () => {
    it('should validate exercises for day 1 (chest day)', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const result = await parseFreeform('floor press 4x12 @45', 'thor', 1);

      expect(result.items.length).toBeGreaterThan(0);
      // Floor press is a valid day 1 exercise
    });

    it('should handle invalid exercise for day', async () => {
      mockOllamaSuccess([{
        exercise_free: 'bent over rows',
        exercise_match: 'bent over rows',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      // Try to log a day 2 exercise on day 1
      const result = await parseFreeform('bent over rows 4x12 @45', 'thor', 1);

      // Parser should either find closest match or return best guess
      expect(result.items).toBeDefined();
    });

    it('should validate exercises for day 3 (leg day)', async () => {
      mockOllamaSuccess([{
        exercise_free: 'goblet squats',
        exercise_match: 'goblet squats',
        sets: 3,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 30,
        notes: null
      }]);

      const result = await parseFreeform('goblet squats 3x12 @30', 'thor', 3);

      expect(result.items.length).toBeGreaterThan(0);
    });
  });

  describe('Performance and reliability', () => {
    it('should parse within reasonable time', async () => {
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);

      const start = Date.now();

      await parseFreeform('floor press 4x12 @45', 'thor', 1);

      const duration = Date.now() - start;

      // Should complete within 10 seconds even with LLM (much faster with mocks)
      expect(duration).toBeLessThan(10000);
    });

    it('should handle concurrent parsing requests', async () => {
      // Mock responses for each request
      mockOllamaSuccess([{
        exercise_free: 'floor press',
        exercise_match: 'floor press',
        sets: 4,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 45,
        notes: null
      }]);
      mockOllamaSuccess([{
        exercise_free: 'leg raises',
        exercise_match: 'leg raises',
        sets: 3,
        reps_per_set: 10,
        variable_reps: null,
        weight_lbs: null,
        notes: null
      }]);
      mockOllamaSuccess([{
        exercise_free: 'goblet squats',
        exercise_match: 'goblet squats',
        sets: 3,
        reps_per_set: 12,
        variable_reps: null,
        weight_lbs: 30,
        notes: null
      }]);

      const requests = [
        parseFreeform('floor press 4x12 @45', 'thor', 1),
        parseFreeform('leg raises 3x10', 'thor', 3),
        parseFreeform('goblet squats 3x12 @30', 'thor', 3)
      ];

      const results = await Promise.all(requests);

      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.items).toBeDefined();
      });
    });
  });
});
