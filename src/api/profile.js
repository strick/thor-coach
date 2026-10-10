import * as profile from "../services/profile.js";

export function register(app) {
  app.get("/api/profile", () => ({ ...profile.getProfile(), options: { diet_styles: profile.DIET_STYLES, sexes: profile.SEXES } }));
  app.put("/api/profile", ({ body }) => profile.updateProfile(body));

  app.get("/api/medications", ({ query }) => profile.listMedications({ active: query.active }));
  app.post("/api/medications", ({ body }) => profile.addMedication(body));
  app.patch("/api/medications/:id", ({ params, body }) => profile.updateMedication(params.id, body));
  app.delete("/api/medications/:id", ({ params }) => profile.deleteMedication(params.id));
}
