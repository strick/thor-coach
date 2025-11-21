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
 * GET /chat/stream
 * SSE endpoint for streaming chat responses with status updates and history
 */
chatRoutes.get('/chat/stream', async (req, res) => {
  try {
    const text = req.query.text as string;
    const rawMode = req.query.mode as string | undefined;
    const validModes = ['auto', 'thor', 'nutrition', 'health', 'overview'];
    const mode = (rawMode && validModes.includes(rawMode)) ? (rawMode as 'auto' | 'thor' | 'nutrition' | 'health' | 'overview') : undefined;

    if (!text) {
      return res.status(400).json({ error: 'Missing required query parameter: text' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Build history as we go
    const history: Array<{ timestamp: string; step: string; detail: string }> = [];

    const addHistoryEntry = (step: string, detail: string) => {
      const timestamp = new Date().toLocaleTimeString();
      history.push({ timestamp, step, detail });
    };

    // Step 1: Received message
    addHistoryEntry('Received', `Processing: "${text}"`);
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      message: 'Received your message...', 
      step: 'Received',
      history 
    })}\n\n`);

    // Small delay for visibility
    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 2: Analyzing intent
    addHistoryEntry('Analysis', 'Classifying your request...');
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      message: 'Analyzing your request...', 
      step: 'Analyzing',
      history 
    })}\n\n`);

    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 3: Route the query to determine which agent to use
    addHistoryEntry('Routing', 'Routing to appropriate agent...');
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      message: 'Routing to agent...', 
      step: 'Routing',
      history 
    })}\n\n`);

    // Import router to get routing info early
    const { routeQuery } = await import('../services/router.js');
    const routing = await routeQuery(text, mode);

    // Map agent to display name based on routing target
    const agentMap: Record<string, { name: string; emoji: string; agent: 'thor' | 'nutrition' | 'health' | 'overview' }> = {
      'WORKOUT': { name: 'Workout Agent', emoji: '💪', agent: 'thor' },
      'NUTRITION': { name: 'Nutrition Agent', emoji: '🥗', agent: 'nutrition' },
      'HEALTH_LOG': { name: 'Health Agent', emoji: '🏥', agent: 'health' },
      'OVERVIEW': { name: 'Overview Agent', emoji: '📊', agent: 'overview' }
    };

    const agentInfo = agentMap[routing.target] || { name: 'Intelligent Agent', emoji: '🤖', agent: 'thor' as const };
    const agentDisplayName = `${agentInfo.emoji} ${agentInfo.name}`;

    // Step 4: Show which agent we're connecting to
    addHistoryEntry('Agent', `Connecting to ${agentInfo.name} (Intent: ${routing.intent})`);
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      message: `Connecting to ${agentDisplayName}...`, 
      step: 'Agent',
      agent: agentInfo.agent,
      history 
    })}\n\n`);

    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 5: Execute the actual request
    addHistoryEntry('Processing', 'Executing agent...');
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      message: `Processing with ${agentDisplayName}...`, 
      step: 'Processing',
      agent: agentInfo.agent,
      history 
    })}\n\n`);

    // Start progress tracking
    const startTime = Date.now();
    const progressInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      
      const progressBars = Math.min(Math.floor(elapsed / 15), 6); // Max 6 bars
      const progressBar = '█'.repeat(progressBars) + '░'.repeat(6 - progressBars);
      
      res.write(`data: ${JSON.stringify({ 
        type: 'progress', 
        message: `${progressBar} Executing... [${timeStr}]`, 
        agent: agentInfo.agent,
        elapsed
      })}\n\n`);
    }, 20000); // Send progress every 20 seconds

    const response = await metaRunnerService.chat({ text, mode });
    
    clearInterval(progressInterval);

    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 6: Complete
    addHistoryEntry('Complete', 'Request processed successfully');
    res.write(`data: ${JSON.stringify({ 
      type: 'status', 
      message: 'Complete!', 
      step: 'Complete',
      agent: response.agent,
      history 
    })}\n\n`);

    // Send final response with full history
    res.write(`data: ${JSON.stringify({ 
      type: 'response', 
      data: response,
      history 
    })}\n\n`);

    res.end();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Chat stream endpoint error:', error);
    res.write(`data: ${JSON.stringify({ 
      type: 'error', 
      message,
      history: [{ 
        timestamp: new Date().toLocaleTimeString(), 
        step: 'Error', 
        detail: message 
      }]
    })}\n\n`);
    res.end();
  }
});

/**
 * GET /health
 * Health check endpoint
 */
chatRoutes.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
