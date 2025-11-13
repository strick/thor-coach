#!/usr/bin/env node

/**
 * Thor MCP Server - HTTP Transport
 * Exposes workout logging tools via HTTP REST API for multi-agent access
 */

import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import { ThorApiClient } from './api-client.js';

const PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : 3003;
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Initialize API client
const apiClient = new ThorApiClient();

/**
 * Tool definitions
 */
const TOOLS = [
  {
    name: 'log_workout',
    description: 'Log a workout using natural language. Parse exercises, sets, reps, and weights from text.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: `Natural language workout description (e.g., 'floor press 4x12 @45, dumbbell row 3x8 @35')`
        },
        date: {
          type: 'string',
          description: `Optional date in YYYY-MM-DD format (defaults to today: ${new Date().toISOString().split('T')[0]})`
        }
      },
      required: ['text']
    }
  },
  {
    name: 'get_today_exercises',
    description: 'Get the list of exercises scheduled for today based on the workout plan',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_exercises_for_day',
    description: 'Get exercises for a specific day of the week (1=Monday, 7=Sunday)',
    inputSchema: {
      type: 'object',
      properties: {
        day_of_week: {
          type: 'number',
          description: 'Day of week (1-7, where 1=Monday, 7=Sunday)'
        }
      },
      required: ['day_of_week']
    }
  },
  {
    name: 'get_progress_summary',
    description: 'Get workout progress summary for a date range, including sessions count and top lifts',
    inputSchema: {
      type: 'object',
      properties: {
        from: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format'
        },
        to: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format'
        }
      },
      required: ['from', 'to']
    }
  },
  {
    name: 'get_weekly_summaries',
    description: 'Get AI-generated weekly workout summaries with metrics and insights',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of summaries to retrieve (default: 10)'
        }
      }
    }
  },
  {
    name: 'get_workouts_by_date',
    description: 'Get all workouts logged on a specific date',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date in YYYY-MM-DD format'
        }
      },
      required: ['date']
    }
  },
  {
    name: 'get_all_exercises',
    description: 'Get list of all exercises in the workout plan',
    inputSchema: {
      type: 'object',
      properties: {
        day_of_week: {
          type: 'number',
          description: 'Optional: filter by day of week (1-7)'
        }
      }
    }
  },
  {
    name: 'get_exercise_history',
    description: 'Get historical performance data for a specific exercise',
    inputSchema: {
      type: 'object',
      properties: {
        exercise_id: {
          type: 'string',
          description: 'Exercise ID (UUID)'
        },
        limit: {
          type: 'number',
          description: 'Number of sessions to retrieve (default: 50)'
        }
      },
      required: ['exercise_id']
    }
  }
];

/**
 * GET /tools
 * List all available tools
 */
app.get('/tools', (req, res) => {
  res.json({
    tools: TOOLS
  });
});

/**
 * POST /tools/:toolName
 * Execute a specific tool
 */
app.post('/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  try {
    // Find tool definition
    const tool = TOOLS.find(t => t.name === toolName);
    if (!tool) {
      return res.status(404).json({
        error: 'Tool not found',
        availableTools: TOOLS.map(t => t.name)
      });
    }

    // Execute tool
    let result;

    switch (toolName) {
      case 'log_workout':
        result = await apiClient.logWorkout(args.text, args.date);
        break;

      case 'get_today_exercises': {
        const today = new Date().getDay() || 7; // Sunday=7
        result = await apiClient.getDayExercises(today);
        break;
      }

      case 'get_exercises_for_day':
        result = await apiClient.getDayExercises(args.day_of_week);
        break;

      case 'get_progress_summary':
        result = await apiClient.getProgressSummary(args.from, args.to);
        break;

      case 'get_weekly_summaries':
        result = await apiClient.getWeeklySummaries(args.limit || 10);
        break;

      case 'get_workouts_by_date':
        result = await apiClient.getWorkoutsByDate(args.date);
        break;

      case 'get_all_exercises':
        result = await apiClient.getExercises(args.day_of_week);
        break;

      case 'get_exercise_history':
        result = await apiClient.getExerciseHistory(args.exercise_id, args.limit || 50);
        break;

      default:
        return res.status(400).json({ error: 'Tool handler not implemented' });
    }

    res.json({ result });

  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  try {
    // Check if Thor API is reachable
    await apiClient.health();
    res.json({
      status: 'healthy',
      service: 'thor-mcp',
      transport: 'http',
      apiConnected: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      service: 'thor-mcp',
      transport: 'http',
      apiConnected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Start server
 */
async function main() {
  // Test API connection silently
  try {
    await apiClient.health();
    console.log('✅ Thor API connection verified');
  } catch (error) {
    console.warn('⚠️  Warning: Thor API not available yet. Tool calls will fail until API is running.');
  }

  app.listen(PORT, () => {
    console.log(`\n🔧 Thor MCP Server (HTTP) running at: http://localhost:${PORT}`);
    console.log(`📍 Tools endpoint: GET http://localhost:${PORT}/tools`);
    console.log(`📍 Execute tool: POST http://localhost:${PORT}/tools/:toolName`);
    console.log(`📍 Health check: GET http://localhost:${PORT}/health`);
    console.log(`\n💡 Transport: HTTP REST (multi-agent ready)`);
    console.log(`💡 Available tools: ${TOOLS.length}`);
    console.log('');
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
