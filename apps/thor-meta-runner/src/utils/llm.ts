import { USE_OLLAMA, OLLAMA_URL, OLLAMA_MODEL, OPENAI_API_KEY, OPENAI_MODEL } from '../config.js';
import { OpenAI } from 'openai';

/**
 * Abstraction for LLM calls (Ollama or OpenAI)
 * Returns JSON parsed response for structured data extraction
 */

let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  return openaiClient;
}

/**
 * Call LLM and parse JSON response
 */
export async function callLLM(systemPrompt: string, userMessage: string): Promise<any> {
  if (USE_OLLAMA) {
    return callOllama(systemPrompt, userMessage);
  } else {
    return callOpenAI(systemPrompt, userMessage);
  }
}

/**
 * Call Ollama with local model
 */
async function callOllama(systemPrompt: string, userMessage: string): Promise<any> {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt: `${systemPrompt}\n\n${userMessage}`,
      stream: false,
      format: 'json'
    })
  });

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.statusText}`);
  }

  const data = await response.json();
  const text = data.response || '';

  try {
    return JSON.parse(text);
  } catch {
    console.error('Failed to parse Ollama response as JSON:', text);
    throw new Error('LLM response was not valid JSON');
  }
}

/**
 * Call OpenAI API
 */
async function callOpenAI(systemPrompt: string, userMessage: string): Promise<any> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    response_format: { type: 'json_object' },
    temperature: 0.7
  });

  const text = response.choices[0]?.message?.content || '';

  try {
    return JSON.parse(text);
  } catch {
    console.error('Failed to parse OpenAI response as JSON:', text);
    throw new Error('LLM response was not valid JSON');
  }
}
