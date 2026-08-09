import { api, toast, esc, todayISO, renderNav, bar } from "./ui.js";

renderNav("nutrition");
const $ = (id) => document.getElementById(id);
$("date").value = todayISO();

const userId = () => $("user").value;
const date = () => $("date").value;

async function loadUsers() {
  const users = await api("/api/users");
  $("user").innerHTML = users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join("");
}

const MEAL_ICONS = { breakfast: "🌅", lunch: "🥪", dinner: "🍽", snack: "🥜" };
const qtyText = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 });
const qtyValue = (value) => String(Math.round(Number(value) * 100) / 100);

async function loadDay() {
  const day = await api(`/api/nutrition/day?user_id=${encodeURIComponent(userId())}&date=${date()}`);

  const t = day.totals, g = day.targets;
  $("totals").innerHTML = t
    ? bar("Calories", t.calories_kcal, g?.calories_kcal || 2000, "kcal", "limit") +
      bar("Protein", t.protein_g, g?.protein_g, "g", "target") +
      bar("Carbs", t.carbs_g, 0, "g") +
      bar("Fat", t.fat_g, 0, "g") +
      bar("Fiber", t.fiber_g, g?.fiber_g, "g", "target") +
      bar("Sodium", t.sodium_mg, g?.sodium_mg_max, "mg", "limit") +
      bar("Sat fat", t.sat_fat_g, g?.sat_fat_g_max, "g", "limit") +
      bar("Cholesterol", t.cholesterol_mg, g?.cholesterol_mg_max, "mg", "limit")
    : `<div class="empty">Nothing logged this day.</div>`;

  if (!day.meals.length) {
    $("meals").innerHTML = `<div class="empty">No meals logged. Use the AI logger above.</div>`;
    return;
  }
  $("meals").innerHTML = day.meals.map((m) => `
    <div class="item" style="display:block">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div class="title">${MEAL_ICONS[m.meal_type] || ""} ${esc(m.meal_type)} <span class="muted small">${esc(m.time_local || "")}</span>
          <span class="pill">${Math.round(m.totals?.calories_kcal || 0)} kcal</span>
          <span class="pill gold">${qtyText(m.totals?.protein_g || 0)}g protein</span></div>
        <div style="white-space:nowrap">
          <button class="btn-ghost btn-sm" data-save-template="${m.id}">Save as template</button>
          <button class="btn-danger" data-del-meal="${m.id}">✕</button>
        </div>
      </div>
      <div class="table-scroll"><table class="mt meal-table"><thead><tr><th>Food</th><th>Quantity</th><th>kcal</th><th>Protein</th><th>Sodium</th><th></th></tr></thead>
      <tbody>${m.items.map((i) => `
        <tr data-item-row="${i.id}">
          <td>${esc(i.food_name)}</td>
          <td><div class="quantity-control quantity-control-sm">
            <button class="qty-button" data-item-minus="${i.id}" aria-label="Decrease ${esc(i.food_name)}">−</button>
            <input type="number" data-item-qty="${i.id}" value="${qtyValue(i.serving_quantity || 1)}" min="0.01" step="0.25" aria-label="Servings of ${esc(i.food_name)}" />
            <button class="qty-button" data-item-plus="${i.id}" aria-label="Increase ${esc(i.food_name)}">+</button>
          </div><div class="muted serving-base">${esc(i.serving_unit || i.serving_display || "1 serving")} each</div></td>
          <td>${Math.round(i.calories_kcal)}</td>
          <td>${qtyText(i.protein_g)}g</td>
          <td>${Math.round(i.sodium_mg)}mg</td>
          <td style="white-space:nowrap"><button class="btn-ghost btn-sm" data-edit-item="${i.id}">✎</button><button class="btn-danger" data-del-item="${i.id}">✕</button></td>
        </tr>`).join("")}
      </tbody></table></div>
    </div>`).join("");

  const itemById = (id) => day.meals.flatMap((m) => m.items).find((i) => i.id === id);
  const saveServings = async (id, value) => {
    const servings = Number(value);
    if (!Number.isFinite(servings) || servings <= 0) return toast("Quantity must be greater than zero", true);
    try {
      await api(`/api/nutrition/item/${id}/servings`, { method: "PATCH", body: { servings } });
      await loadDay();
    } catch (err) { toast(err.message, true); }
  };
  $("meals").querySelectorAll("[data-item-minus], [data-item-plus]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.itemMinus || b.dataset.itemPlus;
      const item = itemById(id);
      const current = Number(item?.serving_quantity) || 1;
      const delta = b.dataset.itemPlus ? 0.25 : -0.25;
      saveServings(id, Math.max(0.25, Math.round((current + delta) * 100) / 100));
    })
  );
  $("meals").querySelectorAll("[data-item-qty]").forEach((input) => {
    input.addEventListener("change", () => saveServings(input.dataset.itemQty, input.value));
    input.addEventListener("keydown", (event) => { if (event.key === "Enter") input.blur(); });
  });

  $("meals").querySelectorAll("[data-del-meal]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Delete this meal and its items?")) return;
      await api(`/api/nutrition/meal/${b.dataset.delMeal}`, { method: "DELETE" });
      toast("Meal deleted"); loadDay();
    })
  );
  $("meals").querySelectorAll("[data-del-item]").forEach((b) =>
    b.addEventListener("click", async () => {
      await api(`/api/nutrition/item/${b.dataset.delItem}`, { method: "DELETE" });
      toast("Item deleted"); loadDay();
    })
  );
  $("meals").querySelectorAll("[data-edit-item]").forEach((b) =>
    b.addEventListener("click", () => {
      const item = day.meals.flatMap((m) => m.items).find((i) => i.id === b.dataset.editItem);
      const row = $("meals").querySelector(`tr[data-item-row="${item.id}"]`);
      row.innerHTML = `
        <td><input class="ie-name" value="${esc(item.food_name)}" style="min-width:120px" /></td>
        <td><input class="ie-serving" value="${esc(item.serving_display || "")}" style="min-width:80px" /></td>
        <td><input type="number" class="ie-kcal" value="${item.calories_kcal}" style="width:76px" /></td>
        <td><input type="number" class="ie-protein" value="${item.protein_g}" step="0.1" style="width:70px" /></td>
        <td><input type="number" class="ie-sodium" value="${item.sodium_mg}" style="width:80px" /></td>
        <td style="white-space:nowrap"><button class="btn-sm ie-save">✓</button><button class="btn-ghost btn-sm ie-cancel">✕</button></td>`;
      row.querySelector(".ie-cancel").addEventListener("click", () => loadDay());
      row.querySelector(".ie-save").addEventListener("click", async () => {
        try {
          await api(`/api/nutrition/item/${item.id}`, {
            method: "PUT",
            body: {
              food_name: row.querySelector(".ie-name").value,
              serving_display: row.querySelector(".ie-serving").value,
              calories_kcal: Number(row.querySelector(".ie-kcal").value) || 0,
              protein_g: Number(row.querySelector(".ie-protein").value) || 0,
              sodium_mg: Number(row.querySelector(".ie-sodium").value) || 0,
            },
          });
          toast("Item updated");
          loadDay();
        } catch (err) { toast(err.message, true); }
      });
    })
  );
  $("meals").querySelectorAll("[data-save-template]").forEach((b) =>
    b.addEventListener("click", async () => {
      const meal = day.meals.find((m) => m.id === b.dataset.saveTemplate);
      const name = prompt("Template name:", `${meal.meal_type} template`);
      if (!name) return;
      await api("/api/nutrition/template", { method: "POST", body: { user_id: userId(), name, meal_type: meal.meal_type, items: meal.items } });
      toast("Template saved"); loadTemplates();
    })
  );
}

