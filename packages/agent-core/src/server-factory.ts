/**
 * Server factory for Thor agents
 * Creates Express app with standard /chat, /health, /sessions endpoints
 */

import express from 'express';
import type { Express } from 'express';
import cors from 'cors';
import type { BaseAgent } from './base-agent.js';
import type { ChatMessage, ServerConfig } from './types.js';

/**
 * Create an Express server for an agent
 */
export function createAgentServer(agent: BaseAgent, config: ServerConfig): Express {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // In-memory conversation storage
  const conversations = new Map<string, ChatMessage[]>();

  /**
   * POST /chat - Send a message to the agent
   */
  app.post('/chat', async (req, res) => {
    if (!agent.isReady()) {
      return res.status(503).json({
        error: 'Agent not ready. MCP server is starting...'
      });
    }

    try {
      const { message, sessionId, reset } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({
          error: 'Message is required and must be a string'
        });
      }

      const currentSessionId = sessionId || generateSessionId();

      let history: ChatMessage[] = [];
      if (!reset && conversations.has(currentSessionId)) {
        history = conversations.get(currentSessionId)!;
      }

      const response = await agent.chat(message, history);

      history.push({ role: 'user', content: message });
      history.push({ role: 'assistant', content: response.message });
      conversations.set(currentSessionId, history);

      res.json({
        reply: response.message,
        sessionId: currentSessionId,
        toolCalls: response.toolCalls,
        model: response.model,
        provider: response.provider
      });
    } catch (error) {
      console.error('Chat error:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * GET /health - Health check endpoint
   */
  app.get('/health', async (req, res) => {
    res.json({
      status: agent.isReady() ? 'ok' : 'starting',
      service: config.serviceName,
      mcpReady: agent.isReady(),
      timestamp: new Date().toISOString()
    });
  });

  /**
   * GET /sessions/:id - Get conversation history
   */
  app.get('/sessions/:id', (req, res) => {
    const { id } = req.params;

    if (!conversations.has(id)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      sessionId: id,
      messages: conversations.get(id)
    });
  });

  /**
   * DELETE /sessions/:id - Clear conversation history
   */
  app.delete('/sessions/:id', (req, res) => {
    const { id } = req.params;

    if (!conversations.has(id)) {
      return res.status(404).json({ error: 'Session not found' });
    }

    conversations.delete(id);
    res.json({ status: 'deleted', sessionId: id });
  });

  /**
   * POST /sessions/clear-all - Clear all conversations
   */
  app.post('/sessions/clear-all', (req, res) => {
    const count = conversations.size;
    conversations.clear();
    res.json({ status: 'cleared', count });
  });

  return app;
}

function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Start the agent server with standard lifecycle
 */
export async function startAgentServer(
  agent: BaseAgent,
  config: ServerConfig & { agentName: string }
): Promise<void> {
  const app = createAgentServer(agent, config);

  // Start MCP connection
  try {
    await agent.start();
    console.log(`✅ ${config.agentName} ready with MCP backend`);
  } catch (error) {
    console.error(`❌ Failed to start ${config.agentName}:`, error);
    process.exit(1);
  }

  // Start HTTP server
  app.listen(config.port, () => {
    console.log(`\n🤖 ${config.agentName} running at: http://localhost:${config.port}`);
    console.log(`📍 Chat endpoint: POST http://localhost:${config.port}/chat`);
    console.log(`💬 Send messages like: {"message": "Hello"}\n`);

    // Log LLM config
    if (process.env.USE_OLLAMA === 'true') {
      console.log(`🦙 Using Ollama: ${process.env.OLLAMA_URL}`);
      console.log(`📦 Model: ${process.env.OLLAMA_MODEL || 'llama3.1:8b'}`);
    } else if (process.env.OPENAI_API_KEY) {
      console.log(`🤖 Using OpenAI: gpt-4-turbo-preview`);
    } else {
      console.warn(`⚠️  Warning: No LLM configured`);
    }
    console.log('');
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    agent.stop();
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('\nSIGINT signal received: closing HTTP server');
    agent.stop();
    process.exit(0);
  });
}
