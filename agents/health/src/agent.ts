/**
 * Health Conversational Agent
 * Uses LLM with tool calling that routes through health-mcp server
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

export class HealthAgent {
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

    // Initialize MCP client - connect to health-mcp server
    const mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3005';
    this.mcpClient = new MCPClient(mcpServerUrl);
  }

  /**
   * Connect to the MCP server via HTTP
   */
  async start(): Promise<void> {
    await this.mcpClient.start();
    this.mcpReady = true;
    console.log('✅ Health MCP server connected');
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
    // Get current date in local timezone
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayDate = `${year}-${month}-${day}`;
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = dayNames[now.getDay()];

    return `You are a health tracking assistant specializing in logging health events like sleep, migraines, runs, and other health activities.

**IMPORTANT - Current Date Information:**
- Today is ${todayName}, ${todayDate}
- When logging events for today, use today's date
- Parse dates from natural language (e.g., "yesterday", "last night", "this morning")

You help users:
1. Log health events (sleep, migraines, runs, yard work, etc.) using log_health_event tool
2. Query past health events using get_health_events tool
3. Delete health events if needed using delete_health_event tool

**Health Event Categories:**
- sleep: Log sleep duration and quality
- migraine: Log migraines with intensity (1-10)
- run: Log running sessions
- yardwork: Log yard work activities
- other: Any other health-related event

Be conversational and helpful.

**CRITICAL: Distinguish between LOGGING new events vs QUERYING past events:**

**QUERY KEYWORDS (use get_health_events):**
If the user's message contains these words, they are QUERYING, NOT logging:
- "when", "was", "were", "did", "have I", "show", "display", "list", "history", "last", "recent", "past", "previous", "all my"
- Examples: "When was...", "Show me...", "What did I...", "How many...", "My last..."

**LOGGING KEYWORDS (use log_health_event):**
If the user's message contains these words, they are LOGGING:
- "I had", "I slept", "I did", "I ran", "log this", "today I", "yesterday I", "last night I"
- Must include specific details (duration, intensity, date)

**LOGGING (use log_health_event):**
- "I slept 8 hours last night" → log_health_event (date: ${todayDate}, category: sleep, duration_minutes: 480)
- "Had a migraine today, intensity 7" → log_health_event (date: ${todayDate}, category: migraine, intensity: 7)
- "Ran 5 miles this morning" → log_health_event (date: ${todayDate}, category: run, notes: "5 miles")
- "Did yard work for 2 hours yesterday" → calculate yesterday's date, log_health_event (category: yardwork, duration_minutes: 120)

**QUERYING (use get_health_events):**
- "When was my last migraine?" → get_health_events (category: migraine, limit: 1) - sort results by date descending
- "Show me my sleep logs from last week" → get_health_events (from: last_week_start, to: ${todayDate}, category: sleep)
- "How many migraines did I have this month?" → get_health_events (from: month_start, to: ${todayDate}, category: migraine)
- "What health events did I log yesterday?" → get_health_events (date: yesterday)
- "Show all my runs" → get_health_events (category: run)

When querying, analyze the results and provide a helpful summary. For "when was last X" queries, return the most recent event's date.

Always be supportive and encourage healthy habits!`;
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
        console.log(`[Health Agent] Calling MCP tool: ${functionName}`, functionArgs);
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
        console.log(`[Health Agent] Calling MCP tool: ${functionName}`, functionArgs);
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
