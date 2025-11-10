import express from "express";
import { ensureSchemaAndSeed } from "./seed.js";
import { router } from "./routes/index.js";
import { USE_OLLAMA, OLLAMA_MODEL, OLLAMA_URL, OPENAI_API_KEY, PORT } from "./config.js";
import { initializeCronJobs } from "./services/cron.js";

ensureSchemaAndSeed();
initializeCronJobs();

const app = express();
app.use(express.json());
app.use(router);

app.listen(PORT, () => {
  const configSummary = {
    llm: USE_OLLAMA ? "ollama" : (OPENAI_API_KEY ? "openai" : "none"),
    ollama: USE_OLLAMA ? { model: OLLAMA_MODEL, url: OLLAMA_URL } : null,
    openai: OPENAI_API_KEY && !USE_OLLAMA? { enabled: true } : { enabled: false },
    port: PORT
  };

  console.log(`Workout MVP API running at: http://localhost:${PORT}`);
  console.log("LLM Configuration:", JSON.stringify(configSummary, null, 2));
});
