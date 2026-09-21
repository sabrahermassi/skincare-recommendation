/**
 * One-off import: the INCI dictionary, from the Open Beauty Facts ingredient
 * taxonomy. This is what makes `ingredients.verified` mean something.
 *
 *   node scripts/import-inci-dictionary.mjs --dry-run
 *   node scripts/import-inci-dictionary.mjs
 *   node scripts/import-inci-dictionary.mjs --prune
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY unless --dry-run. With the
 * keys set, --dry-run reads the table and prints the real plan, including what
 * --prune would remove. A write also needs SUPABASE_ENV=staging or production
 * — production also requires --prod on the command line.
 *
 * --prune clears out names an earlier run wrote that this run no longer
 * produces (the old name rule turned POLY(DIMER GRAPESEED OIL) into "poly").
 * A name no product uses is deleted; one a product still uses goes back to
 * being an unverified stub, so it stops lending a wrong rating to that formula.
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

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { connect } from "./lib/db.mjs";
import { parseFunctions } from "./lib/normalise-function.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";
import { applyPrune, assertNotTooMany, inBatches, planPruneAgainst } from "./lib/prune-stale.mjs";

const DRY_RUN = process.argv.includes("--dry-run");
const PRUNE = process.argv.includes("--prune");
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

/**
 * Same normalisation the label parser uses. Only for `labelForms` below: it is
 * what a scanned label's text becomes, so it is how a label will ask for a row.
 */
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

/**
 * Normalise an authoritative dictionary name without discarding chemistry.
 *
 * Deliberately not the label parser's `normalise()` above. The label parser
 * drops bracketed text, so a label printing "Tris(nonylphenyl)phosphite" asks
 * for "tris phosphite"; `toRows` adds that spelling as well, but only when one
 * ingredient alone reads that way.
 */
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
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
}

function pickEn(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") return value.en ?? Object.values(value)[0] ?? null;
  return null;
}

/** What a scanned label would ask for, for an entry printed with brackets. */
function labelFormOf(entry) {
  const printed = pickEn(entry.inci) ?? pickEn(entry.name);
  if (!printed?.includes("(")) return null;
  const form = normalise(printed);
  return form.length >= 2 ? form : null;
}

/**
 * Shortened spellings more than one taxonomy entry reads as. `import-cosing`
 * asks for this: its own list is a 2016 snapshot, so a spelling only one of
 * its ingredients has can still belong to several here.
 */
