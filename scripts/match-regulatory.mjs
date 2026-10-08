/**
 * Ties dictionary ingredients to the Annex entries they are about, and writes the owner's review list
 * (#457, step 4 of 9). The rules are in `scripts/lib/regulatory-match.mjs`; this is the database around them.
 *
 *   npm run match:regulatory                          # read staging, print the counts and the held rows, write the review CSV. Writes nothing to the database.
 *   npm run match:regulatory -- --apply               # ...and write `ingredient_regulatory` (needs SUPABASE_ENV, and --prod for production)
 *   npm run match:regulatory -- --apply --prune       # ...and delete automatic rows the new matches no longer make
 *   npm run match:regulatory -- --cosing-file ./records.json   # read the CosIng records from a file instead of `cosing_records` (a dry run; --apply refuses it)
 *   npm run match:regulatory -- --out ./elsewhere.csv
 *
 * Needs the CosIng copy (`cosing_records`, migration 0039). With none, or one far smaller than the real
 * thing, it stops with the reason and writes nothing: matching against a missing copy would read as "nothing
 * is regulated". It only ever writes `ingredient_regulatory`, so `ingredients.updated_at`, the dictionary's
 * sync watermark, does not move; it prints the newest value before and after to show it.
 *
 * It never touches a row a person has reviewed (`reviewed_by`) or made by hand (`matched_by = 'manual'`): a
 * run that disagrees with one only reports it. `reviewed_by` is the owner's to fill in, and only reviewed
 * rows may ever fire the notice.
 */

import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { connect } from "./lib/db.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";
import { matchRegulatory, planRegulatoryWrites, toCsv } from "./lib/regulatory-match.mjs";

export const DEFAULT_OUT = ".regulatory-review.csv";
/** A CosIng copy with fewer records than this is not the copy: the real one has some 36,000 (7 October 2026). */
export const MIN_RECORDS = 20000;
const BATCH = 500;

const flag = (args, name) => args.includes(name);
const option = (args, name) => {
  const at = args.indexOf(name);
  return at === -1 ? null : args[at + 1];
};

async function readAll(db, table, select, order) {
  return paginateOrdered(db, table, { select, cursorColumn: order });
}

/** How many catalogue products each of `names` is in. Asked for the names that matter, not for the whole table. */
async function productCounts(db, names) {
  const counts = new Map();
  for (let i = 0; i < names.length; i += 100) {
    const chunk = names.slice(i, i + 100);
    const seen = new Map();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await db.from("product_ingredients").select("product_id,inci_name").in("inci_name", chunk).order("product_id").order("position").range(from, from + 999);
      if (error) throw new Error(`read product_ingredients: ${error.message}`);
      for (const row of data) seen.set(row.inci_name, (seen.get(row.inci_name) ?? new Set()).add(row.product_id));
      if (data.length < 1000) break;
    }
    for (const [name, products] of seen) counts.set(name, products.size);
  }
  return counts;
}

async function newestDictionaryStamp(db) {
  const { data, error } = await db.from("ingredients").select("updated_at").order("updated_at", { ascending: false }).limit(1);
  if (error) throw new Error(`read ingredients.updated_at: ${error.message}`);
  return data[0]?.updated_at ?? null;
}

