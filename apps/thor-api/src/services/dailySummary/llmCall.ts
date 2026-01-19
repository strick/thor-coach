/**
 * Daily Summary LLM Call Wrapper
 * Handles communication with LLM provider
 */

import { getLLMConfigForUsage } from "../llm-config.js";
import { OPENAI_API_KEY, USE_OLLAMA, OLLAMA_URL } from "../../config.js";

/**
 * Call LLM with daily summary prompt
 * Returns raw markdown response from LLM
 */
export async function callLLMForDailySummary(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const config = getLLMConfigForUsage("daily_summary");

  if (config.provider === "openai") {
    return callOpenAI(systemPrompt, userPrompt, config.model, config.apiKey!);
  } else {
    return callOllama(systemPrompt, userPrompt, config.model, config.url!);
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  apiKey: string
): Promise<string> {
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.25,
          max_tokens: 1500,
          top_p: 0.9
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          `OpenAI API error: ${response.status} - ${errorData.error?.message || "Unknown error"}`
        );
      }

      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      return data.choices[0].message.content;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        console.warn(
          `Daily summary LLM call failed (attempt ${attempt + 1}/${maxRetries}), retrying...`,
          lastError.message
        );
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  throw new Error(`Failed to generate daily summary after ${maxRetries} attempts: ${lastError?.message}`);
}

/**
 * Call Ollama API
 */
async function callOllama(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  url: string
): Promise<string> {
  const maxRetries = 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(`${url}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          stream: false,
          options: {
            temperature: 0.25,
            top_p: 0.9
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json() as { message: { content: string } };
      return data.message.content;
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        console.warn(
          `Daily summary LLM call failed (attempt ${attempt + 1}/${maxRetries}), retrying...`,
          lastError.message
        );
        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  throw new Error(`Failed to generate daily summary after ${maxRetries} attempts: ${lastError?.message}`);
}
