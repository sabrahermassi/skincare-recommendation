#!/usr/bin/env node
/**
 * What this branch would require against production, and in what order.
 *
 * The gap this closes is a handover one. Work happens on staging, and what
 * reached production is then whatever someone remembered at merge time — which
 * is how migrations 0008 to 0015 were applied everywhere except the database
 * that mattered, unnoticed for weeks.
 *
 * Read entirely from git, deliberately. A plan that needs to query production
 * to be written cannot be written from an environment that has no route to it,
 * which is the situation in a web session today. This runs anywhere, offline,
 * and the answer is the same.
 *
 * It reports what the branch *adds*. It cannot know what production already
 * has — only the operator or `supabase migration list` can say that — so the
 * migration step is stated as a command to run, never as a claim about state.
 *
 * Run:
 *   node scripts/promotion-plan.mjs [base]     # base defaults to origin/main
 */

import { execFileSync } from "node:child_process";

const base = process.argv[2] ?? "origin/main";

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

let changed;
try {
  changed = git("diff", "--name-only", `${base}...HEAD`).split("\n").filter(Boolean);
} catch {
  console.error(`Could not diff against ${base}. Fetch it first, or pass another base.`);
  process.exit(1);
}

if (changed.length === 0) {
  console.log(`No changes against ${base}. Nothing to promote.`);
  process.exit(0);
}

const migrations = changed.filter((f) => f.startsWith("supabase/migrations/") && f.endsWith(".sql"));
const functions = changed.filter((f) => f.startsWith("supabase/functions/"));

/*
  A script being edited does not mean it has to be run — most edits are to its
  logic, not to data it already wrote. Listing them as "consider" rather than
  "do" is the honest framing; deciding is the operator's, and a plan that cries
  wolf gets skimmed.
*/
const scripts = changed.filter((f) => f.startsWith("scripts/") && f.endsWith(".mjs"));

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
console.log(`Promotion plan — ${branch} against ${base}\n`);

if (migrations.length > 0) {
  console.log(`SCHEMA — ${migrations.length} migration${migrations.length === 1 ? "" : "s"} added:`);
  for (const m of migrations) console.log(`    ${m.replace("supabase/migrations/", "")}`);
  console.log("");
  console.log("  Apply after merging. Check what production already has first:");
  console.log("    supabase migration list --project-ref <production-ref>");
  console.log("    supabase db push --project-ref <production-ref>");
  console.log("");
}

if (functions.length > 0) {
  const names = [...new Set(functions.map((f) => f.split("/")[2]).filter(Boolean))];
  console.log(`EDGE FUNCTIONS — ${names.join(", ")} changed. Deploy after merging:`);
  for (const n of names) console.log(`    supabase functions deploy ${n} --project-ref <production-ref>`);
  console.log("");
}

if (scripts.length > 0) {
  console.log("SCRIPTS changed — decide whether production needs a run:");
  for (const s of scripts) console.log(`    ${s.replace("scripts/", "")}`);
  console.log("");
  console.log("  A write against production needs the environment named and the flag:");
  console.log("    SUPABASE_URL=<production-url> SUPABASE_SERVICE_ROLE_KEY=<key> \\");
  console.log("      SUPABASE_ENV=production npm run <script> -- --prod");
  console.log("");
  console.log("  Run it against staging first, without --prod, and read the counts.");
  console.log("");
}

if (migrations.length === 0 && functions.length === 0 && scripts.length === 0) {
  console.log("Application code only — no schema, function or data-script changes.");
  console.log("Merging is the whole deployment. Nothing to run against production.");
}
