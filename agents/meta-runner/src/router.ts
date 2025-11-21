/**
 * Meta-Runner Router
 * Classifies user queries and routes to appropriate specialized agents
 */

import OpenAI from 'openai';

export type IntentCategory = 'WORKOUT' | 'HEALTH' | 'GENERAL';

export interface ClassificationResult {
  category: IntentCategory;
  confidence: number;
  reasoning: string;
}

export interface AgentClient {
  sendMessage(message: string, sessionId?: string): Promise<{ reply: string; sessionId: string }>;
  healthCheck(): Promise<boolean>;
}

export class MetaRunnerRouter {
  private openai: OpenAI | null = null;
  private useOllama: boolean;
  private ollamaUrl: string;
  private ollamaModel: string;
  private thorAgent: AgentClient;
  private healthAgent: AgentClient;

  constructor(thorAgent: AgentClient, healthAgent: AgentClient) {
    this.useOllama = process.env.USE_OLLAMA === 'true';
    this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
    this.ollamaModel = process.env.OLLAMA_MODEL || 'llama3.1:8b';
    this.thorAgent = thorAgent;
    this.healthAgent = healthAgent;

    if (!this.useOllama && process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  private getClassificationPrompt(): string {
    return `You are an intent classifier for a fitness and health tracking system.

Your job is to classify user queries into one of three categories:

**HEALTH** - ALWAYS classify as HEALTH if the query contains these keywords or topics:
- migraine, headache, pain
- sleep, slept, sleeping, insomnia
- health event, health log, health data
- runs (as in running for health, not workout sets)
- yard work, yardwork
- Examples: "When was my last migraine?", "How did I sleep?", "Show my health logs", "I had a headache"

**WORKOUT** - Queries related to:
- Logging workouts or exercises (bench press, squats, deadlifts, etc.)
- Viewing workout plans or exercises for specific days
- Progress tracking for workouts
- Workout history and exercise history
- Strength training, lifting weights
- Questions like "What exercises should I do today?", "Log my workout", "Show my lifting progress"

**GENERAL** - Queries that are:
- Greetings ("hello", "hi", "how are you")
- General conversation
- Off-topic questions
- Unclear or ambiguous requests that don't fit workout or health categories

**IMPORTANT**: If you see words like "migraine", "headache", "sleep", ALWAYS classify as HEALTH, not WORKOUT.

Respond ONLY with valid JSON in this format:
{
  "category": "WORKOUT" | "HEALTH" | "GENERAL",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of classification"
}`;
  }

  /**
   * Classify a user query into WORKOUT, HEALTH, or GENERAL
   */
  async classifyIntent(userMessage: string): Promise<ClassificationResult> {
    const systemPrompt = this.getClassificationPrompt();
    const userPrompt = `Classify this user message: "${userMessage}"`;

    if (this.useOllama) {
      return this.classifyWithOllama(systemPrompt, userPrompt);
    } else if (this.openai) {
      return this.classifyWithOpenAI(systemPrompt, userPrompt);
    } else {
      throw new Error('No LLM configured. Set USE_OLLAMA=true or provide OPENAI_API_KEY');
    }
  }

  private async classifyWithOpenAI(systemPrompt: string, userPrompt: string): Promise<ClassificationResult> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.0
    });

    const content = response.choices[0].message.content || '{}';
    const result = JSON.parse(content);

    return {
      category: result.category || 'GENERAL',
      confidence: result.confidence || 0.5,
      reasoning: result.reasoning || 'No reasoning provided'
    };
  }

  private async classifyWithOllama(systemPrompt: string, userPrompt: string): Promise<ClassificationResult> {
    const response = await fetch(`${this.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.ollamaModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        format: 'json',
        stream: false,
        options: {
          temperature: 0.0
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json() as { message: { content: string } };
    const result = JSON.parse(data.message.content);

    return {
      category: result.category || 'GENERAL',
      confidence: result.confidence || 0.5,
      reasoning: result.reasoning || 'No reasoning provided'
    };
  }

  /**
   * Route a user message to the appropriate agent
   */
  async route(userMessage: string, sessionId?: string): Promise<{ reply: string; sessionId: string; routedTo: IntentCategory }> {
    // Step 1: Classify intent
    const classification = await this.classifyIntent(userMessage);
    console.log(`[Router] Classified as ${classification.category} (confidence: ${classification.confidence})`);
    console.log(`[Router] Reasoning: ${classification.reasoning}`);

    // Step 2: Route to appropriate agent or handle directly
    let reply: string;
    let newSessionId = sessionId || `session-${Date.now()}`;

    switch (classification.category) {
      case 'WORKOUT':
        console.log('[Router] Routing to thor-agent (workout)');
        const workoutResponse = await this.thorAgent.sendMessage(userMessage, sessionId);
        reply = workoutResponse.reply;
        newSessionId = workoutResponse.sessionId;
        break;

      case 'HEALTH':
        console.log('[Router] Routing to health-agent (health)');
        const healthResponse = await this.healthAgent.sendMessage(userMessage, sessionId);
        reply = healthResponse.reply;
        newSessionId = healthResponse.sessionId;
        break;

      case 'GENERAL':
        console.log('[Router] Handling general query directly');
        reply = this.handleGeneralQuery(userMessage);
        break;

      default:
        console.warn(`[Router] Unknown category: ${classification.category}, defaulting to general`);
        reply = this.handleGeneralQuery(userMessage);
    }

    return {
      reply,
      sessionId: newSessionId,
      routedTo: classification.category
    };
  }

  /**
   * Handle general queries directly without routing to agents
   */
  private handleGeneralQuery(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();

    // Greetings
    if (lowerMessage.match(/^(hi|hello|hey|good morning|good afternoon|good evening)/)) {
      return "Hey there! I'm here to help you track your workouts and health. What would you like to do today?";
    }

    // How are you
    if (lowerMessage.includes('how are you')) {
      return "I'm doing great, thanks for asking! Ready to help you crush your fitness goals. What would you like to log or track today?";
    }

    // Default general response
    return "I can help you with:\n\n" +
           "💪 **Workouts**: Log exercises, view your plan, track progress\n" +
           "❤️  **Health**: Log sleep, migraines, runs, and other health events\n\n" +
           "What would you like to do?";
  }

  /**
   * Health check - verify both agents are accessible
   */
  async healthCheck(): Promise<{ thor: boolean; health: boolean }> {
    const [thor, health] = await Promise.all([
      this.thorAgent.healthCheck().catch(() => false),
      this.healthAgent.healthCheck().catch(() => false)
    ]);

    return { thor, health };
  }
}
