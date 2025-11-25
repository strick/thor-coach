/**
 * Shared types for Thor agents
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ChatResponse {
  message: string;
  toolCalls?: Array<{
    tool: string;
    arguments: any;
    result: any;
  }>;
}

export interface AgentConfig {
  mcpServerUrl?: string;
  useOllama?: boolean;
  ollamaUrl?: string;
  ollamaModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
}

export interface ServerConfig {
  port: number;
  serviceName: string;
}
