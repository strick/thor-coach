/**
 * HTTP Client for communicating with specialized agents (thor-agent, health-agent)
 */

import type { AgentClient } from './router.js';

export class HTTPAgentClient implements AgentClient {
  private agentUrl: string;
  private timeout: number;

  constructor(agentUrl: string, timeout: number = 90000) {
    this.agentUrl = agentUrl.endsWith('/') ? agentUrl.slice(0, -1) : agentUrl;
    this.timeout = timeout;
  }

  /**
   * Send a message to the agent
   */
  async sendMessage(message: string, sessionId?: string): Promise<{ reply: string; sessionId: string }> {
    const url = `${this.agentUrl}/chat`;

    const payload: any = {
      message,
      reset: false
    };

    if (sessionId) {
      payload.sessionId = sessionId;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Agent returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.json() as any;

      return {
        reply: data.reply || data.message || 'No response',
        sessionId: data.sessionId || sessionId || `session-${Date.now()}`
      };

    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error(`Agent request timed out after ${this.timeout}ms`);
        }
        throw new Error(`Failed to communicate with agent: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Health check for the agent
   */
  async healthCheck(): Promise<boolean> {
    const url = `${this.agentUrl}/health`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json() as any;
      return data.status === 'ok' && (data.mcpReady === true || data.mcpReady === undefined);

    } catch (error) {
      console.error(`Health check failed for ${this.agentUrl}:`, error);
      return false;
    }
  }
}
