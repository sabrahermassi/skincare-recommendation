/**
 * Clean the unverified ingredient stubs out of the dictionary.
 *
 * A stub is a name a scan or import met that the dictionary did not know, so
 * it was saved with `verified = false`. Three kinds are safe to remove:
 *
 *   variant — a spelling, spacing or other-language form of a name the
 *             dictionary already verifies ("glycérine", "sodium hydroxyde").
 *             Products that use it are pointed at the real name first.
 *   unused  — any unverified name no product references. It can be deleted
 *             regardless of what it once meant; a later import will recreate
 *             it if the text is encountered again.
 *   confirmed non-ingredient — one of the few names a person has read and
 *             confirmed is packaging text (`CONFIRMED_NOT_INGREDIENTS`). The
 *             product rows that carry it are dropped, then the stub.
 *
 * A fourth kind is only reported: junk — text that fails the ingredient-name
 * checks (a web address, a file name, a sentence, a fragment with no letters).
 * Junk no product uses goes with the unused stubs; junk a product still uses is
 * left alone, because the text may hold a real ingredient nobody has picked out.
 *
 * Anything else is left exactly as it is: it may be a real ingredient no public
 * list carries yet, which is a decision for a person, not this script.
 *
 * Prints the whole plan first and writes nothing unless run with --apply.
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the shell, as the other
 * dictionary scripts do.
 *
 *   node scripts/clean-ingredient-stubs.mjs            # print the plan
 *   node scripts/clean-ingredient-stubs.mjs --apply    # do it
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

import { fuzzyKnownName, isPlausibleIngredientName, parseInci, resolveKnownName } from "./lib/inci-parse.mjs";
import { KNOWN_SHORT_NAMES } from "./audit-catalogue-quality.mjs";
import { fetchAliases } from "./lib/aliases.mjs";
import { fetchStoredFormulas } from "./lib/formula-diff.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const APPLY = process.argv.includes("--apply");
const BATCH = 200;

/**
 * Broad label terms that one alias source happens to map to a possible target,
 * but which are not specific enough to inherit that target's safety data.
 */
const AMBIGUOUS_STUB_NAMES = new Set([
  "acrylates",
  "butyrospermum parkii",
  "caprate",
  "caprylic",
  "caprylic triglyceride",
  "caprylyl",
  "ceramide",
  "cetearyl",
  "citrus aurantium peel oil",
  "color pigments",
  "iron oxides",
  "lemongrass oil",
]);

/**
 * Text a person has read and confirmed names no ingredient at all: a heading, a
 * distributor's address, marketing copy, a batch code. Unlike junk found by rule,
 * these are certain, so the product rows that carry them are removed.
 */
const CONFIRMED_NOT_INGREDIENTS = new Set([
  "120-2563",
  "19g proprietati: extractul de orez întăreşte bariera pielii",
  "but better dincidecoder the skincare ingredients with the most google searches > eng 6:04 pm cd \\9/20/2126",
  "ingredients",
  "korea distribuitor: promo plus srl",
  "missha airy fit sheet mask ean 8809581454804 missha - masca cu extract de orez pentru ten radiant airy fit",
  "netezeşte şi catifelează tenul. mod de utilizare: aplică masca pe tenul curat si dupà toner",
  "public interest&quot",
  "spatele ambalajului. producator: able c&c",
]);

/**
 * Names that mean the same thing, so "aqua / water / eau" is one ingredient
 * written three ways. Any other slash-joined stub is several ingredients and is
 * never collapsed to one of them.
 */
const EQUIVALENT_NAMES = [
  ["aqua", "water", "eau", "ater", "agua"],
  ["parfum", "fragrance"],
];

