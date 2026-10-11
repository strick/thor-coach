// Marker matching and unit handling — pure, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { findMarker, normalizeUnit, toCanonical, LAB_MARKERS } from "../src/data/labMarkers.js";

const close = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test("names as labs print them map to one marker", () => {
  const cases = {
    "LDL Chol Calc (NIH)": "ldl_c",
    "LDL-Cholesterol": "ldl_c",
    "Cholesterol, Total": "total_cholesterol",
    "HDL Cholesterol": "hdl_c",
    "Triglycerides": "triglycerides",
    "Hemoglobin A1c": "a1c",
    "eGFR If NonAfricn Am": "egfr",
    "eGFR (CKD-EPI 2021)": "egfr",
    "Glucose, Serum": "glucose",
    "Vitamin D, 25-Hydroxy": "vitamin_d",
    "ALT (SGPT)": "alt",
    "Platelets": "platelets",
    "hs-CRP": "crp_hs",
    "TSH": "tsh",
    "Lipoprotein (a)": "lpa",
  };
  for (const [name, key] of Object.entries(cases)) assert.equal(findMarker(name)?.key, key, name);
  assert.equal(findMarker("Mystery Analyte"), null);
  assert.equal(findMarker(""), null);
});

test("every alias is unique across markers", () => {
  const seen = new Map();
  for (const m of LAB_MARKERS) {
    for (const a of m.aliases) {
      const k = a.toLowerCase();
      assert.ok(!seen.has(k) || seen.get(k) === m.key, `alias "${a}" used by ${seen.get(k)} and ${m.key}`);
      seen.set(k, m.key);
    }
  }
});

test("unit spellings normalize", () => {
  assert.equal(normalizeUnit("mg/dl"), "mg/dL");
  assert.equal(normalizeUnit("MMOL/L"), "mmol/L");
  assert.equal(normalizeUnit("x10E3/uL"), "10^3/µL");
  assert.equal(normalizeUnit("K/uL"), "10^3/µL");
  assert.equal(normalizeUnit("10*3/uL"), "10^3/µL");
  assert.equal(normalizeUnit("x10E6/uL"), "10^6/µL");
  assert.equal(normalizeUnit("10^9/L"), "10^9/L");
  assert.equal(normalizeUnit("umol/L"), "µmol/L");
  assert.equal(normalizeUnit("uIU/mL"), "µIU/mL");
  assert.equal(normalizeUnit("mL/min/1.73m2"), "mL/min/1.73m²");
  assert.equal(normalizeUnit(" "), null);
  assert.equal(normalizeUnit("widgets"), "widgets");
});

test("conversions to US units", () => {
  close(toCanonical("ldl_c", 2.59, "mmol/L").value, 100.2);
  close(toCanonical("triglycerides", 1.7, "mmol/L").value, 150.6);
  close(toCanonical("glucose", 5.5, "mmol/L").value, 99.1);
  close(toCanonical("a1c", 48, "mmol/mol").value, 6.54, 0.01); // not a plain multiplier
  close(toCanonical("creatinine", 88.4, "µmol/L").value, 1.0, 0.001);
  close(toCanonical("vitamin_d", 75, "nmol/L").value, 30.0);
  close(toCanonical("hemoglobin", 145, "g/L").value, 14.5, 0.001);
  assert.deepEqual(toCanonical("wbc", 6.1, "x10E3/uL"), { value: 6.1, unit: "10^3/µL" });
  assert.deepEqual(toCanonical("wbc", 6.1, "10^9/L"), { value: 6.1, unit: "10^3/µL" }, "equivalent units pass through");
  assert.equal(toCanonical("ldl_c", 100, "furlongs"), null);
  assert.equal(toCanonical("ldl_c", 100, null), null, "no unit → can't assume");
  assert.deepEqual(toCanonical("chol_hdl_ratio", 3.4, null), { value: 3.4, unit: "ratio" });
});

test("Lp(a) is never converted between mg/dL and nmol/L", () => {
  assert.deepEqual(toCanonical("lpa", 75, "nmol/L"), { value: 75, unit: "nmol/L" });
  assert.deepEqual(toCanonical("lpa", 30, "mg/dL"), { value: 30, unit: "mg/dL" });
  assert.equal(toCanonical("lpa", 30, "g/L"), null);
});
