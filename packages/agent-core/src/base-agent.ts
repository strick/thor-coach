/**
 * Base Agent class - shared LLM + MCP infrastructure
 * Subclasses only need to implement getSystemPrompt() and agentName
 */

import OpenAI from 'openai';
import { MCPClientHTTP } from './mcp-client-http.js';
import type { ChatMessage, ChatResponse, AgentConfig } from './types.js';

export abstract class BaseAgent {
  protected mcpClient: MCPClientHTTP;
  protected mcpReady: boolean = false;
  protected apiUrl: string;

  /** Subclasses must provide agent name for logging */
  protected abstract get agentName(): string;

  /** Subclasses must provide system prompt */
  protected abstract getSystemPrompt(): string;

  constructor(config?: AgentConfig) {
    const mcpServerUrl = config?.mcpServerUrl ?? process.env.MCP_SERVER_URL ?? 'http://localhost:3003';
    this.mcpClient = new MCPClientHTTP(mcpServerUrl);

    // API URL for fetching runtime LLM config
    this.apiUrl = config?.apiUrl ?? process.env.THOR_API_URL ?? 'http://localhost:3000';
  }

  /**
   * Detect if a message can be handled directly without LLM (ultra-fast path)
   */
  protected canBypassLLM(message: string): { bypass: boolean; intent?: string; params?: any } {
    const lowerMessage = message.toLowerCase().trim();

    // GET PLAN patterns for "today"
    const getPlanPatterns = [
      /what.*workout.*today/,
      /what.*exercises.*today/,
      /what.*do.*today/,
      /today.*workout/,
      /today.*plan/,
      /show.*plan/,
      /get.*plan/,
      /my.*plan/,
      /workout.*plan/
    ];

    if (getPlanPatterns.some(pattern => pattern.test(lowerMessage))) {
      return { bypass: true, intent: 'get_plan' };
    }

    // Check for day-specific queries (Monday, Tuesday, Mon, Tue, etc.)
    const dayMap: Record<string, number> = {
      'sunday': 7,
      'sun': 7,
      'monday': 1,
      'mon': 1,
      'tuesday': 2,
      'tue': 2,
      'tues': 2,
      'wednesday': 3,
      'wed': 3,
      'thursday': 4,
      'thu': 4,
      'thur': 4,
      'thurs': 4,
      'friday': 5,
      'fri': 5,
      'saturday': 6,
      'sat': 6
    };

    // Check if message contains a day name and is asking about workout/exercises
    for (const [dayName, dayNum] of Object.entries(dayMap)) {
      if (lowerMessage.includes(dayName)) {
        const hasWorkoutKeyword = /workout|exercise|plan/.test(lowerMessage);
        const hasQueryKeyword = /what|show|tell|get/.test(lowerMessage);

        if (hasWorkoutKeyword && hasQueryKeyword) {
          return { bypass: true, intent: 'get_plan', params: { day: dayNum } };
        }
      }
    }

    return { bypass: false };
  }

  /**
   * Detect if a message is a simple query (GET operation)
   */
  protected isSimpleQuery(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // Simple query indicators
    const simpleKeywords = [
      'what', 'show', 'get', 'list', 'display', 'tell me',
      'how many', 'which', 'when', 'where', 'summary', 'history'
    ];

    // Complex operation indicators
    const complexKeywords = [
      'log', 'add', 'record', 'track', 'ate', 'did', 'completed'
    ];

    const hasSimpleKeyword = simpleKeywords.some(keyword => lowerMessage.includes(keyword));
    const hasComplexKeyword = complexKeywords.some(keyword => lowerMessage.includes(keyword));

    // If it has complex keywords, it's not simple
    if (hasComplexKeyword) {
      return false;
    }

    // If it has simple keywords and no complex keywords, it's simple
    return hasSimpleKeyword;
  }

