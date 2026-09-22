/**
 * Merge the duplicate ingredients `audit-duplicate-ingredients.mjs` finds,
 * where it is safe to do so automatically.
 *
 * Only a spelling group with no conflict is merged: names that differ solely
 * by case, spacing or punctuation, whose rows already agree on `safety` and
 * `functions`. There is nothing for a person to decide there — the rows
 * describe the same ingredient the same way, just spelled two ways.
 *
 * Two kinds are never touched here, and are only reported:
 *
 *   - a CAS group. A shared CAS number is a lead, not proof (a blend or an
 *     extract can legitimately be listed under two names) — merging on CAS
 *     alone risks collapsing two different ingredients into one.
 *   - any group with a conflict (disagreeing safety or functions), spelling or
 *     CAS. The rows disagree about the ingredient itself; picking a winner is
 *     a data judgment, not a formatting cleanup.
 *
 * Within a mergeable group, the name kept is whichever more products already
 * use (ties broken by locale order, not plain alphabetical — "water" sorts
 * before "Water") — the spelling that changes the fewest
 * product rows. Every other name in the group is retired: product rows that
 * name it are repointed to the kept name first (or dropped, if that product
 * already lists the kept name at an earlier position — the same rule
 * `clean-ingredient-stubs.mjs` uses). Any `ingredient_synonyms` row naming the
 * retired spelling as its target is repointed at the kept name too —
 * `ingredient_synonyms.inci_name` cascades on delete, so skipping this would
 * silently drop an alias someone stored for that exact spelling the moment
 * the retired row goes. Only then is the retired ingredient row deleted, once
 * nothing points at it any more.
 *
 * Prints the whole plan first and writes nothing unless run with --apply.
 * Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the shell, plus
 * SUPABASE_ENV once --apply turns it into a write (and --prod alongside it if
 * that environment is production).
 *
 *   node scripts/fix-duplicate-ingredients.mjs            # print the plan
 *   node scripts/fix-duplicate-ingredients.mjs --apply    # do it
 */

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { findDuplicates } from "./audit-duplicate-ingredients.mjs";
import { planRepoints, usesOf } from "./clean-ingredient-stubs.mjs";
import { connect } from "./lib/db.mjs";
import { fetchStoredFormulas } from "./lib/formula-diff.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

const APPLY = process.argv.includes("--apply");
const BATCH = 200;

/**
 * @typedef {{ inci_name: string, cas_number: string | null, functions: string[] | null, safety: string, source: string }} Row
 * @typedef {{ kind: "spelling" | "cas", key: string, rows: Row[], conflicts: string[] }} Group
 */

/**
 * Split the groups `findDuplicates` reports into ones safe to merge
 * automatically and ones that need a person, per the rules above.
 *
 * @param {Group[]} groups
 * @returns {{ mergeable: Group[], skipped: Group[] }}
 */
export function partitionGroups(groups) {
  const mergeable = [];
  const skipped = [];
  for (const group of groups) {
    if (group.kind === "spelling" && group.conflicts.length === 0) mergeable.push(group);
    else skipped.push(group);
  }
  return { mergeable, skipped };
}

/**
 * Which name in a mergeable group to keep: whichever more products already
 * use, ties broken alphabetically so the choice is deterministic.
 *
 * @param {Group} group
 * @param {Map<string, number>} useCount inci_name → product_ingredients rows
 * @returns {{ keep: string, retire: string[] }}
 */
export function pickCanonical(group, useCount) {
  const ranked = [...group.rows].sort((a, b) => {
    const byUse = (useCount.get(b.inci_name) ?? 0) - (useCount.get(a.inci_name) ?? 0);
    return byUse !== 0 ? byUse : a.inci_name.localeCompare(b.inci_name);
  });
  return { keep: ranked[0].inci_name, retire: ranked.slice(1).map((r) => r.inci_name) };
}

/**
 * The merge plan for every mergeable group at once: which name each retired
 * name points to.
 *
 * @param {Group[]} mergeable
 * @param {Map<string, number>} useCount
 * @returns {Map<string, string>} retired name → kept name
 */
export function planMerge(mergeable, useCount) {
  const variants = new Map();
  for (const group of mergeable) {
    const { keep, retire } = pickCanonical(group, useCount);
    for (const name of retire) variants.set(name, keep);
  }
  return variants;
}

/**
 * How to deal with the `ingredient_synonyms` rows that target a retired name,
 * before that name is deleted.
 *
 * A row whose `synonym` text already equals the kept name is a self-reference
 * once repointed (`synonym_is_not_its_own_target` would refuse the update) and
 * is dropped instead — it says nothing a lookup on the kept name doesn't
 * already give for free. Every other row is repointed onto the kept name.
 *
 * @param {{ synonym: string, inci_name: string }[]} rows synonym rows whose
 *   `inci_name` is one of `variants`' keys
 * @param {Map<string, string>} variants retired name -> kept name
 * @returns {{ drop: string[], repoint: Map<string, string[]> }} repoint maps
 *   kept name -> synonym texts to point at it
 */
export function planSynonymRepoints(rows, variants) {
  const drop = [];
  const repoint = new Map();
  for (const row of rows) {
    const keep = variants.get(row.inci_name);
    if (keep === undefined) continue;
    if (row.synonym === keep) {
      drop.push(row.synonym);
      continue;
    }
    if (!repoint.has(keep)) repoint.set(keep, []);
    repoint.get(keep).push(row.synonym);
  }
  return { drop, repoint };
}

