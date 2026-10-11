// Canonical lab markers: names labs print → one key, US conventional units,
// unit conversions, and context the AI should know when reading them.
//
// conversions: { fromUnit: (v) => value in canonical units }. Functions, not
//   factors, because some conversions aren't linear (A1c mmol/mol → %).
// equivalents: units that are the same quantity under another name.
// keepAsReported: units with no safe conversion (Lp(a) mg/dL vs nmol/L) —
//   stored as-is; trends are drawn per unit.
// critical: canonical-unit values labs treat as urgent (call-back range).
// better: "lower" | "higher" — for coloring changes; omitted = within range is the goal.
// note: confounders and context passed to the AI.

const MMOL_CHOL = { "mmol/L": (v) => v * 38.67 };

export const LAB_MARKERS = [
  // --- Lipids ---
  { key: "total_cholesterol", name: "Total cholesterol", panel: "Lipids", unit: "mg/dL", better: "lower",
    aliases: ["cholesterol, total", "total cholesterol", "cholesterol", "chol", "cholesterol total", "tc"], conversions: MMOL_CHOL },
  { key: "ldl_c", name: "LDL cholesterol", panel: "Lipids", unit: "mg/dL", better: "lower",
    aliases: ["ldl", "ldl-c", "ldl cholesterol", "ldl chol calc (nih)", "ldl-cholesterol", "ldl calc", "ldl cholesterol calc", "ldl cholesterol calculated",
      "ldl direct", "ldl-c (calculated)", "ldl chol", "ldl cholesterol (calc)", "ldl-cholesterol calc", "ldl, calculated"],
    conversions: MMOL_CHOL,
    note: "Statins lower LDL substantially; a big drop between draws may reflect a medication change. Calculated LDL is less accurate when triglycerides are high." },
  { key: "hdl_c", name: "HDL cholesterol", panel: "Lipids", unit: "mg/dL", better: "higher",
    aliases: ["hdl", "hdl-c", "hdl cholesterol", "hdl chol", "hdl-cholesterol"], conversions: MMOL_CHOL,
    note: "Regular aerobic exercise tends to raise HDL modestly." },
  { key: "triglycerides", name: "Triglycerides", panel: "Lipids", unit: "mg/dL", better: "lower",
    aliases: ["triglycerides", "triglyceride", "trig", "trigs", "tg"], conversions: { "mmol/L": (v) => v * 88.57 },
    note: "Very sensitive to fasting status, recent alcohol, and refined carbs/added sugar in the days before the draw." },
  { key: "non_hdl_c", name: "Non-HDL cholesterol", panel: "Lipids", unit: "mg/dL", better: "lower",
    aliases: ["non-hdl cholesterol", "non hdl cholesterol", "non-hdl-c", "non-hdl", "non hdl", "cholesterol, non-hdl"], conversions: MMOL_CHOL },
  { key: "vldl_c", name: "VLDL cholesterol", panel: "Lipids", unit: "mg/dL", better: "lower",
    aliases: ["vldl", "vldl cholesterol", "vldl cholesterol cal", "vldl-c", "vldl chol calc"], conversions: MMOL_CHOL },
  { key: "chol_hdl_ratio", name: "Cholesterol/HDL ratio", panel: "Lipids", unit: "ratio", better: "lower",
    aliases: ["chol/hdl ratio", "cholesterol/hdl ratio", "total chol/hdl ratio", "t. chol/hdl ratio", "tc/hdl ratio"] },
  { key: "apob", name: "Apolipoprotein B", panel: "Lipids", unit: "mg/dL", better: "lower",
    aliases: ["apob", "apo b", "apolipoprotein b", "apolipoprotein b-100", "apolipoprotein b100"], conversions: { "g/L": (v) => v * 100 } },
  { key: "lpa", name: "Lipoprotein(a)", panel: "Lipids", unit: "nmol/L", better: "lower",
    aliases: ["lipoprotein(a)", "lipoprotein (a)", "lp(a)", "lpa", "lipoprotein a"], keepAsReported: ["nmol/L", "mg/dL"],
    note: "Largely genetic and stable over life; mg/dL and nmol/L can't be converted between each other." },

  // --- Blood sugar ---
  { key: "glucose", name: "Glucose", panel: "Blood sugar", unit: "mg/dL",
    aliases: ["glucose", "glucose, serum", "fasting glucose", "glucose fasting", "glucose, fasting", "fbg", "blood glucose", "glucose, plasma"],
    conversions: { "mmol/L": (v) => v * 18.016 }, critical: { low: 50, high: 400 },
    note: "Only meaningful as 'fasting' if the draw was fasting." },
  { key: "a1c", name: "Hemoglobin A1c", panel: "Blood sugar", unit: "%", better: "lower",
    aliases: ["hemoglobin a1c", "hba1c", "a1c", "hgb a1c", "glycated hemoglobin", "glycohemoglobin", "hemoglobin a1c (hba1c)"],
    conversions: { "mmol/mol": (v) => v / 10.929 + 2.15 },
    note: "Reflects roughly the last 2–3 months of average blood sugar." },
  { key: "insulin", name: "Insulin (fasting)", panel: "Blood sugar", unit: "µIU/mL",
    aliases: ["insulin", "fasting insulin", "insulin, fasting"], equivalents: ["mIU/L"], conversions: { "pmol/L": (v) => v / 6 } },

  // --- Kidney & electrolytes ---
  { key: "sodium", name: "Sodium", panel: "Kidney & electrolytes", unit: "mmol/L",
    aliases: ["sodium", "na", "sodium, serum"], equivalents: ["mEq/L"], critical: { low: 120, high: 160 } },
  { key: "potassium", name: "Potassium", panel: "Kidney & electrolytes", unit: "mmol/L",
    aliases: ["potassium", "k", "potassium, serum"], equivalents: ["mEq/L"], critical: { low: 2.8, high: 6.2 },
    note: "A hemolyzed (damaged) sample can falsely raise potassium; mildly high values are often re-checked." },
  { key: "chloride", name: "Chloride", panel: "Kidney & electrolytes", unit: "mmol/L",
    aliases: ["chloride", "cl", "chloride, serum"], equivalents: ["mEq/L"] },
  { key: "co2", name: "Carbon dioxide (bicarbonate)", panel: "Kidney & electrolytes", unit: "mmol/L",
    aliases: ["carbon dioxide", "co2", "carbon dioxide, total", "bicarbonate", "total co2", "hco3", "co2, total"], equivalents: ["mEq/L"] },
  { key: "bun", name: "BUN (urea nitrogen)", panel: "Kidney & electrolytes", unit: "mg/dL",
    aliases: ["bun", "urea nitrogen", "blood urea nitrogen", "urea nitrogen (bun)", "urea nitrogen, blood"],
    conversions: { "mmol/L": (v) => v * 2.8 },
    note: "Rises with high protein intake and dehydration." },
  { key: "creatinine", name: "Creatinine", panel: "Kidney & electrolytes", unit: "mg/dL",
    aliases: ["creatinine", "creatinine, serum", "creat", "creatinine, blood"], conversions: { "µmol/L": (v) => v / 88.4 },
    note: "Runs higher with more muscle mass, creatine supplements, a high-protein meal or hard exercise before the draw; eGFR is calculated from it." },
  { key: "egfr", name: "eGFR", panel: "Kidney & electrolytes", unit: "mL/min/1.73m²", better: "higher",
    aliases: ["egfr", "estimated gfr", "egfr (ckd-epi)", "egfr cr", "gfr, estimated", "egfr if nonafricn am", "egfr non-afr. american", "egfr creatinine"],
    patterns: [/^e?gfr\b/],
    note: "Calculated from creatinine, so it reads low in muscular people and after creatine supplements." },
  { key: "bun_creatinine_ratio", name: "BUN/creatinine ratio", panel: "Kidney & electrolytes", unit: "ratio",
    aliases: ["bun/creatinine ratio", "bun/creat ratio", "urea nitrogen/creatinine ratio"] },
  { key: "calcium", name: "Calcium", panel: "Kidney & electrolytes", unit: "mg/dL",
    aliases: ["calcium", "ca", "calcium, serum", "calcium, total"], conversions: { "mmol/L": (v) => v * 4.008 }, critical: { low: 6.5, high: 13 } },
  { key: "magnesium", name: "Magnesium", panel: "Kidney & electrolytes", unit: "mg/dL",
    aliases: ["magnesium", "magnesium, serum", "mg"], conversions: { "mmol/L": (v) => v * 2.431 } },
  { key: "uric_acid", name: "Uric acid", panel: "Kidney & electrolytes", unit: "mg/dL",
    aliases: ["uric acid", "urate", "uric acid, serum"], conversions: { "µmol/L": (v) => v / 59.48 } },
  { key: "urine_acr", name: "Urine albumin/creatinine ratio", panel: "Kidney & electrolytes", unit: "mg/g", better: "lower",
    aliases: ["albumin/creatinine ratio", "microalbumin/creatinine ratio", "urine albumin/creatinine ratio", "uacr", "acr",
      "albumin/creatinine ratio, random urine", "microalb/creat ratio"],
    conversions: { "mg/mmol": (v) => v * 8.84 }, note: "Can rise temporarily after hard exercise." },

  // --- Liver & proteins ---
  { key: "alt", name: "ALT", panel: "Liver", unit: "U/L",
    aliases: ["alt", "alt (sgpt)", "sgpt", "alanine aminotransferase", "alt/sgpt"], equivalents: ["IU/L"],
    note: "Can rise for days after hard lifting; statins and alcohol can raise it too." },
  { key: "ast", name: "AST", panel: "Liver", unit: "U/L",
    aliases: ["ast", "ast (sgot)", "sgot", "aspartate aminotransferase", "ast/sgot"], equivalents: ["IU/L"],
    note: "Also comes from muscle — commonly elevated for several days after hard training." },
  { key: "alp", name: "Alkaline phosphatase", panel: "Liver", unit: "U/L",
    aliases: ["alkaline phosphatase", "alk phos", "alp", "alkaline phosphatase, serum"], equivalents: ["IU/L"] },
  { key: "ggt", name: "GGT", panel: "Liver", unit: "U/L",
    aliases: ["ggt", "gamma-glutamyl transferase", "gamma gt", "gamma glutamyl transferase"], equivalents: ["IU/L"],
    note: "Sensitive to alcohol intake." },
  { key: "bilirubin_total", name: "Bilirubin, total", panel: "Liver", unit: "mg/dL",
    aliases: ["bilirubin, total", "total bilirubin", "bilirubin", "bilirubin total", "t. bilirubin"], conversions: { "µmol/L": (v) => v / 17.1 },
    note: "Mildly high values with otherwise normal liver tests are often Gilbert's syndrome, which is harmless." },
  { key: "total_protein", name: "Total protein", panel: "Liver", unit: "g/dL",
    aliases: ["protein, total", "total protein", "protein total", "protein, total, serum"], conversions: { "g/L": (v) => v / 10 } },
  { key: "albumin", name: "Albumin", panel: "Liver", unit: "g/dL",
    aliases: ["albumin", "albumin, serum"], conversions: { "g/L": (v) => v / 10 } },
  { key: "globulin", name: "Globulin", panel: "Liver", unit: "g/dL",
    aliases: ["globulin", "globulin, total", "globulin, calculated"], conversions: { "g/L": (v) => v / 10 } },
  { key: "ag_ratio", name: "A/G ratio", panel: "Liver", unit: "ratio",
    aliases: ["a/g ratio", "albumin/globulin ratio", "a/g ratio (calc)"] },

  // --- Blood count ---
  { key: "wbc", name: "White blood cells", panel: "Blood count", unit: "10^3/µL",
    aliases: ["wbc", "white blood cell count", "white blood cells", "leukocytes", "wbc count", "white blood count"],
    equivalents: ["10^9/L"], critical: { low: 2, high: 30 } },
  { key: "rbc", name: "Red blood cells", panel: "Blood count", unit: "10^6/µL",
    aliases: ["rbc", "red blood cell count", "red blood cells", "erythrocytes", "rbc count"], equivalents: ["10^12/L"] },
  { key: "hemoglobin", name: "Hemoglobin", panel: "Blood count", unit: "g/dL",
    aliases: ["hemoglobin", "hgb", "hb", "haemoglobin"], conversions: { "g/L": (v) => v / 10, "mmol/L": (v) => v * 1.611 },
    critical: { low: 7, high: 20 } },
  { key: "hematocrit", name: "Hematocrit", panel: "Blood count", unit: "%",
    aliases: ["hematocrit", "hct", "haematocrit"], conversions: { "L/L": (v) => v * 100 } },
  { key: "mcv", name: "MCV", panel: "Blood count", unit: "fL", aliases: ["mcv", "mean corpuscular volume"] },
  { key: "mch", name: "MCH", panel: "Blood count", unit: "pg", aliases: ["mch", "mean corpuscular hemoglobin"] },
  { key: "mchc", name: "MCHC", panel: "Blood count", unit: "g/dL",
    aliases: ["mchc", "mean corpuscular hemoglobin concentration"], conversions: { "g/L": (v) => v / 10 } },
  { key: "rdw", name: "RDW", panel: "Blood count", unit: "%", aliases: ["rdw", "rdw-cv", "red cell distribution width"] },
  { key: "platelets", name: "Platelets", panel: "Blood count", unit: "10^3/µL",
    aliases: ["platelets", "platelet count", "plt", "platelet"], equivalents: ["10^9/L"], critical: { low: 20, high: 1000 } },
  { key: "neutrophils_abs", name: "Neutrophils (absolute)", panel: "Blood count", unit: "10^3/µL",
    aliases: ["neutrophils (absolute)", "neutrophils absolute", "abs neutrophils", "absolute neutrophils", "neutrophils, absolute", "anc",
      "neutrophils, abs", "neutrophil abs"], equivalents: ["10^9/L"] },
  { key: "lymphocytes_abs", name: "Lymphocytes (absolute)", panel: "Blood count", unit: "10^3/µL",
    aliases: ["lymphs (absolute)", "lymphocytes (absolute)", "absolute lymphocytes", "lymphocytes, absolute", "lymphs, abs", "lymphocyte abs"],
    equivalents: ["10^9/L"] },

  // --- Thyroid ---
  { key: "tsh", name: "TSH", panel: "Thyroid", unit: "mIU/L",
    aliases: ["tsh", "thyroid stimulating hormone", "tsh, 3rd generation", "thyrotropin", "tsh (thyroid stimulating hormone)"],
    equivalents: ["µIU/mL"], note: "Biotin supplements (common in hair/skin/nail products) can distort thyroid test results; many labs advise stopping biotin a few days before." },
  { key: "free_t4", name: "Free T4", panel: "Thyroid", unit: "ng/dL",
    aliases: ["free t4", "t4, free", "t4 free", "free thyroxine", "ft4", "t4,free(direct)", "thyroxine, free", "t4, free (direct)"],
    conversions: { "pmol/L": (v) => v / 12.87 } },
  { key: "free_t3", name: "Free T3", panel: "Thyroid", unit: "pg/mL",
    aliases: ["free t3", "t3, free", "ft3", "triiodothyronine, free", "t3 free"], conversions: { "pmol/L": (v) => v / 1.536 } },

  // --- Vitamins & iron ---
  { key: "vitamin_d", name: "Vitamin D (25-OH)", panel: "Vitamins & iron", unit: "ng/mL",
    aliases: ["vitamin d", "vitamin d, 25-hydroxy", "25-hydroxy vitamin d", "25-oh vitamin d", "vitamin d 25 oh", "vitamin d,25-hydroxy",
      "25(oh)d", "vitamin d, 25-oh, total", "25-hydroxyvitamin d", "vitamin d 25-hydroxy", "vit d 25 hydroxy"],
    conversions: { "nmol/L": (v) => v / 2.496 } },
  { key: "b12", name: "Vitamin B12", panel: "Vitamins & iron", unit: "pg/mL",
    aliases: ["vitamin b12", "b12", "cobalamin", "vitamin b-12", "vit b12"], conversions: { "pmol/L": (v) => v * 1.355 },
    note: "Metformin and acid-reducing medicines can lower B12 over time." },
  { key: "folate", name: "Folate", panel: "Vitamins & iron", unit: "ng/mL",
    aliases: ["folate", "folate (folic acid), serum", "folic acid", "folate, serum"], conversions: { "nmol/L": (v) => v / 2.266 } },
  { key: "ferritin", name: "Ferritin", panel: "Vitamins & iron", unit: "ng/mL",
    aliases: ["ferritin", "ferritin, serum"], equivalents: ["µg/L"],
    note: "Also rises with inflammation or illness, so a normal ferritin doesn't always rule out low iron." },
  { key: "iron", name: "Iron", panel: "Vitamins & iron", unit: "µg/dL",
    aliases: ["iron", "iron, total", "serum iron", "iron, serum"], conversions: { "µmol/L": (v) => v * 5.585 } },
  { key: "tibc", name: "TIBC", panel: "Vitamins & iron", unit: "µg/dL",
    aliases: ["tibc", "iron binding capacity", "total iron binding capacity", "iron bind.cap.(tibc)", "iron binding capacity, total"],
    conversions: { "µmol/L": (v) => v * 5.585 } },
  { key: "transferrin_sat", name: "Transferrin saturation", panel: "Vitamins & iron", unit: "%",
    aliases: ["transferrin saturation", "iron saturation", "% saturation", "iron % saturation", "tsat", "iron saturation (%)"] },

  // --- Inflammation, muscle, hormones ---
  { key: "crp_hs", name: "hs-CRP", panel: "Other", unit: "mg/L", better: "lower",
    aliases: ["hs-crp", "hscrp", "hs crp", "c-reactive protein, cardiac", "crp, high sensitivity", "high sensitivity crp",
      "c-reactive protein (high sensitivity)", "cardio crp", "c-reactive protein, high sensitivity"],
    conversions: { "mg/dL": (v) => v * 10 },
    note: "Temporarily raised by a recent cold or infection, injury, or a very hard workout — a single high reading is often re-checked." },
  { key: "crp", name: "C-reactive protein", panel: "Other", unit: "mg/L", better: "lower",
    aliases: ["crp", "c-reactive protein", "c reactive protein"], conversions: { "mg/dL": (v) => v * 10 } },
  { key: "ck", name: "Creatine kinase", panel: "Other", unit: "U/L",
    aliases: ["ck", "creatine kinase", "cpk", "creatine kinase, total", "ck, total"], equivalents: ["IU/L"],
    note: "Rises sharply for days after hard or unfamiliar exercise, especially lifting and long runs." },
  { key: "homocysteine", name: "Homocysteine", panel: "Other", unit: "µmol/L", aliases: ["homocysteine", "homocysteine, serum"] },
  { key: "psa", name: "PSA", panel: "Other", unit: "ng/mL",
    aliases: ["psa", "psa, total", "prostate specific antigen", "prostate-specific antigen", "psa total"], equivalents: ["µg/L"],
    note: "Can rise temporarily after cycling, ejaculation, or a prostate exam in the day or two before the draw." },
  { key: "testosterone_total", name: "Testosterone, total", panel: "Other", unit: "ng/dL",
    aliases: ["testosterone", "testosterone, total", "total testosterone", "testosterone, serum", "testosterone total"],
    conversions: { "nmol/L": (v) => v * 28.84 },
    note: "Highest in the morning; most guidelines want two early-morning measurements before calling it low." },
];

