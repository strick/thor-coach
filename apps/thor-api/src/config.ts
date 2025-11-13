import 'dotenv/config';
import { THOR_PLAN_ID } from "@thor/shared";

export const PORT = Number(process.env.PORT || 3000);
export { THOR_PLAN_ID };

export const USE_LLM = Boolean(process.env.OPENAI_API_KEY) || process.env.USE_OLLAMA === "true";

// LLM choices
export const USE_OLLAMA = process.env.USE_OLLAMA === "true";
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
