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
import { createClient } from "@supabase/supabase-js";

import { fuzzyKnownName, isPlausibleIngredientName, parseInci, resolveKnownName } from "./lib/inci-parse.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const APPLY = process.argv.includes("--apply");
const BATCH = 200;

/**
 * What to do with one unverified name: `{ kind: "variant", target }`,
 * `{ kind: "junk" }`, or `null` to leave it alone.
 *
 * The word limit `isPlausibleIngredientName` applies to label text is not
 * applied here — real dictionary names run past it (fermented extracts list
 * dozens of species) — so only the first eight words are checked.
 */
function classifyStub(name, known, aliases) {
  const resolved = resolveKnownName(name, known, aliases);
  if (resolved !== name && known.has(resolved)) return { kind: "variant", target: resolved };
  const typo = fuzzyKnownName(name, known, { remaining: Infinity });
  if (typo !== name && known.has(typo)) return { kind: "variant", target: typo };
  const aliased = aliases?.get(name);
  if (aliased && aliased !== name && known.has(aliased)) return { kind: "variant", target: aliased };

  // A heading glued to one real ingredient ("ingrédients: aqua") is the name
  // the parser used to write before it learned headings; it reads back as that
  // single ingredient. Anything that reads back as several is left as junk.
  const parsed = parseInci(name, known, undefined, aliases);
  if (parsed.length === 1 && parsed[0].inci_name !== name && known.has(parsed[0].inci_name)) {
    return { kind: "variant", target: parsed[0].inci_name };
  }

  const head = name.split(/\s+/).slice(0, 8).join(" ");
  if (name.length < 4 || !/[a-z]/i.test(name) || !isPlausibleIngredientName(head)) {
    return { kind: "junk" };
  }
  return null;
}

async function readIngredients(db, verified) {
  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name",
    cursorColumn: "inci_name",
    filter: (q) => q.eq("verified", verified),
  });
  return rows.map((r) => r.inci_name);
}

async function readAliases(db) {
  const rows = await paginateOrdered(db, "ingredient_synonyms", {
    select: "synonym, inci_name",
    cursorColumn: "synonym",
  });
  return new Map(rows.map((r) => [r.synonym.toLowerCase(), r.inci_name.toLowerCase()]));
}

/** Every product_ingredients row that uses one of `names`. */
async function usesOf(db, names) {
  const out = [];
  for (let i = 0; i < names.length; i += BATCH) {
    const { data, error } = await db
      .from("product_ingredients")
      .select("product_id, inci_name, position")
      .in("inci_name", names.slice(i, i + BATCH));
    if (error) throw new Error(error.message);
    out.push(...data);
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
  const aliases = await readAliases(db);
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
  // it, or the formula would name it twice: that row is dropped instead.
  const productNames = new Map();
  const variantUses = [...variants.keys()].flatMap((s) => usesByName.get(s) ?? []);
  const productIds = [...new Set(variantUses.map((u) => u.product_id))];
  for (let i = 0; i < productIds.length; i += BATCH) {
    const { data, error } = await db
      .from("product_ingredients")
      .select("product_id, inci_name")
      .in("product_id", productIds.slice(i, i + BATCH));
    if (error) throw new Error(error.message);
    for (const r of data) {
      if (!productNames.has(r.product_id)) productNames.set(r.product_id, new Set());
      productNames.get(r.product_id).add(r.inci_name);
    }
  }

  const repoint = [];
  const dropRow = [];
  for (const u of variantUses) {
    const target = variants.get(u.inci_name);
    if (productNames.get(u.product_id)?.has(target)) dropRow.push(u);
    else {
      repoint.push({ ...u, target });
      productNames.get(u.product_id)?.add(target);
    }
  }
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

  for (const r of repoint) {
    const { error } = await db
      .from("product_ingredients")
      .update({ inci_name: r.target })
      .eq("product_id", r.product_id)
      .eq("position", r.position);
    if (error) throw new Error(`repoint ${r.product_id}#${r.position}: ${error.message}`);
  }
  for (const r of dropRow) {
    const { error } = await db
      .from("product_ingredients")
      .delete()
      .eq("product_id", r.product_id)
      .eq("position", r.position);
    if (error) throw new Error(`drop ${r.product_id}#${r.position}: ${error.message}`);
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

export { classifyStub };

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
