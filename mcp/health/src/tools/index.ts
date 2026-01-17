/**
 * Tool definitions index - combines all domain tools
 */

export type { ToolDefinition } from './types.js';
export { HEALTH_TOOLS } from './health-tools.js';
export { WORKOUT_TOOLS } from './workout-tools.js';
export { NUTRITION_TOOLS } from './nutrition-tools.js';

// Combined export of all tools
import { HEALTH_TOOLS } from './health-tools.js';
import { WORKOUT_TOOLS } from './workout-tools.js';
import { NUTRITION_TOOLS } from './nutrition-tools.js';

export const TOOL_DEFINITIONS = [
  ...HEALTH_TOOLS,
  ...WORKOUT_TOOLS,
  ...NUTRITION_TOOLS,
];