let editingTemplateId = null;

function templateEditor(t) {
  const sumKcal = (items) => Math.round(items.reduce((a, i) => a + (i.calories_kcal || 0), 0));
  const el = document.createElement("div");
  el.className = "quick-form";
  el.innerHTML = `
    <div class="row">
      <div><label>Name</label><input class="te-name" value="${esc(t.name)}" /></div>
      <div class="fit" style="width:140px"><label>Meal</label>
        <select class="te-type"><option value="">any</option>${["breakfast", "lunch", "dinner", "snack"]
          .map((m) => `<option${t.meal_type === m ? " selected" : ""}>${m}</option>`).join("")}</select></div>
    </div>
    <div class="list mt te-items"></div>
    <div class="row mt">
      <button class="te-save fit">Save changes</button>
      <button class="te-cancel btn-ghost fit btn-sm">Cancel</button>
      <span class="muted small te-total"></span>
    </div>`;

  // working copy: [{item, scale, removed}]
  const work = t.items.map((item) => ({ item, scale: 1, removed: false }));

  function renderItems() {
    const box = el.querySelector(".te-items");
    box.innerHTML = work.map((w, i) => w.removed ? "" : `
      <div class="item">
        <div class="main"><div class="title">${esc(w.item.food_name)}</div>
          <div class="meta">${esc(w.item.serving_display || "1 serving")} · ${Math.round((w.item.calories_kcal || 0) * w.scale)} kcal · ${qtyText((w.item.protein_g || 0) * w.scale)}g protein</div></div>
        <div style="white-space:nowrap;display:flex;align-items:center;gap:6px">
          <label style="margin:0">×</label>
          <input type="number" data-scale="${i}" value="${w.scale}" step="0.25" min="0.25" style="width:70px" />
          <button class="btn-danger" data-rm="${i}">✕</button>
        </div>
      </div>`).join("");
    const live = work.filter((w) => !w.removed);
    el.querySelector(".te-total").textContent =
      `${live.length} items · ${Math.round(live.reduce((a, w) => a + (w.item.calories_kcal || 0) * w.scale, 0))} kcal · ` +
      `${qtyText(live.reduce((a, w) => a + (w.item.protein_g || 0) * w.scale, 0))}g protein`;
    box.querySelectorAll("[data-rm]").forEach((b) =>
      b.addEventListener("click", () => { work[b.dataset.rm].removed = true; renderItems(); }));
    box.querySelectorAll("[data-scale]").forEach((inp) =>
      inp.addEventListener("change", () => {
        work[inp.dataset.scale].scale = Math.max(0.25, Number(inp.value) || 1);
        renderItems();
      }));
  }
  renderItems();

  el.querySelector(".te-cancel").addEventListener("click", () => { editingTemplateId = null; loadTemplates(); });
  el.querySelector(".te-save").addEventListener("click", async () => {
    const NUTR = ["calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "added_sugar_g", "sodium_mg", "sat_fat_g", "cholesterol_mg", "potassium_mg", "calcium_mg"];
    const items = work.filter((w) => !w.removed).map((w) => {
      if (w.scale === 1) return w.item;
      const scaled = { ...w.item };
      for (const n of NUTR) scaled[n] = Math.round(((w.item[n] || 0) * w.scale) * 10) / 10;
      scaled.serving_quantity = (w.item.serving_quantity || 1) * w.scale;
      scaled.serving_display = w.item.serving_unit
        ? `${scaled.serving_quantity} × ${w.item.serving_unit}`
        : `${w.item.serving_display || "1 serving"} ×${w.scale}`;
      return scaled;
    });
    if (!items.length) return toast("A template needs at least one item — delete it instead", true);
    try {
      await api(`/api/nutrition/template/${t.id}`, {
        method: "PATCH",
        body: { name: el.querySelector(".te-name").value, meal_type: el.querySelector(".te-type").value || null, items },
      });
      toast("Template updated");
      editingTemplateId = null;
      loadTemplates();
    } catch (err) { toast(err.message, true); }
  });
  return el;
}

async function loadTemplates() {
  const list = await api(`/api/nutrition/templates?user_id=${encodeURIComponent(userId())}`);
  const box = $("templates");
  box.innerHTML = "";
  if (!list.length) {
    box.innerHTML = `<div class="empty">No templates yet — save a meal as one, or build one in the food library.</div>`;
    return;
  }
  for (const t of list) {
    const row = document.createElement("div");
    row.className = "item";
    row.innerHTML = `
      <div class="main"><div class="title">${esc(t.name)}</div>
        <div class="meta">${esc(t.meal_type || "any")} · ${t.items.length} items · ${Math.round(t.items.reduce((a, i) => a + (i.calories_kcal || 0), 0))} kcal · ${qtyText(t.items.reduce((a, i) => a + (i.protein_g || 0), 0))}g protein</div></div>
      <div style="white-space:nowrap">
        <button class="btn-sm" data-apply>Add to day</button>
        <button class="btn-ghost btn-sm" data-edit>✎</button>
        <button class="btn-danger" data-del>✕</button>
      </div>`;
    row.querySelector("[data-apply]").addEventListener("click", async () => {
      try {
        await api(`/api/nutrition/template/${t.id}/apply`, { method: "POST", body: { user_id: userId(), date: date() } });
        toast(`"${t.name}" added to ${date()}`);
        loadDay();
      } catch (err) { toast(err.message, true); }
    });
    row.querySelector("[data-edit]").addEventListener("click", () => {
      editingTemplateId = editingTemplateId === t.id ? null : t.id;
      loadTemplates();
    });
    row.querySelector("[data-del]").addEventListener("click", async () => {
      if (!confirm(`Delete template "${t.name}"?`)) return;
      await api(`/api/nutrition/template/${t.id}`, { method: "DELETE" });
      toast("Template deleted");
      loadTemplates();
    });
    box.appendChild(row);
    if (editingTemplateId === t.id) box.appendChild(templateEditor(t));
  }
}

async function loadGoals() {
  const g = await api(`/api/nutrition/goals?user_id=${encodeURIComponent(userId())}`);
  $("g-protein").value = g?.daily_protein_target_g ?? "";
  $("g-fiber").value = g?.min_daily_fiber_g ?? "";
  $("g-sodium").value = g?.max_daily_sodium_mg ?? "";
  $("g-satfat").value = g?.max_daily_saturated_fat_g ?? "";
  $("g-chol").value = g?.max_daily_cholesterol_mg ?? "";
  $("g-sugar").value = g?.max_daily_added_sugar_g ?? "";
}

$("btn-food").addEventListener("click", async () => {
  const text = $("food-text").value.trim();
  if (!text) return toast("Describe what you ate first", true);
  $("btn-food").disabled = true;
  try {
    const res = await api("/api/nutrition/log", {
      method: "POST",
      body: { user_id: userId(), text, date: date(), meal_type: $("meal-type").value || undefined },
    });
    toast(`Logged ${res.items_added} item(s) as ${res.meal_type}`);
    $("food-text").value = "";
    loadDay();
  } catch (err) { toast(err.message, true); }
  finally { $("btn-food").disabled = false; }
});

$("btn-goals").addEventListener("click", async () => {
  const num = (id) => ($(id).value === "" ? null : Number($(id).value));
  try {
    await api("/api/nutrition/goals", {
      method: "POST",
      body: {
        user_id: userId(),
        daily_protein_target_g: num("g-protein"),
        min_daily_fiber_g: num("g-fiber"),
        max_daily_sodium_mg: num("g-sodium"),
        max_daily_saturated_fat_g: num("g-satfat"),
        max_daily_cholesterol_mg: num("g-chol"),
        max_daily_added_sugar_g: num("g-sugar"),
      },
    });
    toast("Goals saved");
  } catch (err) { toast(err.message, true); }
});

// --- Food library ---

const draft = []; // [{food, servings}]

const CAT_LABELS = {
  protein: "Protein", dairy_eggs: "Dairy & eggs", grains: "Grains & starches", fruits: "Fruits",
  vegetables: "Vegetables", legumes_nuts: "Legumes & nuts", fats_condiments: "Fats & condiments",
  snacks: "Snacks & sweets", prepared: "Prepared & restaurant", drinks: "Drinks", custom: "My foods",
};

async function loadCategories() {
  const cats = await api("/api/foods/categories");
  $("lib-category").innerHTML = `<option value="">all</option>` +
    cats.map((c) => `<option value="${esc(c.category)}">${esc(CAT_LABELS[c.category] || c.category)} (${c.count})</option>`).join("");
}

let searchTimer;
async function searchLibrary() {
  const q = $("lib-search").value.trim();
  const cat = $("lib-category").value;
  if (!q && !cat) { $("lib-results").innerHTML = `<div class="empty">Search the library or pick a category.</div>`; return; }
  const foods = await api(`/api/foods?q=${encodeURIComponent(q)}&category=${encodeURIComponent(cat)}`);
  $("lib-results").innerHTML = foods.length
    ? foods.map((f) => `
      <div class="item food-result" data-food-row="${f.id}">
        <div class="main"><div class="title">${esc(f.name)}${f.source === "custom" ? ' <span class="pill gray">mine</span>' : ""}</div>
          <div class="meta">per ${esc(f.serving_display)}</div>
          <div class="macro-row"><span>${Math.round(f.calories_kcal)} kcal</span><span class="macro-protein">${qtyText(f.protein_g)}g protein</span><span>${qtyText(f.carbs_g)}g carbs</span><span>${qtyText(f.fat_g)}g fat</span></div></div>
        <div class="food-add-controls"><div class="quantity-control">
          <button class="qty-button" data-result-minus aria-label="Decrease quantity">−</button>
          <input type="number" class="result-qty" value="1" min="0.01" step="0.25" aria-label="Quantity" />
          <button class="qty-button" data-result-plus aria-label="Increase quantity">+</button>
        </div><button class="btn-sm" data-add="${f.id}">Add</button>${f.source === "custom" ? `<button class="btn-danger" data-del-food="${f.id}">✕</button>` : ""}</div>
      </div>`).join("")
    : `<div class="empty">No match — add it as a custom food below.</div>`;
  $("lib-results").querySelectorAll("[data-add]").forEach((b) =>
    b.addEventListener("click", () => {
      const food = foods.find((f) => f.id === b.dataset.add);
      const servings = Math.max(0.01, Number(b.closest("[data-food-row]").querySelector(".result-qty").value) || 1);
      const existing = draft.find((d) => d.food.id === food.id);
      if (existing) existing.servings += servings;
      else draft.push({ food, servings });
      renderDraft();
    })
  );
  $("lib-results").querySelectorAll("[data-result-minus], [data-result-plus]").forEach((b) =>
    b.addEventListener("click", () => {
      const input = b.closest(".quantity-control").querySelector("input");
      const delta = b.hasAttribute("data-result-plus") ? 0.25 : -0.25;
      input.value = qtyValue(Math.max(0.25, (Number(input.value) || 1) + delta));
    })
  );
  $("lib-results").querySelectorAll("[data-del-food]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Remove this custom food from the library?")) return;
      await api(`/api/foods/${b.dataset.delFood}`, { method: "DELETE" });
      toast("Removed from library");
      searchLibrary(); loadCategories();
    })
  );
}

