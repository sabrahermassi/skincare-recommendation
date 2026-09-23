/**
 * The one place a script gets a database client.
 *
 * Before this existed, all eleven scripts inlined the same six lines: read two
 * environment variables, `createClient`, write. Nothing anywhere named which
 * project was on the other end, so "did that just run against production?" was
 * a question the tooling could not answer — and migrations 0008 to 0015
 * silently never reached production, which was discovered weeks later (see the
 * header of `.github/workflows/ci.yml`).
 *
 * A write now has to say, twice, that it means production: `SUPABASE_ENV` in
 * the shell and an explicit flag on the command line. Two different surfaces,
 * so a stale exported variable alone cannot do it, and neither can a flag typed
 * into the wrong terminal tab. Reads are never gated — reading production to
 * compare it against staging is a normal thing to want.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/*
 * Loads .env.staging from the repo root into process.env, for whichever
 * variable isn't already set — a real shell export always wins, so this only
 * fills the gap a fresh terminal starts with. `.env.staging` is `.gitignore`d
 * (the `.env*` rule); it is a file each machine creates once and keeps
 * locally, not something this repo ships or a script writes.
 *
 * Scoped to the one file whose name says what it is for. `.env` alone stays
 * meaningless here on purpose — CLAUDE.md already says server credentials go
 * in the shell, and a script silently reading an unnamed `.env` would make
 * that untrue without saying so.
 *
 * Resolved from `process.cwd()` rather than this module's own location:
 * every script here is run via `npm run <name>` (and Jest, for the tests that
 * import this file directly), both of which start in the repo root. Deriving
 * it from `import.meta.url` instead reads as more correct and is not — Jest
 * transforms this module before running it, and the transformed `import.meta`
 * does not carry a real file URL, so that path throws under `npm test` only.
 */
function loadLocalStagingEnv() {
  const envFile = path.join(process.cwd(), ".env.staging");
  if (!existsSync(envFile)) return;

  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadLocalStagingEnv();

/**
 * The subdomain of a Supabase URL, e.g. `abcdefgh` in
 * `https://abcdefgh.supabase.co`. Not a secret: it ships inside the app bundle
 * as part of `EXPO_PUBLIC_SUPABASE_URL`. Used for telling one project from
 * another in a log line a human reads.
 */
export function projectRef(url) {
  try {
    const host = new URL(url).hostname;
    const [ref] = host.split(".");
    return ref || host;
  } catch {
    return "unparseable";
  }
}

/**
 * The production project, so a run pointing at it while claiming
 * `SUPABASE_ENV=staging` is refused rather than believed. That is the accident
 * `--prod` alone cannot catch: an exported variable left over from an earlier
 * command says staging, the URL beside it says production, and both look
 * deliberate.
 *
 * Committed rather than configured because a guard read from the same
 * environment it is guarding is not a guard. Not a secret either — this ref
 * ships in every build inside `EXPO_PUBLIC_SUPABASE_URL`.
 */
export const PRODUCTION_REF = "phwtskwqjrwetbpygpwy";

const VALID_ENVS = ["staging", "production"];

/**
 * Whether this run may proceed, and what to tell the operator either way.
 *
 * Exported and pure for the same reason `migratePersisted` is: it is the part
 * that can do real damage by being subtly wrong, and it cannot be pinned
 * through a live client. `connect` below is the thin shell that reads the
 * environment and exits.
 *
 * The parameters are spelled out rather than inferred: with only the default
 * values to go on, `argv` infers as `never[]` and `productionRef` as `null`,
 * and a test passing either one fails to typecheck.
 *
 * @param {object} options
 * @param {string | undefined} options.url
 * @param {string | undefined} options.key
 * @param {string | undefined} [options.declared] Value of `SUPABASE_ENV`.
 * @param {boolean} options.write
 * @param {string[]} [options.argv]
 * @param {string | null} [options.productionRef]
 * @returns {{ ok: true, env: string, ref: string, notice: string }
 *          | { ok: false, message: string }}
 */
export function decide({ url, key, declared, write, argv = [], productionRef = PRODUCTION_REF }) {
  if (!url || !key) {
    return { ok: false, message: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required." };
  }

  const ref = projectRef(url);

  // A read says which project it read and gets on with it. Only a write has to
  // justify itself, so an unlabelled shell can still run every audit.
  if (!write) {
    const label = declared ? `(${declared})` : "(SUPABASE_ENV unset)";
    return { ok: true, env: declared ?? "unknown", ref, notice: `→ reading ${ref} ${label}` };
  }

  if (!declared) {
    return {
      ok: false,
      message:
        "SUPABASE_ENV is not set, and this run writes.\n" +
        `  Target project: ${ref}\n` +
        "  Set SUPABASE_ENV=staging (or production) in the shell alongside the URL.",
    };
  }
  if (!VALID_ENVS.includes(declared)) {
    return {
      ok: false,
      message: `SUPABASE_ENV must be one of ${VALID_ENVS.join(", ")} — got "${declared}".`,
    };
  }

  // The declaration and the URL disagreeing means one of them is stale. Which
  // one does not matter; neither is trustworthy enough to write through.
  if (productionRef) {
    const looksProd = ref === productionRef;
    if (looksProd && declared !== "production") {
      return {
        ok: false,
        message:
          `SUPABASE_ENV says "${declared}" but SUPABASE_URL points at the production project (${ref}).\n` +
          "  Refusing to write. Fix whichever of the two is stale.",
      };
    }
    if (!looksProd && declared === "production") {
      return {
        ok: false,
        message:
          `SUPABASE_ENV says "production" but SUPABASE_URL points at ${ref}, which is not production.\n` +
          "  Refusing to write. Fix whichever of the two is stale.",
      };
    }
  }

  if (declared === "production" && !argv.includes("--prod")) {
    return {
      ok: false,
      message:
        `This run writes to PRODUCTION (${ref}).\n` +
        "  Pass --prod as well if that is what you meant.\n" +
        "  Development writes belong on staging: SUPABASE_ENV=staging with the staging URL and key.",
    };
  }

  const banner = declared === "production" ? "PRODUCTION" : declared;
  return { ok: true, env: declared, ref, notice: `→ writing to ${banner} (${ref})` };
}

/**
 * Resolve credentials, state plainly which project is about to be used, and
 * exit rather than write to production that was not asked for twice.
 *
 * @param {object} options
 * @param {boolean} options.write  Whether this invocation intends to write.
 *   Each script computes it from its own flag — `--apply`, `!--dry-run`,
 *   `--delete-junk-products` — since those conventions differ and are not this
 *   function's to unify.
 * @param {string[]} [options.argv] Defaults to `process.argv`.
 */
export function connect({ write, argv = process.argv }) {
  const verdict = decide({
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    declared: process.env.SUPABASE_ENV,
    write,
    argv,
  });

  if (!verdict.ok) {
    console.error(verdict.message);
    process.exit(1);
  }

  console.log(verdict.notice);
  return {
    db: createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    }),
    env: verdict.env,
    ref: verdict.ref,
  };
}
