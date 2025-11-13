import express from "express";
import * as systemController from "../controllers/systemController.js";

export const systemRoutes = express.Router();

// Health check endpoint
systemRoutes.get("/health", systemController.healthCheck);

// Get runtime configuration
systemRoutes.get("/config", systemController.getConfig);

// Get available Ollama models
systemRoutes.get("/ollama/models", systemController.getOllamaModels);
