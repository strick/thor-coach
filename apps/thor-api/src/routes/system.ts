import express from "express";
import * as systemController from "../controllers/systemController.js";

export const systemRoutes = express.Router();

// Health check endpoint
systemRoutes.get("/health", systemController.healthCheck);

// Get runtime configuration
systemRoutes.get("/config", systemController.getConfig);

// Get available Ollama models
systemRoutes.get("/ollama/models", systemController.getOllamaModels);

// LLM config endpoints
systemRoutes.get("/config/llm", systemController.getLLMConfig);
systemRoutes.post("/config/llm", systemController.updateLLMConfig);
// User management endpoints
systemRoutes.get("/users", systemController.getUsers);
systemRoutes.post("/users", systemController.createUser);
systemRoutes.patch("/users/:id", systemController.updateUser);
systemRoutes.delete("/users/:id", systemController.deleteUser);