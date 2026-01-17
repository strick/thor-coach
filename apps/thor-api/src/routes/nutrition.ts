import express from "express";
import * as nutritionController from "../controllers/nutritionController.js";

export const nutritionRoutes = express.Router();

// Log food from natural language
nutritionRoutes.post("/nutrition/log", nutritionController.logFood);

// Parse food text
nutritionRoutes.post("/nutrition/parse", nutritionController.parseFood);

// Get daily nutrition summary (legacy)
nutritionRoutes.get("/nutrition/today", nutritionController.getDailyNutrition);

// Get nutrition summary for date range
nutritionRoutes.get("/nutrition/summary", nutritionController.getNutritionSummary);

// Get nutrition goals
nutritionRoutes.get("/nutrition/goals", nutritionController.getGoals);

// Set/update nutrition goals
nutritionRoutes.post("/nutrition/goals", nutritionController.updateGoals);

// New structured meal endpoints
nutritionRoutes.get("/nutrition/day", nutritionController.getDayNutrition);
nutritionRoutes.get("/nutrition/day/totals", nutritionController.getDayTotals);
nutritionRoutes.post("/nutrition/meal", nutritionController.addMeal);
nutritionRoutes.post("/nutrition/item", nutritionController.addItem);
nutritionRoutes.put("/nutrition/item", nutritionController.updateItem);
nutritionRoutes.delete("/nutrition/item", nutritionController.deleteItem);
nutritionRoutes.delete("/nutrition/meal", nutritionController.deleteMeal);