function renderDraft() {
  $("draft-count").textContent = draft.length ? `${draft.length} selected` : "Nothing selected";
  if (!draft.length) {
    $("draft").innerHTML = `<div class="empty compact">Choose a food, set the quantity, then add it here.</div>`;
    $("draft-totals").innerHTML = "";
    $("btn-lib-log").disabled = true;
    $("btn-lib-template").disabled = true;
    return;
  }
  $("btn-lib-log").disabled = false;
  $("btn-lib-template").disabled = false;
  $("draft").innerHTML = draft.map((d, i) => `
    <div class="item">
      <div class="main"><div class="title">${esc(d.food.name)}</div>
        <div class="meta">${qtyText(d.servings)} × ${esc(d.food.serving_display)} · ${Math.round(d.food.calories_kcal * d.servings)} kcal · ${qtyText(d.food.protein_g * d.servings)}g protein</div></div>
      <div class="food-add-controls">
        <div class="quantity-control"><button class="qty-button" data-minus="${i}">−</button>
        <input type="number" data-draft-qty="${i}" value="${qtyValue(d.servings)}" min="0.01" step="0.25" aria-label="Quantity of ${esc(d.food.name)}" />
        <button class="qty-button" data-plus="${i}">+</button></div>
        <button class="btn-danger" data-remove="${i}">✕</button>
      </div>
    </div>`).join("");
  const sum = (k) => draft.reduce((a, d) => a + (Number(d.food[k]) || 0) * d.servings, 0);
  $("draft-totals").innerHTML = `<strong>${Math.round(sum("calories_kcal"))}</strong> kcal <span><strong>${qtyText(sum("protein_g"))}g</strong> protein</span><span>${qtyText(sum("carbs_g"))}g carbs</span><span>${qtyText(sum("fat_g"))}g fat</span><span>${qtyText(sum("fiber_g"))}g fiber</span>`;
  $("draft").querySelectorAll("[data-plus]").forEach((b) =>
    b.addEventListener("click", () => { draft[b.dataset.plus].servings += 0.25; renderDraft(); }));
  $("draft").querySelectorAll("[data-minus]").forEach((b) =>
    b.addEventListener("click", () => {
      const d = draft[b.dataset.minus];
      d.servings = Math.max(0.25, d.servings - 0.25);
      renderDraft();
    }));
  $("draft").querySelectorAll("[data-draft-qty]").forEach((input) =>
    input.addEventListener("change", () => {
      draft[input.dataset.draftQty].servings = Math.max(0.01, Number(input.value) || 1);
      renderDraft();
    }));
  $("draft").querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", () => { draft.splice(b.dataset.remove, 1); renderDraft(); }));
}

