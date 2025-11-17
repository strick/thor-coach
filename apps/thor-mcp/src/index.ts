#!/usr/bin/env node

/**
 * Thor MCP Server - HTTP Transport (StreamableHTTP)
 * Exposes workout logging tools via proper MCP protocol over HTTP for Docker
 */

import express from 'express';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { ThorApiClient } from './api-client.js';
import { TOOL_DEFINITIONS } from './tool-config.js';

const PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : 3003;
const app = express();

// Middleware
app.use(express.json());

// Initialize API client
const apiClient = new ThorApiClient();

// Initialize MCP server with proper SDK
const server = new McpServer(
  {
    name: "thor-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Helper to create successful tool response
 */
function createToolResponse(data: any) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Helper to create error response
 */
function createErrorResponse(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${errorMessage}`,
      },
    ],
    isError: true,
  };
}

/**
 * Register all tools from shared configuration
 * Single source of truth - no duplication!
 */
TOOL_DEFINITIONS.forEach((toolDef) => {
  server.registerTool(
    toolDef.name,
    {
      title: toolDef.title,
      description: toolDef.description,
      inputSchema: toolDef.zodSchema,
    },
    async (args: any) => {
      try {
        const result = await toolDef.handler(apiClient, args);
        return createToolResponse(result);
      } catch (err) {
        return createErrorResponse(err);
      }
    }
  );
});

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

/**
 * GET /tools - List all available tools (for HTTP client compatibility)
 * Generated from shared tool configuration
 */
app.get('/tools', (_req, res) => {
  const tools = TOOL_DEFINITIONS.map((toolDef) => ({
    name: toolDef.name,
    description: toolDef.description,
    inputSchema: toolDef.jsonSchema,
  }));
  res.json({ tools });
});

/**
 * POST /tools/:toolName - Execute a tool (for HTTP client compatibility)
 * Uses shared tool configuration - no switch statement needed!
 */
app.post('/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  // Find tool definition from shared config
  const toolDef = TOOL_DEFINITIONS.find((t) => t.name === toolName);

  if (!toolDef) {
    return res.status(404).json({ error: 'Tool not found' });
  }

  try {
    const result = await toolDef.handler(apiClient, args);
    res.json({ result });
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
});

/**
 * MCP endpoint - handles MCP protocol over HTTP using StreamableHTTP transport
 * This is the proper way to expose MCP server over HTTP
 */
app.post('/mcp', async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

/**
 * Start the server
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
    console.log(`📍 MCP endpoint: POST http://localhost:${PORT}/mcp`);
    console.log(`📍 Health check: GET http://localhost:${PORT}/health`);
    console.log(`\n💡 Transport: StreamableHTTP (proper MCP over HTTP)`);
    console.log(`💡 Uses server.registerTool() with title, description, inputSchema`);
    console.log(`💡 Available tools: 8`);
    console.log('');
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
