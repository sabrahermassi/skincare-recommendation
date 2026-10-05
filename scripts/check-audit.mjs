// The CI gate for runtime dependency advisories (#33, #393).
//
// `npm audit --omit=dev --audit-level=high` fails on a high or critical
// advisory with no way to accept one that has no fix yet, and that blocked
// every PR when two such advisories landed in October 2026. This runs the same
// audit at the same threshold, and lets an advisory through only if it is in
// `audit-allowlist.json` with a reason and an expiry date. An expired entry
// stops covering its advisory, so an exception can't quietly become permanent.
//
// The threshold is not configurable here on purpose. Policy: docs/dependencies.md.

import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FAILING_SEVERITIES = ["high", "critical"];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// `Date.parse` rolls 2026-02-30 over to 2 March, so the date has to print back
// as the same string to be a real day.
function isRealDate(text) {
  const time = Date.parse(text);
  return ISO_DATE.test(text) && !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

/**
 * The allowlist, checked. Returns the entries and a list of problems; any
 * problem fails the run, so a typo can never turn into a silent allowance.
 */
export function parseAllowlist(raw) {
  const problems = [];
  if (!Array.isArray(raw)) return { entries: [], problems: ["audit-allowlist.json must be a JSON array of entries"] };

  const entries = [];
  raw.forEach((entry, i) => {
    const where = `entry ${i + 1}`;
    if (typeof entry !== "object" || entry === null) {
      problems.push(`${where} is not an object`);
      return;
    }
    const missing = ["id", "package", "reason", "expires"].filter(
      (field) => typeof entry[field] !== "string" || entry[field].trim() === ""
    );
    if (missing.length > 0) {
      problems.push(`${where} (${entry.id ?? "no id"}) is missing ${missing.join(", ")}`);
      return;
    }
    if (!isRealDate(entry.expires)) {
      problems.push(`${where} (${entry.id}) has an expiry that is not a YYYY-MM-DD date: ${entry.expires}`);
      return;
    }
    entries.push({ id: entry.id, package: entry.package, reason: entry.reason, expires: entry.expires });
  });
  return { entries, problems };
}

/**
 * The advisories in `npm audit --json`. The `vulnerabilities` map lists every
 * package an advisory touches, so a package that only depends on a vulnerable
 * one appears too, with plain package names in `via`. The advisories
 * themselves are the objects in `via`; counting those once each, per package,
 * is what the list should say.
 *
 * `reachedThrough` names the project's own direct dependencies that pull an
 * advisory in (expo, tailwindcss): the plain-name `via` links are followed
 * from the vulnerable package up to the packages `npm audit` marks `isDirect`.
 */
export function advisoriesFrom(audit) {
  const vulnerabilities = audit.vulnerabilities ?? {};

  const dependents = new Map();
  for (const [pkg, vuln] of Object.entries(vulnerabilities)) {
    for (const via of vuln.via ?? []) {
      if (typeof via === "string") dependents.set(via, [...(dependents.get(via) ?? []), pkg]);
    }
  }
  const directDependentsOf = (start) => {
    const seen = new Set([start]);
    const queue = [start];
    for (const name of queue) {
      for (const dependent of dependents.get(name) ?? []) {
        if (!seen.has(dependent)) {
          seen.add(dependent);
          queue.push(dependent);
        }
      }
    }
    return [...seen].filter((name) => name !== start && vulnerabilities[name]?.isDirect).sort();
  };

  const found = new Map();
  for (const [pkg, vuln] of Object.entries(vulnerabilities)) {
    for (const via of vuln.via ?? []) {
      if (typeof via !== "object" || via === null) continue;
      const id = via.url?.match(/GHSA-[a-z0-9-]+/i)?.[0] ?? `npm:${via.source}`;
      const name = via.name ?? pkg;
      // One GHSA can name several packages; each is its own finding, because an
      // allowlist entry covers an id for one package only.
      const key = `${id}|${name}`;
      if (found.has(key)) continue;
      found.set(key, {
        id,
        package: name,
        severity: via.severity,
        title: via.title,
        range: via.range,
        reachedThrough: directDependentsOf(name),
      });
    }
  }
  return [...found.values()];
}

/**
 * Sorts every high or critical advisory into allowed or failed.
 * `today` is a YYYY-MM-DD date in UTC; an entry covers its advisory through
 * the end of the day it expires on.
 */
export function evaluateAudit(audit, allowlist, today) {
  const problems = [];
  if (audit === null || typeof audit !== "object" || audit.error || !audit.vulnerabilities) {
    const detail = audit?.error?.summary ?? audit?.error?.code ?? "no vulnerabilities report in the output";
    return { allowed: [], failed: [], expired: [], unused: [], problems: [`npm audit did not produce a report: ${detail}`] };
  }

  const parsed = parseAllowlist(allowlist);
  problems.push(...parsed.problems);

  const failing = advisoriesFrom(audit).filter((a) => FAILING_SEVERITIES.includes(a.severity));

  const allowed = [];
  const failed = [];
  const expired = [];
  const matched = new Set();
  for (const advisory of failing) {
    const entry = parsed.entries.find((e) => e.id === advisory.id && e.package === advisory.package);
    if (!entry) {
      failed.push(advisory);
      continue;
    }
    matched.add(entry);
    if (entry.expires < today) {
      failed.push(advisory);
      expired.push({ advisory, entry });
    } else {
      allowed.push({ advisory, entry });
    }
  }

  // An entry whose advisory is gone: nothing to fail, but it should be deleted.
  const unused = parsed.entries.filter((e) => !matched.has(e));
  return { allowed, failed, expired, unused, problems };
}

export function formatReport({ allowed, failed, expired, unused, problems }, today) {
  const lines = [];
  const reached = (a) => (a.reachedThrough.length > 0 ? ` (pulled in by ${a.reachedThrough.join(", ")})` : "");

  if (allowed.length > 0) {
    lines.push("Allowed (in audit-allowlist.json):");
    for (const { advisory, entry } of allowed) {
      lines.push(`  ${advisory.id} ${advisory.package} [${advisory.severity}]: ${advisory.title}`);
      lines.push(`    why: ${entry.reason}`);
      lines.push(`    allowed until: ${entry.expires}`);
    }
  }

  if (unused.length > 0) {
    lines.push("Allowlist entries that match no current advisory (the fix has landed, delete them):");
    for (const e of unused) lines.push(`  ${e.id} ${e.package}`);
  }

  for (const problem of problems) lines.push(`FAILED: ${problem}`);

  if (failed.length > 0) {
    lines.push("FAILED, high or critical advisories not allowed:");
    for (const advisory of failed) {
      lines.push(`  ${advisory.id} ${advisory.package} [${advisory.severity}] ${advisory.range ?? ""}: ${advisory.title}${reached(advisory)}`);
      const lapsed = expired.find((x) => x.advisory === advisory);
      if (lapsed) lines.push(`    its allowlist entry expired on ${lapsed.entry.expires} (today is ${today}): fix it, or re-review and renew the entry`);
    }
  }

  const bad = failed.length + problems.length;
  lines.push(
    bad === 0
      ? `Audit passed: ${allowed.length} advisory(ies) allowed, none failing.`
      : `Audit failed: ${failed.length} advisory(ies) not allowed${problems.length > 0 ? `, ${problems.length} other problem(s)` : ""}.`
  );
  return lines.join("\n");
}

function runAudit() {
  // npm exits 1 whenever it finds anything, so the exit code says nothing here;
  // the JSON is the answer, and its absence is a failure the caller reports.
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  try {
    return JSON.parse(result.stdout);
  } catch {
    return { error: { summary: result.stderr?.trim() || "output was not JSON" } };
  }
}

function main() {
  const allowlistPath = join(dirname(fileURLToPath(import.meta.url)), "..", "audit-allowlist.json");
  const today = new Date().toISOString().slice(0, 10);
  let allowlist;
  try {
    allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  } catch (err) {
    console.error(`FAILED: cannot read audit-allowlist.json: ${err.message}`);
    process.exit(1);
  }
  const outcome = evaluateAudit(runAudit(), allowlist, today);
  const failedRun = outcome.failed.length + outcome.problems.length > 0;
  (failedRun ? console.error : console.log)(formatReport(outcome, today));
  process.exit(failedRun ? 1 : 0);
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

if (invokedDirectly()) main();