async function main(args) {
  const apply = flag(args, "--apply");
  const prune = flag(args, "--prune");
  const cosingFile = option(args, "--cosing-file");
  const out = option(args, "--out") ?? DEFAULT_OUT;
  if (apply && cosingFile) throw new Error("--apply writes only from the database's own CosIng copy, not from --cosing-file");

  const { db } = connect({ write: apply });

  const entries = await readAll(db, "regulatory_entries", "annex,entry,wording,cas_numbers,ec_numbers,members,status", "entry").then((rows) => rows.filter((r) => r.status === "active"));
  const records = cosingFile ? JSON.parse(readFileSync(cosingFile, "utf8")) : await readAll(db, "cosing_records", "cosing_ref,kind,inci_name,cas_numbers,ec_numbers,annex_refs", "cosing_ref");
  if (records.length === 0) throw new Error("There is no CosIng copy (cosing_records is empty). Nothing was matched; run the import first.");
  if (!cosingFile && records.length < MIN_RECORDS) throw new Error(`The CosIng copy has ${records.length} records, fewer than the ${MIN_RECORDS} that make it the copy. Nothing was matched.`);
  if (entries.length === 0) throw new Error("There are no active regulatory entries. Run import:eu-annexes first.");

  const ingredients = (await readAll(db, "ingredients", "inci_name", "inci_name")).map((r) => r.inci_name);
  const first = matchRegulatory({ entries, records, ingredients });
  const involved = [...new Set([...first.matches, ...first.held].filter((r) => r.annex === "II").map((r) => r.inci_name))];
  const result = matchRegulatory({ entries, records, ingredients, productCounts: await productCounts(db, involved) });

  writeFileSync(out, toCsv(result.reviewRows));
  const { counts } = result;
  console.log(`${entries.length} active entries, ${records.length} CosIng records${cosingFile ? ` (from ${cosingFile})` : ""}, ${ingredients.length} dictionary names (${result.ingredientsWithRecord} with a CosIng record).`);
  console.log(`Matched by CAS ${counts.cas}, by EC ${counts.ec}, by CosIng ${counts.cosing}, by class ${counts.class}; held back ${counts.held}.`);
  console.log(`Review list: ${result.reviewRows.length} Annex II row(s) in at least one product → ${out}`);
  console.log(`Entries with no CAS or EC at all: ${result.entriesWithoutIds.length}.`);
  for (const h of result.held.slice(0, 25)) console.log(`  held: ${h.inci_name} → ${h.annex}/${h.entry}: ${h.reason}`);
  if (result.held.length > 25) console.log(`  … and ${result.held.length - 25} more (in the review list where they touch Annex II).`);

  const stored = await readAll(db, "ingredient_regulatory", "inci_name,annex,entry,matched_by,reviewed_by", "inci_name");
  const plan = planRegulatoryWrites(stored, result.matches);
  console.log(`Against ingredient_regulatory (${stored.length} stored): ${plan.upserts.length} to write, ${plan.unchanged} unchanged, ${plan.stale.length} stale, ${plan.conflicts.length} reviewed or hand-made row(s) this run disagrees with.`);
  for (const c of plan.conflicts) console.log(`  not touched: ${c.inci_name} → ${c.annex}/${c.entry} is ${c.matched_by}${c.reviewed_by ? `, reviewed by ${c.reviewed_by}` : ""}; this run says ${c.now ?? "no match"}`);

  if (!apply) {
    console.log("Dry run: nothing written to the database. Add --apply to write.");
    return;
  }

  const before = await newestDictionaryStamp(db);
  for (let i = 0; i < plan.upserts.length; i += BATCH) {
    const { error } = await db.from("ingredient_regulatory").upsert(plan.upserts.slice(i, i + BATCH), { onConflict: "inci_name,annex,entry" });
    if (error) throw new Error(`write ingredient_regulatory: ${error.message}`);
  }
  if (prune) {
    for (const row of plan.stale) {
      const { error } = await db.from("ingredient_regulatory").delete().eq("inci_name", row.inci_name).eq("annex", row.annex).eq("entry", row.entry).is("reviewed_by", null).neq("matched_by", "manual");
      if (error) throw new Error(`prune ingredient_regulatory: ${error.message}`);
    }
  }
  const after = await newestDictionaryStamp(db);
  console.log(`Wrote ${plan.upserts.length} row(s)${prune ? `, pruned ${plan.stale.length}` : ""}. ingredients.updated_at, newest: ${before} before, ${after} after${before === after ? " (unchanged)" : " (CHANGED: stop and look)"}.`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
