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
  model?: string; // LLM model used (e.g., "llama3.1:8b", "gpt-4-turbo-preview", "none")
  provider?: 'ollama' | 'openai' | 'heuristic'; // LLM provider used ('heuristic' = no LLM, direct MCP call)
}

export interface AgentConfig {
  mcpServerUrl?: string;
  apiUrl?: string; // Thor API URL for fetching runtime LLM config
  // Legacy fields kept for backwards compatibility (fallback only)
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
