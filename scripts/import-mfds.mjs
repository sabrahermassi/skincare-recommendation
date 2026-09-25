/**
 * Korea's MFDS cosmetic-ingredient register → `ingredient_synonyms`, locale
 * `ko` (#201).
 *
 * #185 made a Hangul ingredient name survive the parser; nothing made it
 * *resolve*. A Korean label then parses into names the dictionary has never
 * seen, and the 60% dictionary gate refuses the read. This fills the gap with
 * the official Korean standard name of each ingredient, pointed at the INCI
 * name the dictionary is keyed on — so "글리세린" resolves to `glycerin` the
 * way "glycérine" already does.
 *
 * Source: 식품의약품안전처_화장품 원료성분정보 on data.go.kr
 * (https://www.data.go.kr/data/15111774/openapi.do) — standard Korean name,
 * English name, CAS number, alternative names. Licence on that page:
 * "이용허락범위 제한 없음" (no restriction on use). Not the RapidAPI wrapper,
 * whose licence is unclear.
 *
 * **Matched on the English name, then on CAS — never on the Korean name.**
 * An English name that is exactly a verified INCI name is an identity; a CAS
 * number that belongs to one verified ingredient and no other is the same
 * identifier join `import-wikidata-synonyms.mjs` uses. Anything else is left
 * unmatched rather than guessed.
 *
 * **Adds, never takes over.** A synonym another source already holds is left
 * as it is — a clash pointing somewhere else is reported, not overwritten.
 * Its own rows (`source = 'mfds'`) are rebuilt on each run, so tightening a
 * guard can retract what a looser one admitted. `ingredients.korean_name`
 * stays untouched: synonyms are the one home for another language's name
 * (#201), and a second home is the drift #186 cleaned up elsewhere.
 *
 *   MFDS_SERVICE_KEY=… node scripts/import-mfds.mjs --dry-run
 *   MFDS_SERVICE_KEY=… SUPABASE_ENV=staging node scripts/import-mfds.mjs
 *
 * The key is the data.go.kr service key for this API, from the shell — never
 * a file in this repo. A run without --dry-run also needs SUPABASE_ENV, and
 * production additionally --prod (scripts/lib/db.mjs).
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { connect } from "./lib/db.mjs";
import { normalise } from "./lib/inci-parse.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";
import { isCodeNotName } from "./import-wikidata-synonyms.mjs";

const ENDPOINT =
  "https://apis.data.go.kr/1471000/CsmtcsIngdCpntInfoService01/getCsmtcsIngdCpntInfoService01";
const PAGE_SIZE = 100;

/**
 * The records in one page of the response, whichever way it arrives.
 * data.go.kr's JSON wraps its list as `body.items` holding either `{ item }`
 * objects or `{ item: [...] }`, and a one-record page as a bare object.
 */
export function itemsFrom(page) {
  const items = page?.body?.items ?? page?.response?.body?.items;
  if (!items) return [];
  const list = Array.isArray(items) ? items : Array.isArray(items.item) ? items.item : [items.item ?? items];
  return list.map((entry) => entry?.item ?? entry).filter((entry) => entry && typeof entry === "object");
}

/** The total the API reports, so paging knows when to stop. */
export function totalFrom(page) {
  return Number(page?.body?.totalCount ?? page?.response?.body?.totalCount ?? 0);
}

/**
 * One MFDS record's names, split and normalised. Alternative names are
 * comma- or semicolon-separated — but a comma with a digit on both sides is
 * part of a name ("1,3-butanediol"), the same rule as the ingredient
 * parser's `splitOnSeparators`, and a slash can be too ("peg/ppg-18/18
 * dimethicone"), so neither splits. A comma with a digit on one side only
 * ("glycerol,1-hexanol") still separates two names (#286 review).
 */
function namesOf(record) {
  const korean = normalise(String(record.INGR_KOR_NAME ?? ""));
  const alternatives = String(record.INGR_SYNONYM ?? "")
    .split(/[;\n]|(?<!\d),|,(?!\d)/)
    .map((name) => normalise(name))
    .filter(Boolean);
  return { korean, alternatives };
}

const HANGUL = /\p{Script=Hangul}/u;

/**
 * Which verified ingredient a record names, or null. English name first (an
 * identity), then a CAS number held by exactly one verified ingredient.
 */
function targetOf(record, verified, casIndex) {
  const english = normalise(String(record.INGR_ENG_NAME ?? ""));
  if (verified.has(english)) return english;
  for (const part of String(record.CAS_NO ?? "").split("/")) {
    const owners = casIndex.get(part.trim());
    if (owners && owners.size === 1) return [...owners][0];
  }
  return null;
}

/**
 * The synonyms to write, from the MFDS records and what the database already
 * holds. Pure, so the guards are testable without either network.
 *
 * - `verified`: every verified INCI name;
 * - `casIndex`: CAS number → the verified names claiming it;
 * - `existing`: synonym → inci_name, for rows from *other* sources.
 */
