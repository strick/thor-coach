import express from "express";
import * as testController from "../controllers/testController.js";

export const testRoutes = express.Router();

// Get test status
testRoutes.get("/tests/status", testController.getTestStatus);

// Run tests (may take a while)
testRoutes.post("/tests/run", testController.runTests);