/** The separate names in a stub that lists more than one ("a / b", "a & b", "a (b"). */
function partsOf(name) {
  return name
    .split(/\s*(?:[/&(,]|\band\b)\s*/)
    .map((p) => p.trim())
    .filter((p) => p && !/^\d+$/.test(p));
}

/** A verified name for one piece of text, or null. */
function resolvePart(part, known, aliases) {
  const resolved = resolveKnownName(part, known, aliases);
  if (known.has(resolved)) return resolved;
  const aliased = aliases?.get(part);
  return aliased && known.has(aliased) ? aliased : null;
}

/** A verified name for a whole single-ingredient string: spelling, typo or other name. */
function wholeName(name, known, aliases) {
  const resolved = resolveKnownName(name, known, aliases);
  if (resolved !== name && known.has(resolved)) return resolved;
  const typo = fuzzyKnownName(name, known, { remaining: Infinity });
  if (typo !== name && known.has(typo)) return typo;
  const aliased = aliases?.get(name);
  return aliased && aliased !== name && known.has(aliased) ? aliased : null;
}

const squashed = (s) => s.replace(/[^\p{L}\p{N}]/gu, "");

/**
 * The verified name this stub is a mangled form of, or null. Deliberately
 * strict: a wrong repoint puts the wrong ingredient on a product, which is
 * worse than leaving the stub where it is.
 */
function variantTarget(name, known, aliases) {
  if (known.has(name)) return name;
  // A heading in front of the ingredient: "ingrédients: aqua", "may contain: ci 77891".
  const colon = name.lastIndexOf(":");
  if (colon > 0) {
    const before = name.slice(0, colon);
    const after = name.slice(colon + 1).trim();
    const namesBefore = parseInci(before, known).some((i) => known.has(i.inci_name));
    return after && !namesBefore ? variantTarget(after, known, aliases) : null;
  }
  const heading = /^(?:ingr[eé]dients?|sastojci|composition)\W+(.+)$/i.exec(name);
  if (heading) return variantTarget(heading[1], known, aliases);

  // A real name with packaging text after its full stop: "phenoxyethanol. idealove ...".
  // Only when what follows names no ingredient: "tocopherol. sodium hyaluronate"
  // is two ingredients, and cutting it would lose the second.
  const trailing = /^([^.]+?)\s*\.\s+(\S.*)$/.exec(name);
  if (trailing) {
    const t = resolvePart(trailing[1], known, aliases);
    const restNamesOne = parseInci(trailing[2], known, undefined, aliases).some((i) => known.has(i.inci_name));
    return t && !restNamesOne ? t : null;
  }

  const parts = partsOf(name);
  if (parts.length > 1) {
    const group = EQUIVALENT_NAMES.find((g) => parts.every((p) => g.includes(p)));
    if (group) return known.has(group[0]) ? group[0] : null;
    const targets = parts.map((p) => resolvePart(p, known, aliases));
    return targets[0] && targets.every((t) => t === targets[0]) ? targets[0] : null;
  }

  // One of the equivalent names on its own ("eau)", "agua") is the same
  // ingredient as the group's first name, which is what every other product's
  // water is stored under.
  const alone = resolveKnownName(name, known, aliases);
  const sameAs = EQUIVALENT_NAMES.find((g) => g.includes(name) || g.includes(alone));
  if (sameAs) return known.has(sameAs[0]) ? sameAs[0] : null;

  const target = wholeName(name, known, aliases);
  // "2 hexanediol" is "1,2-hexanediol" with its "1," cut off, and plain
  // hexanediol is a different ingredient: a bare leading number only counts when
  // the rest is spacing.
  if (target && /^\d\s*-?\s+[a-z]/i.test(name) && squashed(target) !== squashed(name)) return null;
  return target;
}

/**
 * What to do with one unverified name: `{ kind: "variant", target }`,
 * `{ kind: "not-ingredient" }` (confirmed by a person), `{ kind: "junk" }`
 * (found by rule), or `null` to leave it alone.
 *
 * The word limit `isPlausibleIngredientName` applies to label text is not
 * applied here — real dictionary names run past it (fermented extracts list
 * dozens of species) — so it is skipped and every other check reads the whole name.
 */
function classifyStub(name, known, aliases) {
  if (AMBIGUOUS_STUB_NAMES.has(name)) return null;
  if (CONFIRMED_NOT_INGREDIENTS.has(name)) return { kind: "not-ingredient" };
  const target = variantTarget(name, known, aliases);
  if (target && target !== name && known.has(target)) return { kind: "variant", target };

  // Short only counts as junk for Latin text: "pca" and "egf" are real (the #86
  // audit keeps the same list), and a two- or three-syllable Korean name is
  // legitimately that short.
  const tooShort = name.length < 4 && /^[\x00-\x7f]*$/.test(name) && !KNOWN_SHORT_NAMES.has(name.toLowerCase());
  if (tooShort || !/\p{L}/u.test(name) || !isPlausibleIngredientName(name, true)) {
    return { kind: "junk" };
  }
  return null;
}

/**
 * Which product rows to point at the real name and which to drop. A product
 * that already lists the real name cannot also name it a second time, so one of
 * the two rows goes — the later one, because position is concentration order
 * and the ingredient belongs where the label first put it. `productNames` maps
 * each product to its current names and every position each holds, and is
 * updated as rows are planned, so two stubs of one ingredient in the same product collapse to
 * one row.
 *
 * A dropped row is named by product and position, which is all that identifies
 * it: when the stub is the earlier row, every row the real name holds is dropped,
 * since a formula can carry the same name at several positions.
 */
function planRepoints(variants, variantUses, productNames) {
  const repoint = [];
  const dropRow = [];
  for (const u of variantUses) {
    const target = variants.get(u.inci_name);
    const names = productNames.get(u.product_id);
    const existingAt = names?.get(target) ?? [];
    if (existingAt.length === 0) {
      repoint.push({ ...u, target });
      names?.set(target, [u.position]);
    } else if (u.position < Math.min(...existingAt)) {
      repoint.push({ ...u, target });
      for (const position of existingAt) dropRow.push({ product_id: u.product_id, inci_name: target, position });
      names.set(target, [u.position]);
    } else {
      dropRow.push(u);
    }
  }
  return { repoint, dropRow };
}

/**
 * Every variant is deletable after its product rows are repointed, and every
 * confirmed non-ingredient after its product rows are dropped. Every other
 * unreferenced stub is stale dictionary data and is deletable as-is.
 */
function plannedDeletions(stubs, variants, uses, notIngredients = new Set()) {
  const used = new Set(uses.map((row) => row.inci_name));
  return new Set(stubs.filter((stub) => variants.has(stub) || notIngredients.has(stub) || !used.has(stub)));
}

async function readIngredients(db, verified) {
  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name",
    cursorColumn: "inci_name",
    filter: (q) => q.eq("verified", verified),
  });
  return rows.map((r) => r.inci_name);
}