function sharedLabelForms(taxonomy) {
  const counts = new Map();
  for (const [key, entry] of Object.entries(taxonomy)) {
    if (!key.startsWith("en:")) continue;
    const form = labelFormOf(entry);
    if (form) counts.set(form, (counts.get(form) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([form]) => form));
}

/** `file` is a saved copy of the taxonomy, for a run with no network. */
async function fetchTaxonomy(file) {
  if (file) return JSON.parse(readFileSync(file, "utf8"));
  console.log("Downloading the Open Beauty Facts ingredient taxonomy (~12 MB)…");
  const res = await fetch(TAXONOMY);
  if (!res.ok) throw new Error(`Taxonomy download failed: HTTP ${res.status}`);
  // Same rule as `read()` in import-cosing: a redirect that lands on plain
  // http could be swapped in transit, and this file decides safety ratings.
  if (!res.url.startsWith("https://")) {
    throw new Error(`refusing a redirect that landed on a non-HTTPS URL: ${res.url}`);
  }
  return res.json();
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
  // "V/54 III/65". Search the full field.
  // A citation may follow a space, a bracket, or a comma/semicolon with no
  // space ("IV/1,II/329"): missing one of those would read a ban as "safe".
  const cites = (annex) => new RegExp(`(^|[\\s[(,;])\\s*(?:annex\\s+)?${annex}(?:\\/|\\b)`, "i").test(text);
  const prohibited = cites("II");
  // Annexes IV-VI list what IS allowed (colourants, preservatives, UV
  // filters). "IV/66 [III/256] II/1329 as hair dye" is an allowed colourant
  // that is banned for one use — calling it prohibited outright would put a
  // hazard warning on every product it colours. Annex III beside Annex II does
  // NOT soften it: hydroquinone is "II/1339 III/14", banned everywhere except
  // nail products, and must stay "avoid" in a skincare app.
  const allowedSomewhere = cites("IV") || cites("V") || cites("VI");
  if (prohibited && !allowedSomewhere) {
    return { safety: "avoid", note: `Prohibited in cosmetics (EU Annex ${text})` };
  }
  if (prohibited) {
    return { safety: "caution", note: `Prohibited for some uses, allowed for others (EU Annex ${text})` };
  }
  if (cites("III")) {
    return { safety: "caution", note: `Restricted use (EU Annex ${text})` };
  }
  return { safety: "safe", note: `EU Annex ${text}` };
}

/**
 * `conflicts` collects every name two entries claim with different data. Such a
 * name is left out rather than stopping the run: the file is someone else's and
 * changes weekly, and one clash upstream must not block every other rating.
 */
function toRows(taxonomy, conflicts = []) {
  const rows = new Map(); // normalised name → row
  const priorities = new Map(); // taxonomy key > its printed name > hand-maintained common alias
  const clashed = new Map(); // name → the priority it was fought over at
  const labelForms = new Map(); // what a scanned label would ask for → every row that reads that way

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
      ...(COMMON_NAME_ALIASES[canonical] ?? []).map((alias) => [alias, 1]),
      [sourceName, 2],
      // Last, so that when the key and the printed name are the same text it
      // is recorded as the key.
      [canonical, 3],
    ]);
    for (const [alias, priority] of aliases) {
      // A name two printed names fought over can still go to a taxonomy key.
      if (alias.length < 2 || (clashed.get(alias) ?? 0) >= priority) continue;
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
        if (priority === existingPriority) {
          // Two entries claim the same name with different data — by key, by
          // printed name, or through the hand-written alias table — and
          // nothing says which is right. Neither gets the name.
          rows.delete(alias);
          priorities.delete(alias);
          clashed.set(alias, priority);
          if (!conflicts.includes(alias)) conflicts.push(alias);
        }
        continue;
      }
      rows.set(alias, { inci_name: alias, ...row });
      priorities.set(alias, priority);
    }

    const form = labelFormOf(entry);
    if (form) labelForms.set(form, [...(labelForms.get(form) ?? []), row]);
  }

  // The label parser drops bracketed text, so "Tris(nonylphenyl)phosphite" on
  // a label asks for "tris phosphite". That spelling gets a row only when one
  // ingredient alone reads that way: ten different ingredients read as "poly",
  // and giving the name to any of them is the false match this file once made.
  for (const [form, owners] of labelForms) {
    if (owners.length !== 1 || rows.has(form) || clashed.has(form)) continue;
    rows.set(form, { inci_name: form, ...owners[0] });
  }

  return [...rows.values()];
}

const STRICTNESS = { safe: 0, caution: 1, avoid: 2 };

/**
 * Preserve data another verified source owns. OBF may promote an unverified
 * label stub and refresh rows it imported previously, but it must not replace
 * curated or CosIng values merely because the same name is present.
 *
 * One exception, because the other way round is the dangerous mistake: when
 * the annex rates a name more strictly than the row it is skipping, that is
 * never dropped silently. CosIng rows carry no rating of their own (that import
 * leaves `safety` unset), so they take the annex rating and nothing else.
 * A hand-curated row is somebody's decision; it is listed for them instead.
 */
function planWrites(rows, existing) {
  const fresh = [];
  const promoted = [];
  const refreshed = [];
  const safetyOnly = [];
  const reviewByHand = [];
  let untouched = 0;

  for (const row of rows) {
    const current = existing.get(row.inci_name);
    if (!current) fresh.push(row);
    else if (!current.verified) promoted.push(row);
    else if (current.source === "obf") refreshed.push(row);
    else {
      untouched += 1;
      if (STRICTNESS[row.safety] > (STRICTNESS[current.safety] ?? 0)) {
        const stricter = { inci_name: row.inci_name, safety: row.safety, note: row.note, owner: current.source };
        (current.source === "cosing" ? safetyOnly : reviewByHand).push(stricter);
      }
    }
  }

  return {
    fresh,
    promoted,
    refreshed,
    safetyOnly,
    reviewByHand,
    untouched,
    ingredients: [...fresh, ...promoted, ...refreshed],
  };
}

