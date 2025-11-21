/**
 * LLM response mocks for testing
 */

import { vi } from 'vitest';

/**
 * Mock Ollama API response
 */
export function mockOllamaResponse(content: string, toolCalls?: any[]) {
  return {
    message: {
      role: 'assistant',
      content,
      tool_calls: toolCalls || [],
    },
  };
}

/**
 * Mock Ollama workout parsing response
 */
export function mockOllamaWorkoutParse(exercises: any[]) {
  return mockOllamaResponse(JSON.stringify({ exercises }));
}

/**
 * Mock OpenAI API response
 */
export function mockOpenAIResponse(content: string, toolCalls?: any[]) {
  return {
    choices: [
      {
        message: {
          role: 'assistant',
          content,
          tool_calls: toolCalls,
        },
      },
    ],
  };
}

/**
 * Mock OpenAI workout parsing response
 */
export function mockOpenAIWorkoutParse(exercises: any[]) {
  return mockOpenAIResponse(JSON.stringify({ exercises }));
}

/**
 * Mock fetch for Ollama
 */
export function mockOllamaFetch(responseData: any) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => responseData,
  } as Response);
}

/**
 * Mock OpenAI client
 */
export function mockOpenAIClient(responseData: any) {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(responseData),
      },
    },
  };
}

/**
 * Clear all LLM mocks
 */
export function clearLLMMocks() {
  vi.restoreAllMocks();
}
