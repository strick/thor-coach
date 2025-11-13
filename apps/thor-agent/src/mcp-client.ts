/**
 * MCP Client for Thor Agent
 * Spawns and communicates with the Thor MCP Server via stdio
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

interface MCPTool {
  name: string;
  title: string;
  description: string;
  inputSchema: any;
}

interface MCPServerInfo {
  name: string;
  version: string;
}

export class MCPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private mcpServerPath: string;
  private requestId = 1;
  private pendingRequests = new Map<number, { resolve: Function; reject: Function }>();
  private buffer = '';
  private tools: MCPTool[] = [];
  private serverInfo: MCPServerInfo | null = null;
  private initialized = false;

  constructor(mcpServerPath: string) {
    super();
    this.mcpServerPath = mcpServerPath;
  }

  /**
   * Start the MCP server process and initialize connection
   */
  async start(): Promise<void> {
    if (this.process) {
      throw new Error('MCP server already running');
    }

    // Spawn the MCP server
    this.process = spawn('node', [this.mcpServerPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, THOR_API_URL: process.env.THOR_API_URL || 'http://localhost:3000' }
    });

    // Handle stdout (JSON-RPC responses)
    this.process.stdout?.on('data', (data) => {
      this.handleData(data);
    });

    // Handle stderr (errors/logs)
    this.process.stderr?.on('data', (data) => {
      console.error('[MCP Server Error]', data.toString());
    });

    // Handle process exit
    this.process.on('exit', (code) => {
      console.log(`MCP server exited with code ${code}`);
      this.process = null;
      this.initialized = false;
      this.emit('exit', code);
    });

    // Initialize the MCP server
    await this.initialize();

    // List available tools
    await this.listTools();
  }

  /**
   * Stop the MCP server process
   */
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
      this.initialized = false;
    }
  }

  /**
   * Initialize the MCP connection
   */
  private async initialize(): Promise<void> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'thor-agent',
        version: '1.0.0'
      }
    });

    this.serverInfo = response.serverInfo;
    this.initialized = true;
  }

  /**
   * List available tools from MCP server
   */
  private async listTools(): Promise<void> {
    const response = await this.sendRequest('tools/list', {});
    this.tools = response.tools || [];
  }

  /**
   * Get list of available tools
   */
  getTools(): MCPTool[] {
    return this.tools;
  }

  /**
   * Get server info
   */
  getServerInfo(): MCPServerInfo | null {
    return this.serverInfo;
  }

  /**
   * Call an MCP tool
   */
  async callTool(toolName: string, args: any): Promise<any> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized');
    }

    const response = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });

    // Extract content from MCP response
    if (response.content && response.content.length > 0) {
      const textContent = response.content.find((c: any) => c.type === 'text');
      if (textContent) {
        try {
          return JSON.parse(textContent.text);
        } catch (e) {
          return textContent.text;
        }
      }
    }

    return response;
  }

  /**
   * Send a JSON-RPC request to the MCP server
   */
  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('MCP server not running'));
        return;
      }

      const id = this.requestId++;
      const request = {
        jsonrpc: '2.0',
        method,
        params,
        id
      };

      this.pendingRequests.set(id, { resolve, reject });

      // Send request
      this.process.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  /**
   * Handle incoming data from MCP server
   */
  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete JSON-RPC messages (one per line)
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          console.error('[MCP Client] Failed to parse message:', line, error);
        }
      }
    }
  }

  /**
   * Handle a JSON-RPC message
   */
  private handleMessage(message: any): void {
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id)!;
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || 'MCP error'));
      } else {
        resolve(message.result);
      }
    }
  }
}