  /**
   * Fetch current runtime LLM configuration from thor-api
   */
  protected async fetchLLMConfig(isSimpleQuery: boolean = false): Promise<any> {
    try {
      const response = await fetch(`${this.apiUrl}/api/config/llm`);
      if (!response.ok) {
        throw new Error(`Failed to fetch LLM config: ${response.statusText}`);
      }
      const config = await response.json();

      // Use simple config for simple queries, complex for everything else
      return isSimpleQuery ? config.agent_simple_queries : config.agent_conversation;
    } catch (error) {
      console.error(`[${this.agentName}] Failed to fetch runtime LLM config, using fallback`, error);
      // Fallback to env variables if API is unavailable
      const useOllama = process.env.USE_OLLAMA === 'true';
      if (useOllama) {
        const model = isSimpleQuery ? 'llama3.2:latest' : (process.env.OLLAMA_MODEL ?? 'llama3.1:8b');
        return {
          provider: 'ollama',
          model,
          url: process.env.OLLAMA_URL ?? 'http://localhost:11434'
        };
      } else {
        const model = isSimpleQuery ? 'gpt-3.5-turbo' : (process.env.OPENAI_MODEL ?? 'gpt-4-turbo-preview');
        return {
          provider: 'openai',
          model,
          apiKey: process.env.OPENAI_API_KEY
        };
      }
    }
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

    // Check if we can bypass LLM entirely (ultra-fast heuristic path)
    const bypassCheck = this.canBypassLLM(userMessage);
    if (bypassCheck.bypass && bypassCheck.intent === 'get_plan') {
      console.log(`[${this.agentName}] ⚡ BYPASS - Direct API/MCP call (no LLM)`);

      let result: any;
      let toolName: string;
      let toolArgs: any;

      // Check if specific day was requested
      if (bypassCheck.params && bypassCheck.params.day) {
        // Call API directly for specific day
        const dayNum = bypassCheck.params.day;
        const response = await fetch(`${this.apiUrl}/api/day/${dayNum}`);
        if (!response.ok) {
          throw new Error(`Failed to fetch day exercises: ${response.statusText}`);
        }
        result = await response.json();
        toolName = 'get_day_exercises';
        toolArgs = { day: dayNum };
      } else {
        // Call get_today_exercises MCP tool for "today" queries
        result = await this.mcpClient.callTool('get_today_exercises', {});
        toolName = 'get_today_exercises';
        toolArgs = {};
      }

      // Format the response
      const exercises = result.exercises || [];
      let message = '';
      if (exercises.length === 0) {
        message = "Rest day! No exercises scheduled.";
      } else {
        message = "Here's your workout plan:\n\n";
        exercises.forEach((ex: any) => {
          message += `• ${ex.name}\n`;
        });
      }

      return {
        message,
        toolCalls: [{
          tool: toolName,
          arguments: toolArgs,
          result
        }],
        model: 'none',
        provider: 'heuristic'
      };
    }

    // Detect if this is a simple query to use faster model
    const isSimple = this.isSimpleQuery(userMessage);

    // Fetch current runtime LLM config
    const llmConfig = await this.fetchLLMConfig(isSimple);
    console.log(`[${this.agentName}] ${isSimple ? '🚀 Simple query' : '🔧 Complex operation'} using ${llmConfig.provider}/${llmConfig.model}`);

    const messages: ChatMessage[] = [
      { role: 'system', content: this.getSystemPrompt() },
      ...conversationHistory,
      { role: 'user', content: userMessage }
    ];

    if (llmConfig.provider === 'ollama') {
      if (!llmConfig.url) {
        throw new Error('Ollama URL is required for ollama provider');
      }
      return this.chatWithOllama(messages, llmConfig.model, llmConfig.url);
    } else if (llmConfig.provider === 'openai') {
      if (!llmConfig.apiKey) {
        throw new Error('OpenAI API key is required for openai provider');
      }
      return this.chatWithOpenAI(messages, llmConfig.model, llmConfig.apiKey);
    } else {
      throw new Error('Invalid LLM provider in runtime config');
    }
  }

  protected async chatWithOpenAI(messages: ChatMessage[], model: string, apiKey: string): Promise<ChatResponse> {
    const openai = new OpenAI({ apiKey });
    const tools = this.getToolsForLLM();

    let response = await openai.chat.completions.create({
      model: model,
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

      const finalResponse = await openai.chat.completions.create({
        model: model,
        messages: toolMessages as any
      });

      return {
        message: finalResponse.choices[0].message.content || 'No response',
        toolCalls: toolCallResults,
        model,
        provider: 'openai'
      };
    }

    return {
      message: message.content || 'No response',
      model,
      provider: 'openai'
    };
  }

  protected async chatWithOllama(messages: ChatMessage[], model: string, url: string): Promise<ChatResponse> {
    const tools = this.getToolsForLLM();

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
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

      const finalResponse = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          messages: toolMessages.map(m => ({ role: m.role, content: m.content })),
          stream: false
        })
      });

      const finalData = await finalResponse.json() as { message: { content: string } };
      return {
        message: finalData.message.content,
        toolCalls: toolCallResults,
        model,
        provider: 'ollama'
      };
    }

    return {
      message: message.content,
      model,
      provider: 'ollama'
    };
  }
}
