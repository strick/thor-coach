// Unified LLM client. Both OpenAI and Ollama are reached through the
// OpenAI-compatible chat completions API, so one code path serves both.
import { LLM_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, OLLAMA_URL, OLLAMA_MODEL } from "./config.js";
import { HttpError } from "./http.js";

// Per-usage runtime overrides, adjustable from the Settings page.
export const USAGE_KINDS = ["chat", "workout_parsing", "nutrition_parsing", "daily_summary", "weekly_summary"];

const defaults = () => ({
  provider: LLM_PROVIDER,
  model: LLM_PROVIDER === "openai" ? OPENAI_MODEL : OLLAMA_MODEL,
});

let runtimeConfig = Object.fromEntries(USAGE_KINDS.map((k) => [k, defaults()]));

export function getLLMConfig() {
  return runtimeConfig;
}

export function updateLLMConfig(usage, { provider, model }) {
  if (!USAGE_KINDS.includes(usage)) throw new HttpError(400, `Unknown usage kind: ${usage}`);
  if (!["openai", "ollama"].includes(provider)) throw new HttpError(400, "provider must be 'openai' or 'ollama'");
  if (provider === "openai" && !OPENAI_API_KEY) throw new HttpError(400, "OPENAI_API_KEY is not configured");
  runtimeConfig[usage] = { provider, model: model || (provider === "openai" ? OPENAI_MODEL : OLLAMA_MODEL) };
  return runtimeConfig;
}

export function resetLLMConfig() {
  runtimeConfig = Object.fromEntries(USAGE_KINDS.map((k) => [k, defaults()]));
  return runtimeConfig;
}

function endpointFor(provider) {
  if (provider === "openai") {
    if (!OPENAI_API_KEY) throw new HttpError(400, "OPENAI_API_KEY is not configured");
    return { url: "https://api.openai.com/v1/chat/completions", headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } };
  }
  return { url: `${OLLAMA_URL}/v1/chat/completions`, headers: {} };
}

/**
 * Low-level chat completion. Accepts OpenAI-style options (messages, tools,
 * response_format, temperature) and returns the first choice message.
 */
export async function chatCompletion(usage, options) {
  const cfg = runtimeConfig[usage] || defaults();
  const { url, headers } = endpointFor(cfg.provider);

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ model: cfg.model, temperature: 0, ...options }),
  });
  const raw = await resp.text();
  if (!resp.ok) throw new HttpError(502, `LLM error (${cfg.provider} ${resp.status}): ${raw.slice(0, 400)}`);

  const data = JSON.parse(raw);
  const message = data.choices?.[0]?.message;
  if (!message) throw new HttpError(502, `LLM returned no message (${cfg.provider})`);
  return { message, provider: cfg.provider, model: cfg.model };
}

/** Chat completion that must return a JSON object. */
export async function chatJSON(usage, system, user) {
  const { message, provider, model } = await chatCompletion(usage, {
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  let content = (message.content || "{}").trim();
  // Some models wrap JSON in markdown fences despite instructions.
  content = content.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    return { data: JSON.parse(content), provider, model };
  } catch {
    throw new HttpError(502, `LLM returned invalid JSON: ${content.slice(0, 200)}`);
  }
}

export async function listOllamaModels() {
  try {
    const resp = await fetch(`${OLLAMA_URL}/api/tags`);
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}