export function proposeSynonyms(records, { verified, casIndex, existing }) {
  const proposals = new Map(); // synonym -> { inci_name, locale }
  const claims = new Map(); // synonym -> Set of targets
  const stats = { records: records.length, matched: 0, unmatched: 0, clashes: 0, alreadyHeld: 0, ambiguous: 0 };

  for (const record of records) {
    const target = targetOf(record, verified, casIndex);
    if (!target) {
      stats.unmatched++;
      continue;
    }
    stats.matched++;
    const { korean, alternatives } = namesOf(record);
    for (const synonym of [korean, ...alternatives]) {
      if (!synonym || synonym === target || synonym.length < 2) continue;
      if (isCodeNotName(synonym)) continue;
      // A real ingredient in its own right: pointing it elsewhere would
      // rewrite a correct name into a different substance.
      if (verified.has(synonym)) continue;
      if (!claims.has(synonym)) claims.set(synonym, new Set());
      claims.get(synonym).add(target);
      if (!proposals.has(synonym)) proposals.set(synonym, { inci_name: target, locale: HANGUL.test(synonym) ? "ko" : null });
    }
  }

  const rows = [];
  for (const [synonym, { inci_name, locale }] of proposals) {
    // Two substances claiming one name say nothing about which a label meant.
    if (claims.get(synonym).size > 1) {
      stats.ambiguous++;
      continue;
    }
    const held = existing.get(synonym);
    if (held !== undefined) {
      if (held === inci_name) stats.alreadyHeld++;
      else stats.clashes++;
      continue;
    }
    rows.push({ synonym, inci_name, locale, source: "mfds" });
  }
  return { rows, stats };
}

/**
 * The key as the query string needs it. data.go.kr issues each key twice,
 * "encoded" (already percent-escaped) and "decoded"; escaping the encoded one
 * again sends `%252B` for a `+` and the API refuses it. So an escaped key is
 * decoded first, and either form reaches the API escaped exactly once (#286
 * review).
 */
export function serviceKeyParam(key) {
  let raw = key;
  if (/%[0-9A-Fa-f]{2}/.test(key)) {
    try {
      raw = decodeURIComponent(key);
    } catch {
      // Not really escaped after all; sent as given.
    }
  }
  return encodeURIComponent(raw);
}

async function fetchRegister(key) {
  const records = [];
  for (let pageNo = 1; ; pageNo++) {
    const url = `${ENDPOINT}?serviceKey=${serviceKeyParam(key)}&pageNo=${pageNo}&numOfRows=${PAGE_SIZE}&type=json`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`MFDS register: HTTP ${res.status}`);
    const page = await res.json();
    const resultCode = page?.header?.resultCode ?? page?.response?.header?.resultCode;
    if (resultCode && resultCode !== "00") {
      throw new Error(`MFDS register: ${resultCode} ${page?.header?.resultMsg ?? page?.response?.header?.resultMsg ?? ""}`);
    }
    const items = itemsFrom(page);
    records.push(...items);
    process.stdout.write(`\r  ${records.length}/${totalFrom(page)}`);
    if (items.length < PAGE_SIZE || records.length >= totalFrom(page)) return records;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const key = process.env.MFDS_SERVICE_KEY;
  if (!key) {
    throw new Error("Set MFDS_SERVICE_KEY (the data.go.kr service key for this API) in the shell — never in a file.");
  }
  const { db } = connect({ write: !dryRun });

  console.log("Reading the MFDS register…");
  const records = await fetchRegister(key);

  const ingredients = await paginateOrdered(db, "ingredients", {
    select: "inci_name, cas_number, verified",
    cursorColumn: "inci_name",
  });
  const verified = new Set(ingredients.filter((r) => r.verified).map((r) => r.inci_name));
  const casIndex = new Map();
  for (const row of ingredients) {
    if (!row.verified || !row.cas_number) continue;
    for (const part of row.cas_number.split("/")) {
      const cas = part.trim();
      if (!/^\d{2,7}-\d{2}-\d$/.test(cas)) continue;
      if (!casIndex.has(cas)) casIndex.set(cas, new Set());
      casIndex.get(cas).add(row.inci_name);
    }
  }
  const others = await paginateOrdered(db, "ingredient_synonyms", {
    select: "synonym, inci_name, source",
    cursorColumn: "synonym",
    filter: (q) => q.neq("source", "mfds"),
  });
  const existing = new Map(others.map((row) => [row.synonym, row.inci_name]));

  const { rows, stats } = proposeSynonyms(records, { verified, casIndex, existing });
  console.log(`\n\n${JSON.stringify(stats)}\n${rows.length} synonyms to write.`);
  for (const r of rows.slice(0, 12)) console.log(`    ${r.synonym}  ->  ${r.inci_name}  [${r.locale ?? "common"}]`);

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  const { error: clearError } = await db.from("ingredient_synonyms").delete().eq("source", "mfds");
  if (clearError) throw new Error(clearError.message);
  for (let i = 0; i < rows.length; i += 500) {
    // Ignore a synonym another source took between the read above and now.
    const { error } = await db
      .from("ingredient_synonyms")
      .upsert(rows.slice(i, i + 500), { onConflict: "synonym", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  console.log(`Wrote ${rows.length} synonyms.`);
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

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
