import { USE_OLLAMA, OLLAMA_URL, OLLAMA_MODEL, OPENAI_API_KEY, OPENAI_MODEL } from "../config.js";

/**
 * LLM Usage Types
 */
export type LLMUsageKind =
  | "agent_conversation"       // Complex agent operations (logging workouts, complex queries)
  | "agent_simple_queries"     // Simple GET operations (get_plan, get_workouts, format results)
  | "workout_parsing"          // Workout text parsing
  | "weekly_summary"           // Weekly summary generation
  | "nutrition_parsing";       // Nutrition text parsing

/**
 * LLM Provider Configuration
 */
export interface LLMProviderConfig {
  provider: "ollama" | "openai";
  model: string;
  // Ollama-specific
  url?: string;
  // OpenAI-specific
  apiKey?: string;
}

/**
 * Runtime LLM Configuration
 */
export interface RuntimeLLMConfig {
  agent_conversation: LLMProviderConfig;
  agent_simple_queries: LLMProviderConfig;
  workout_parsing: LLMProviderConfig;
  weekly_summary: LLMProviderConfig;
  nutrition_parsing: LLMProviderConfig;
}

/**
 * In-memory LLM configuration store
 */
let runtimeConfig: RuntimeLLMConfig;

/**
 * Initialize runtime config from environment variables
 */
function initializeFromEnv(): RuntimeLLMConfig {
  const defaultConfig: LLMProviderConfig = USE_OLLAMA
    ? {
        provider: "ollama",
        model: OLLAMA_MODEL,
        url: OLLAMA_URL
      }
    : {
        provider: "openai",
        model: OPENAI_MODEL,
        apiKey: OPENAI_API_KEY
      };

  // Simple queries use a faster, smaller model
  const simpleQueryConfig: LLMProviderConfig = USE_OLLAMA
    ? {
        provider: "ollama",
        model: "llama3.2:latest",  // Smaller, faster model (3.2B params vs 8B)
        url: OLLAMA_URL
      }
    : {
        provider: "openai",
        model: "gpt-3.5-turbo",  // Faster and cheaper than gpt-4
        apiKey: OPENAI_API_KEY
      };

  // Initialize all usage kinds
  return {
    agent_conversation: { ...defaultConfig },
    agent_simple_queries: { ...simpleQueryConfig },
    workout_parsing: { ...defaultConfig },
    weekly_summary: { ...defaultConfig },
    nutrition_parsing: { ...defaultConfig }
  };
}

/**
 * Get the current runtime LLM configuration
 */
export function getRuntimeLLMConfig(): RuntimeLLMConfig {
  if (!runtimeConfig) {
    runtimeConfig = initializeFromEnv();
  }
  return runtimeConfig;
}

/**
 * Get LLM config for a specific usage kind
 */
export function getLLMConfigForUsage(usageKind: LLMUsageKind): LLMProviderConfig {
  const config = getRuntimeLLMConfig();
  return config[usageKind];
}

/**
 * Update runtime LLM configuration (partial update)
 */
export function updateRuntimeLLMConfig(updates: Partial<RuntimeLLMConfig>): RuntimeLLMConfig {
  if (!runtimeConfig) {
    runtimeConfig = initializeFromEnv();
  }

  // Merge updates with existing config
  for (const [key, value] of Object.entries(updates)) {
    if (value && key in runtimeConfig) {
      runtimeConfig[key as LLMUsageKind] = value as LLMProviderConfig;
    }
  }

  return runtimeConfig;
}

/**
 * Update LLM config for a specific usage kind
 */
export function updateLLMConfigForUsage(
  usageKind: LLMUsageKind,
  config: LLMProviderConfig
): RuntimeLLMConfig {
  if (!runtimeConfig) {
    runtimeConfig = initializeFromEnv();
  }

  runtimeConfig[usageKind] = config;
  return runtimeConfig;
}

/**
 * Reset runtime config to environment defaults
 */
export function resetLLMConfig(): RuntimeLLMConfig {
  runtimeConfig = initializeFromEnv();
  return runtimeConfig;
}

/**
 * Validate LLM provider config
 */
export function validateLLMConfig(config: LLMProviderConfig): { valid: boolean; error?: string } {
  if (config.provider === "ollama") {
    if (!config.url) {
      return { valid: false, error: "Ollama requires 'url' field" };
    }
    if (!config.model) {
      return { valid: false, error: "Ollama requires 'model' field" };
    }
  } else if (config.provider === "openai") {
    if (!config.apiKey) {
      return { valid: false, error: "OpenAI requires 'apiKey' field" };
    }
    if (!config.model) {
      return { valid: false, error: "OpenAI requires 'model' field" };
    }
  } else {
    return { valid: false, error: "Invalid provider. Must be 'ollama' or 'openai'" };
  }

  return { valid: true };
}
