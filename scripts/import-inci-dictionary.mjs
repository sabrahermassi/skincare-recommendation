/**
 * One-off import: the INCI dictionary, from the Open Beauty Facts ingredient
 * taxonomy. This is what makes `ingredients.verified` mean something.
 *
 *   node scripts/import-inci-dictionary.mjs --dry-run
 *   node scripts/import-inci-dictionary.mjs
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY unless --dry-run.
 *
 * WHY NOT COSING DIRECTLY: CosIng's site is a single-page app whose export
 * only exists as a button behind its own session — every REST path returns the
 * HTML shell, and it refuses an empty search, so there is no scriptable full
 * download. This taxonomy is CosIng's content in one ODbL JSON file: of its
 * 22,270 entries, 99% carry a CosIng reference number, 98% list INCI
 * functions, 50% a CAS number, and 1,219 carry the regulatory annex
 * restriction. `scripts/import-cosing.mjs` still works if you ever obtain the
 * official CSV by hand, but nothing requires it.
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { parseFunctions } from "./lib/normalise-function.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const TAXONOMY = "https://static.openbeautyfacts.org/data/taxonomies/ingredients.json";
const ATTRIBUTION_NOTE = "Ingredient reference from Open Beauty Facts / EU CosIng.";

/**
 * Labels outside the EU use common names where CosIng uses the Latin INCI
 * term, so a US or Korean label saying "Water" would otherwise fail to match
 * `AQUA` and be shown as unrecognised. Only the handful that actually diverge.
 */
const COMMON_NAME_ALIASES = {
  aqua: ["water", "eau", "purified water", "distilled water"],
  "parfum": ["fragrance"],
  "sodium chloride": ["salt"],
  "tocopheryl acetate": ["vitamin e acetate"],
  "ascorbic acid": ["vitamin c"],
  "retinol": ["vitamin a"],
  "cocos nucifera oil": ["coconut oil"],
  "butyrospermum parkii butter": ["shea butter"],
  "simmondsia chinensis seed oil": ["jojoba oil"],
  "aloe barbadensis leaf juice": ["aloe vera juice"],
};

/** Same normalisation the label parser uses, or the two sides cannot meet. */
function normalise(raw) {
  return raw
    .replace(/\([^)]*\)/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/g, "");
}

/** Normalise an authoritative dictionary name without discarding chemistry. */
function normaliseDictionaryName(raw) {
  return raw
    // Parentheses are chemically meaningful in official INCI names. The
    // label parser removes parenthetical label annotations, but doing that to
    // the dictionary collapsed POLY(DIMER GRAPESEED OIL) to the false name
    // "poly", and several distinct ingredients onto that same row.
    .replace(/[()]/g, " ")
    .replace(/[*_[\]]/g, " ")
    .replace(/\b\d+([.,]\d+)?\s*%/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/^[^a-z0-9]+|[^a-z0-9)]+$/g, "");
}

function pickEn(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.en ?? Object.values(value)[0] ?? null;
  return null;
}

/**
 * Turns a CosIng annex reference into a safety level.
 *
 *   Annex II  — substances PROHIBITED in cosmetic products      → avoid
 *   Annex III — RESTRICTED, permitted subject to limits         → caution
 *
 * This is the one place the app gets a safety rating from an actual regulator
 * rather than an invented table, so the mapping stays deliberately literal:
 * anything that is not an explicit prohibition or restriction is left `safe`
 * with no claim attached.
 */
