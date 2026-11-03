import { db, uuid, tx } from "../db.js";
import { chatJSON } from "../llm.js";
import { DEFAULT_USER_ID, TIMEZONE, todayISO } from "../config.js";
import { HttpError } from "../http.js";

const NUTRIENTS = [
  "calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "added_sugar_g",
  "sodium_mg", "sat_fat_g", "cholesterol_mg", "potassium_mg", "calcium_mg",
];
const MEAL_NUTRIENTS = ["calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sodium_mg", "sat_fat_g", "cholesterol_mg"];

const PARSER_SYSTEM = `You are a nutrition parser. The user describes food they ate.
Extract EACH food item mentioned and return ONLY a JSON object:
{"items":[{"food_name":"...","brand":null,"serving_display":"1 cup","serving_quantity":1,"serving_unit":"cup",
"calories_kcal":0,"protein_g":0,"carbs_g":0,"fat_g":0,"fiber_g":0,"sugar_g":0,"added_sugar_g":0,
"sodium_mg":0,"sat_fat_g":0,"cholesterol_mg":0,"potassium_mg":0,"calcium_mg":0}]}
Rules:
- Parse EACH item separately.
- Use realistic nutrition values from USDA data for the stated serving size.
- Include every field for every item.
- Return ONLY the JSON object.`;

export async function parseFood(text) {
  if (!text?.trim()) throw new HttpError(400, "text is required");
  const { data } = await chatJSON("nutrition_parsing", PARSER_SYSTEM, text);
  if (!Array.isArray(data?.items) || !data.items.length) throw new HttpError(502, "Nutrition parser returned no items");
  return data.items;
}

function getUserGoals(userId) {
  return db.prepare("SELECT * FROM nutrition_goals WHERE user_id = ? ORDER BY created_at DESC LIMIT 1").get(userId);
}

export function upsertGoals(userId, goals) {
  const id = uuid();
  // The Nutrition page doesn't send diet_style; keep the current one rather
  // than silently resetting it to DASH.
  const dietStyle = goals.diet_style || getUserGoals(userId)?.diet_style || "DASH";
  db.prepare(
    `INSERT INTO nutrition_goals (id, user_id, daily_protein_target_g, max_daily_sodium_mg, max_daily_saturated_fat_g,
       min_daily_fiber_g, max_daily_cholesterol_mg, max_daily_added_sugar_g, diet_style)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, userId,
    goals.daily_protein_target_g ?? null, goals.max_daily_sodium_mg ?? null, goals.max_daily_saturated_fat_g ?? null,
    goals.min_daily_fiber_g ?? null, goals.max_daily_cholesterol_mg ?? null, goals.max_daily_added_sugar_g ?? null,
    dietStyle
  );
  return getUserGoals(userId);
}

export function getGoals(userId = DEFAULT_USER_ID) {
  return getUserGoals(userId) || null;
}

/** Ensure a nutrition day row (with targets + totals) exists; returns the day row. */
function ensureDay(userId, date) {
  let day = db.prepare("SELECT * FROM nutrition_days WHERE user_id = ? AND date_local = ?").get(userId, date);
  if (day) return day;

  const goals = getUserGoals(userId);
  const dayId = uuid();
  db.prepare("INSERT INTO nutrition_days (id, user_id, date_local, timezone) VALUES (?, ?, ?, ?)").run(dayId, userId, date, TIMEZONE);
  db.prepare(
    `INSERT INTO nutrition_day_targets (id, nutrition_day_id, protein_g, fiber_g, sodium_mg_max, sat_fat_g_max, added_sugar_g_max, cholesterol_mg_max)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuid(), dayId,
    goals?.daily_protein_target_g ?? 150, goals?.min_daily_fiber_g ?? 30, goals?.max_daily_sodium_mg ?? 2300,
    goals?.max_daily_saturated_fat_g ?? 15, goals?.max_daily_added_sugar_g ?? 30, goals?.max_daily_cholesterol_mg ?? 200
  );
  db.prepare("INSERT INTO nutrition_day_totals (id, nutrition_day_id) VALUES (?, ?)").run(uuid(), dayId);
  return db.prepare("SELECT * FROM nutrition_days WHERE id = ?").get(dayId);
}

