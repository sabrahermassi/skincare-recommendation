/**
 * Wikidata → `ingredient_synonyms`.
 *
 * Fixes a measured class of failure that more INCI names cannot: names that
 * are not missing, only written differently. On real products in this
 * catalogue — `glycérine` (the French half of a bilingual label), `mineral
 * oil` (INCI says `paraffinum liquidum`), `tocophérol`, `acide citrique`.
 *
 * **Joined on CAS number, never on name.** Wikidata property P231 is the CAS
 * registry number and we hold CAS for ~14,600 ingredients, so each mapping is
 * an identifier match rather than a guess. Matching substances by name is what
 * this script exists to fix; doing it to build the script would be circular.
 *
 * Wikidata is CC0 and far cleaner than the alternatives (PubChem's glycerol
 * synonyms include "Moon", "Optim" and "Incorporation factor"), but it is a
 * general-knowledge base, not a labelling vocabulary — the iron oxide entity
 * offers "rust", "hematite", "Fe2O3" and "E172(ii)". Hence the guards below.
 * A synonym that never appears on a label is harmless; one that collides with
 * a *different* real ingredient is not, and those are refused.
 *
 *   node scripts/import-wikidata-synonyms.mjs --dry-run
 *   node scripts/import-wikidata-synonyms.mjs
 *   node scripts/import-wikidata-synonyms.mjs --limit 500   # smaller slice
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";

import { paginateOrdered } from "./lib/paginate.mjs";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || Infinity;

const ENDPOINT = "https://query.wikidata.org/sparql";
const USER_AGENT = "Skintel/1.0 (https://github.com/sabrahermassi/skincare-recommendation)";

/** Languages a cosmetics label in our markets might actually be printed in. */
const LOCALES = ["en", "fr", "de", "es", "it", "pt", "nl", "ja", "ko", "zh"];

/** CAS numbers per SPARQL request. Large enough to be quick, small enough not to time out. */
const BATCH = 150;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/** Same normalisation as lib/inci.ts, or the two sides cannot meet. */
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
 * Reject anything that is a code rather than a name.
 *
 * Chemical formulas ("Fe2O3"), E-numbers ("E172(ii)") and colour-index codes
 * arrive as aliases but are not what a label prints as an ingredient name, and
 * each is short enough to sit near a real name by edit distance.
 */
function isCodeNotName(value) {
  if (value.length < 4) return true;
  if (/^e\s?\d{3}/i.test(value)) return true; // E-number
  if (/^c\.?\s?i\.?\s?\d+/i.test(value)) return true; // colour index
  if (/^[a-z]{1,3}\d+([a-z]{1,3}\d*)*$/i.test(value)) return true; // formula-ish, e.g. fe2o3
  if (!/[a-z]{3}/i.test(value)) return true; // no real word in it
  // Cross-database identifiers. These read as names because they contain a
  // word ("pubchem 84369"), but no label prints them.
  if (
    /^(pubchem|chebi|chembl|unii|cas|nsc|dtxsid|einecs|inchi|smiles|zinc|drugbank|kegg|hmdb|mfcd|rtecs|fema|ins|wikidata|reaxys|beilstein)\b/i.test(
      value
    )
  ) {
    return true;
  }
  return false;
}

