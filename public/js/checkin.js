// Daily check-in (Today, Health, and the ＋ sheet). Every tap saves; the screen
// updates before the request returns, and saves run one at a time.
//
// mode "morning": sleep, sleep quality, energy (+ an optional weigh-in)
// mode "evening": stress, caffeine, drinks (+ "a line about today")
// mode "full":    everything, plus notes (Health page)
import { api, toast, esc, addDays, announceChange } from "./ui.js";

const SCALES = {
  sleep_quality: { label: "Sleep quality", ends: ["Rough", "Great"] },
  energy: { label: "Energy right now", ends: ["Drained", "Full of energy"] },
  stress: { label: "Stress today", ends: ["Calm", "Maxed out"] },
};
const OPTS = {
  caffeine_servings: { label: "Caffeine today (cups)", values: [0, 1, 2, 3, 4], top: "4+" },
  alcohol_drinks: { label: "Drinks today", values: [0, 1, 2, 3], top: "3+" },
};
const FIELDS = {
  morning: ["sleep_hours", "sleep_quality", "energy"],
  evening: ["stress", "caffeine_servings", "alcohol_drinks"],
  full: ["sleep_hours", "sleep_quality", "energy", "stress", "caffeine_servings", "alcohol_drinks"],
};

let uidSeq = 0;
export const morningDone = (s) => FIELDS.morning.every((f) => s?.[f] != null);
export const eveningDone = (s) => FIELDS.evening.every((f) => s?.[f] != null);

/**
 * @param {HTMLElement} el container
 * @param {{ date: string, mode?: "morning"|"evening"|"full", statusEl?: HTMLElement,
 *   collapse?: boolean, onChange?: (state) => void }} opts
 *   collapse: show a one-line summary when this half is already complete.
 */
