/**
 * HTTP-based MCP Client
 * Connects to MCP Server via HTTP REST API
 */

import { EventEmitter } from 'events';

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export class MCPClientHTTP extends EventEmitter {
  private mcpServerUrl: string;
  private tools: Tool[] = [];

  constructor(mcpServerUrl: string = 'http://localhost:3003') {
    super();
    this.mcpServerUrl = mcpServerUrl.replace(/\/$/, '');
  }

  /**
   * Start the MCP client (fetch available tools)
   */
  async start(): Promise<void> {
    try {
      const response = await fetch(`${this.mcpServerUrl}/tools`);

      if (!response.ok) {
        throw new Error(`MCP server returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { tools: Tool[] };
      this.tools = data.tools;

      console.log(`[MCP Client] Connected to MCP server at ${this.mcpServerUrl}`);
      console.log(`[MCP Client] Available tools: ${this.tools.map(t => t.name).join(', ')}`);

    } catch (error) {
      console.error('[MCP Client] Failed to connect to MCP server:', error);
      throw new Error(
        `Could not connect to MCP server at ${this.mcpServerUrl}. ` +
        'Make sure the server is running.'
      );
    }
  }

  /**
   * Stop the MCP client
   */
  stop(): void {
    console.log('[MCP Client] Disconnecting from MCP server');
  }

  /**
   * Get list of available tools
   */
  getTools(): Tool[] {
    return this.tools;
  }

  /**
   * Call a tool via HTTP
   */
  async callTool(toolName: string, args: any): Promise<any> {
    try {
      console.log(`[MCP Client] Calling tool: ${toolName}`, args);

      const response = await fetch(`${this.mcpServerUrl}/tools/${toolName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(args)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText })) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as { result: any };
      console.log(`[MCP Client] Tool ${toolName} completed successfully`);

      return data.result;

    } catch (error) {
      console.error(`[MCP Client] Tool ${toolName} failed:`, error);
      throw error;
    }
  }

  /**
   * Health check for MCP server
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.mcpServerUrl}/health`);
      const data = await response.json() as { status: string };
      return data.status === 'healthy';
    } catch (error) {
      return false;
    }
  }
}