// Catalog foods carry an id; frequent-food and barcode entries are sent inline.
const picks = () => draft.map((d) => (d.food.id ? { food_id: d.food.id, servings: d.servings } : { item: d.food, servings: d.servings }));

function addToDraft(food) {
  const key = food.id || food.name;
  const existing = draft.find((d) => (d.food.id || d.food.name) === key);
  if (existing) existing.servings += 1;
  else draft.push({ food, servings: 1 });
  renderDraft();
}

// --- "Your usuals" — most-logged foods, one tap to the tray ---

async function loadFrequent() {
  const foods = await api(`/api/foods/frequent?user_id=${encodeURIComponent(userId())}`);
  if (!foods.length) { $("frequent-row").innerHTML = ""; return; }
  $("frequent-row").innerHTML =
    `<label>Your usuals</label>` +
    foods.map((f, i) => `<button class="btn-ghost btn-sm" data-freq="${i}" style="margin:2px 4px 2px 0">${esc(f.food_name)} <span class="muted">${Math.round(f.calories_kcal)}</span></button>`).join("");
  $("frequent-row").querySelectorAll("[data-freq]").forEach((b) =>
    b.addEventListener("click", () => {
      const f = foods[b.dataset.freq];
      addToDraft({ id: null, name: f.food_name, serving_display: f.serving_display, ...f });
      toast(`${f.food_name} added to picks`);
    })
  );
}

