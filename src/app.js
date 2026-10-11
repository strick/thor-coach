// HTTP app wiring (router + auth + API routes), separate from server.js so
// tests can build the app without the boot-time backup or a fixed port.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./http.js";
import { registerRoutes } from "./routes.js";
import * as auth from "./auth.js";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export function createThorApp({ pin = process.env.THOR_PIN || "" } = {}) {
  const app = createApp({ staticDir: path.join(root, "public"), pin, auth });
  auth.registerAuthRoutes(app);
  registerRoutes(app);
  return app;
}

export { auth };