async function sparql(casBatch) {
  const values = casBatch.map((c) => JSON.stringify(c)).join(" ");
  const query = `SELECT ?cas ?label (LANG(?label) AS ?lang) WHERE {
    VALUES ?cas { ${values} }
    ?item wdt:P231 ?cas .
    { ?item rdfs:label ?label } UNION { ?item skos:altLabel ?label }
    FILTER(LANG(?label) IN (${LOCALES.map((l) => `"${l}"`).join(",")}))
  }`;

  const res = await fetch(`${ENDPOINT}?query=${encodeURIComponent(query)}`, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`SPARQL ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  return body.results.bindings.map((b) => ({
    cas: b.cas.value,
    label: b.label.value,
    lang: b.lang.value,
  }));
}

async function loadIngredients() {
  return paginateOrdered(db, "ingredients", {
    select: "inci_name, cas_number, verified",
    cursorColumn: "inci_name",
  });
}

async function main() {
  const all = await loadIngredients();
  const verifiedNames = new Set(all.filter((r) => r.verified).map((r) => r.inci_name));

  // One CAS can legitimately carry several INCI names. Such a CAS is dropped
  // rather than arbitrarily assigned — the same refusal-to-guess the fuzzy
  // matcher makes on an ambiguous near-miss.
  const byCas = new Map();
  for (const row of all) {
    if (!row.verified || !row.cas_number) continue;
    // CosIng records several registry numbers in one field, slash-separated
    // ("7631-86-9 / 112945-52-5 / 60676-86-0"). Treating that as a single
    // malformed value silently excluded 1,071 ingredients from the collision
    // check below — and `silica` was one of them, so `solum diatomeae`
    // (diatomaceous earth, same CAS) took every silicon-dioxide synonym
    // unopposed. Every number a name claims has to compete.
    for (const part of row.cas_number.split("/")) {
      const cas = part.trim();
      if (!/^\d{2,7}-\d{2}-\d$/.test(cas)) continue;
      if (!byCas.has(cas)) byCas.set(cas, new Set());
      byCas.get(cas).add(row.inci_name);
    }
  }
  const usable = [...byCas.entries()].filter(([, names]) => names.size === 1);
  const ambiguousCas = byCas.size - usable.length;

  const casList = usable.slice(0, LIMIT === Infinity ? undefined : LIMIT);
  console.log(
    `${all.length} ingredients, ${byCas.size} with a usable CAS ` +
      `(${ambiguousCas} dropped for mapping to several names)`
  );
  console.log(`Querying Wikidata for ${casList.length} CAS numbers…`);

  const casToName = new Map(casList.map(([cas, names]) => [cas, [...names][0]]));
  const proposals = new Map(); // synonym -> { inci_name, locale }
  const collisions = new Map(); // synonym -> Set of inci_names

  let failedBatches = 0;
  for (let i = 0; i < casList.length; i += BATCH) {
    const batch = casList.slice(i, i + BATCH).map(([cas]) => cas);
    let rows = [];
    try {
      rows = await sparql(batch);
    } catch (err) {
      console.warn(`\n  batch at ${i} failed (${err.message.slice(0, 80)}) — skipping`);
      failedBatches += 1;
      continue;
    }

    for (const { cas, label, lang } of rows) {
      const target = casToName.get(cas);
      if (!target) continue;
      const synonym = normalise(label);
      if (!synonym || synonym === target) continue;
      if (isCodeNotName(synonym)) continue;
      // Already a real ingredient in its own right: pointing it elsewhere
      // would rewrite a correct name into a different substance.
      if (verifiedNames.has(synonym)) continue;

      if (!collisions.has(synonym)) collisions.set(synonym, new Set());
      collisions.get(synonym).add(target);
      if (!proposals.has(synonym)) {
        proposals.set(synonym, { inci_name: target, locale: lang === "en" ? null : lang });
      }
    }
    process.stdout.write(`\r  ${Math.min(i + BATCH, casList.length)}/${casList.length}`);
  }

  // A synonym claimed by two different substances tells us nothing about which
  // one a label meant.
  let ambiguousSynonyms = 0;
  for (const [synonym, targets] of collisions) {
    if (targets.size > 1) {
      proposals.delete(synonym);
      ambiguousSynonyms += 1;
    }
  }

  const rows = [...proposals.entries()].map(([synonym, v]) => ({
    synonym,
    inci_name: v.inci_name,
    locale: v.locale,
    source: "curated",
  }));

  console.log(
    `\n\n${rows.length} synonyms to write ` +
      `(${ambiguousSynonyms} refused as ambiguous across substances)`
  );
  const byLocale = {};
  for (const r of rows) byLocale[r.locale ?? "(common)"] = (byLocale[r.locale ?? "(common)"] ?? 0) + 1;
  console.log("  by locale:", JSON.stringify(byLocale));
  console.log("\n  sample:");
  for (const r of rows.slice(0, 12)) {
    console.log(`    ${r.synonym}  ->  ${r.inci_name}  [${r.locale ?? "common"}]`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  // A failed batch means `proposals` is missing whatever that batch would
  // have contributed. Deleting and rebuilding from an incomplete set would
  // permanently drop synonym mappings that were correct before this run —
  // worse than leaving stale data in place. Refuse rather than guess.
  if (failedBatches > 0) {
    throw new Error(
      `${failedBatches} SPARQL batch(es) failed — refusing to delete and rebuild curated ` +
        `synonyms from an incomplete proposal set. Re-run once Wikidata is reachable.`
    );
  }

  // Rebuilt, not merged. Every row here is derived from Wikidata plus the
  // guards above, so a rerun after tightening a guard has to be able to
  // retract what a looser one admitted — an upsert alone would leave the bad
  // rows in place.
  const { error: clearError } = await db
    .from("ingredient_synonyms")
    .delete()
    .eq("source", "curated");
  if (clearError) throw new Error(clearError.message);

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db
      .from("ingredient_synonyms")
      .upsert(rows.slice(i, i + 500), { onConflict: "synonym" });
    if (error) throw new Error(error.message);
    process.stdout.write(`\r  ${Math.min(i + 500, rows.length)}/${rows.length}`);
  }
  console.log(`\nWrote ${rows.length} synonyms.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
