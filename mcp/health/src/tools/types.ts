/**
 * Shared types for tool definitions
 */

import { z } from 'zod';
import type { HealthApiClient } from '../api-client.js';

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  zodSchema: Record<string, z.ZodTypeAny>;
  jsonSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (apiClient: HealthApiClient, args: any) => Promise<any>;
}