const PAGE = 1000; // PostgREST's default row cap: a longer read is cut short without an error.

/**
 * Every product_ingredients row that uses one of `names`. Paged, because a
 * stub used by many products can return more rows than one response holds, and
 * a silently short read makes a used stub look unused — the cleanup would then
 * start deleting and fail partway on the foreign key.
 */
async function usesOf(db, names) {
  const out = [];
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db
        .from("product_ingredients")
        .select("product_id, inci_name, position")
        .in("inci_name", batch)
        .order("product_id", { ascending: true })
        .order("position", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(error.message);
      out.push(...data);
      if (data.length < PAGE) break;
    }
  }
  return out;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const known = new Set((await readIngredients(db, true)).map((n) => n.toLowerCase()));
  const stubs = await readIngredients(db, false);
  const aliases = await fetchAliases(db);
  console.log(`Dictionary: ${known.size} verified names, ${stubs.length} unverified stubs.\n`);

  const variants = new Map(); // stub → verified name
  const junk = [];
  const notIngredients = new Set();
  for (const stub of stubs) {
    const verdict = classifyStub(stub, known, aliases);
    if (verdict?.kind === "variant") variants.set(stub, verdict.target);
    else if (verdict?.kind === "not-ingredient") notIngredients.add(stub);
    else if (verdict?.kind === "junk") junk.push(stub);
  }
  // Read uses for every stub, not only today's recognised variants/junk. An
  // unverified row that no formula references has no catalogue meaning left
  // and can be removed without deciding whether the original text was real.
  const uses = await usesOf(db, stubs);
  const usesByName = new Map();
  for (const u of uses) usesByName.set(u.inci_name, [...(usesByName.get(u.inci_name) ?? []), u]);

  // A product that already lists the real name cannot also point this row at
  // it, or the formula would name it twice: one of the two rows is dropped.
  const variantUses = [...variants.keys()].flatMap((s) => usesByName.get(s) ?? []);
  const productIds = [...new Set(variantUses.map((u) => u.product_id))];
  const productNames = new Map();
  for (const [productId, rows] of await fetchStoredFormulas(db, productIds)) {
    const names = new Map();
    for (const r of rows) names.set(r.inci_name, [...(names.get(r.inci_name) ?? []), r.position]);
    productNames.set(productId, names);
  }

  const { repoint, dropRow } = planRepoints(variants, variantUses, productNames);
  // A confirmed non-ingredient is not part of any formula: its rows go.
  const notIngredientRows = [...notIngredients].flatMap((n) => usesByName.get(n) ?? []);
  dropRow.push(...notIngredientRows);
  const junkInUse = junk.filter((n) => (usesByName.get(n) ?? []).length > 0);
  const doomed = plannedDeletions(stubs, variants, uses, notIngredients);
  const usedNames = new Set(uses.map((row) => row.inci_name));
  const unused = stubs.filter((name) => !usedNames.has(name));
  const unresolvedInUse = stubs.length - doomed.size - junkInUse.length;

  console.log(`Spelling variants of a verified name: ${variants.size}`);
  for (const [stub, target] of [...variants].slice(0, 12)) console.log(`  ${stub}  ->  ${target}`);
  console.log(
    `    ${repoint.length} product row(s) repointed, ${dropRow.length - notIngredientRows.length} duplicate row(s) dropped`
  );
  console.log(`\nConfirmed not an ingredient (product rows dropped, stub deleted): ${notIngredients.size}`);
  for (const n of [...notIngredients].slice(0, 12)) console.log(`  ${n.slice(0, 90)}`);
  console.log(`    ${notIngredientRows.length} product row(s) dropped`);
  console.log(`\nUnused unverified stubs (deleted): ${unused.length}`);
  for (const n of unused.slice(0, 12)) console.log(`  ${n.slice(0, 90)}`);
  console.log(`\nJunk still used by a product (left alone): ${junkInUse.length}`);
  for (const n of junkInUse.slice(0, 12)) console.log(`  ${n.slice(0, 90)}`);
  console.log(`\nLeft alone, used and could be real ingredients: ${unresolvedInUse}`);

  if (!APPLY) {
    console.log("\nNothing written. Run again with --apply to do it.");
    return;
  }

  // Drops first: a row is identified by product and position, and a dropped row
  // can be the real name's own, which a repoint would otherwise duplicate.
  for (const r of dropRow) {
    const { error } = await db
      .from("product_ingredients")
      .delete()
      .eq("product_id", r.product_id)
      .eq("position", r.position);
    if (error) throw new Error(`drop ${r.product_id}#${r.position}: ${error.message}`);
  }
  for (const r of repoint) {
    const { error } = await db
      .from("product_ingredients")
      .update({ inci_name: r.target })
      .eq("product_id", r.product_id)
      .eq("position", r.position);
    if (error) throw new Error(`repoint ${r.product_id}#${r.position}: ${error.message}`);
  }

  // Uses are read again just before each batch is deleted. A scan can save a
  // product between the plan above and this point, and a stub it now references
  // must stay: deleting it would fail the whole batch on the foreign key. A save
  // landing in the last moment can still lose that race; its write fails, the
  // person can retry, and nothing is left half-written.
  const doomedNames = [...doomed];
  let deleted = 0;
  for (let i = 0; i < doomedNames.length; i += BATCH) {
    const batch = doomedNames.slice(i, i + BATCH);
    const nowUsed = new Set((await usesOf(db, batch)).map((row) => row.inci_name));
    const safe = batch.filter((name) => !nowUsed.has(name));
    if (safe.length === 0) continue;
    const { error } = await db.from("ingredients").delete().eq("verified", false).in("inci_name", safe);
    if (error) throw new Error(error.message);
    deleted += safe.length;
  }
  const kept = doomedNames.length - deleted;
  console.log(`\nDeleted ${deleted} stub(s)${kept > 0 ? `, kept ${kept} a product has started using` : ""}.`);
}

/** See the same guard in `scripts/import-obf.mjs`. */
function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

export { AMBIGUOUS_STUB_NAMES, CONFIRMED_NOT_INGREDIENTS, classifyStub, plannedDeletions, planRepoints, usesOf };

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
