import 'dotenv/config';

export const PORT = Number(process.env.PORT || 3001);
export const THOR_API_URL = process.env.THOR_API_URL || "http://localhost:3000";
export const THOR_AGENT_URL = process.env.THOR_AGENT_URL || "http://thor-agent:3002";

// LLM configuration (shared with thor-api)
export const USE_OLLAMA = process.env.USE_OLLAMA === "true";
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export const USE_LLM = Boolean(OPENAI_API_KEY) || USE_OLLAMA;

if (!USE_LLM) {
  console.warn("⚠️  Warning: No LLM configured. Meta-runner requires OLLAMA or OPENAI_API_KEY.");
}
