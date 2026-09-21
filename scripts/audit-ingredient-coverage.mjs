/**
 * Account for every unverified ingredient name in the live catalogue.
 *
 * `verified` means a name came from a checked dictionary. Seeing the same
 * unmatched text on several products proves only that the text is repeated;
 * it does not prove which INCI entry it means. This audit therefore never
 * promotes a stub by frequency.
 *
 * The ledger is sorted by rule, not read name by name: only the two short lists
 * in `clean-ingredient-stubs.mjs` (`AMBIGUOUS_STUB_NAMES`,
 * `CONFIRMED_NOT_INGREDIENTS`) were decided by a person. It is deliberately
 * conservative. A name is either:
 *
 *   - normalised to an already verified name by the existing cleanup rules;
 *   - removable because it is unused or is not an ingredient name;
 *   - left unmapped because it contains several ingredients, is ambiguous, or
 *     has no safe match in the checked dictionaries.
 *
 * Public catalogue reads are sufficient. Use either the app's anonymous key
 * or the service key used by the other maintenance scripts:
 *
 *   npm run audit:ingredient-coverage
 *   npm run audit:ingredient-coverage -- --write
 *   npm run audit:ingredient-coverage -- --check
 */

import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { AMBIGUOUS_STUB_NAMES, classifyStub, usesOf } from "./clean-ingredient-stubs.mjs";
import { fetchAliases } from "./lib/aliases.mjs";
import { parseInci } from "./lib/inci-parse.mjs";
import { paginateOrdered } from "./lib/paginate.mjs";

// Beside the document that explains it, not in `data/`: that folder is the
// app's data seam, and no app code reads this file.
function defaultLedgerPath() {
  return fileURLToPath(new URL("../docs/ingredient-stub-review.json", import.meta.url));
}

const REASONS = Object.freeze({
  normalize: "A conservative spelling/alias rule resolves this to one verified dictionary name.",
  removeUnused: "No product references this unverified stub; it can be removed without changing a formula.",
  removeNonIngredient:
    "A person read this text and confirmed it names no ingredient; the cleanup drops it from the products that carry it.",
  invalidSourceText: "The source text is corrupted or mixes an ingredient with non-INCI text, so no safe identity can be assigned.",
  multiple: "The text contains more than one verified ingredient, so collapsing it to one name would lose data.",
  ambiguous: "The wording can mean more than one ingredient or omits the part needed for a safe identity match.",
  noMatch:
    "Matched no rule: no single safe target in the checked CosIng/OBF dictionary or CAS-backed synonym table. Sorted by rule, not read by a person; this group mixes misspellings, other-language names and leftover packaging text.",
});

/**
 * Give one current stub its explicit disposition. `uses` is the count of
 * product_ingredients rows that reference it, not evidence of identity.
 */
function reviewStub({ name, source, uses }, known, aliases) {
  if (uses === 0) {
    return { name, source, uses, decision: "remove-unused", reason: REASONS.removeUnused };
  }

  // This denylist has to run before alias/fuzzy matching. A general-purpose
  // synonym source can offer one plausible target for a broad label term, but
  // that does not make the broad term chemically specific.
  if (AMBIGUOUS_STUB_NAMES.has(name)) {
    return { name, source, uses, decision: "leave-unmapped-ambiguous", reason: REASONS.ambiguous };
  }

  const classified = classifyStub(name, known, aliases);
  if (classified?.kind === "not-ingredient") {
    return { name, source, uses, decision: "remove-non-ingredient", reason: REASONS.removeNonIngredient };
  }

  if (classified?.kind === "variant") {
    return {
      name,
      source,
      uses,
      decision: "normalize",
      target: classified.target,
      reason: REASONS.normalize,
    };
  }

  if (classified?.kind === "junk") {
    return {
      name,
      source,
      uses,
      decision: "leave-unmapped-invalid-source-text",
      reason: REASONS.invalidSourceText,
    };
  }

  // `and` is not an INCI-name separator in the production parser, but in an
  // already-created stub it is strong evidence that the source joined two
  // label entries. This audit only records that fact; it does not rewrite the
  // formula or guess where either item belonged.
  const parsed = parseInci(name.replace(/\s+(?:and|&)\s+/gi, ", "), known, undefined, aliases);
  const verifiedParts = parsed.filter((part) => known.has(part.inci_name));
  if (new Set(verifiedParts.map((part) => part.inci_name)).size > 1) {
    return { name, source, uses, decision: "leave-unmapped-multiple", reason: REASONS.multiple };
  }

  return { name, source, uses, decision: "leave-unmapped-no-authoritative-match", reason: REASONS.noMatch };
}

/**
 * The fingerprint of what was decided: each name, where it came from, and its
 * decision. Use counts are left out on purpose. They move with every scan, and a
 * name's count changing from 2 to 3 changes no decision; a count reaching or
 * leaving zero does, and that shows up as the decision changing.
 */
