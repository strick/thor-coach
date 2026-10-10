export const PORT = Number(process.env.PORT || 3100);
export const HOST = process.env.HOST || "0.0.0.0";

export const THOR_PLAN_ID = "thor";
export const DEFAULT_USER_ID = "user-main";
export const TIMEZONE = process.env.TZ || "America/New_York";

export const LLM_PROVIDER = process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "ollama");
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
// Advice jobs (summaries, chat, guides, lab reading) default to a stronger model;
// parsing jobs stay on OPENAI_MODEL. Both are overridable per job in Settings.
export const OPENAI_ADVICE_MODEL = process.env.OPENAI_ADVICE_MODEL || "gpt-5-mini";
// Tests and proxies only — the real API is the default.
export const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";
export const OLLAMA_ADVICE_MODEL = process.env.OLLAMA_ADVICE_MODEL || OLLAMA_MODEL;

export const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID || "";
export const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || "";
export const STRAVA_REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN || "";

// --- Microsoft-account sign-in (src/auth.js; active when both MS_* are set) ---
export const MS_CLIENT_ID = process.env.MS_CLIENT_ID || "";
export const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET || "";
export const MS_TENANT = process.env.MS_TENANT || "consumers"; // personal Microsoft accounts
export const ALLOWED_EMAILS = (process.env.THOR_ALLOWED_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
export const BASE_URL = (process.env.THOR_BASE_URL || "").replace(/\/+$/, "");
export const SESSION_DAYS = Number(process.env.THOR_SESSION_DAYS || 7);

export const todayISO = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Monday=1 .. Sunday=7 (matches the plan's day_of_week convention)
export const getDOW = (d = new Date()) => (d.getDay() === 0 ? 7 : d.getDay());
