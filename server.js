import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./src/http.js";
import { ensureSchemaAndSeed, runDailyBackup } from "./src/db.js";
import { registerRoutes } from "./src/routes.js";
import { PORT, HOST, LLM_PROVIDER } from "./src/config.js";

const root = path.dirname(fileURLToPath(import.meta.url));

ensureSchemaAndSeed();

// One consistent snapshot per day, checked hourly (the old stack's external
// backup cron had been silently failing — this one lives in-process).
const tryBackup = () => { try { runDailyBackup(); } catch (err) { console.error("[backup]", err); } };
tryBackup();
setInterval(tryBackup, 60 * 60 * 1000).unref();

const app = createApp({ staticDir: path.join(root, "public"), pin: process.env.THOR_PIN || "" });
registerRoutes(app);

app.listen(PORT, HOST, () => {
  console.log(`⚡ Thor v2 — http://localhost:${PORT} (LLM: ${LLM_PROVIDER})`);
});
