// Long-term memory: durable facts, preferences and doctor instructions the
// user wants Thor to keep ("my doctor wants LDL under 100"). Visible and
// deletable on the Ask Thor and Profile pages.
import { db, uuid } from "../db.js";
import { DEFAULT_USER_ID } from "../config.js";
import { HttpError } from "../http.js";

export const MEMORY_CATEGORIES = ["health", "doctor", "training", "food", "preference", "other"];
const MAX_MEMORIES = 200;

export function listMemories(userId = DEFAULT_USER_ID) {
  return db.prepare("SELECT * FROM user_memories WHERE user_id = ? ORDER BY created_at DESC, rowid DESC").all(userId);
}

function clean({ content, category }) {
  const text = String(content ?? "").trim().replace(/\s+/g, " ");
  if (!text) throw new HttpError(400, "content is required");
  if (text.length > 500) throw new HttpError(400, "Keep memories under 500 characters");
  const cat = category ? String(category).toLowerCase() : null;
  return { content: text, category: MEMORY_CATEGORIES.includes(cat) ? cat : cat ? "other" : null };
}

export function addMemory(input, { source = "chat" } = {}, userId = DEFAULT_USER_ID) {
  const m = clean(input);
  const dup = db.prepare("SELECT id FROM user_memories WHERE user_id = ? AND lower(content) = lower(?)").get(userId, m.content);
  if (dup) return getMemory(dup.id);
  const count = db.prepare("SELECT COUNT(*) AS n FROM user_memories WHERE user_id = ?").get(userId).n;
  if (count >= MAX_MEMORIES) throw new HttpError(400, `Memory is full (${MAX_MEMORIES}) — delete some old ones first`);
  const id = uuid();
  db.prepare("INSERT INTO user_memories (id, user_id, content, category, source) VALUES (?, ?, ?, ?, ?)").run(
    id, userId, m.content, m.category, source === "manual" ? "manual" : "chat"
  );
  return getMemory(id);
}

export function getMemory(id) {
  const m = db.prepare("SELECT * FROM user_memories WHERE id = ?").get(id);
  if (!m) throw new HttpError(404, "Memory not found");
  return m;
}

export function updateMemory(id, patch) {
  const current = getMemory(id);
  const m = clean({ content: patch.content ?? current.content, category: patch.category ?? current.category });
  db.prepare("UPDATE user_memories SET content = ?, category = ?, updated_at = datetime('now') WHERE id = ?").run(m.content, m.category, id);
  return getMemory(id);
}

export function deleteMemory(id) {
  const r = db.prepare("DELETE FROM user_memories WHERE id = ?").run(id);
  if (!r.changes) throw new HttpError(404, "Memory not found");
  return { deleted: id };
}

/** For prompts: the most recent memories, compact. */
export function memoriesForPrompt(limit = 40, userId = DEFAULT_USER_ID) {
  return listMemories(userId).slice(0, limit).map((m) => ({ id: m.id, note: m.content, category: m.category || undefined, saved: m.created_at.slice(0, 10) }));
}
