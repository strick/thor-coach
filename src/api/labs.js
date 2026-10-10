import * as labs from "../services/labs.js";
import * as guides from "../services/guides.js";

export function register(app) {
  app.get("/api/labs/markers", () => labs.markerCatalog());
  app.get("/api/labs/latest", () => labs.latestResults());
  app.get("/api/labs/trends", ({ query }) => labs.trend(query.marker));

  app.get("/api/labs/reports", () => labs.listReports());
  app.post("/api/labs/reports", ({ body }) => labs.createReport(body));
  app.get("/api/labs/reports/:id", ({ params }) => labs.getReport(params.id));
  app.put("/api/labs/reports/:id", ({ params, body }) => labs.saveReview(params.id, body));
  app.delete("/api/labs/reports/:id", ({ params }) => labs.deleteReport(params.id));

  // File upload: the raw file is the request body (no multipart); name in X-Filename.
  app.post(
    "/api/labs/reports/:id/files",
    ({ params, req, body }) => {
      let name = null;
      try {
        name = req.headers["x-filename"] ? decodeURIComponent(req.headers["x-filename"]) : null;
      } catch {}
      return labs.addFile(params.id, body, name);
    },
    { raw: true, maxBytes: labs.MAX_FILE_BYTES }
  );
  app.post("/api/labs/reports/:id/extract", ({ params }) => labs.extractReport(params.id));
  app.post("/api/labs/reports/:id/explain", ({ params }) => guides.generateLabExplainer(params.id));

  app.get("/api/labs/files/:id", ({ params, res }) => {
    const { meta, data } = labs.getFile(params.id);
    const ascii = (meta.original_filename || "report").replace(/[^\x20-\x7e]|["\\]/g, "_");
    res.writeHead(200, {
      "Content-Type": meta.mime_type,
      "Content-Length": data.length,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(meta.original_filename || "report")}`,
      "Cache-Control": "private, no-store",
    });
    res.end(data);
  });
  app.delete("/api/labs/files/:id", ({ params }) => labs.deleteFile(params.id));

  app.get("/api/guides/:id", ({ params }) => guides.getGuide(params.id));
}
