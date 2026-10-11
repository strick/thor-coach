import * as guides from "../services/guides.js";
import * as memory from "../services/memory.js";
import { chat, chatHistory, newThread } from "../services/chat.js";
import { listWeeklySummaries } from "../services/workouts.js";

export function register(app) {
  // --- Guides library (specific paths before /:id) ---
  app.get("/api/guides/suggestions", () => ({ topics: guides.suggestedTopics() }));
  app.get("/api/guides/archive", () => listWeeklySummaries(52)); // pre-health-pal weekly summaries
  app.post("/api/guides/weekly-review", ({ body }) => guides.generateWeeklyReview(body.week_start));
  app.post("/api/guides/deep-dive", ({ body }) => guides.generateDeepDive(body.topic));
  app.get("/api/guides", ({ query }) => guides.listGuides({ kind: query.kind, limit: query.limit, pinned: query.pinned }));
  app.get("/api/guides/:id/context", ({ params }) => guides.getGuideContext(params.id) ?? { none: true });
  app.post("/api/guides/:id/regenerate", ({ params }) => guides.regenerateGuide(params.id));
  app.get("/api/guides/:id", ({ params }) => guides.getGuide(params.id));
  app.patch("/api/guides/:id", ({ params, body }) => guides.updateGuide(params.id, body));
  app.delete("/api/guides/:id", ({ params }) => guides.deleteGuide(params.id));

  // The Workouts page's old "weekly summary" button now makes the weekly health review.
  app.post("/api/weekly-summaries/generate", ({ body }) => guides.generateWeeklyReview(body.week_start));

  // --- Ask Thor ---
  app.get("/api/chat/history", ({ query }) => chatHistory({ limit: query.limit }));
  app.post("/api/chat/new", () => newThread());
  app.post("/api/chat", ({ body }) => chat(body));

  // --- Long-term memory ---
  app.get("/api/memories", () => memory.listMemories());
  app.post("/api/memories", ({ body }) => memory.addMemory(body, { source: "manual" }));
  app.patch("/api/memories/:id", ({ params, body }) => memory.updateMemory(params.id, body));
  app.delete("/api/memories/:id", ({ params }) => memory.deleteMemory(params.id));
}
