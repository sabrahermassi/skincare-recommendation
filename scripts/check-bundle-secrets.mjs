/**
 * Fail loudly if a server-only secret reaches a shipped bundle (issue #15).
 *
 * Expo inlines any EXPO_PUBLIC_* variable directly into the JS bundle at
 * build time, and `app.json`'s `web.output: "single"` makes that bundle a
 * static file anyone can download. This is the CI backstop for that: it
 * scans every exported platform's output and fails the build the moment a
 * server-only secret's name or a recognisable key value shows up in it.
 *
 * Two checks, not one, because a single pattern list would only ever catch
 * what it anticipated:
 *
 *   1. Named-secret check — every non-EXPO_PUBLIC_ variable name declared in
 *      `.env.example` (SUPABASE_SERVICE_ROLE_KEY, INCI_API_KEY,
 *      GOOGLE_VISION_API_KEY as of writing) must never appear as a literal
 *      string anywhere in the built output. Metro only ever inlines
 *      EXPO_PUBLIC_-prefixed identifiers — a raw `process.env.FOO` reference
 *      to something else is dead code that gets stripped, not substituted —
 *      so the *name itself* showing up bundled is a strong, specific signal
 *      that something was renamed or referenced in client-reachable code by
 *      mistake. This check needs no secret value duplicated into CI, and it
 *      stays correct on its own as new server secrets are added to
 *      `.env.example`, with no second place to remember to update.
 *
 *   2. Known key-format patterns — regexes for the specific providers this
 *      project actually holds keys for, so a raw key value pasted somewhere
 *      by mistake is also caught even if it never went through a
 *      recognisably-named variable.
 *
 * Run: node scripts/check-bundle-secrets.mjs <dir> [<dir> ...]
 * Exits non-zero and prints every match on a hit.
 */

import fs from "node:fs";
import path from "node:path";

const ENV_EXAMPLE_PATH = new URL("../.env.example", import.meta.url);

/** Every declared variable name that must never reach the client. */
function forbiddenVariableNames() {
  const text = fs.readFileSync(ENV_EXAMPLE_PATH, "utf8");
  const names = [];
  for (const line of text.split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line.trim());
    if (match && !match[1].startsWith("EXPO_PUBLIC_")) names.push(match[1]);
  }
  return names;
}

/**
 * Known, recognisable secret shapes for the providers this project actually
 * uses. Not a general-purpose secret scanner — narrow and specific is what
 * keeps this cheap to run on every push with no false-positive noise.
 *
 * `textOnly` patterns are skipped against compiled Hermes bytecode (`.hbc`).
 * Verified directly, twice, during development: Hermes packs thousands of
 * short internal identifiers and error-message fragments into one string
 * table with no delimiters when read as raw bytes, and a short generic-
 * looking prefix collides with that noise often enough to be useless as a
 * signal. `sb_secret_` (10 characters) matched real, harmless Expo Router
 * and Hermes runtime internals twice — first
 * `sb_secret__internal_expo_router_zoom_transition_source_id`, then, after
 * adding a "must contain a digit" heuristic to rule that one out,
 * `sb_secret__readOnlyErrorunOnRuntime_runtimesTs4FactoryCouldn` (which does
 * contain a digit). Chasing an ever-more-specific heuristic against binary
 * noise is a losing game; the honest fix is to only trust this pattern
 * against genuine text, where a real embedded key would appear as an
 * unbroken literal rather than a coincidental byte-adjacency. Confirmed
 * clean the other direction too: `AIza[...]{35}` (exact-length, not open-
 * ended) and the JWT pattern (requires two literal "eyJ" headers plus a
 * three-part dot-delimited structure) produced zero false positives across
 * six real .hbc builds, so they stay enabled everywhere — as does the
 * named-variable check below, whose identifiers are long and specific
 * enough (`SUPABASE_SERVICE_ROLE_KEY`) that the same collision risk is
 * negligible.
 */
const KEY_PATTERNS = [
  { name: "Google API key", pattern: /AIza[0-9A-Za-z_-]{35}/g },
  {
    name: "Supabase secret key (sb_secret_)",
    pattern: /sb_secret_[A-Za-z0-9_-]{20,50}/g,
    textOnly: true,
  },
  // The legacy JWT-shaped service-role key, still valid during the migration
  // window — three base64url segments separated by dots.
  {
    name: "Supabase service-role key (legacy JWT)",
    pattern: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  },
];

/** Files worth scanning inside an export directory — skip images/fonts/etc. */
const SCANNABLE_EXTENSIONS = new Set([".js", ".hbc", ".html", ".css", ".json", ".map"]);

/** Genuinely readable text, as opposed to compiled bytecode — see above. */
const TEXT_EXTENSIONS = new Set([".js", ".html", ".css", ".json", ".map"]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (SCANNABLE_EXTENSIONS.has(path.extname(entry.name))) yield full;
  }
}

function scanFile(filePath, forbiddenNames) {
  // Binary-safe: Hermes bytecode (.hbc) isn't UTF-8, but a leaked string
  // literal — an env var name or a key value — still round-trips through
  // latin1 as the same byte sequence, so it's still found as a substring.
  const content = fs.readFileSync(filePath, "latin1");
  const isText = TEXT_EXTENSIONS.has(path.extname(filePath));
  const hits = [];

  for (const name of forbiddenNames) {
    if (content.includes(name)) hits.push({ what: `variable name "${name}"`, file: filePath });
  }
  for (const { name, pattern, textOnly } of KEY_PATTERNS) {
    if (textOnly && !isText) continue;
    pattern.lastIndex = 0;
    if (pattern.test(content)) hits.push({ what: `${name} pattern`, file: filePath });
  }
  return hits;
}

function main() {
  const dirs = process.argv.slice(2);
  if (dirs.length === 0) {
    console.error("Usage: node scripts/check-bundle-secrets.mjs <dir> [<dir> ...]");
    process.exit(2);
  }

  const forbiddenNames = forbiddenVariableNames();
  const allHits = [];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.error(`check-bundle-secrets: ${dir} does not exist — did the export step run?`);
      process.exit(2);
    }
    for (const file of walk(dir)) {
      allHits.push(...scanFile(file, forbiddenNames));
    }
  }

  if (allHits.length > 0) {
    console.error("✖ Possible secret found in a shipped bundle:\n");
    for (const hit of allHits) console.error(`  ${hit.what}\n    in ${hit.file}`);
    console.error(
      "\nA server-only secret must never appear in client-reachable code. " +
        "See .claude/claude-security-guidance.md and .env.example."
    );
    process.exit(1);
  }

  console.log(
    `check-bundle-secrets: clean — scanned ${dirs.length} export(s) for ${forbiddenNames.length} ` +
      `forbidden name(s) and ${KEY_PATTERNS.length} known key pattern(s).`
  );
}

main();
