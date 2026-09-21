/**
 * Clearing names a dictionary importer wrote on an earlier run and no longer
 * produces. Shared by `import-inci-dictionary` and `import-cosing`, each of
 * which only ever touches rows carrying its own `source`.
 */

import { usesOf } from "../clean-ingredient-stubs.mjs";

// A full download that suddenly "no longer produces" more than this share of
// the rows it owns is a truncated file, not a clean-up.
const MAX_STALE_SHARE = 0.02;
const STUB_NOTE = "No published rating for this ingredient yet.";

/**
 * `used` is the set of names some product's formula points at: those cannot be
 * deleted (the formula row references them), and should not keep data that
 * belonged to a different ingredient either.
 */
function planPrune(rows, existing, used, source) {
  const produced = new Set(rows.map((row) => row.inci_name));
  const owned = [...existing.values()].filter((row) => row.verified && row.source === source);
  const stale = owned.filter((row) => !produced.has(row.inci_name)).map((row) => row.inci_name);

  return {
    stale,
    remove: stale.filter((name) => !used.has(name)),
    demote: stale.filter((name) => used.has(name)),
    tooMany: owned.length > 0 && stale.length / owned.length > MAX_STALE_SHARE,
  };
}

/** Reads which stale names a product still uses, then plans around them. */
async function planPruneAgainst(db, rows, existing, source) {
  const staleNames = planPrune(rows, existing, new Set(), source).stale;
  const used = new Set((await usesOf(db, staleNames)).map((row) => row.inci_name));
  return planPrune(rows, existing, used, source);
}

function assertNotTooMany(prune, label) {
  if (!prune.tooMany) return;
  throw new Error(
    `${prune.stale.length} stale names is more than ${MAX_STALE_SHARE * 100}% of the ${label} rows. ` +
      "That looks like a cut-short download, not a clean-up. Nothing written."
  );
}

async function inBatches(items, size, run) {
  for (let i = 0; i < items.length; i += size) await run(items.slice(i, i + size));
}

async function demote(db, names, source) {
  if (names.length === 0) return;
  const { error } = await db
    .from("ingredients")
    .update({ verified: false, source: "unmatched", safety: "safe", functions: [], cas_number: null, note: STUB_NOTE })
    .in("inci_name", names)
    .eq("source", source);
  if (error) throw new Error(error.message);
}

/** Returns how many rows went each way. Every write is guarded on `source`. */
async function applyPrune(db, prune, source) {
  await inBatches(prune.demote, 200, (batch) => demote(db, batch, source));
  let removed = 0;
  let demoted = prune.demote.length;
  await inBatches(prune.remove, 200, async (batch) => {
    // Read uses again: a scan may have started using one since the plan. It
    // can no longer be deleted, and must not stay verified either.
    const nowUsed = new Set((await usesOf(db, batch)).map((row) => row.inci_name));
    const taken = batch.filter((name) => nowUsed.has(name));
    await demote(db, taken, source);
    demoted += taken.length;

    const safe = batch.filter((name) => !nowUsed.has(name));
    if (safe.length === 0) return;
    const { error } = await db.from("ingredients").delete().in("inci_name", safe).eq("source", source);
    if (error) throw new Error(error.message);
    removed += safe.length;
  });
  return { removed, demoted };
}

export { applyPrune, assertNotTooMany, inBatches, planPrune, planPruneAgainst };
