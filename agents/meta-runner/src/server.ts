/**
 * Meta-Runner HTTP Server
 * Routes user queries to specialized agents (thor-agent, health-agent)
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { MetaRunnerRouter } from './router.js';
import { HTTPAgentClient } from './agent-client.js';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);

// Middleware
app.use(cors());
app.use(express.json());

// Initialize agent clients
const thorAgentUrl = process.env.THOR_AGENT_URL || 'http://localhost:3002';
const healthAgentUrl = process.env.HEALTH_AGENT_URL || 'http://localhost:3004';

const thorClient = new HTTPAgentClient(thorAgentUrl);
const healthClient = new HTTPAgentClient(healthAgentUrl);

// Initialize router
const router = new MetaRunnerRouter(thorClient, healthClient);

// Conversation sessions (in-memory for now)
const sessions = new Map<string, { history: any[] }>();

/**
 * POST /chat - Main chat endpoint
 */
app.post('/chat', async (req, res) => {
  try {
    const { message, sessionId, reset } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Reset session if requested
    if (reset && sessionId) {
      sessions.delete(sessionId);
    }

    console.log(`[Meta-Runner] Received message: "${message}"`);

    // Route the message
    const response = await router.route(message, sessionId);

    console.log(`[Meta-Runner] Routed to ${response.routedTo}, reply: "${response.reply.substring(0, 100)}..."`);

    // Store session
    if (!sessions.has(response.sessionId)) {
      sessions.set(response.sessionId, { history: [] });
    }

    const session = sessions.get(response.sessionId)!;
    session.history.push({ role: 'user', content: message });
    session.history.push({ role: 'assistant', content: response.reply });

    res.json({
      reply: response.reply,
      sessionId: response.sessionId,
      routedTo: response.routedTo
    });

  } catch (error) {
    console.error('[Meta-Runner] Chat error:', error);
    res.status(500).json({
      error: 'Failed to process message',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /health - Health check endpoint
 */
app.get('/health', async (req, res) => {
  try {
    const agentHealth = await router.healthCheck();

    const isHealthy = agentHealth.thor && agentHealth.health;

    res.json({
      status: isHealthy ? 'ok' : 'degraded',
      agents: {
        thor: agentHealth.thor ? 'healthy' : 'unhealthy',
        health: agentHealth.health ? 'healthy' : 'unhealthy'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Meta-Runner] Health check error:', error);
    res.status(500).json({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /sessions/:sessionId - Get session history
 */
app.get('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({
    sessionId,
    history: session.history
  });
});

/**
 * DELETE /sessions/:sessionId - Delete session
 */
app.delete('/sessions/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const deleted = sessions.delete(sessionId);

  if (!deleted) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({ status: 'deleted', sessionId });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 Meta-Runner Server started on http://localhost:${PORT}`);
  console.log(`📡 Thor Agent: ${thorAgentUrl}`);
  console.log(`❤️  Health Agent: ${healthAgentUrl}`);
  console.log(`\n🤖 LLM: ${process.env.USE_OLLAMA === 'true' ? 'Ollama' : 'OpenAI'}`);
  console.log('\n✅ Ready to route queries!\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Meta-Runner...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Meta-Runner...');
  process.exit(0);
});
