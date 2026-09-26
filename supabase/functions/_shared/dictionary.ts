// The ingredient dictionary as the Deno writers read it: the verified names,
// the synonyms, and which of a formula's names are verified. Moved out of
// `label-ocr/index.ts` (#184) so `product-lookup` asks the same questions the
// same way — `knownIngredients` is the gate's own definition of "recognised",
// and a second copy of it would be a second definition.
//
// Each takes the caller's service-role client rather than making its own.
//
// The dictionary and the synonyms are whole-table reads (~36k and ~25k rows),
// so each function instance keeps what it read for `DICTIONARY_TTL_MS` (#198)
// instead of paging through them again on every photo. A synonym or entry
// added in the meantime is picked up when the copy ages out.

import { paginateOrdered } from "./paginate.ts";

/**
 * The minimum a client has to look like for `knownIngredients` — structural,
 * like `RateLimitDb`, rather than importing supabase-js's own type.
 */
// deno-lint-ignore no-explicit-any
export type DictionaryDb = any;

/**
 * Known ingredient names, for reconstructing an undelimited OCR block.
 *
 * `verified` only, and that restriction is load-bearing. Every fragment this
 * function fails to match is written back as an unverified row so that
 * `product_ingredients` has a foreign key to point at — "code", "fll", "8az",
 * "aqua/water". Reading those back in would let one bad read teach the next
 * one: run two matches "aqua/water" against the junk row run one created, and
 * the wrong segmentation becomes permanent. Only the imported taxonomy
 * (`source = 'obf'`) is trusted to define what an ingredient is.
 */
export async function fetchDictionary(db: DictionaryDb): Promise<Set<string>> {
  // A copy each time: `label-ocr` adds the synonyms to the set it is given.
  return new Set(await cachedRead(db, "dictionary", () => readDictionary(db)));
}

async function readDictionary(db: DictionaryDb): Promise<Set<string>> {
  const rows = await paginateOrdered<{ inci_name: string }>(db, "ingredients", {
    select: "inci_name",
    cursorColumn: "inci_name",
    filter: (q) => q.eq("verified", true),
  });
  return new Set(rows.map((row) => row.inci_name));
}

/**
 * Other names for ingredients we already hold, mapped to the canonical one —
 * the French half of a bilingual label, or a trivial name like "mineral oil"
 * where INCI says "paraffinum liquidum". Matched exactly like a real name,
 * then rewritten to what the dictionary is keyed on.
 */
export async function fetchAliases(db: DictionaryDb): Promise<Map<string, string>> {
  return new Map(await cachedRead(db, "aliases", () => readAliases(db)));
}

async function readAliases(db: DictionaryDb): Promise<Map<string, string>> {
  const rows = await paginateOrdered<{ synonym: string; inci_name: string }>(
    db,
    "ingredient_synonyms",
    { select: "synonym, inci_name", cursorColumn: "synonym" }
  );
  return new Map(rows.map((row) => [row.synonym, row.inci_name]));
}

export async function knownIngredients(db: DictionaryDb, names: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < names.length; i += 200) {
    const { data, error } = await db
      .from("ingredients")
      .select("inci_name")
      .eq("verified", true)
      .in("inci_name", names.slice(i, i + 200));
    // Thrown, not swallowed: the plausibility gate reads `found.size` as "how
    // much of this formula did we recognise", and a query that failed partway
    // through is indistinguishable from one that recognised nothing — a
    // transient DB error would otherwise read as a bad photo (or a bad
    // barcode) and tell the user the wrong thing entirely.
    if (error) throw new Error(`knownIngredients: ${error.message}`);
    for (const row of data ?? []) found.add(row.inci_name as string);
  }
  return found;
}

/** How long a function instance keeps the dictionary and synonyms it read (#198). */
export const DICTIONARY_TTL_MS = 10 * 60 * 1000;

type CacheEntry = { value: Promise<unknown>; until: number };

/** Per client, so each test's fake database starts empty; a function instance has one client. */
const cache = new WeakMap<object, Map<string, CacheEntry>>();

/**
 * `load()` at most once per `db` and `key` every `DICTIONARY_TTL_MS`. Requests
 * that arrive while a read is in flight share it. A read that fails is dropped
 * at once, so the next request asks the database again rather than being told
 * the same failure for ten minutes.
 */
export function cachedRead<T>(db: object, key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
  let entries = cache.get(db);
  if (!entries) {
    entries = new Map();
    cache.set(db, entries);
  }
  const hit = entries.get(key);
  if (hit && hit.until > now) return hit.value as Promise<T>;
  const value = load();
  const entry: CacheEntry = { value, until: now + DICTIONARY_TTL_MS };
  entries.set(key, entry);
  const held = entries;
  value.catch(() => {
    if (held.get(key) === entry) held.delete(key);
  });
  return value;
}
