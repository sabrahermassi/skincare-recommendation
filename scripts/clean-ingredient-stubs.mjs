/**
 * Clean the unverified ingredient stubs out of the dictionary.
 *
 * A stub is a name a scan or import met that the dictionary did not know, so
 * it was saved with `verified = false`. Two kinds are safe to remove:
 *
 *   variant — a spelling, spacing or other-language form of a name the
 *             dictionary already verifies ("glycérine", "sodium hydroxyde").
 *             Products that use it are pointed at the real name first.
 *   junk    — not an ingredient at all (a web address, a file name, a sentence,
 *             a fragment with no letters). Deleted only when no product uses it.
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

import { connect } from "./lib/db.mjs";
import { fuzzyKnownName, isPlausibleIngredientName, parseInci, resolveKnownName } from "./lib/inci-parse.mjs";
import { KNOWN_SHORT_NAMES } from "./audit-catalogue-quality.mjs";
import { fetchAliases } from "./lib/aliases.mjs";
import { fetchStoredFormulas } from "./lib/formula-diff.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const APPLY = process.argv.includes("--apply");
const BATCH = 200;

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

  const target = wholeName(name, known, aliases);
  // "2 hexanediol" is "1,2-hexanediol" with its "1," cut off, and plain
  // hexanediol is a different ingredient: a bare leading number only counts when
  // the rest is spacing.
  if (target && /^\d\s*-?\s+[a-z]/i.test(name) && squashed(target) !== squashed(name)) return null;
  return target;
}

/**
 * What to do with one unverified name: `{ kind: "variant", target }`,
 * `{ kind: "junk" }`, or `null` to leave it alone.
 *
 * The word limit `isPlausibleIngredientName` applies to label text is not
 * applied here — real dictionary names run past it (fermented extracts list
 * dozens of species) — so it is skipped and every other check reads the whole name.
 */
function classifyStub(name, known, aliases) {
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
  const { db } = connect({ write: APPLY });

  const known = new Set((await readIngredients(db, true)).map((n) => n.toLowerCase()));
  const stubs = await readIngredients(db, false);
  const aliases = await fetchAliases(db);
  console.log(`Dictionary: ${known.size} verified names, ${stubs.length} unverified stubs.\n`);

  const variants = new Map(); // stub → verified name
  const junk = [];
  for (const stub of stubs) {
    const verdict = classifyStub(stub, known, aliases);
    if (verdict?.kind === "variant") variants.set(stub, verdict.target);
    else if (verdict?.kind === "junk") junk.push(stub);
  }
  const untouched = stubs.length - variants.size - junk.length;

  const uses = await usesOf(db, [...variants.keys(), ...junk]);
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
  const junkInUse = junk.filter((n) => (usesByName.get(n) ?? []).length > 0);
  const junkFree = junk.filter((n) => (usesByName.get(n) ?? []).length === 0);

  console.log(`Spelling variants of a verified name: ${variants.size}`);
  for (const [stub, target] of [...variants].slice(0, 12)) console.log(`  ${stub}  ->  ${target}`);
  console.log(`    ${repoint.length} product row(s) repointed, ${dropRow.length} duplicate row(s) dropped`);
  console.log(`\nJunk, used by no product (deleted): ${junkFree.length}`);
  for (const n of junkFree.slice(0, 12)) console.log(`  ${n.slice(0, 90)}`);
  console.log(`\nJunk still used by a product (left alone): ${junkInUse.length}`);
  for (const n of junkInUse.slice(0, 12)) console.log(`  ${n.slice(0, 90)}`);
  console.log(`\nLeft alone, could be real ingredients: ${untouched}`);

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

  const doomed = [...variants.keys(), ...junkFree];
  for (let i = 0; i < doomed.length; i += BATCH) {
    const { error } = await db
      .from("ingredients")
      .delete()
      .eq("verified", false)
      .in("inci_name", doomed.slice(i, i + BATCH));
    if (error) throw new Error(error.message);
  }
  console.log(`\nDeleted ${doomed.length} stub(s).`);
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

export { classifyStub, planRepoints, usesOf };

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
