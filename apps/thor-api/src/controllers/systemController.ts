import express from "express";

type Request = express.Request;
type Response = express.Response;
import { db } from "../db.js";
import { randomUUID } from "node:crypto";
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

/**
 * GET /api/system/users
 * Get all users
 */
export const getUsers = asyncHandler(async (req: Request, res: Response) => {
  const users = db.prepare(
    `SELECT id, name, email, created_at FROM users ORDER BY name`
  ).all() as any[];

  res.json({
    status: "ok",
    users
  });
});

/**
 * POST /api/system/users
 * Create a new user
 */
export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const { name, email } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new ApiError(400, "Name is required and must be a non-empty string");
  }

  const userId = randomUUID();
  
  db.prepare(
    `INSERT INTO users (id, name, email) VALUES (?, ?, ?)`
  ).run(userId, name.trim(), email || null);

  const user = db.prepare(
    `SELECT id, name, email, created_at FROM users WHERE id = ?`
  ).get(userId);

  res.json({
    status: "created",
    user
  });
});

/**
 * DELETE /api/system/users/:id
 * Delete a user and all their data
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // Prevent deletion of main user
  if (id === 'user-main') {
    throw new ApiError(400, "Cannot delete the main user");
  }

  // Start transaction
  const deleteStmt = db.transaction(() => {
    // Delete user's nutrition data
    db.prepare(`DELETE FROM nutrition_meal_items WHERE user_id = ?`).run(id);
    db.prepare(`DELETE FROM nutrition_meal_totals WHERE meal_id IN (SELECT id FROM nutrition_meals WHERE user_id = ?)`).run(id);
    db.prepare(`DELETE FROM nutrition_meals WHERE user_id = ?`).run(id);
    db.prepare(`DELETE FROM nutrition_day_totals WHERE nutrition_day_id IN (SELECT id FROM nutrition_days WHERE user_id = ?)`).run(id);
    db.prepare(`DELETE FROM nutrition_day_targets WHERE nutrition_day_id IN (SELECT id FROM nutrition_days WHERE user_id = ?)`).run(id);
    db.prepare(`DELETE FROM nutrition_days WHERE user_id = ?`).run(id);
    db.prepare(`DELETE FROM nutrition_goals WHERE user_id = ?`).run(id);
    db.prepare(`DELETE FROM nutrition_templates WHERE user_id = ?`).run(id);
    db.prepare(`DELETE FROM food_logs WHERE user_id = ?`).run(id);
    
    // Delete the user
    const result = db.prepare(`DELETE FROM users WHERE id = ?`).run(id);
    return result;
  });

  const result = deleteStmt();

  if (!result || result.changes === 0) {
    throw new ApiError(404, "User not found");
  }

  res.json({
    status: "deleted",
    success: true
  });
});