export const MARKERS_BY_KEY = Object.fromEntries(LAB_MARKERS.map((m) => [m.key, m]));
export const PANELS = [...new Set(LAB_MARKERS.map((m) => m.panel))];

// --- Units ------------------------------------------------------------------

const UNIT_MAP = {
  "mg/dl": "mg/dL", "mmol/l": "mmol/L", "µmol/l": "µmol/L", "umol/l": "µmol/L", "μmol/l": "µmol/L",
  "ng/ml": "ng/mL", "nmol/l": "nmol/L", "pg/ml": "pg/mL", "pmol/l": "pmol/L", "g/dl": "g/dL", "g/l": "g/L",
  "mg/l": "mg/L", "ng/dl": "ng/dL", "ug/dl": "µg/dL", "µg/dl": "µg/dL", "μg/dl": "µg/dL", "mcg/dl": "µg/dL",
  "ug/l": "µg/L", "µg/l": "µg/L", "μg/l": "µg/L", "mcg/l": "µg/L",
  "meq/l": "mEq/L", "u/l": "U/L", "iu/l": "IU/L", "units/l": "U/L",
  "%": "%", "percent": "%", "mmol/mol": "mmol/mol", "fl": "fL", "pg": "pg", "l/l": "L/L",
  "miu/l": "mIU/L", "uiu/ml": "µIU/mL", "µiu/ml": "µIU/mL", "μiu/ml": "µIU/mL", "miu/ml": "mIU/mL", "mu/l": "mIU/L",
  "mg/g": "mg/g", "mg/g creat": "mg/g", "mg/mmol": "mg/mmol", "ratio": "ratio",
  "ml/min/1.73m2": "mL/min/1.73m²", "ml/min/1.73 m2": "mL/min/1.73m²", "ml/min/1.73m²": "mL/min/1.73m²",
  "ml/min/1.73 m²": "mL/min/1.73m²", "ml/min/1.73": "mL/min/1.73m²", "ml/min": "mL/min/1.73m²",
};
const COUNT_UNITS = [
  [/^(x\s*)?10\s*(\^|e|\*|\(|x)?\s*3\)?\s*\/\s*(u|µ|μ)l$|^(k|thou|thous)\s*\/\s*(u|µ|μ|c)?(l|mm3)$|^10\^?3\/mm3$/, "10^3/µL"],
  [/^(x\s*)?10\s*(\^|e|\*|\(|x)?\s*6\)?\s*\/\s*(u|µ|μ)l$|^(m|mil|mill)\s*\/\s*(u|µ|μ|c)?(l|mm3)$/, "10^6/µL"],
  [/^(x\s*)?10\s*(\^|e|\*|\(|x)?\s*9\)?\s*\/\s*l$/, "10^9/L"],
  [/^(x\s*)?10\s*(\^|e|\*|\(|x)?\s*12\)?\s*\/\s*l$/, "10^12/L"],
];

