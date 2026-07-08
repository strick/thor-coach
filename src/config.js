export const PORT = Number(process.env.PORT || 3100);
export const HOST = process.env.HOST || "0.0.0.0";

export const THOR_PLAN_ID = "thor";
export const DEFAULT_USER_ID = "user-main";
export const TIMEZONE = process.env.TZ || "America/New_York";

export const LLM_PROVIDER = process.env.LLM_PROVIDER || (process.env.OPENAI_API_KEY ? "openai" : "ollama");
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
export const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.1:8b";

export const STRAVA_CLIENT_ID = process.env.STRAVA_CLIENT_ID || "";
export const STRAVA_CLIENT_SECRET = process.env.STRAVA_CLIENT_SECRET || "";
export const STRAVA_REFRESH_TOKEN = process.env.STRAVA_REFRESH_TOKEN || "";

export const todayISO = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

// Monday=1 .. Sunday=7 (matches the plan's day_of_week convention)
export const getDOW = (d = new Date()) => (d.getDay() === 0 ? 7 : d.getDay());
