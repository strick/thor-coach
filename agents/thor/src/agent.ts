/**
 * Thor Conversational Agent
 * Uses LLM with tool calling that routes through MCP server
 */

import OpenAI from 'openai';
import { MCPClientHTTP as MCPClient } from './mcp-client-http.js';

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

export class ThorAgent {
  private openai: OpenAI | null = null;
  private useOllama: boolean;
  private ollamaUrl: string;
  private ollamaModel: string;
  private mcpClient: MCPClient;
  private mcpReady: boolean = false;

  constructor() {
    this.useOllama = process.env.USE_OLLAMA === 'true';
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:8b';

    if (!this.useOllama && process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }

    // Initialize MCP client - connect to thor-mcp server
    const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3003';
    this.mcpClient = new MCPClient(mcpServerUrl);
  }

  /**
   * Connect to the MCP server via HTTP
   */
  async start(): Promise<void> {
    await this.mcpClient.start();
    this.mcpReady = true;
    console.log('✅ Thor MCP server connected');
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
   * Get tool definitions for LLM (OpenAI format)
   */
  private getToolsForLLM(): any[] {
    return this.mcpClient.getTools().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema
      }
    }));
  }

  private getSystemPrompt(): string {
    // Get current date in local timezone (EST)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[now.getDay()];

    return `You are Thor, an AI workout coach and logging assistant.

**IMPORTANT - Current Date Information:**
- Today is ${todayName}, ${todayDate}
- When logging workouts for today, DO NOT include a date parameter - leave it empty/undefined
- Only use the date parameter when the user explicitly mentions a different date (e.g., "yesterday", "last Monday", "2025-11-15")

You help users:
1. Log workouts using natural language (use log_workout tool)
2. View their workout plans and exercises (use get_today_exercises, get_exercises_for_day, get_all_exercises)
3. Track progress over time (use get_progress_summary, get_weekly_summaries)
4. Review workout history (use get_workouts_by_date, get_exercise_history)

Be conversational, motivating, and helpful.

**CRITICAL: Distinguish between LOGGING new workouts vs QUERYING past workouts:**

**LOGGING WORKOUTS (use log_workout):**
- "Log today's workout: floor press 4x12 @45, skullcrusher 3x10 @20" → log_workout WITHOUT date parameter
- "I did bench press yesterday 5x5 @135" → log_workout WITH date parameter (calculate yesterday's date)
- "Floor press 4x12, skullcrusher 3x15" → log_workout (assume today)

**QUERYING WORKOUT PLAN (use get_today_exercises, get_exercises_for_day):**
- "What exercises should I do today?" → get_today_exercises
- "What's on the plan for Monday?" → get_exercises_for_day (day: Monday/1)
- "Show me all exercises in my plan" → get_all_exercises

**QUERYING WORKOUT HISTORY (use get_workouts_by_date, get_exercise_history):**
- "What workouts did I do yesterday?" → get_workouts_by_date (date: yesterday)
- "What did I lift last Monday?" → get_workouts_by_date (date: last Monday)
- "Show me my bench press history" → get_exercise_history (exercise: bench press)
- "How's my progress on squats?" → get_exercise_history (exercise: squats) + analyze progression

**QUERYING PROGRESS & SUMMARIES (use get_progress_summary, get_weekly_summaries):**
- "Show me my progress for the last 30 days" → get_progress_summary (from/to dates)
- "How did I do this week?" → get_weekly_summaries (limit: 1)

Always be encouraging and celebrate their progress!`;
  }

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

  private async chatWithOpenAI(messages: ChatMessage[]): Promise<ChatResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const tools = this.getToolsForLLM();

    // First LLM call - may request tool calls
    let response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: messages as any,
      tools: tools as any,
      tool_choice: 'auto'
    });

    let message = response.choices[0].message;
    const toolCallResults: Array<{ tool: string; arguments: any; result: any }> = [];

    // Handle tool calls if requested
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolMessages = [...messages, message as any];

      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        // Execute the tool via MCP
        console.log(`[Agent] Calling MCP tool: ${functionName}`, functionArgs);
        const result = await this.mcpClient.callTool(functionName, functionArgs);

        toolCallResults.push({
          tool: functionName,
          arguments: functionArgs,
          result
        });

        // Add tool result to messages
        toolMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        } as any);
      }

      // Second LLM call with tool results
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

  private async chatWithOllama(messages: ChatMessage[]): Promise<ChatResponse> {
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

    // Check if Ollama returned tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolCallResults: Array<{ tool: string; arguments: any; result: any }> = [];
      const toolMessages = [...messages, message];

      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = toolCall.function.arguments;

        // Execute the tool via MCP
        console.log(`[Agent] Calling MCP tool: ${functionName}`, functionArgs);
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

      // Second call with tool results
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
