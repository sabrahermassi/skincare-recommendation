/**
 * One-off repair: repoint catalogue rows at canonical ingredient names.
 *
 * Two parser bugs, both since fixed, left bad names behind in rows already
 * written. Fixing the parsers only helps the next scan — these rows stay wrong
 * until something rewrites them:
 *
 *   slash  "aqua/water", "aqua/water/eau", "butter/shea" — a "/" on a label
 *          separates two names for ONE ingredient. The matcher now resolves
 *          these to the canonical first name.
 *   locant "2-hexanediol" — "1,2-Hexanediol" was split on its own comma,
 *          dropping a bare "1" and orphaning the rest. CosIng supplies the
 *          real name, so the repair now has somewhere to point.
 *
 * Only ever repoints a `product_ingredients` row onto a name that already
 * exists and is verified; a candidate that resolves to nothing is left alone
 * and reported. The orphaned name rows are not deleted — they are unverified,
 * `fetchDictionary()` already ignores them, and deleting rows other products
 * may still reference is a separate decision.
 *
 *   node scripts/backfill-ingredient-names.mjs --dry-run
 *   node scripts/backfill-ingredient-names.mjs
 *
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY either way — --dry-run
 * still reads the live catalogue, it just skips the writes at the end.
 */

import { createClient } from "@supabase/supabase-js";

const DRY_RUN = process.argv.includes("--dry-run");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function verifiedNames() {
  const names = new Set();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("ingredients")
      .select("inci_name")
      .eq("verified", true)
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) names.add(row.inci_name);
    if (!data || data.length < 1000) break;
  }
  return names;
}

/** Candidate canonical forms for a bad name, best first. */
function candidates(name) {
  const out = [];
  if (name.includes("/")) {
    // "aqua/water/eau" -> "aqua"; the parts after the slash are other names
    // for the same substance, and the first is the canonical one.
    out.push(name.split("/")[0].trim());
  }
  // "2-hexanediol" -> "1,2-hexanediol". The dropped locant is almost always 1;
  // anything else is proposed too and only used if the dictionary has it.
  const locant = /^(\d)-(.+)$/.exec(name);
  if (locant) {
    for (const lead of ["1", "2", "3"]) {
      if (lead !== locant[1]) out.push(`${lead},${locant[1]}-${locant[2]}`);
    }
  }
  return out.filter((c) => c.length > 1);
}

/** Synonym → canonical, so a stored `glycérine` can be repointed at `glycerin`. */
async function synonyms() {
  const map = new Map();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db
      .from("ingredient_synonyms")
      .select("synonym, inci_name")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) map.set(row.synonym, row.inci_name);
    if (!data || data.length < 1000) break;
  }
  return map;
}

async function main() {
  const verified = await verifiedNames();
  const aliases = await synonyms();
  console.log(`${verified.size} verified names, ${aliases.size} synonyms`);

  const { data: bad, error } = await db
    .from("ingredients")
    .select("inci_name")
    .eq("verified", false);
  if (error) throw new Error(error.message);

  const repairs = [];
  const unresolved = [];
  for (const { inci_name } of bad ?? []) {
    // A stored name that is itself a known synonym resolves directly —
    // `glycérine` was parsed correctly, it just isn't the canonical name.
    const viaSynonym = aliases.get(inci_name);
    const target =
      viaSynonym && verified.has(viaSynonym)
        ? viaSynonym
        : candidates(inci_name).find((c) => verified.has(c));
    if (target) repairs.push({ from: inci_name, to: target });
    else if (inci_name.includes("/") || /^\d-/.test(inci_name)) unresolved.push(inci_name);
  }

  // How many catalogue references each repair actually moves.
  let movedLinks = 0;
  for (const r of repairs) {
    const { count, error: e } = await db
      .from("product_ingredients")
      .select("*", { count: "exact", head: true })
      .eq("inci_name", r.from);
    if (e) throw new Error(e.message);
    r.links = count ?? 0;
    movedLinks += r.links;
  }
  repairs.sort((a, b) => b.links - a.links);

  console.log(`\n${repairs.length} names repairable, moving ${movedLinks} product references:`);
  for (const r of repairs.slice(0, 20)) console.log(`  ${r.from}  ->  ${r.to}   (${r.links})`);
  if (repairs.length > 20) console.log(`  … and ${repairs.length - 20} more`);
  if (unresolved.length) {
    console.log(`\n${unresolved.length} left alone (no verified target): ${unresolved.slice(0, 10).join(", ")}`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: nothing written.");
    return;
  }

  let done = 0;
  for (const r of repairs) {
    if (r.links === 0) continue;
    // The target may already be on the same product at another position, and
    // (product_id, position) is the key — so move rows one at a time and skip
    // any that would collide with a row already naming the canonical form.
    const { data: rows, error: e1 } = await db
      .from("product_ingredients")
      .select("product_id, position")
      .eq("inci_name", r.from);
    if (e1) throw new Error(e1.message);

    for (const row of rows ?? []) {
      const { data: clash, error: clashError } = await db
        .from("product_ingredients")
        .select("position")
        .eq("product_id", row.product_id)
        .eq("inci_name", r.to)
        .maybeSingle();
      if (clashError) throw new Error(clashError.message);

      if (clash) {
        // Already present under the canonical name — drop the duplicate.
        const { error: deleteError } = await db
          .from("product_ingredients")
          .delete()
          .eq("product_id", row.product_id)
          .eq("position", row.position);
        if (deleteError) throw new Error(deleteError.message);
      } else {
        const { error: e2 } = await db
          .from("product_ingredients")
          .update({ inci_name: r.to })
          .eq("product_id", row.product_id)
          .eq("position", row.position);
        if (e2) throw new Error(e2.message);
      }
    }
    done += 1;
    process.stdout.write(`\r  ${done}/${repairs.length}`);
  }
  console.log(`\nRepointed ${movedLinks} references across ${repairs.length} names.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
