import express from "express";

type Request = express.Request;
type Response = express.Response;
import { db } from "../db.js";
import { USE_OLLAMA, OLLAMA_MODEL, OLLAMA_URL, OPENAI_API_KEY } from "../config.js";
import { asyncHandler, ApiError } from "../middleware/errorHandler.js";
import {
  getRuntimeLLMConfig,
  updateRuntimeLLMConfig,
  validateLLMConfig,
  type RuntimeLLMConfig
} from "../services/llm-config.js";

export const healthCheck = asyncHandler(async (req: Request, res: Response) => {
  // Cheap DB ping
  db.prepare("select 1").get();
  res.json({ status: "ok" });
});

export const getConfig = asyncHandler(async (req: Request, res: Response) => {
  res.json({
    llm: USE_OLLAMA ? "ollama" : OPENAI_API_KEY ? "openai" : "none",
    ollama: USE_OLLAMA ? { model: OLLAMA_MODEL, url: OLLAMA_URL } : null,
    openai: OPENAI_API_KEY ? { enabled: true } : null,
    port: req.app.get("port") ?? undefined,
  });
});

export const getOllamaModels = asyncHandler(async (req: Request, res: Response) => {
  const response = await fetch(`${OLLAMA_URL}/api/tags`);

  if (!response.ok) {
    throw new ApiError(500, "Failed to fetch Ollama models");
  }

  const data = await response.json();
  res.json({ models: data.models || [] });
});

export const getLLMConfig = asyncHandler(async (req: Request, res: Response) => {
  const config = getRuntimeLLMConfig();
  res.json(config);
});

export const updateLLMConfig = asyncHandler(async (req: Request, res: Response) => {
  const updates = req.body as Partial<RuntimeLLMConfig>;

  // Validate each provided config
  for (const [usageKind, config] of Object.entries(updates)) {
    if (config) {
      const validation = validateLLMConfig(config);
      if (!validation.valid) {
        throw new ApiError(400, `Invalid config for ${usageKind}: ${validation.error}`);
      }
    }
  }

  const updatedConfig = updateRuntimeLLMConfig(updates);
  res.json(updatedConfig);
});