function inventoryHashOf(entries) {
  const material = [...entries]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, source, decision, target }) => ({ name, source, decision, ...(target ? { target } : {}) }));
  return createHash("sha256").update(JSON.stringify(material)).digest("hex");
}

/**
 * What is wrong with the committed ledger, as sentences; empty when nothing is.
 * Two separate questions: does the file still agree with its own hash (an entry
 * edited by hand without `--write` does not), and does it still describe the
 * live catalogue.
 */
function checkLedger(recorded, live) {
  const problems = [];
  const recomputed = inventoryHashOf(recorded.entries ?? []);
  if (recomputed !== recorded.inventoryHash) {
    problems.push(
      `The committed ledger's entries do not match its own hash (recorded ${recorded.inventoryHash}, entries give ${recomputed}): it was edited without --write.`
    );
  }
  if (recomputed !== live.inventoryHash) {
    problems.push(`Review ledger is stale: committed entries give ${recomputed}, live ${live.inventoryHash}.`);
  }
  return problems;
}

function buildLedger({ verifiedCount, stubs, uses, known, aliases, generatedAt = new Date().toISOString() }) {
  const useCounts = new Map();
  for (const row of uses) useCounts.set(row.inci_name, (useCounts.get(row.inci_name) ?? 0) + 1);

  const entries = stubs
    .map((stub) =>
      reviewStub(
        { name: stub.inci_name, source: stub.source, uses: useCounts.get(stub.inci_name) ?? 0 },
        known,
        aliases
      )
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const counts = Object.fromEntries(
    [...new Set(entries.map((entry) => entry.decision))]
      .sort()
      .map((decision) => [decision, entries.filter((entry) => entry.decision === decision).length])
  );
  const usedEntries = entries.filter((entry) => entry.uses > 0);
  const inventoryHash = inventoryHashOf(entries);

  return {
    schemaVersion: 1,
    generatedAt,
    policy: {
      promoteByFrequency: false,
      verifiedMeaning: "Matched to a checked source; repeated sightings alone are not verification.",
      checkedSources: [
        "EU CosIng-derived ingredient inventory",
        "Open Beauty Facts ingredient taxonomy",
        "CAS-joined Wikidata synonym table",
      ],
    },
    inventoryHash,
    summary: {
      verifiedNames: verifiedCount,
      unverifiedNames: entries.length,
      usedUnverifiedNames: usedEntries.length,
      unverifiedProductLinks: usedEntries.reduce((sum, entry) => sum + entry.uses, 0),
      decisions: counts,
    },
    entries,
  };
}

/** Keep one reviewed name per line so a future snapshot produces a readable diff. */
function serializeLedger(ledger) {
  const { entries, ...header } = ledger;
  const beforeEntries = JSON.stringify({ ...header, entries: [] }, null, 2).replace(
    '"entries": []',
    '"entries": [\n__ENTRIES__\n  ]'
  );
  const lines = entries.map((entry) => `    ${JSON.stringify(entry)}`).join(",\n");
  return `${beforeEntries.replace("__ENTRIES__", lines)}\n`;
}

async function readIngredients(db, verified) {
  return paginateOrdered(db, "ingredients", {
    select: "inci_name, source",
    cursorColumn: "inci_name",
    filter: (query) => query.eq("verified", verified),
  });
}

function printSummary(ledger) {
  const { summary } = ledger;
  console.log(`Dictionary: ${summary.verifiedNames} verified names, ${summary.unverifiedNames} unverified names.`);
  console.log(`${summary.usedUnverifiedNames} names are used by ${summary.unverifiedProductLinks} product rows.`);
  for (const [decision, count] of Object.entries(summary.decisions)) console.log(`  ${decision}: ${count}`);
  console.log(`Inventory SHA-256: ${ledger.inventoryHash}`);
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and an anonymous or service-role key are required.");
    process.exit(1);
  }

  const db = createClient(url, key, { auth: { persistSession: false } });
  const [verified, stubs, aliases] = await Promise.all([
    readIngredients(db, true),
    readIngredients(db, false),
    fetchAliases(db),
  ]);
  const uses = await usesOf(db, stubs.map((stub) => stub.inci_name));
  const known = new Set(verified.map((row) => row.inci_name.toLowerCase()));
  const ledger = buildLedger({ verifiedCount: verified.length, stubs, uses, known, aliases });
  printSummary(ledger);
  const ledgerPath = defaultLedgerPath();

  if (process.argv.includes("--check")) {
    const problems = checkLedger(JSON.parse(readFileSync(ledgerPath, "utf8")), ledger);
    if (problems.length > 0) {
      for (const problem of problems) console.error(problem);
      process.exit(1);
    }
    console.log("Review ledger matches the live unverified-name inventory.");
  }

  if (process.argv.includes("--write")) {
    writeFileSync(ledgerPath, serializeLedger(ledger), "utf8");
    console.log(`Wrote ${ledgerPath}`);
  }
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

export { buildLedger, checkLedger, reviewStub, serializeLedger };

if (invokedDirectly()) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
