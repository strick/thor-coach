import axios from 'axios';

const THOR_AGENT_URL = process.env.THOR_AGENT_URL || 'http://thor-agent:3002';

/**
 * HTTP client for communicating with thor-agent
 * Uses agent-to-agent communication pattern
 * Meta-runner → thor-agent → thor-mcp → thor-api
 */
export class ThorAgentClient {
  private baseURL = THOR_AGENT_URL;
  private client = axios.create({ baseURL: this.baseURL });

  /**
   * Send a message to the thor-agent
   * Agent will use MCP tools to execute the request
   */
  async sendMessage(message: string, sessionId?: string) {
    try {
      const response = await this.client.post('/chat', {
        message,
        sessionId
      });
      return response.data;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot reach thor-agent at ${this.baseURL}: Connection refused. Make sure thor-agent is running.`);
      }
      if (error.response) {
        throw new Error(`Thor-agent error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
      }
      throw new Error(`Failed to call thor-agent: ${error.message || String(error)}`);
    }
  }

  /**
   * Log a workout via agent (uses log_workout MCP tool)
   */
  async logWorkout(text: string) {
    const message = `Log this workout: "${text}"`;
    return this.sendMessage(message);
  }

  /**
   * Log a meal via agent (uses log_meal MCP tool when available)
   */
  async logMeal(description: string, details?: any) {
    const message = `Log this meal: "${description}"${details ? ` ${JSON.stringify(details)}` : ''}`;
    return this.sendMessage(message);
  }

  /**
   * Log a health event via agent (uses log_health_event MCP tool when available)
   */
  async logHealthEvent(description: string, details?: any) {
    const message = `Log this health event: "${description}"${details ? ` ${JSON.stringify(details)}` : ''}`;
    return this.sendMessage(message);
  }

  /**
   * Get progress summary via agent (uses get_progress_summary MCP tool)
   */
  async getProgressSummary(periodDays?: number) {
    const message = `Get my workout progress summary for the last ${periodDays || 14} days`;
    return this.sendMessage(message);
  }

  /**
   * Get health summary via agent (uses get_health_summary MCP tool when available)
   */
  async getHealthSummary(periodDays?: number) {
    const message = `Get my health summary for the last ${periodDays || 14} days`;
    return this.sendMessage(message);
  }
}
