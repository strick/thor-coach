/**
 * Base Agent class - shared LLM + MCP infrastructure
 * Subclasses only need to implement getSystemPrompt() and agentName
 */

import OpenAI from 'openai';
import { MCPClientHTTP } from './mcp-client-http.js';
import type { ChatMessage, ChatResponse, AgentConfig } from './types.js';

export abstract class BaseAgent {
  protected openai: OpenAI | null = null;
  protected useOllama: boolean;
  protected ollamaUrl: string;
  protected ollamaModel: string;
  protected mcpClient: MCPClientHTTP;
  protected mcpReady: boolean = false;

  /** Subclasses must provide agent name for logging */
  protected abstract get agentName(): string;

  /** Subclasses must provide system prompt */
  protected abstract getSystemPrompt(): string;

  constructor(config?: AgentConfig) {
    this.useOllama = config?.useOllama ?? process.env.USE_OLLAMA === 'true';
    this.ollamaUrl = config?.ollamaUrl ?? process.env.OLLAMA_URL ?? 'http://localhost:11434';
    this.ollamaModel = config?.ollamaModel ?? process.env.OLLAMA_MODEL ?? 'llama3.1:8b';

    const openaiKey = config?.openaiApiKey ?? process.env.OPENAI_API_KEY;
    if (!this.useOllama && openaiKey) {
      this.openai = new OpenAI({ apiKey: openaiKey });
    }

    const mcpServerUrl = config?.mcpServerUrl ?? process.env.MCP_SERVER_URL ?? 'http://localhost:3003';
    this.mcpClient = new MCPClientHTTP(mcpServerUrl);
  }

  /**
   * Connect to the MCP server
   */
  async start(): Promise<void> {
    await this.mcpClient.start();
    this.mcpReady = true;
    console.log(`✅ ${this.agentName} MCP server connected`);
    console.log(`🛠️  Available tools: ${this.mcpClient.getTools().map(t => t.name).join(', ')}`);
  }

  /**
   * Disconnect from the MCP server
   */
  stop(): void {
    this.mcpClient.stop();
    this.mcpReady = false;
  }

  /**
   * Check if agent is ready
   */
  isReady(): boolean {
    return this.mcpReady;
  }

  /**
   * Get tool definitions for LLM (OpenAI format)
   */
  protected getToolsForLLM(): any[] {
    return this.mcpClient.getTools().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
  }

  /**
   * Helper to get current date info for system prompts
   */
  protected getDateContext(): { todayDate: string; todayName: string } {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[now.getDay()];
    return { todayDate, todayName };
  }

  /**
   * Main chat entry point
   */
  async chat(userMessage: string, conversationHistory: ChatMessage[] = []): Promise<ChatResponse> {
    if (!this.mcpReady) {
      throw new Error('MCP server not ready. Call start() first.');
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    if (this.useOllama) {
      return this.chatWithOllama(messages);
    } else if (this.openai) {
      return this.chatWithOpenAI(messages);
    } else {
      throw new Error('No LLM configured. Set USE_OLLAMA=true or provide OPENAI_API_KEY');
    }
  }

  protected async chatWithOpenAI(messages: ChatMessage[]): Promise<ChatResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const tools = this.getToolsForLLM();

    let response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: messages as any,
      tools: tools as any,
      tool_choice: 'auto'
    });

    let message = response.choices[0].message;
    const toolCallResults: Array<{ tool: string; arguments: any; result: any }> = [];

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolMessages = [...messages, message as any];

      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[${this.agentName}] Calling MCP tool: ${functionName}`, functionArgs);
        const result = await this.mcpClient.callTool(functionName, functionArgs);

        toolCallResults.push({
          tool: functionName,
          arguments: functionArgs,
          result
        });

        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        } as any);
      }

      const finalResponse = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: toolMessages as any
      });

      return {
        message: finalResponse.choices[0].message.content || 'No response',
        toolCalls: toolCallResults
      };
    }

    return {
      message: message.content || 'No response'
    };
  }

  protected async chatWithOllama(messages: ChatMessage[]): Promise<ChatResponse> {
    const tools = this.getToolsForLLM();

    const response = await fetch(`${this.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollamaModel,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        tools: tools.map(t => ({
          type: 'function',
          function: {
            name: t.function.name,
            description: t.function.description,
            parameters: t.function.parameters
          }
        })),
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json() as { message: any };
    const message = data.message;

    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCallResults: Array<{ tool: string; arguments: any; result: any }> = [];
      const toolMessages = [...messages, message];

      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = toolCall.function.arguments;

        console.log(`[${this.agentName}] Calling MCP tool: ${functionName}`, functionArgs);
        const result = await this.mcpClient.callTool(functionName, functionArgs);

        toolCallResults.push({
          tool: functionName,
          arguments: functionArgs,
          result
        });

        toolMessages.push({
          role: 'tool',
          content: JSON.stringify(result)
        });
      }

      const finalResponse = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.ollamaModel,
          messages: toolMessages.map(m => ({ role: m.role, content: m.content })),
          stream: false
        })
      });

      const finalData = await finalResponse.json() as { message: { content: string } };
      return {
        message: finalData.message.content,
        toolCalls: toolCallResults
      };
    }

    return {
      message: message.content
    };
  }
}