async function main() {
  const taxonomy = await fetchTaxonomy();
  console.log(`  ${Object.keys(taxonomy).length} taxonomy entries`);

  const conflicts = [];
  const rows = toRows(taxonomy, conflicts);
  const restricted = rows.filter((r) => r.safety !== "safe");
  console.log(
    `  ${rows.length} dictionary names (incl. aliases), ` +
      `${rows.filter((r) => r.cas_number).length} with a CAS number, ` +
      `${restricted.length} carrying an EU annex restriction`
  );
  if (conflicts.length > 0) {
    console.log(`  ${conflicts.length} name(s) claimed by two entries with different data, left out:`);
    for (const name of conflicts.slice(0, 20)) console.log(`    ${name}`);
  }

  // Same shape as import-cosing: a dry run is allowed to proceed with no
  // credentials at all, so the connection is only made when there is
  // something to connect to, or when this run writes and connect() must
  // refuse it outright.
  const haveCredentials = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!haveCredentials && DRY_RUN) {
    // Without the table there is no plan to print: every name would read as new.
    console.log("\n--dry-run without keys: the database was not read, so there is no write plan.");
    printSamples(rows, restricted);
    return;
  }

  const { db } = connect({ write: !DRY_RUN });
  const existing = new Map();
  const currentRows = await paginateOrdered(db, "ingredients", {
    select: "inci_name, verified, source, safety",
    cursorColumn: "inci_name",
  });
  for (const row of currentRows) existing.set(row.inci_name, row);

  const plan = planWrites(rows, existing);
  console.log(
    `  ${plan.fresh.length} new, ${plan.promoted.length} promoted, ` +
      `${plan.refreshed.length} OBF rows refreshed, ${plan.untouched} other verified rows left alone`
  );
  if (plan.safetyOnly.length > 0) {
    console.log(`  ${plan.safetyOnly.length} CosIng row(s) take the stricter annex rating (nothing else changes):`);
    for (const r of plan.safetyOnly.slice(0, 20)) console.log(`    [${r.safety}] ${r.inci_name}`);
  }
  if (plan.reviewByHand.length > 0) {
    console.log(`  ${plan.reviewByHand.length} hand-set row(s) are rated more strictly by the annex. NOT changed, check them:`);
    for (const r of plan.reviewByHand) console.log(`    [${r.safety}] ${r.inci_name} (${r.owner}) — ${r.note}`);
  }

  const prune = await planPruneAgainst(db, rows, existing, "obf");
  console.log(
    `  ${prune.stale.length} name(s) from an earlier run are no longer produced: ` +
      `${prune.remove.length} unused, ${prune.demote.length} still used by a product` +
      (PRUNE ? "" : " (pass --prune to clear them)")
  );
  for (const name of prune.demote.slice(0, 20)) console.log(`    still used: ${name}`);
  if (PRUNE) assertNotTooMany(prune, "OBF");

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    printSamples(rows, restricted);
    return;
  }

  let written = 0;
  await inBatches(plan.ingredients, 500, async (batch) => {
    // Upsert, so names already created unverified by a barcode lookup are
    // promoted in place — the transition this table exists to record.
    const { error } = await db.from("ingredients").upsert(batch, { onConflict: "inci_name" });
    if (error) throw new Error(error.message);
    written += batch.length;
    process.stdout.write(`\r  ${written}/${plan.ingredients.length}`);
  });
  console.log(`\nWrote ${plan.ingredients.length} ingredient names, ${restricted.length} with a real EU safety rating.`);

  for (const { inci_name, safety, note } of plan.safetyOnly) {
    // Guarded on the owner read above, so a row re-sourced meanwhile is left.
    const { error } = await db.from("ingredients").update({ safety, note }).eq("inci_name", inci_name).eq("source", "cosing");
    if (error) throw new Error(error.message);
  }

  if (!PRUNE) return;

  const removed = await applyPrune(db, prune, "obf");
  console.log(`Pruned: ${removed} deleted, ${prune.demote.length} returned to unverified.`);
}

function printSamples(rows, restricted) {
  console.log("Regulated substances found, sample:");
  for (const r of restricted.slice(0, 5)) console.log(`  [${r.safety}] ${r.inci_name} — ${r.note}`);
  console.log("\nCommon-name aliases resolve:");
  for (const probe of ["water", "fragrance", "shea butter", "glycerin"]) {
    console.log(`  ${probe.padEnd(14)} ${rows.some((r) => r.inci_name === probe) ? "present" : "MISSING"}`);
  }
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

export { fetchTaxonomy, normaliseDictionaryName, planWrites, safetyFrom, sharedLabelForms, toRows };

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