function recomputeMeal(mealId) {
  const sums = db.prepare(
    `SELECT ${MEAL_NUTRIENTS.map((n) => `COALESCE(SUM(${n}),0) AS ${n}`).join(", ")}
     FROM nutrition_meal_items WHERE meal_id = ?`
  ).get(mealId);
  db.prepare(
    `INSERT INTO nutrition_meal_totals (id, meal_id, ${MEAL_NUTRIENTS.join(", ")})
     VALUES (?, ?, ${MEAL_NUTRIENTS.map(() => "?").join(", ")})
     ON CONFLICT(meal_id) DO UPDATE SET ${MEAL_NUTRIENTS.map((n) => `${n} = excluded.${n}`).join(", ")}`
  ).run(uuid(), mealId, ...MEAL_NUTRIENTS.map((n) => sums[n]));
}

function recomputeDay(dayId) {
  const sums = db.prepare(
    `SELECT ${NUTRIENTS.map((n) => `COALESCE(SUM(i.${n}),0) AS ${n}`).join(", ")}
     FROM nutrition_meal_items i JOIN nutrition_meals m ON m.id = i.meal_id
     WHERE m.nutrition_day_id = ?`
  ).get(dayId);
  db.prepare(
    `UPDATE nutrition_day_totals SET ${NUTRIENTS.map((n) => `${n} = ?`).join(", ")} WHERE nutrition_day_id = ?`
  ).run(...NUTRIENTS.map((n) => sums[n]), dayId);
  db.prepare("UPDATE nutrition_days SET recompute_required = 0, last_computed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(dayId);
}

function itemColumns(item) {
  return {
    food_name: item.food_name || item.description || "Unknown food",
    brand: item.brand ?? null,
    serving_quantity: item.serving_quantity ?? null,
    serving_unit: item.serving_unit ?? null,
    serving_display: item.serving_display ?? null,
    ...Object.fromEntries(NUTRIENTS.map((n) => [n, Number(item[n] ?? (n === "calories_kcal" ? item.calories : n === "sat_fat_g" ? item.saturated_fat_g : 0)) || 0])),
  };
}

export function addMeal(userId, date, mealType, timeLocal) {
  if (!["breakfast", "lunch", "dinner", "snack"].includes(mealType)) throw new HttpError(400, "Invalid meal_type");
  return tx(() => {
    const day = ensureDay(userId, date);
    const id = uuid();
    db.prepare(
      "INSERT INTO nutrition_meals (id, user_id, nutrition_day_id, meal_id, meal_type, time_local) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(id, userId, day.id, id, mealType, timeLocal ?? new Date().toTimeString().slice(0, 5));
    recomputeMeal(id);
    return db.prepare("SELECT * FROM nutrition_meals WHERE id = ?").get(id);
  });
}

export function addItems(userId, mealId, items) {
  const meal = db.prepare("SELECT * FROM nutrition_meals WHERE id = ?").get(mealId);
  if (!meal) throw new HttpError(404, "Meal not found");
  return tx(() => {
    const inserted = [];
    for (const raw of items) {
      const item = itemColumns(raw);
      const id = uuid();
      db.prepare(
        `INSERT INTO nutrition_meal_items (id, user_id, meal_id, item_id, food_name, brand, serving_quantity, serving_unit, serving_display, ${NUTRIENTS.join(", ")})
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${NUTRIENTS.map(() => "?").join(", ")})`
      ).run(
        id, userId, mealId, id, item.food_name, item.brand, item.serving_quantity, item.serving_unit, item.serving_display,
        ...NUTRIENTS.map((n) => item[n])
      );
      inserted.push(id);
    }
    recomputeMeal(mealId);
    recomputeDay(meal.nutrition_day_id);
    return { inserted };
  });
}

export function updateItem(itemId, patch) {
  const item = db.prepare("SELECT * FROM nutrition_meal_items WHERE id = ?").get(itemId);
  if (!item) throw new HttpError(404, "Item not found");
  const fields = ["food_name", "brand", "serving_quantity", "serving_unit", "serving_display", ...NUTRIENTS];
  const updates = fields.filter((f) => patch[f] !== undefined);
  if (!updates.length) throw new HttpError(400, "No updatable fields in body");
  return tx(() => {
    db.prepare(`UPDATE nutrition_meal_items SET ${updates.map((f) => `${f} = ?`).join(", ")} WHERE id = ?`).run(
      ...updates.map((f) => patch[f]), itemId
    );
    const meal = db.prepare("SELECT * FROM nutrition_meals WHERE id = ?").get(item.meal_id);
    recomputeMeal(item.meal_id);
    recomputeDay(meal.nutrition_day_id);
    return db.prepare("SELECT * FROM nutrition_meal_items WHERE id = ?").get(itemId);
  });
}

/** Change an item's serving count while keeping every nutrient in proportion. */
export function setItemServings(itemId, servings) {
  const item = db.prepare("SELECT * FROM nutrition_meal_items WHERE id = ?").get(itemId);
  if (!item) throw new HttpError(404, "Item not found");
  const next = Number(servings);
  if (!Number.isFinite(next) || next < 0.01 || next > 1000) {
    throw new HttpError(400, "servings must be between 0.01 and 1000");
  }
  const current = Number(item.serving_quantity) > 0 ? Number(item.serving_quantity) : 1;
  const factor = next / current;
  const baseServing = item.serving_unit || item.serving_display || "1 serving";
  const servingDisplay = Math.abs(next - 1) < 0.0001 ? baseServing : `${next} × ${baseServing}`;
  return updateItem(itemId, {
    serving_quantity: next,
    serving_unit: baseServing,
    serving_display: servingDisplay,
    ...Object.fromEntries(NUTRIENTS.map((n) => [n, (Number(item[n]) || 0) * factor])),
  });
}

export function deleteItem(itemId) {
  const item = db.prepare("SELECT * FROM nutrition_meal_items WHERE id = ?").get(itemId);
  if (!item) throw new HttpError(404, "Item not found");
  return tx(() => {
    const meal = db.prepare("SELECT * FROM nutrition_meals WHERE id = ?").get(item.meal_id);
    db.prepare("DELETE FROM nutrition_meal_items WHERE id = ?").run(itemId);
    recomputeMeal(item.meal_id);
    recomputeDay(meal.nutrition_day_id);
    return { deleted: itemId };
  });
}

export function deleteMeal(mealId) {
  const meal = db.prepare("SELECT * FROM nutrition_meals WHERE id = ?").get(mealId);
  if (!meal) throw new HttpError(404, "Meal not found");
  return tx(() => {
    db.prepare("DELETE FROM nutrition_meal_items WHERE meal_id = ?").run(mealId);
    db.prepare("DELETE FROM nutrition_meal_totals WHERE meal_id = ?").run(mealId);
    db.prepare("DELETE FROM nutrition_meals WHERE id = ?").run(mealId);
    recomputeDay(meal.nutrition_day_id);
    return { deleted: mealId };
  });
}

function inferMealType(text) {
  const t = text.toLowerCase();
  if (/\bbreakfast\b/.test(t)) return "breakfast";
  if (/\blunch\b/.test(t)) return "lunch";
  if (/\bdinner\b/.test(t)) return "dinner";
  const hour = new Date().getHours();
  if (hour < 10) return "breakfast";
  if (hour < 14) return "lunch";
  if (hour >= 17 && hour < 21) return "dinner";
  return "snack";
}

/** One-shot natural language logging: parse text, create meal, add items. */
export async function logFoodText(userId, text, date, mealType) {
  const items = await parseFood(text);
  const day = date || todayISO();
  const type = mealType || inferMealType(text);
  const meal = addMeal(userId, day, type);
  addItems(userId, meal.id, items);
  return { meal_id: meal.id, meal_type: type, date: day, items_added: items.length, items };
}

/** Full day view: day, targets, totals, meals with items. */
export function getDay(userId = DEFAULT_USER_ID, date = todayISO()) {
  const day = db.prepare("SELECT * FROM nutrition_days WHERE user_id = ? AND date_local = ?").get(userId, date);
  if (!day) return { date, user_id: userId, exists: false, meals: [], totals: null, targets: null };

  const targets = db.prepare("SELECT * FROM nutrition_day_targets WHERE nutrition_day_id = ?").get(day.id);
  const totals = db.prepare("SELECT * FROM nutrition_day_totals WHERE nutrition_day_id = ?").get(day.id);
  // Meal totals are computed from items at read time — stored totals from the
  // old stack are unreliable for historical meals.
  const meals = db.prepare("SELECT * FROM nutrition_meals WHERE nutrition_day_id = ? ORDER BY created_at").all(day.id).map((m) => {
    const items = db.prepare("SELECT * FROM nutrition_meal_items WHERE meal_id = ? ORDER BY created_at").all(m.id);
    const totals = Object.fromEntries(
      MEAL_NUTRIENTS.map((n) => [n, items.reduce((a, i) => a + (Number(i[n]) || 0), 0)])
    );
    return { ...m, totals, items };
  });
  return { ...day, exists: true, date, targets, totals, meals };
}

/** Day totals across a date range for charts. */
export function getSummary(userId = DEFAULT_USER_ID, start, end) {
  return db.prepare(
    `SELECT d.date_local, t.calories_kcal, t.protein_g, t.carbs_g, t.fat_g, t.fiber_g, t.sodium_mg, t.sat_fat_g, t.cholesterol_mg
     FROM nutrition_days d JOIN nutrition_day_totals t ON t.nutrition_day_id = d.id
     WHERE d.user_id = ? AND d.date_local BETWEEN ? AND ? ORDER BY d.date_local`
  ).all(userId, start || "0000-01-01", end || "9999-12-31");
}

// --- Food catalog ---

export function searchFoods(q = "", category = "") {
  const term = `%${q.trim()}%`;
  const rows = db.prepare(
    `SELECT * FROM food_catalog
     WHERE (name LIKE ? OR aliases LIKE ?) ${category ? "AND category = ?" : ""}
     ORDER BY CASE WHEN name LIKE ? THEN 0 ELSE 1 END, name
     LIMIT 40`
  ).all(...(category ? [term, term, category, `${q.trim()}%`] : [term, term, `${q.trim()}%`]));
  return rows.map((r) => ({ ...r, aliases: JSON.parse(r.aliases || "[]") }));
}

export function foodCategories() {
  return db.prepare("SELECT category, COUNT(*) AS count FROM food_catalog GROUP BY category ORDER BY category").all();
}

export function addCustomFood(food) {
  if (!food.name?.trim()) throw new HttpError(400, "name is required");
  if (!food.serving_display?.trim()) throw new HttpError(400, "serving_display is required (e.g. '1 cup')");
  const id = uuid();
  db.prepare(
    `INSERT INTO food_catalog (id, name, category, serving_display, ${NUTRIENTS.join(", ")}, aliases, source)
     VALUES (?, ?, ?, ?, ${NUTRIENTS.map(() => "?").join(", ")}, ?, 'custom')`
  ).run(
    id, food.name.trim(), food.category || "custom", food.serving_display.trim(),
    ...NUTRIENTS.map((n) => Number(food[n]) || 0), JSON.stringify(food.aliases || [])
  );
  return db.prepare("SELECT * FROM food_catalog WHERE id = ?").get(id);
}

export function deleteCustomFood(id) {
  const f = db.prepare("SELECT * FROM food_catalog WHERE id = ?").get(id);
  if (!f) throw new HttpError(404, "Food not found");
  if (f.source !== "custom") throw new HttpError(400, "Only custom foods can be deleted");
  db.prepare("DELETE FROM food_catalog WHERE id = ?").run(id);
  return { deleted: id };
}

/**
 * picks: [{food_id?, item?, servings}] → meal-item objects with nutrients
 * scaled by servings. `item` allows inline foods (frequent-foods, barcode hits)
 * that aren't in the catalog.
 */
function picksToItems(picks) {
  if (!Array.isArray(picks) || !picks.length) throw new HttpError(400, "picks array is required");
  return picks.map((p) => {
    let f = p.item;
    if (!f) {
      f = db.prepare("SELECT * FROM food_catalog WHERE id = ?").get(p.food_id);
      if (!f) throw new HttpError(404, `Food not found: ${p.food_id}`);
    }
    const qty = Number(p.servings) > 0 ? Number(p.servings) : 1;
    const baseServing = f.serving_display || "1 serving";
    return {
      food_name: f.name || f.food_name || "Unknown food",
      brand: f.brand ?? null,
      serving_quantity: qty,
      serving_unit: baseServing,
      serving_display: qty === 1 ? baseServing : `${qty} × ${baseServing}`,
      ...Object.fromEntries(NUTRIENTS.map((n) => [n, Math.round((Number(f[n]) || 0) * qty * 10) / 10])),
    };
  });
}

/** Most-used foods for this user (last 90 days) — the "your usuals" row. */
export function frequentFoods(userId = DEFAULT_USER_ID, limit = 10) {
  const names = db.prepare(
    `SELECT LOWER(food_name) AS key, COUNT(*) AS freq FROM nutrition_meal_items
     WHERE user_id = ? AND created_at >= datetime('now', '-90 days')
     GROUP BY key ORDER BY freq DESC LIMIT ?`
  ).all(userId, Math.min(Number(limit) || 10, 20));
  return names.map(({ key, freq }) => {
    const item = db.prepare(
      "SELECT * FROM nutrition_meal_items WHERE user_id = ? AND LOWER(food_name) = ? ORDER BY created_at DESC LIMIT 1"
    ).get(userId, key);
    // Normalize to a per-1-serving base so the picks tray can rescale it.
    const qty = Number(item.serving_quantity) > 0 ? Number(item.serving_quantity) : 1;
    const perServing = Object.fromEntries(NUTRIENTS.map((n) => [n, Math.round(((item[n] || 0) / qty) * 10) / 10]));
    return {
      food_name: item.food_name,
      brand: item.brand,
      serving_display: item.serving_unit || item.serving_display || "1 serving",
      frequency: freq,
      ...perServing,
    };
  });
}

/** Copy all meals + items from one day to another (fresh ids, totals recomputed). */
export function copyDay(userId, fromDate, toDate) {
  if (!fromDate || !toDate || fromDate === toDate) throw new HttpError(400, "from_date and to_date must differ");
  const source = getDay(userId, fromDate);
  if (!source.exists || !source.meals.length) throw new HttpError(404, `Nothing logged on ${fromDate} to copy`);
  let itemsCopied = 0;
  for (const meal of source.meals) {
    const newMeal = addMeal(userId, toDate, meal.meal_type, meal.time_local);
    addItems(userId, newMeal.id, meal.items);
    itemsCopied += meal.items.length;
  }
  return { copied_meals: source.meals.length, copied_items: itemsCopied, from: fromDate, to: toDate };
}

/** Look up a product by barcode via OpenFoodFacts (free, no key). */
export async function barcodeLookup(code) {
  if (!/^\d{6,14}$/.test(String(code).trim())) throw new HttpError(400, "Barcode must be 6-14 digits");
  let data;
  try {
    const resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`, {
      headers: { "User-Agent": "thor-fitness-tracker/2.0 (personal use)" },
    });
    data = await resp.json();
  } catch {
    throw new HttpError(502, "OpenFoodFacts is unreachable");
  }
  if (data.status !== 1 || !data.product) return { found: false, code };

  const p = data.product;
  const nut = p.nutriments || {};
  // Prefer per-serving values; fall back to per-100g.
  const perServing = nut["energy-kcal_serving"] != null;
  const pick = (key) => {
    const v = perServing ? nut[`${key}_serving`] : nut[`${key}_100g`];
    return Number(v) || 0;
  };
  const food = {
    name: [p.product_name, p.brands].filter(Boolean).join(" — ") || `Product ${code}`,
    brand: p.brands || null,
    serving_display: perServing ? (p.serving_size || "1 serving") : "100 g",
    calories_kcal: pick("energy-kcal"),
    protein_g: pick("proteins"),
    carbs_g: pick("carbohydrates"),
    fat_g: pick("fat"),
    fiber_g: pick("fiber"),
    sugar_g: pick("sugars"),
    added_sugar_g: 0,
    sodium_mg: Math.round(pick("sodium") * 1000), // OFF reports grams
    sat_fat_g: pick("saturated-fat"),
    cholesterol_mg: Math.round(pick("cholesterol") * 1000),
    potassium_mg: Math.round(pick("potassium") * 1000),
    calcium_mg: Math.round(pick("calcium") * 1000),
  };
  return { found: true, code, basis: perServing ? "per_serving" : "per_100g", food };
}

/** Log catalog picks straight into a meal (no LLM — exact values). */
export function logCatalogPicks(userId, date, mealType, picks) {
  const items = picksToItems(picks);
  const meal = addMeal(userId, date || todayISO(), mealType || inferMealType(""));
  addItems(userId, meal.id, items);
  return { meal_id: meal.id, meal_type: meal.meal_type, items_added: items.length, items };
}

/** Save catalog picks directly as a reusable template. */
export function templateFromPicks(userId, name, mealType, picks) {
  return saveTemplate(userId, name, mealType, picksToItems(picks));
}

// --- Templates ---

export function listTemplates(userId = DEFAULT_USER_ID) {
  return db.prepare("SELECT * FROM nutrition_templates WHERE user_id = ? ORDER BY created_at DESC").all(userId)
    .map((t) => ({ ...t, items: JSON.parse(t.items_json || "[]") }));
}

export function saveTemplate(userId, name, mealType, items) {
  if (!name?.trim()) throw new HttpError(400, "name is required");
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, "items array is required");
  const id = uuid();
  db.prepare(
    "INSERT INTO nutrition_templates (id, user_id, name, meal_type, items_json, created_at, created_date) VALUES (?, ?, ?, ?, ?, datetime('now'), date('now'))"
  ).run(id, userId, name.trim(), mealType ?? null, JSON.stringify(items));
  return { id };
}

export function applyTemplate(userId, templateId, date, mealType) {
  const t = db.prepare("SELECT * FROM nutrition_templates WHERE id = ?").get(templateId);
  if (!t) throw new HttpError(404, "Template not found");
  const items = JSON.parse(t.items_json || "[]");
  const meal = addMeal(userId, date || todayISO(), mealType || t.meal_type || "snack");
  addItems(userId, meal.id, items);
  return { meal_id: meal.id, items_added: items.length };
}

/** Update a template's name, meal type, and/or items (full items replacement). */
export function updateTemplate(templateId, { name, meal_type, items }) {
  const t = db.prepare("SELECT * FROM nutrition_templates WHERE id = ?").get(templateId);
  if (!t) throw new HttpError(404, "Template not found");
  if (items !== undefined && (!Array.isArray(items) || !items.length)) {
    throw new HttpError(400, "items must be a non-empty array (delete the template instead)");
  }
  db.prepare("UPDATE nutrition_templates SET name = ?, meal_type = ?, items_json = ? WHERE id = ?").run(
    name?.trim() || t.name,
    meal_type !== undefined ? meal_type : t.meal_type,
    items !== undefined ? JSON.stringify(items) : t.items_json,
    templateId
  );
  const updated = db.prepare("SELECT * FROM nutrition_templates WHERE id = ?").get(templateId);
  return { ...updated, items: JSON.parse(updated.items_json || "[]") };
}

export function deleteTemplate(templateId) {
  const r = db.prepare("DELETE FROM nutrition_templates WHERE id = ?").run(templateId);
  if (!r.changes) throw new HttpError(404, "Template not found");
  return { deleted: templateId };
}

// --- Barcode by photo (iPhone Safari has no BarcodeDetector) ---------------

const BARCODE_SYSTEM = `You read product barcodes (UPC/EAN) from photos. Reply with JSON only:
{"digits": "<the digits printed under the bars, no spaces>"} — or {"digits": null} if you can't read every digit clearly. Never guess a digit.`;

function imageType(buf) {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** Read the printed digits under a barcode with the vision model, then look the product up. */
export async function barcodeFromPhoto(buffer) {
  if (!buffer?.length) throw new HttpError(400, "Send a photo of the barcode");
  const mime = imageType(buffer);
  if (!mime) throw new HttpError(400, "Send the barcode photo as a JPEG, PNG or WebP");
  const { data } = await chatJSON("nutrition_parsing", BARCODE_SYSTEM, [
    { type: "text", text: "Read the barcode digits in this photo." },
    { type: "image_url", image_url: { url: `data:${mime};base64,${buffer.toString("base64")}`, detail: "high" } },
  ]);
  const digits = String(data?.digits ?? "").replace(/\D/g, "");
  if (!/^\d{6,14}$/.test(digits)) return { found: false, code: null, unreadable: true };
  return { ...(await barcodeLookup(digits)), code: digits };
}