/**
 * Repoints every `ingredient_synonyms` row targeting a retired name onto its
 * kept name, before the retired `ingredients` row is deleted — the delete
 * cascades onto this table, so doing it after would be too late.
 *
 * @param {any} db
 * @param {Map<string, string>} variants retired name -> kept name
 */
async function repointSynonyms(db, variants) {
  const retiredNames = [...variants.keys()];
  for (let i = 0; i < retiredNames.length; i += BATCH) {
    const batch = retiredNames.slice(i, i + BATCH);
    const { data, error } = await db.from("ingredient_synonyms").select("synonym, inci_name").in("inci_name", batch);
    if (error) throw new Error(`reading synonyms for ${batch.join(", ")}: ${error.message}`);
    if (!data || data.length === 0) continue;

    const { drop, repoint } = planSynonymRepoints(data, variants);
    if (drop.length > 0) {
      const { error: dropError } = await db.from("ingredient_synonyms").delete().in("synonym", drop);
      if (dropError) throw new Error(`dropping self-referencing synonym(s): ${dropError.message}`);
    }
    for (const [keep, synonyms] of repoint) {
      const { error: updateError } = await db.from("ingredient_synonyms").update({ inci_name: keep }).in("synonym", synonyms);
      if (updateError) throw new Error(`repointing synonym(s) onto ${keep}: ${updateError.message}`);
    }
  }
}

async function main() {
  const { db } = connect({ write: APPLY });

  const rows = await paginateOrdered(db, "ingredients", {
    select: "inci_name,cas_number,functions,safety,source",
    cursorColumn: "inci_name",
    filter: (query) => query.eq("verified", true),
  });
  console.log(`Read ${rows.length} verified ingredient names.`);

  const groups = findDuplicates(rows);
  const { mergeable, skipped } = partitionGroups(groups);
  console.log(
    `${groups.length} duplicate group(s): ${mergeable.length} spelling-only, no conflict (mergeable); ` +
      `${skipped.length} left for review (CAS-based, or disagree on safety/functions).`
  );

  if (mergeable.length === 0) {
    console.log("\nNothing to merge.");
    return;
  }

  const allNames = [...new Set(mergeable.flatMap((g) => g.rows.map((r) => r.inci_name)))];
  const uses = await usesOf(db, allNames);
  const useCount = new Map();
  for (const u of uses) useCount.set(u.inci_name, (useCount.get(u.inci_name) ?? 0) + 1);

  const variants = planMerge(mergeable, useCount);
  const variantUses = uses.filter((u) => variants.has(u.inci_name));
  const productIds = [...new Set(variantUses.map((u) => u.product_id))];
  const productNames = new Map();
  for (const [productId, formulaRows] of await fetchStoredFormulas(db, productIds)) {
    const names = new Map();
    for (const r of formulaRows) names.set(r.inci_name, [...(names.get(r.inci_name) ?? []), r.position]);
    productNames.set(productId, names);
  }

  const { repoint, dropRow } = planRepoints(variants, variantUses, productNames);

  console.log(`\nMerging ${mergeable.length} group(s), retiring ${variants.size} name(s):`);
  for (const group of mergeable) {
    const { keep, retire } = pickCanonical(group, useCount);
    console.log(`  ${retire.join(", ")}  ->  ${keep}`);
  }
  console.log(`\n${repoint.length} product row(s) repointed, ${dropRow.length} duplicate row(s) dropped.`);

  if (skipped.length > 0) {
    console.log(`\nLeft for review (not touched):`);
    for (const group of skipped.slice(0, 20)) {
      const label = group.kind === "cas" ? `CAS ${group.key}` : "spelling, conflicting data";
      console.log(`  ${label}: ${group.rows.map((r) => r.inci_name).join(", ")}`);
      for (const conflict of group.conflicts) console.log(`    ! ${conflict}`);
    }
    if (skipped.length > 20) console.log(`  … ${skipped.length - 20} more.`);
  }

  if (!APPLY) {
    console.log("\nNothing written. Run again with --apply to do it.");
    return;
  }

  // Drops first: a row is identified by product and position, and a dropped row
  // can be the kept name's own, which a repoint would otherwise duplicate.
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

  // Before any retired row is deleted: ingredient_synonyms.inci_name cascades
  // on delete, so an alias someone stored pointing at a retired spelling must
  // be moved onto the kept name first, or it is lost with no record of it.
  await repointSynonyms(db, variants);

  // Uses are read again just before each batch is deleted. A scan can save a
  // product between the plan above and this point, and a retired name it now
  // references must stay: deleting it would fail the whole batch on the
  // foreign key. A retired name still in use is left as a verified row rather
  // than merged, and the next run of this script will pick it up again.
  const retiredNames = [...variants.keys()];
  let deleted = 0;
  for (let i = 0; i < retiredNames.length; i += BATCH) {
    const batch = retiredNames.slice(i, i + BATCH);
    const nowUsed = new Set((await usesOf(db, batch)).map((row) => row.inci_name));
    const safe = batch.filter((name) => !nowUsed.has(name));
    if (safe.length === 0) continue;
    const { error } = await db.from("ingredients").delete().eq("verified", true).in("inci_name", safe);
    if (error) throw new Error(error.message);
    deleted += safe.length;
  }
  const kept = retiredNames.length - deleted;
  console.log(`\nDeleted ${deleted} retired name(s)${kept > 0 ? `, kept ${kept} that a product started using again` : ""}.`);
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

export { invokedDirectly };

if (invokedDirectly()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