// --- Copy previous day ---

$("btn-copy-yesterday").addEventListener("click", async () => {
  const to = date();
  const from = new Date(to + "T12:00:00");
  from.setDate(from.getDate() - 1);
  const fromISO = todayISO(from);
  try {
    const res = await api("/api/nutrition/copy-day", {
      method: "POST",
      body: { user_id: userId(), from_date: fromISO, to_date: to },
    });
    toast(`Copied ${res.copied_meals} meal(s), ${res.copied_items} item(s) from ${fromISO}`);
    loadDay();
  } catch (err) { toast(err.message, true); }
});

// --- Barcode lookup (camera when available, manual entry always) ---

let scanStream = null;

function stopScan() {
  scanStream?.getTracks().forEach((t) => t.stop());
  scanStream = null;
  $("bc-video").style.display = "none";
}

async function handleBarcode(code) {
  stopScan();
  $("bc-code").value = code;
  $("bc-result").innerHTML = `<div class="empty"><span class="spin">⚡</span> Looking up ${esc(code)}…</div>`;
  try {
    const res = await api(`/api/foods/barcode/${encodeURIComponent(code)}`);
    if (!res.found) {
      $("bc-result").innerHTML = `<div class="empty">Not in OpenFoodFacts — add it as a custom food below.</div>`;
      return;
    }
    const f = res.food;
    $("bc-result").innerHTML = `
      <div class="item">
        <div class="main"><div class="title">${esc(f.name)}</div>
          <div class="meta">${esc(f.serving_display)} · ${Math.round(f.calories_kcal)} kcal · ${qtyText(f.protein_g)}g protein · ${Math.round(f.sodium_mg)}mg sodium${res.basis === "per_100g" ? " · per 100g" : ""}</div></div>
        <div style="white-space:nowrap">
          <button class="btn-sm" id="bc-add">+ Picks</button>
          <button class="btn-gold btn-sm" id="bc-save">Save to library</button>
        </div>
      </div>`;
    document.getElementById("bc-add").addEventListener("click", () => {
      addToDraft({ id: null, ...f });
      toast(`${f.name} added to picks`);
    });
    document.getElementById("bc-save").addEventListener("click", async () => {
      await api("/api/foods", { method: "POST", body: { ...f, category: "custom" } });
      toast("Saved to library");
      loadCategories();
    });
  } catch (err) {
    $("bc-result").innerHTML = `<div class="empty">${esc(err.message)}</div>`;
  }
}

