// Unified LLM client. Both OpenAI and Ollama are reached through the
// OpenAI-compatible chat completions API, so one code path serves both.
import {
  LLM_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, OPENAI_ADVICE_MODEL, OPENAI_BASE_URL,
  OLLAMA_URL, OLLAMA_MODEL, OLLAMA_ADVICE_MODEL,
} from "./config.js";
import { HttpError } from "./http.js";
import { getSetting, setSetting } from "./db.js";

// Every LLM job Thor runs. Advice jobs reason over your health data and get the
// stronger default model; parsing jobs turn free text into rows and stay cheap.
export const USAGE_KINDS = [
  "chat", "daily_summary", "weekly_review", "guides", "lab_extraction",
  "workout_parsing", "nutrition_parsing",
];
export const ADVICE_KINDS = new Set(["chat", "daily_summary", "weekly_review", "guides", "lab_extraction"]);
const LEGACY_KINDS = { weekly_summary: "weekly_review" };

// Per-job request defaults. temperature and reasoning_effort are optional:
// models that reject them get them stripped on the fly (see chatCompletion).
const KIND_DEFAULTS = {
  workout_parsing: { temperature: 0 },
  nutrition_parsing: { temperature: 0 },
  lab_extraction: { temperature: 0, reasoning_effort: "low" },
  chat: { temperature: 0.4, reasoning_effort: "low" },
  daily_summary: { temperature: 0.3, reasoning_effort: "low" },
  weekly_review: { temperature: 0.3, reasoning_effort: "low" },
  guides: { temperature: 0.3, reasoning_effort: "medium" },
};
const OPTIONAL_PARAMS = ["temperature", "reasoning_effort"];
const LLM_TIMEOUT_MS = Number(process.env.THOR_LLM_TIMEOUT_MS || 180_000);
const SETTING_KEY = "llm.routing";

// Per-job overrides from Settings, persisted in app_settings so they survive
// restarts. Only overrides are stored; everything else follows the defaults.
let overrides = null;
const unsupported = new Set(); // `${model}|${param}` the API has rejected
const missingModels = new Set(); // default advice models the account can't use

export function defaultModel(usage, provider = LLM_PROVIDER) {
  const advice = ADVICE_KINDS.has(usage);
  if (provider === "openai") return advice ? OPENAI_ADVICE_MODEL : OPENAI_MODEL;
  return advice ? OLLAMA_ADVICE_MODEL : OLLAMA_MODEL;
}

/** Load persisted routing (call after the schema exists). Drops anything stale or unusable. */
export function initLLMConfig() {
  let saved = {};
  try {
    saved = JSON.parse(getSetting(SETTING_KEY) || "{}") || {};
  } catch {
    saved = {};
  }
  const clean = {};
  for (const [rawKind, cfg] of Object.entries(saved)) {
    const kind = LEGACY_KINDS[rawKind] || rawKind;
    if (!USAGE_KINDS.includes(kind) || !cfg || !["openai", "ollama"].includes(cfg.provider)) continue;
    if (cfg.provider === "openai" && !OPENAI_API_KEY) {
      console.warn(`[llm] ignoring saved OpenAI routing for ${kind}: OPENAI_API_KEY is not set`);
      continue;
    }
    clean[kind] = { provider: cfg.provider, model: cfg.model || null };
  }
  overrides = clean;
  return getLLMConfig();
}

function ensureLoaded() {
  if (!overrides) initLLMConfig();
}

function resolve(usage) {
  ensureLoaded();
  const o = overrides[usage];
  const provider = o?.provider || LLM_PROVIDER;
  let model = o?.model || defaultModel(usage, provider);
  // The default advice model isn't on this account — fall back to the base model.
  if (!o?.model && missingModels.has(model)) model = provider === "openai" ? OPENAI_MODEL : OLLAMA_MODEL;
  return { provider, model, isDefaultModel: !o?.model };
}

function persist() {
  setSetting(SETTING_KEY, JSON.stringify(overrides));
}

export function getLLMConfig() {
  ensureLoaded();
  return Object.fromEntries(
    USAGE_KINDS.map((k) => {
      const { provider, model } = resolve(k);
      return [k, { provider, model, default_model: defaultModel(k, provider), is_default: !overrides[k], advice: ADVICE_KINDS.has(k) }];
    })
  );
}

export function updateLLMConfig(rawUsage, { provider, model }) {
  const usage = LEGACY_KINDS[rawUsage] || rawUsage;
  if (!USAGE_KINDS.includes(usage)) throw new HttpError(400, `Unknown usage kind: ${rawUsage}`);
  if (!["openai", "ollama"].includes(provider)) throw new HttpError(400, "provider must be 'openai' or 'ollama'");
  if (provider === "openai" && !OPENAI_API_KEY) throw new HttpError(400, "OPENAI_API_KEY is not configured");
  ensureLoaded();
  overrides[usage] = { provider, model: model?.trim() || null };
  persist();
  return getLLMConfig();
}

