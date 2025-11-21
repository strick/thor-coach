import { ThorAgentClient, HealthAgentClient } from '../clients/thorApiClient.js';
import { routeQuery } from './router.js';
import { parseWorkout, parseMeal, parseHealthEvent } from './parsers.js';
import type { MetaRunnerRequest, MetaRunnerResponse } from '@thor/shared';

export class MetaRunnerService {
  private thorAgentClient: ThorAgentClient;
  private healthAgentClient: HealthAgentClient;
  private sessionId?: string;

  constructor() {
    this.thorAgentClient = new ThorAgentClient();
    this.healthAgentClient = new HealthAgentClient();
  }

  /**
   * Main entry point: handle a natural language health query
   */
  async chat(request: MetaRunnerRequest): Promise<MetaRunnerResponse> {
    const { text, mode, periodDays } = request;

    try {
      console.log(`[MetaRunner] Processing text: "${text}", mode: ${mode}`);
      // Step 1: Route the query
      const routing = await routeQuery(text, mode);
      console.log(`[MetaRunner] Routing result:`, routing);

      // Step 2: Execute based on intent using agent
      let actions: string[] = [];
      let rawToolResults: any = null;
      let message = '';

      switch (routing.target) {
        case 'WORKOUT':
          ({ actions, rawToolResults, message } = await this.handleWorkout(routing.cleaned_text));
          break;

        case 'NUTRITION':
          ({ actions, rawToolResults, message } = await this.handleNutrition(routing.cleaned_text));
          break;

        case 'HEALTH_LOG':
          ({ actions, rawToolResults, message } = await this.handleHealthLog(routing.cleaned_text));
          break;

        case 'OVERVIEW':
          ({ actions, rawToolResults, message } = await this.handleOverview(periodDays || 14));
          break;

        default:
          throw new Error(`Unknown target: ${routing.target}`);
      }

      return {
        agent: this.targetToAgent(routing.target),
        intent: routing.intent,
        actions,
        message,
        rawToolResults
      };
    } catch (error) {
      console.error('MetaRunner error:', error);
      throw error;
    }
  }

  /**
   * Handle WORKOUT domain - send to thor-agent which uses log_workout MCP tool
   */
  private async handleWorkout(text: string): Promise<{
    actions: string[];
    message: string;
    rawToolResults?: any;
  }> {
    try {
      const result = await this.thorAgentClient.logWorkout(text);

      const actions = ['delegated to thor-agent', 'used log_workout MCP tool'];
      const message = result.reply || 'Logged workout via agent.';

      return {
        actions,
        message,
        rawToolResults: result
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('logWorkout error:', { error, errorMsg });
      throw new Error(`Failed to log workout via agent: ${errorMsg}`);
    }
  }

  /**
   * Handle NUTRITION domain - send to thor-agent which will use log_meal MCP tool
   */
  private async handleNutrition(text: string): Promise<{
    actions: string[];
    message: string;
    rawToolResults?: any;
  }> {
    try {
      const result = await this.thorAgentClient.logMeal(text);

      const actions = ['delegated to thor-agent', 'used log_meal MCP tool'];
      const message = result.reply || 'Logged meal via agent.';

      return {
        actions,
        message,
        rawToolResults: result
      };
    } catch (error) {
      throw new Error(`Failed to log meal via agent: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle HEALTH_LOG domain - send to health-agent which will use log_health_event MCP tool
   */
  private async handleHealthLog(text: string): Promise<{
    actions: string[];
    message: string;
    rawToolResults?: any;
  }> {
    try {
      const result = await this.healthAgentClient.logHealthEvent(text);

      const actions = ['delegated to health-agent', 'used log_health_event MCP tool'];
      const message = result.reply || 'Logged health event via agent.';

      return {
        actions,
        message,
        rawToolResults: result
      };
    } catch (error) {
      throw new Error(`Failed to log health event via health-agent: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle OVERVIEW domain - send to thor-agent which uses get_progress_summary MCP tool
   */
  private async handleOverview(periodDays: number): Promise<{
    actions: string[];
    message: string;
    rawToolResults?: any;
  }> {
    try {
      const result = await this.thorAgentClient.getProgressSummary(periodDays);

      const actions = ['delegated to thor-agent', 'used get_progress_summary MCP tool'];
      const message = result.reply || 'Retrieved health overview via agent.';

      return {
        actions,
        message,
        rawToolResults: result
      };
    } catch (error) {
      throw new Error(`Failed to get overview via thor-agent: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Convert target to agent name
   */
  private targetToAgent(target: string): 'thor' | 'nutrition' | 'health' | 'overview' {
    const map: Record<string, 'thor' | 'nutrition' | 'health' | 'overview'> = {
      'WORKOUT': 'thor',
      'NUTRITION': 'nutrition',
      'HEALTH_LOG': 'health',
      'OVERVIEW': 'overview'
    };
    return map[target] as 'thor' | 'nutrition' | 'health' | 'overview';
  }
}
