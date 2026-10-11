import { ensureSchemaAndSeed, runDailyBackup } from "./src/db.js";
import { initLLMConfig } from "./src/llm.js";
import { createThorApp, auth } from "./src/app.js";
import { PORT, HOST, LLM_PROVIDER } from "./src/config.js";

ensureSchemaAndSeed();
initLLMConfig();

// One consistent snapshot per day, checked hourly (the old stack's external
// backup cron had been silently failing — this one lives in-process).
const tryBackup = () => { try { runDailyBackup(); } catch (err) { console.error("[backup]", err); } };
tryBackup();
setInterval(tryBackup, 60 * 60 * 1000).unref();

const app = createThorApp({ pin: process.env.THOR_PIN || "" });

app.listen(PORT, HOST, () => {
  const gate = auth.enabled ? "Microsoft sign-in" : process.env.THOR_PIN ? "PIN" : "open";
  console.log(`⚡ Thor v2 — http://localhost:${PORT} (LLM: ${LLM_PROVIDER}, auth: ${gate})`);
});
