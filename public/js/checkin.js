// Daily check-in widget (dashboard + Health page): every tap saves immediately.
import { api, toast, esc, addDays } from "./ui.js";

const SCALES = {
  sleep_quality: { label: "Sleep quality", ends: ["Awful", "Great"] },
  stress: { label: "Stress today", ends: ["Calm", "Maxed out"] },
  energy: { label: "Energy today", ends: ["Drained", "Great"] },
};
const STEPPERS = {
  caffeine_servings: { label: "Caffeine (cups)", step: 1 },
  alcohol_drinks: { label: "Alcohol (drinks)", step: 1 },
};

const isCheckedIn = (s) => s.sleep_hours != null || s.stress != null || s.energy != null || s.sleep_quality != null;

/**
 * @param {HTMLElement} el container
 * @param {{ date: string, compact?: boolean, onChange?: (state) => void }} opts
 *   compact: collapse to a one-line summary once checked in (dashboard).
 */
export async function mountCheckin(el, { date, compact = false, onChange } = {}) {
  let state = await api(`/api/checkins/${date}`);
  const recent = await api(`/api/checkins?start=${addDays(date, -14)}&end=${addDays(date, -1)}`);
  const lastSleep = recent.find((r) => r.sleep_hours != null)?.sleep_hours ?? null;
  let expanded = !compact || !isCheckedIn(state);

  async function save(field, value) {
    try {
      state = await api("/api/checkins", { method: "PUT", body: { date, [field]: value } });
      render();
      onChange?.(state);
    } catch (err) {
      toast(err.message, true);
    }
  }

  function summary() {
    const bits = [];
    if (state.sleep_hours != null) bits.push(`${state.sleep_hours} h sleep`);
    if (state.stress != null) bits.push(`stress ${state.stress}/5`);
    if (state.energy != null) bits.push(`energy ${state.energy}/5`);
    if (state.caffeine_servings != null) bits.push(`${state.caffeine_servings} caffeine`);
    if (state.alcohol_drinks) bits.push(`${state.alcohol_drinks} drinks`);
    return bits.join(" · ");
  }

  function render() {
    if (!expanded) {
      el.innerHTML = `<div class="row" style="align-items:center">
        <span class="pill green fit">Checked in ✓</span>
        <span class="muted small">${esc(summary())}</span>
        <button class="btn-ghost btn-sm fit" data-edit>Edit</button></div>`;
      el.querySelector("[data-edit]").addEventListener("click", () => { expanded = true; render(); });
      return;
    }
    const seg = (field) => {
      const s = SCALES[field];
      return `<label>${s.label}</label>
        <div class="seg" data-scale="${field}">${[1, 2, 3, 4, 5]
          .map((n) => `<button type="button" class="${state[field] === n ? "on" : ""}" data-v="${n}">${n}</button>`).join("")}</div>
        <div class="scale-legend"><span>1 · ${s.ends[0]}</span><span>5 · ${s.ends[1]}</span></div>`;
    };
    const stepper = (field) => `<div><label>${STEPPERS[field].label}</label>
      <div class="quantity-control">
        <button type="button" class="qty-button" data-step="${field}" data-d="-1">−</button>
        <input type="number" min="0" step="1" data-num="${field}" value="${state[field] ?? ""}" placeholder="—" />
        <button type="button" class="qty-button" data-step="${field}" data-d="1">+</button>
      </div></div>`;
    el.innerHTML = `
      <label>Last night's sleep</label>
      <div class="row" style="align-items:center">
        <div class="quantity-control fit">
          <button type="button" class="qty-button" data-step="sleep_hours" data-d="-0.5">−</button>
          <input type="number" min="0" max="24" step="0.5" data-num="sleep_hours" value="${state.sleep_hours ?? ""}" placeholder="${lastSleep ?? "—"}" />
          <button type="button" class="qty-button" data-step="sleep_hours" data-d="0.5">+</button>
        </div>
        <span class="muted small fit">hours</span>
        ${state.sleep_hours == null && lastSleep != null ? `<button type="button" class="btn-ghost btn-sm fit" data-same>Same as before (${lastSleep} h)</button>` : ""}
      </div>
      ${seg("sleep_quality")}
      ${seg("stress")}
      ${seg("energy")}
      <div class="row mt">${stepper("caffeine_servings")}${stepper("alcohol_drinks")}</div>
      ${compact ? "" : `<label>Notes</label><input data-notes value="${esc(state.notes ?? "")}" placeholder="Anything worth remembering about today" />`}
      ${compact && isCheckedIn(state) ? `<button type="button" class="btn-ghost btn-sm mt" data-done>Done</button>` : ""}`;

    el.querySelectorAll("[data-scale]").forEach((g) =>
      g.querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => {
          const v = Number(b.dataset.v);
          save(g.dataset.scale, state[g.dataset.scale] === v ? null : v); // tap again to clear
        })
      )
    );
    el.querySelectorAll("[data-step]").forEach((b) =>
      b.addEventListener("click", () => {
        const f = b.dataset.step;
        const d = Number(b.dataset.d);
        const base = state[f] ?? (f === "sleep_hours" ? lastSleep ?? 7 : 0);
        const next = state[f] == null && d < 0 && f !== "sleep_hours" ? 0 : Math.max(0, base + (state[f] == null && f === "sleep_hours" ? 0 : d));
        save(f, next);
      })
    );
    el.querySelectorAll("[data-num]").forEach((i) =>
      i.addEventListener("change", () => save(i.dataset.num, i.value === "" ? null : Number(i.value)))
    );
    el.querySelector("[data-same]")?.addEventListener("click", () => save("sleep_hours", lastSleep));
    el.querySelector("[data-notes]")?.addEventListener("change", (e) => save("notes", e.target.value));
    el.querySelector("[data-done]")?.addEventListener("click", () => { expanded = false; render(); });
  }

  render();
  return { get state() { return state; } };
}
