import { z } from "zod";

/**
 * Ingest request schema
 */
export const IngestReq = z.object({
  text: z.string().min(3),
  date: z.string().optional(), // YYYY-MM-DD
  planId: z.string().optional().default("thor")
});