function safetyFrom(restriction) {
  const ref = pickEn(restriction);
  if (!ref) return { safety: "safe", note: null };
  const text = String(ref).trim();
  // OBF does not use one spelling here. Alongside "II/416" and "III/61"
  // there are values such as "CMR1B II/656", "Annex III/I/257", and
  // "V/54 III/65". Search the full field and prefer Annex II if both occur.
  if (/(^|[\s[])\s*(?:annex\s+)?II(?:\/|\b)/i.test(text)) {
    return { safety: "avoid", note: `Prohibited in cosmetics (EU Annex ${text})` };
  }
  if (/(^|[\s[])\s*(?:annex\s+)?III(?:\/|\b)/i.test(text)) {
    return { safety: "caution", note: `Restricted use (EU Annex ${text})` };
  }
  return { safety: "safe", note: `EU Annex ${text}` };
}

function toRows(taxonomy) {
  const rows = new Map(); // normalised name → row
  const priorities = new Map(); // source-backed spelling > hand-maintained common alias

  for (const [key, entry] of Object.entries(taxonomy)) {
    if (!key.startsWith("en:")) continue;

    const slug = key.slice(3).replace(/-/g, " ");
    // The taxonomy key is the stable, unambiguous spelling. `name` supplies a
    // second spelling where punctuation differs, but must not replace it.
    const canonical = normaliseDictionaryName(slug);
    if (canonical.length < 2) continue;

    const { safety, note } = safetyFrom(entry.inci_restriction);
    // Shared with import-cosing so the same role is never written two ways —
    // this importer used to emit the OBF taxonomy's hyphenated, mixed-case
    // form while CosIng emitted a lowercase spaced one.
    const functions = parseFunctions(pickEn(entry.inci_functions), ",");

    const row = {
      cas_number: pickEn(entry.cas) || null,
      functions,
      safety,
      // Deliberately no `comedogenic`: CosIng rates neither pore-clogging nor
      // irritancy, and filling it in from nothing would put a fabricated
      // number next to genuine regulatory data, where it would look sourced.
      note: note ?? (pickEn(entry.inci_description) || ATTRIBUTION_NOTE).slice(0, 300),
      source: "obf",
      verified: true,
    };

    // Aliases get their own row rather than a synonyms column so that lookup
    // stays a primary-key hit. The table is fully regenerated by re-running
    // this script, so the duplication never drifts.
    const sourceName = normaliseDictionaryName(pickEn(entry.inci) ?? pickEn(entry.name) ?? slug);
    const aliases = new Map([
      [canonical, 2],
      [sourceName, 2],
      ...(COMMON_NAME_ALIASES[canonical] ?? []).map((alias) => [alias, 1]),
    ]);
    for (const [alias, priority] of aliases) {
      if (alias.length < 2) continue;
      const existing = rows.get(alias);
      if (existing) {
        // Silently accepting the first row would attach whichever safety and
        // functions happened to appear first to an ambiguous alias.
        const candidate = { inci_name: alias, ...row };
        if (JSON.stringify(existing) === JSON.stringify(candidate)) continue;
        const existingPriority = priorities.get(alias) ?? 0;
        // A real taxonomy spelling owns its metadata. A convenience alias
        // such as `fragrance` must not overwrite (or block) that real row.
        if (priority > existingPriority) {
          rows.set(alias, candidate);
          priorities.set(alias, priority);
          continue;
        }
        if (priority === 1 || existingPriority === 1) {
          continue;
        }
        if (priority === existingPriority) {
          throw new Error(`Conflicting ingredient alias in taxonomy: ${alias}`);
        }
        continue;
      }
      rows.set(alias, { inci_name: alias, ...row });
      priorities.set(alias, priority);
    }
  }

  return [...rows.values()];
}

/**
 * Preserve data another verified source owns. OBF may promote an unverified
 * label stub and refresh rows it imported previously, but it must not replace
 * curated, CosIng, or MFDS values merely because the same name is present.
 */
function planWrites(rows, existing) {
  const fresh = [];
  const promoted = [];
  const refreshed = [];
  let untouched = 0;

  for (const row of rows) {
    const current = existing.get(row.inci_name);
    if (!current) fresh.push(row);
    else if (!current.verified) promoted.push({ ...row, note: row.note });
    else if (current.source === "obf") refreshed.push(row);
    else untouched += 1;
  }

  return { fresh, promoted, refreshed, untouched, ingredients: [...fresh, ...promoted, ...refreshed] };
}

async function main() {
  console.log("Downloading the Open Beauty Facts ingredient taxonomy (~12 MB)…");
  const res = await fetch(TAXONOMY);
  if (!res.ok) throw new Error(`Taxonomy download failed: HTTP ${res.status}`);
  const taxonomy = await res.json();
  console.log(`  ${Object.keys(taxonomy).length} taxonomy entries`);

  const rows = toRows(taxonomy);
  const restricted = rows.filter((r) => r.safety !== "safe");
  console.log(
    `  ${rows.length} dictionary names (incl. aliases), ` +
      `${rows.filter((r) => r.cas_number).length} with a CAS number, ` +
      `${restricted.length} carrying an EU annex restriction`
  );

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!DRY_RUN && (!url || !key)) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run)");
    process.exit(1);
  }

  const existing = new Map();
  if (url && key) {
    const probe = createClient(url, key, { auth: { persistSession: false } });
    const currentRows = await paginateOrdered(probe, "ingredients", {
      select: "inci_name, verified, source",
      cursorColumn: "inci_name",
    });
    for (const row of currentRows) existing.set(row.inci_name, row);
  }

  const plan = planWrites(rows, existing);
  console.log(
    `  ${plan.fresh.length} new, ${plan.promoted.length} promoted, ` +
      `${plan.refreshed.length} OBF rows refreshed, ${plan.untouched} other verified rows left alone`
  );

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written. Regulated substances found, sample:");
    for (const r of restricted.slice(0, 5)) console.log(`  [${r.safety}] ${r.inci_name} — ${r.note}`);
    console.log("\nCommon-name aliases resolve:");
    for (const probe of ["water", "fragrance", "shea butter", "glycerin"]) {
      console.log(`  ${probe.padEnd(14)} ${rows.some((r) => r.inci_name === probe) ? "present" : "MISSING"}`);
    }
    return;
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  for (let i = 0; i < plan.ingredients.length; i += 500) {
    // Upsert, so names already created unverified by a barcode lookup are
    // promoted in place — the transition this table exists to record.
    const { error } = await db
      .from("ingredients")
      .upsert(plan.ingredients.slice(i, i + 500), { onConflict: "inci_name" });
    if (error) throw new Error(error.message);
    process.stdout.write(`\r  ${Math.min(i + 500, plan.ingredients.length)}/${plan.ingredients.length}`);
  }
  console.log(`\nWrote ${plan.ingredients.length} ingredient names, ${restricted.length} with a real EU safety rating.`);
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

export { normalise, normaliseDictionaryName, pickEn, planWrites, safetyFrom, toRows };

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