/** Normalize how labs write units ("mg/dl", "x10E3/uL", "K/uL") to one spelling. */
export function normalizeUnit(unit) {
  if (unit == null) return null;
  const raw = String(unit).trim();
  if (!raw) return null;
  const u = raw.toLowerCase().replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/");
  if (UNIT_MAP[u]) return UNIT_MAP[u];
  const compact = u.replace(/\s+/g, "");
  if (UNIT_MAP[compact]) return UNIT_MAP[compact];
  for (const [re, canon] of COUNT_UNITS) if (re.test(compact)) return canon;
  return raw;
}

// --- Matching ---------------------------------------------------------------

const norm = (s) => String(s || "").toLowerCase().replace(/[*†‡¹²³]/g, "").replace(/\s+/g, " ").trim();
const ALIAS_INDEX = new Map();
for (const m of LAB_MARKERS) {
  for (const a of [m.key, m.name, ...m.aliases]) {
    const k = norm(a);
    if (!ALIAS_INDEX.has(k)) ALIAS_INDEX.set(k, m);
  }
}

/** Find the marker for a name as printed on a report, or null. */
export function findMarker(name) {
  const n = norm(name);
  if (!n) return null;
  const tries = [
    n,
    n.replace(/\s*\([^)]*\)\s*/g, " ").trim(), // drop parentheticals: "LDL Chol Calc (NIH)"
    n.replace(/,?\s*(serum|plasma|blood|whole blood|random|fasting)$/, "").trim(),
  ];
  for (const t of tries) if (ALIAS_INDEX.has(t)) return ALIAS_INDEX.get(t);
  for (const m of LAB_MARKERS) if (m.patterns?.some((re) => re.test(n))) return m;
  return null;
}

/**
 * Convert a value in `unit` to the marker's canonical unit.
 * Returns { value, unit } or null when there's no safe conversion.
 */
export function toCanonical(key, value, unit) {
  const m = MARKERS_BY_KEY[key];
  if (!m || value == null || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  const u = normalizeUnit(unit);
  if (m.keepAsReported) return m.keepAsReported.includes(u) ? { value: v, unit: u } : null;
  if (u == null || u === m.unit || m.equivalents?.includes(u)) {
    // No unit printed: assume canonical only for unitless ratios.
    if (u == null && m.unit !== "ratio") return null;
    return { value: v, unit: m.unit };
  }
  const fn = m.conversions?.[u];
  return fn ? { value: Math.round(fn(v) * 1000) / 1000, unit: m.unit } : null;
}