export async function mountCheckin(el, { date, mode = "full", statusEl = null, collapse = false, onChange } = {}) {
  const uid = `ci${++uidSeq}`;
  const [initial, recent, reflection, weights] = await Promise.all([
    api(`/api/checkins/${date}`),
    api(`/api/checkins?start=${addDays(date, -14)}&end=${addDays(date, -1)}`),
    mode === "evening" ? api(`/api/reflections/day?date=${date}`).catch(() => ({})) : null,
    mode === "morning" ? api(`/api/body?start=${addDays(date, -45)}&end=${date}`).catch(() => []) : null,
  ]);
  let state = initial;
  const lastSleep = recent.find((r) => r.sleep_hours != null)?.sleep_hours ?? null;
  const weighIns = (weights || []).filter((r) => r.weight_lbs != null);
  const todayWeight = weighIns.find((r) => r.date === date)?.weight_lbs ?? null;
  const lastWeight = weighIns.filter((r) => r.date < date).pop() || null;
  const fields = FIELDS[mode];
  const complete = () => fields.every((f) => state[f] != null);
  let expanded = !collapse || !complete();

  const setStatus = (text) => { if (statusEl) statusEl.textContent = text; };

  let queue = Promise.resolve();
  function save(field, value) {
    state = { ...state, [field]: value };
    sync();
    setStatus("Saving…");
    queue = queue
      .then(() => api("/api/checkins", { method: "PUT", body: { date, [field]: value } }))
      .then(() => {
        setStatus("Saved ✓");
        onChange?.(state);
        announceChange("checkin");
      })
      .catch(async (err) => {
        toast(err, true);
        setStatus("");
        state = await api(`/api/checkins/${date}`).catch(() => state);
        sync();
      });
  }

  function summary() {
    const bits = [];
    if (fields.includes("sleep_hours") && state.sleep_hours != null) bits.push(`${state.sleep_hours} h sleep`);
    if (fields.includes("sleep_quality") && state.sleep_quality != null) bits.push(`quality ${state.sleep_quality}/5`);
    if (fields.includes("energy") && state.energy != null) bits.push(`energy ${state.energy}/5`);
    if (fields.includes("stress") && state.stress != null) bits.push(`stress ${state.stress}/5`);
    if (fields.includes("caffeine_servings") && state.caffeine_servings != null) bits.push(`${state.caffeine_servings} caffeine`);
    if (fields.includes("alcohol_drinks") && state.alcohol_drinks != null) bits.push(`${state.alcohol_drinks} drinks`);
    return bits.join(" · ");
  }

  const rating = (field) => {
    const s = SCALES[field];
    // "right now" only makes sense in the morning check-in, not when looking back.
    const label = field === "energy" && mode !== "morning" ? "Energy" : s.label;
    return `<span class="field-label" id="${uid}-${field}">${label}</span>
      <div class="rate" role="group" aria-labelledby="${uid}-${field}">${[1, 2, 3, 4, 5].map((n) =>
        `<button type="button" data-rate="${field}" data-v="${n}" aria-pressed="false"
          aria-label="${n} of 5${n === 1 ? `, ${s.ends[0]}` : n === 5 ? `, ${s.ends[1]}` : ""}">${n}</button>`).join("")}</div>
      <div class="scale-legend" aria-hidden="true"><span>${s.ends[0]}</span><span>${s.ends[1]}</span></div>`;
  };

  const options = (field) => {
    const o = OPTS[field];
    return `<span class="field-label" id="${uid}-${field}">${o.label}</span>
      <div class="opts" role="group" aria-labelledby="${uid}-${field}">${o.values.map((n, i) =>
        `<button type="button" data-opt="${field}" data-v="${n}" aria-pressed="false">${i === o.values.length - 1 ? o.top : n}</button>`).join("")}</div>`;
  };

  const sleepChips = () => {
    const hours = [...new Set([lastSleep, 6, 7, 8].filter((h) => h != null))];
    return hours.map((h, i) =>
      `<button type="button" class="chip" data-sleep-set="${h}" aria-pressed="false">${i === 0 && h === lastSleep ? `Same as last night (${h} h)` : `${h} h`}</button>`).join("");
  };

  function render() {
    if (!expanded) {
      el.innerHTML = `<div class="checkin-done">
        <span class="pill green">Checked in ✓</span>
        <span class="muted small">${esc(summary())}</span>
        <button type="button" class="btn-ghost btn-sm" data-edit>Edit</button></div>`;
      el.querySelector("[data-edit]").addEventListener("click", () => { expanded = true; render(); });
      return;
    }
    const parts = [];
    if (fields.includes("sleep_hours")) {
      parts.push(`<span class="field-label" id="${uid}-sleep">Sleep last night</span>
        <div class="sleep-row">
          <div class="stepper" role="group" aria-labelledby="${uid}-sleep">
            <button type="button" data-sleep="-0.5" aria-label="Half an hour less">−</button>
            <output aria-live="polite" data-sleep-out></output>
            <button type="button" data-sleep="0.5" aria-label="Half an hour more">+</button>
          </div>
        </div>
        <div class="chips mt">${sleepChips()}</div>`);
    }
    if (fields.includes("sleep_quality")) parts.push(rating("sleep_quality"));
    if (fields.includes("energy")) parts.push(rating("energy"));
    if (fields.includes("stress")) parts.push(rating("stress"));
    if (fields.includes("caffeine_servings")) parts.push(options("caffeine_servings"));
    if (fields.includes("alcohol_drinks")) parts.push(options("alcohol_drinks"));
    if (mode === "morning") {
      parts.push(`<details class="more mt"${todayWeight != null ? " open" : ""}><summary>Weigh-in (optional)</summary>
        <div class="row" style="align-items:center">
          <div><label for="${uid}-w" class="sr-only">Weight in pounds</label>
            <input id="${uid}-w" type="number" inputmode="decimal" step="0.1" enterkeyhint="done" data-weight
              value="${todayWeight ?? ""}" placeholder="${lastWeight ? `Last: ${lastWeight.weight_lbs}` : "lbs"}" /></div>
          <button type="button" class="btn-ghost fit" data-weight-save>Save</button>
        </div></details>`);
    }
    if (mode === "evening") {
      parts.push(`<label for="${uid}-note">A line about today</label>
        <textarea id="${uid}-note" rows="2" data-reflection placeholder="How did today feel?">${esc(reflection?.body || "")}</textarea>`);
    }
    if (mode === "full") {
      parts.push(`<label for="${uid}-notes">Notes</label>
        <input id="${uid}-notes" data-notes value="${esc(state.notes ?? "")}" placeholder="Anything worth remembering about today" />`);
    }
    if (collapse) parts.push(`<button type="button" class="btn-ghost btn-sm mt" data-done hidden>Done</button>`);
    el.innerHTML = parts.join("");
    wire();
    sync();
  }

  /** Reflect `state` in the controls in place (no re-render, so focus stays put). */
  function sync() {
    if (!expanded) return render();
    const out = el.querySelector("[data-sleep-out]");
    if (out) out.textContent = state.sleep_hours != null ? `${state.sleep_hours} h` : "—";
    el.querySelectorAll("[data-sleep-set]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.sleepSet) === state.sleep_hours)));
    el.querySelectorAll("[data-rate]").forEach((b) => b.setAttribute("aria-pressed", String(state[b.dataset.rate] === Number(b.dataset.v))));
    el.querySelectorAll("[data-opt]").forEach((b) => {
      const o = OPTS[b.dataset.opt];
      const v = Number(b.dataset.v);
      const cur = state[b.dataset.opt];
      const top = v === o.values[o.values.length - 1];
      b.setAttribute("aria-pressed", String(cur != null && (top ? cur >= v : cur === v)));
      if (top) b.textContent = cur != null && cur > v ? String(cur) : o.top;
    });
    const done = el.querySelector("[data-done]");
    if (done) done.hidden = !complete();
  }

  function wire() {
    el.querySelectorAll("[data-rate]").forEach((b) =>
      b.addEventListener("click", () => {
        const f = b.dataset.rate;
        const v = Number(b.dataset.v);
        save(f, state[f] === v ? null : v); // tap again to clear
      })
    );
    el.querySelectorAll("[data-opt]").forEach((b) =>
      b.addEventListener("click", () => {
        const f = b.dataset.opt;
        const v = Number(b.dataset.v);
        const o = OPTS[f];
        const top = v === o.values[o.values.length - 1];
        // "4+" steps up on repeat taps; any other value toggles.
        if (top && state[f] != null && state[f] >= v) save(f, Math.min(state[f] + 1, 20));
        else save(f, state[f] === v ? null : v);
      })
    );
    el.querySelectorAll("[data-sleep]").forEach((b) =>
      b.addEventListener("click", () => {
        const d = Number(b.dataset.sleep);
        const next = state.sleep_hours == null ? lastSleep ?? 7 : Math.min(24, Math.max(0, state.sleep_hours + d));
        save("sleep_hours", next);
      })
    );
    el.querySelectorAll("[data-sleep-set]").forEach((b) =>
      b.addEventListener("click", () => save("sleep_hours", Number(b.dataset.sleepSet)))
    );
    el.querySelector("[data-notes]")?.addEventListener("change", (e) => save("notes", e.target.value));
    el.querySelector("[data-done]")?.addEventListener("click", () => { expanded = false; render(); });
    el.querySelector("[data-reflection]")?.addEventListener("change", async (e) => {
      try {
        await api("/api/reflections/day", { method: "PUT", body: { date, body: e.target.value } });
        setStatus("Saved ✓");
        announceChange("note");
      } catch (err) { toast(err, true); }
    });
    el.querySelector("[data-weight-save]")?.addEventListener("click", async () => {
      const w = Number(el.querySelector("[data-weight]").value);
      if (!w) return toast("Enter your weight first", true);
      try {
        await api("/api/body", { method: "PUT", body: { date, weight_lbs: w } });
        toast(`Weighed in at ${w} lbs`);
        setStatus("Saved ✓");
        announceChange("weight");
      } catch (err) { toast(err, true); }
    });
  }

  render();
  return { get state() { return state; } };
}
