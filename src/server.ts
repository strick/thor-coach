import express from "express";
import { PORT } from "./config.js";
import { ensureSchemaAndSeed } from "./seed.js";
import { router } from "./routes/index.js";

ensureSchemaAndSeed();

const app = express();
app.use(express.json());
app.use(router);

app.listen(PORT, () => {
  console.log(`Workout MVP API listening on http://localhost:${PORT}`);
  console.log(`POST /ingest with { "text": "Incline press 4x12 @25; Flys 3x12", "date": "2025-11-08" }`);
});