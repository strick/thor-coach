/**
 * Thor Agent Server
 * Provides conversational AI interface via /chat endpoint
 * Uses MCP server for all tool calls
 */

import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { ThorAgent, ChatMessage } from './agent.js';

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize agent
const agent = new ThorAgent();
let agentReady = false;

// Start MCP server
agent.start()
  .then(() => {
    agentReady = true;
    console.log('✅ Agent ready with MCP backend');
  })
  .catch((error) => {
    console.error('❌ Failed to start agent:', error);
    process.exit(1);
  });

// In-memory conversation storage (per session)
// In production, use Redis or a database
const conversations = new Map<string, ChatMessage[]>();

/**
 * POST /chat
 * Send a message to the Thor agent
 *
 * Body:
 *   - message: string (required) - User message
 *   - sessionId: string (optional) - Session ID for conversation continuity
 *   - reset: boolean (optional) - Reset conversation history
 *
 * Response:
 *   - reply: string - Agent's response
 *   - sessionId: string - Session ID for this conversation
 *   - toolCalls: array (optional) - Tools that were called
 */
app.post('/chat', async (req, res) => {
  if (!agentReady) {
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

    // Get or create session ID
    const currentSessionId = sessionId || generateSessionId();

    // Get conversation history
    let history: ChatMessage[] = [];
    if (!reset && conversations.has(currentSessionId)) {
      history = conversations.get(currentSessionId)!;
    }

    // Send message to agent
    const response = await agent.chat(message, history);

    // Update conversation history
    history.push({ role: 'user', content: message });
    history.push({ role: 'assistant', content: response.message });
    conversations.set(currentSessionId, history);

    // Return response
    res.json({
      reply: response.message,
      sessionId: currentSessionId,
      toolCalls: response.toolCalls
    });
  } catch (error) {
    console.error('Chat error:', error);
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
  res.json({
    status: agentReady ? 'ok' : 'starting',
    service: 'thor-agent',
    mcpReady: agentReady,
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /sessions/:id
 * Get conversation history for a session
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
 * DELETE /sessions/:id
 * Clear conversation history for a session
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
 * POST /sessions/clear-all
 * Clear all conversation histories (development helper)
 */
app.post('/sessions/clear-all', (req, res) => {
  const count = conversations.size;
  conversations.clear();
  res.json({ status: 'cleared', count });
});

// Generate a simple session ID
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Start server
app.listen(PORT, () => {
  console.log(`\n🤖 Thor Agent running at: http://localhost:${PORT}`);
  console.log(`📍 Chat endpoint: POST http://localhost:${PORT}/chat`);
  console.log(`💬 Send messages like: {"message": "What exercises should I do today?"}\n`);

  // Check LLM configuration
  if (process.env.USE_OLLAMA === 'true') {
    console.log(`🦙 Using Ollama: ${process.env.OLLAMA_URL}`);
    console.log(`📦 Model: ${process.env.OLLAMA_MODEL || 'llama3.1:8b'}`);
  } else if (process.env.OPENAI_API_KEY) {
    console.log(`🤖 Using OpenAI: gpt-4-turbo-preview`);
  } else {
    console.warn(`⚠️  Warning: No LLM configured. Set USE_OLLAMA=true or provide OPENAI_API_KEY`);
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