export function resetLLMConfig() {
  overrides = {};
  persist();
  return getLLMConfig();
}

function endpointFor(provider) {
  if (provider === "openai") {
    if (!OPENAI_API_KEY) throw new HttpError(400, "OPENAI_API_KEY is not configured");
    return { url: `${OPENAI_BASE_URL}/chat/completions`, headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } };
  }
  return { url: `${OLLAMA_URL}/v1/chat/completions`, headers: {} };
}

function parseError(raw) {
  try {
    return JSON.parse(raw)?.error || null;
  } catch {
    return null;
  }
}

/** Which optional param (if any) a 400 response says the model doesn't accept. */
function strippableParam(raw, body) {
  const err = parseError(raw);
  if (OPTIONAL_PARAMS.includes(err?.param) && err.param in body) return err.param;
  const msg = String(err?.message || raw);
  if (!/unsupported|unrecognized|not supported|does not support|unknown parameter/i.test(msg)) return null;
  return OPTIONAL_PARAMS.find((p) => p in body && msg.includes(p)) || null;
}

const isModelMissing = (status, raw) => {
  const err = parseError(raw);
  return status === 404 || err?.code === "model_not_found";
};

/**
 * Low-level chat completion. Accepts OpenAI-style options (messages, tools,
 * response_format, temperature) and returns the first choice message.
 */
export async function chatCompletion(usage, options) {
  const cfg = resolve(usage);
  const { url, headers } = endpointFor(cfg.provider);

  const body = { model: cfg.model, ...KIND_DEFAULTS[usage], ...options };
  if (cfg.provider !== "openai") delete body.reasoning_effort;
  for (const p of OPTIONAL_PARAMS) if (unsupported.has(`${body.model}|${p}`)) delete body[p];

  for (let attempt = 0; attempt < 4; attempt += 1) {
    let resp;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      });
    } catch (err) {
      if (err.name === "TimeoutError") {
        throw new HttpError(504, `LLM timed out after ${Math.round(LLM_TIMEOUT_MS / 1000)}s (${cfg.provider} ${body.model})`);
      }
      throw new HttpError(502, `LLM unreachable (${cfg.provider}): ${err.message}`);
    }
    const raw = await resp.text();

    if (resp.ok) {
      const data = JSON.parse(raw);
      const message = data.choices?.[0]?.message;
      if (!message) throw new HttpError(502, `LLM returned no message (${cfg.provider})`);
      return { message, provider: cfg.provider, model: body.model };
    }

    if (resp.status === 400) {
      const p = strippableParam(raw, body);
      if (p) {
        unsupported.add(`${body.model}|${p}`);
        delete body[p];
        continue;
      }
    }
    // A default advice model the account can't use: fall back once, loudly.
    const fallback = cfg.provider === "openai" ? OPENAI_MODEL : OLLAMA_MODEL;
    if (cfg.isDefaultModel && body.model !== fallback && isModelMissing(resp.status, raw)) {
      console.warn(`[llm] model ${body.model} unavailable for ${usage}; falling back to ${fallback}`);
      missingModels.add(body.model);
      body.model = fallback;
      for (const p of OPTIONAL_PARAMS) if (unsupported.has(`${body.model}|${p}`)) delete body[p];
      continue;
    }
    throw new HttpError(502, `LLM error (${cfg.provider} ${body.model} ${resp.status}): ${raw.slice(0, 400)}`);
  }
  throw new HttpError(502, `LLM request kept failing (${cfg.provider} ${body.model})`);
}

/**
 * Chat completion that must return a JSON object. `user` is a string or an
 * array of OpenAI content parts (text, image_url, file) for documents.
 */
export async function chatJSON(usage, system, user, options = {}) {
  if (Array.isArray(user) && user.some((p) => p?.type === "file") && resolve(usage).provider !== "openai") {
    throw new HttpError(
      400,
      "Reading PDFs needs an OpenAI model. Route 'Lab extraction' to OpenAI in Settings, or paste the text instead."
    );
  }
  const { message, provider, model } = await chatCompletion(usage, {
    response_format: { type: "json_object" },
    ...options,
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
    const resp = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(10_000) });
    if (!resp.ok) return [];
    const data = await resp.json();
    return (data.models || []).map((m) => m.name);
  } catch {
    return [];
  }
}

let openaiModelCache = null;
/** Chat-capable model ids on the configured OpenAI account (cached for an hour). */
export async function listOpenAIModels() {
  if (!OPENAI_API_KEY) return [];
  if (openaiModelCache && Date.now() - openaiModelCache.at < 3_600_000) return openaiModelCache.models;
  try {
    const resp = await fetch(`${OPENAI_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) return [];
    const data = await resp.json();
    const models = (data.data || [])
      .map((m) => m.id)
      .filter((id) => /^(gpt-|o\d)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding)/.test(id))
      .sort();
    openaiModelCache = { at: Date.now(), models };
    return models;
  } catch {
    return [];
  }
}
