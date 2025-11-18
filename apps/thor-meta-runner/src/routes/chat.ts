import express from 'express';
import { MetaRunnerService } from '../services/metaRunner.js';
import { MetaRunnerRequestSchema } from '@thor/shared';

export const chatRoutes = express.Router();
const metaRunnerService = new MetaRunnerService();

/**
 * POST /chat
 * Main endpoint for agentic health queries
 */
chatRoutes.post('/chat', async (req, res) => {
  try {
    console.log('Request body:', req.body);
    // Validate request
    const validRequest = MetaRunnerRequestSchema.parse(req.body);

    // Execute meta-runner
    const response = await metaRunnerService.chat(validRequest);

    res.status(200).json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Chat endpoint error:', error);
    res.status(400).json({
      agent: 'unknown',
      intent: 'error',
      actions: [],
      message: `Error: ${message}`,
      error: true
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
chatRoutes.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
