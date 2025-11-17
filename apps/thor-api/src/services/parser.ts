import { getDayExercises } from "./plans.js";
import type { ParsedLog } from "../models.js";
import { USE_LLM, USE_OLLAMA, OLLAMA_MODEL, OLLAMA_URL, OPENAI_API_KEY, OPENAI_MODEL } from "../config.js";

async function parseWithOllama(system: string, user: string) {
  const resp = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      format: "json",
      stream: false,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      options: { temperature: 0 }
    })
  });

  const raw = await resp.text();
  if (!resp.ok) throw new Error(`Ollama ${resp.status}: ${raw}`);

  try {
    const data = JSON.parse(raw);
    return JSON.parse(data?.message?.content || "{}");
  } catch {
    // NDJSON fallback
    const parts: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim(); if (!t) continue;
      try {
        const j = JSON.parse(t);
        if (j?.message?.content) parts.push(j.message.content);
      } catch {}
    }
    return JSON.parse(parts.join("") || "{}");
  }
}

export interface ParseResult {
  items: ParsedLog[];
  llm_provider: string;
  llm_model: string;
}

export async function parseFreeform(text: string, planId: string, dow: number): Promise<ParseResult> {
  if (!USE_LLM) throw new Error("Must use LLM parser");

  const normalizedText = text.replace(/£\s*/g, "").replace(/\bpounds?\b/gi, " lbs");
  const valid = getDayExercises(planId, dow).map((e: any) => e.name);

  const sys = `
You are a precise workout log parser.
Return a JSON object exactly like:
{"items":[{"exercise_free":string,"exercise_match":string,"sets":number,"reps_per_set":number|null,"variable_reps":number[]|null,"weight_lbs":number|null,"notes":string|null}]}
Rules:
- One item per exercise (no merging).
- Use the CLOSEST match from the valid list.
- NOTATION: In "NxM" or "N*M" format, N is SETS and M is REPS_PER_SET.
  Examples: "3x12" means sets=3, reps_per_set=12
            "4*10" means sets=4, reps_per_set=10
- Handle: "4*12 floor press @45" (sets=4, reps=12, weight=45)
          "4x9 with 35 lbs incline" (sets=4, reps=9, weight=35)
          "3x10 with 30 lbs flys" (sets=3, reps=10, weight=30)
          "3x12 tricep overhead" (sets=3, reps=12)
          "11, 8, 5 push ups" (variable_reps=[11,8,5], reps_per_set=8)
          "12x 3 leg raises" (sets=12, reps=3)
- If comma reps given, variable_reps=[...], reps_per_set=rounded average.
- IMPORTANT: Capture any contextual notes, feelings, or comments following the exercise.
  Examples: "This was brutal", "felt easy", "struggled with form", "personal best!"
- Put exercise-specific comments in the "notes" field for that exercise.
- Output ONLY valid JSON.`.trim();

  const user = `
Valid exercises for today (choose closest for exercise_match):
${valid.join("; ")}

Text:
${normalizedText}
`.trim();

  function normalizeItems(items: any[]): ParsedLog[] {
    return (items || []).map((i: any) => {
      let reps = i?.reps_per_set;
      if ((reps == null) && Array.isArray(i?.variable_reps) && i.variable_reps.length) {
        const sum = i.variable_reps.reduce((a: number, b: number) => a + b, 0);
        reps = Math.round(sum / i.variable_reps.length);
      }

      // Build notes: combine user notes + variable reps info if present
      let notes = i.notes ?? undefined;
      if (Array.isArray(i?.variable_reps) && i.variable_reps.length) {
        const repsInfo = `reps_per_set=${JSON.stringify(i.variable_reps)}`;
        notes = notes ? `${notes} [${repsInfo}]` : repsInfo;
      }

      return {
        exercise: i.exercise_match,
        sets: i.sets ?? undefined,
        reps: reps ?? undefined,
        weight_lbs: i.weight_lbs ?? undefined,
        notes: notes,
      } as ParsedLog;
    });
  }

  if (USE_OLLAMA) {
    const parsed = await parseWithOllama(sys, user);
    if (!parsed?.items || !Array.isArray(parsed.items)) throw new Error("Model returned no items (Ollama)");
    return {
      items: normalizeItems(parsed.items),
      llm_provider: "ollama",
      llm_model: OLLAMA_MODEL
    };
  }

  // OpenAI path: strict schema, fallback to json_object
  const { OpenAI } = await import("openai");
  const client = new OpenAI({ apiKey: OPENAI_API_KEY });

  const exerciseMatchProp = valid.length > 0
    ? { type: "string", enum: valid }
    : { type: "string" };

  const schema = {
    name: "workout_parse",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              exercise_free:  { type: "string" },
              exercise_match: exerciseMatchProp,
              sets:           { type: "integer", minimum: 1 },
              reps_per_set:   { type: ["integer", "null"] },
              variable_reps:  { type: ["array", "null"], items: { type: "integer", minimum: 1 } },
              weight_lbs:     { type: ["number", "null"] },
              notes:          { type: ["string", "null"] }
            },
            required: ["exercise_free","exercise_match","sets","reps_per_set","variable_reps","weight_lbs","notes"]
          }
        }
      },
      required: ["items"]
    },
    strict: true
  } as const;

  try {
    const resp = await client.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_schema", json_schema: schema },
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      temperature: 0
    });
    const content = resp.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as { items?: any[] };
    if (!parsed?.items || !Array.isArray(parsed.items)) throw new Error("Model returned no items (schema)");
    return {
      items: normalizeItems(parsed.items),
      llm_provider: "openai",
      llm_model: OPENAI_MODEL
    };
  } catch {
    const resp2 = await client.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: sys }, { role: "user", content: user }],
      temperature: 0
    });
    const content2 = resp2.choices[0]?.message?.content ?? "{}";
    const parsed2 = JSON.parse(content2) as { items?: any[] };
    if (!parsed2?.items || !Array.isArray(parsed2.items)) throw new Error("Model returned no items (json_object)");
    return {
      items: normalizeItems(parsed2.items),
      llm_provider: "openai",
      llm_model: OPENAI_MODEL
    };
  }
}
