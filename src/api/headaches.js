import * as headaches from "../services/headaches.js";
import * as checkins from "../services/checkins.js";

export function register(app) {
  // Specific paths first — the router is first-match-wins and /:id would catch them.
  app.get("/api/headaches/options", () => headaches.headacheOptions());
  app.get("/api/headaches/ongoing", () => ({ ongoing: headaches.getOngoing() }));
  app.get("/api/headaches", ({ query }) => headaches.listHeadaches({ start: query.start, end: query.end, limit: query.limit }));
  app.post("/api/headaches", ({ body }) => headaches.createHeadache(body));
  app.get("/api/headaches/:id", ({ params }) => headaches.getHeadache(params.id));
  app.patch("/api/headaches/:id", ({ params, body }) => headaches.updateHeadache(params.id, body));
  app.delete("/api/headaches/:id", ({ params }) => headaches.deleteHeadache(params.id));
  app.get("/api/headache-insights", ({ query }) => headaches.getHeadacheInsights({ days: query.days, end: query.end }));

  app.get("/api/checkins", ({ query }) => checkins.listCheckins(query.start, query.end));
  app.get("/api/checkins/:date", ({ params }) => checkins.getCheckin(params.date));
  app.put("/api/checkins", ({ body }) => {
    const { date, ...fields } = body;
    return checkins.upsertCheckin(date, fields);
  });
}
