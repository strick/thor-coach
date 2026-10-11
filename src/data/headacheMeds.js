// Acute headache medicines by class, for the medication-overuse check
// (ICHD-3 8.2). Generic and common US brand names, lower-case. Order matters:
// combination products and opioid combos are matched before the simple
// analgesics they contain.
export const MED_CLASSES = [
  {
    key: "combination",
    label: "combination analgesic",
    names: [
      "excedrin", "butalbital", "fioricet", "fiorinal", "goody's", "goodys", "bc powder", "anacin", "midol",
      "aspirin/acetaminophen/caffeine", "acetaminophen/caffeine", "aspirin/caffeine",
    ],
  },
  {
    key: "opioid",
    label: "opioid",
    names: [
      "codeine", "tramadol", "ultram", "hydrocodone", "oxycodone", "morphine", "hydromorphone", "butorphanol",
      "tylenol 3", "tylenol with codeine", "percocet", "vicodin", "norco",
    ],
  },
  {
    key: "triptan",
    label: "triptan",
    names: [
      "sumatriptan", "rizatriptan", "zolmitriptan", "eletriptan", "naratriptan", "almotriptan", "frovatriptan",
      "imitrex", "maxalt", "zomig", "relpax", "amerge", "axert", "frova", "treximet", "tosymra", "onzetra", "zembrace",
    ],
  },
  {
    key: "ergot",
    label: "ergot",
    names: ["ergotamine", "dihydroergotamine", "dhe", "cafergot", "migranal", "trudhesa"],
  },
  {
    // Newer acute migraine drugs: tracked, but not counted toward overuse
    // (ICHD-3 doesn't set thresholds for them).
    key: "gepant",
    label: "gepant / ditan",
    names: ["ubrogepant", "ubrelvy", "rimegepant", "nurtec", "zavegepant", "zavzpret", "lasmiditan", "reyvow"],
  },
  {
    key: "simple",
    label: "simple analgesic / NSAID",
    names: [
      "ibuprofen", "advil", "motrin", "naproxen", "aleve", "naprosyn", "aspirin", "bayer", "ecotrin",
      "acetaminophen", "paracetamol", "tylenol", "diclofenac", "cambia", "celecoxib", "celebrex",
      "ketorolac", "toradol", "indomethacin", "ketoprofen", "meloxicam",
    ],
  },
];

/** Classes that count toward medication-overuse headache. */
export const OVERUSE_CLASSES = ["triptan", "ergot", "opioid", "combination", "simple"];

/** Common OTC options for the headache form's medicine picker. */
export const COMMON_HEADACHE_MEDS = ["Ibuprofen", "Naproxen", "Acetaminophen", "Aspirin", "Excedrin"];

const normalize = (s) => String(s || "").toLowerCase().replace(/#/g, "").replace(/\s+/g, " ").trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MATCHERS = MED_CLASSES.map((c) => ({
  key: c.key,
  re: new RegExp(`(^|[^a-z])(${c.names.map(escapeRe).join("|")})($|[^a-z])`),
}));

/** Class key for a medicine name ("other" when unknown). */
export function classifyMed(name) {
  const n = normalize(name);
  if (!n) return "other";
  return MATCHERS.find((m) => m.re.test(n))?.key || "other";
}

export function classLabel(key) {
  return MED_CLASSES.find((c) => c.key === key)?.label || "other";
}
