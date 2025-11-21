/**
 * Health event tools (migraine, sleep, yardwork, etc.)
 */

import { z } from 'zod';
import type { ToolDefinition } from './types.js';

export const HEALTH_TOOLS: ToolDefinition[] = [
  {
    name: 'log_health_event',
    title: 'Log Health Event',
    description: 'Log a NEW health event that just happened. Use this when the user is reporting a health event they experienced (e.g., "I had a migraine today", "I slept 8 hours"). DO NOT use this for queries about past events.',
    zodSchema: {
      date: z.string().describe("Date in YYYY-MM-DD format"),
      category: z.enum(['migraine', 'sleep', 'yardwork', 'run', 'other']).describe("Category of health event"),
      intensity: z.number().int().min(1).max(10).optional().describe("Optional intensity rating (1-10)"),
      duration_minutes: z.number().int().min(1).optional().describe("Optional duration in minutes"),
      notes: z.string().optional().describe("Optional notes about the event"),
    },
    jsonSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        category: { type: 'string', enum: ['migraine', 'sleep', 'yardwork', 'run', 'other'] },
        intensity: { type: 'number' },
        duration_minutes: { type: 'number' },
        notes: { type: 'string' }
      },
      required: ['date', 'category']
    },
    handler: async (apiClient, args) => {
      return await apiClient.logHealthEvent(
        args.date,
        args.category,
        args.intensity,
        args.duration_minutes,
        args.notes
      );
    }
  },

  {
    name: 'get_health_events',
    title: 'Get Health Events',
    description: 'QUERY and RETRIEVE past health events from history. Use this when the user asks about past events (e.g., "When was my last migraine?", "Show me my sleep logs", "What health events did I log?"). Supports filtering by date, date range, or category.',
    zodSchema: {
      date: z.string().optional().describe("Optional specific date in YYYY-MM-DD format"),
      from: z.string().optional().describe("Optional start date for range query in YYYY-MM-DD format"),
      to: z.string().optional().describe("Optional end date for range query in YYYY-MM-DD format"),
      category: z.enum(['migraine', 'sleep', 'yardwork', 'run', 'other']).optional().describe("Optional category filter"),
      limit: z.number().int().min(1).max(200).optional().describe("Number of events to retrieve (default: 50)"),
    },
    jsonSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        from: { type: 'string' },
        to: { type: 'string' },
        category: { type: 'string', enum: ['migraine', 'sleep', 'yardwork', 'run', 'other'] },
        limit: { type: 'number' }
      }
    },
    handler: async (apiClient, args) => {
      return await apiClient.getHealthEvents(args);
    }
  },

  {
    name: 'delete_health_event',
    title: 'Delete Health Event',
    description: 'Delete a specific health event by its ID',
    zodSchema: {
      event_id: z.string().uuid().describe("Health event ID (UUID)"),
    },
    jsonSchema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' }
      },
      required: ['event_id']
    },
    handler: async (apiClient, args) => {
      return await apiClient.deleteHealthEvent(args.event_id);
    }
  },
];