$("btn-barcode").addEventListener("click", () => {
  const panel = $("barcode-panel");
  const open = panel.style.display !== "none";
  panel.style.display = open ? "none" : "";
  if (open) stopScan();
  else if ("BarcodeDetector" in window && navigator.mediaDevices?.getUserMedia) $("bc-scan").style.display = "";
});

$("bc-lookup").addEventListener("click", () => {
  const code = $("bc-code").value.trim();
  if (!code) return toast("Type the barcode digits", true);
  handleBarcode(code);
});

$("bc-scan").addEventListener("click", async () => {
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = $("bc-video");
    video.srcObject = scanStream;
    video.style.display = "";
    await video.play();
    const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
    const tick = async () => {
      if (!scanStream) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) return handleBarcode(codes[0].rawValue);
      } catch { /* keep scanning */ }
      requestAnimationFrame(tick);
    };
    tick();
  } catch (err) {
    toast(`Camera unavailable (${err.name}) — type the digits instead`, true);
  }
});

$("lib-search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchLibrary().catch(() => {}), 250); });
$("lib-category").addEventListener("change", () => searchLibrary().catch(() => {}));

$("btn-lib-log").addEventListener("click", async () => {
  try {
    const res = await api("/api/nutrition/log-catalog", {
      method: "POST",
      body: { user_id: userId(), date: date(), meal_type: $("lib-meal-type").value || undefined, picks: picks() },
    });
    toast(`Logged ${res.items_added} item(s) as ${res.meal_type}`);
    draft.length = 0; renderDraft(); loadDay();
  } catch (err) { toast(err.message, true); }
});

$("btn-lib-template").addEventListener("click", async () => {
  const name = prompt("Template name:", "");
  if (!name) return;
  try {
    await api("/api/nutrition/template-from-catalog", {
      method: "POST",
      body: { user_id: userId(), name, meal_type: $("lib-meal-type").value || null, picks: picks() },
    });
    toast(`Template "${name}" saved`);
    draft.length = 0; renderDraft(); loadTemplates();
  } catch (err) { toast(err.message, true); }
});

$("btn-lib-clear").addEventListener("click", () => { draft.length = 0; renderDraft(); });

$("btn-custom-food").addEventListener("click", async () => {
  const num = (id) => ($(id).value === "" ? 0 : Number($(id).value));
  try {
    const food = await api("/api/foods", {
      method: "POST",
      body: {
        name: $("cf-name").value, serving_display: $("cf-serving").value,
        calories_kcal: num("cf-cal"), protein_g: num("cf-protein"), carbs_g: num("cf-carbs"), fat_g: num("cf-fat"),
        fiber_g: num("cf-fiber"), sodium_mg: num("cf-sodium"), sat_fat_g: num("cf-satfat"), cholesterol_mg: num("cf-chol"),
      },
    });
    toast(`"${food.name}" added to library`);
    ["cf-name", "cf-serving", "cf-cal", "cf-protein", "cf-carbs", "cf-fat", "cf-fiber", "cf-sodium", "cf-satfat", "cf-chol"].forEach((id) => ($(id).value = ""));
    $("lib-search").value = food.name;
    searchLibrary();
    loadCategories();
  } catch (err) { toast(err.message, true); }
});

loadCategories().catch(() => {});
searchLibrary().catch(() => {});
renderDraft();

$("date").addEventListener("change", () => loadDay().catch((e) => toast(e.message, true)));
$("user").addEventListener("change", () => { loadDay(); loadTemplates(); loadGoals(); loadFrequent(); });

loadUsers()
  .then(() => Promise.all([loadDay(), loadTemplates(), loadGoals(), loadFrequent()]))
  .catch((e) => toast(e.message, true));
