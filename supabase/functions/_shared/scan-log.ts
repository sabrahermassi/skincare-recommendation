// A raw outcome log for the scan path — see migration 0024 for the schema
// and the privacy reasoning (outcomes only, never content; identity is the
// same fingerprint `rate_limits` already uses).
//
// This file exists separately from `rate-limit.ts` for the same reason that
// one is separate from `http.ts`: it touches no Deno global directly (it
// takes `req`, `db` and the salt as arguments), so it stays testable the same
// way.

import { callerKey, fingerprintCaller } from "./rate-limit.ts";

export type ScanPath = "barcode" | "label";

export type ScanOutcome =
  // barcode path
  | "resolved"
  | "not_found"
  // label path
  | "read_ok"
  | "quality_gate"
  | "not_enough_text"
  | "image_too_large"
  | "unsupported_image"
  // both paths
  | "upstream_failure"
  | "internal_error";

export type ScanLogEntry = {
  path: ScanPath;
  outcome: ScanOutcome;
  /** Label path only. */
  namesParsed?: number;
  /** Label path only. */
  namesResolved?: number;
  /** Label path only, and only once an image was actually read. */
  imageBytes?: number;
};

/**
 * The minimum a database client has to look like for `logScan` — structural,
 * not the real Supabase type, for the same reason `RateLimitDb` in
 * `rate-limit.ts` is structural: this file stays free of a JSR specifier so
 * nothing stops it being unit tested outside Deno later.
 */
export type ScanLogDb = {
  from(table: "scan_log"): {
    insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }>;
  };
};

/**
 * Record what a scan did. Never throws, never rejects, and never makes the
 * caller wait longer than `TIMEOUT_MS` — a logging failure must not become a
 * scan failure (see the migration's own comment on why this table exists).
 *
 * `salt` is threaded through explicitly, the same as `ConsumeOptions.secret`
 * in `rate-limit.ts`, rather than read from `Deno.env` in here: it keeps this
 * file free of the one thing (`Deno.env`) that would stop it being testable
 * the way `rate-limit.ts` is.
 *
 * The fingerprint is computed *inside* the swallow, deliberately the
 * opposite of `consumeRateLimit`'s own choice to let `fingerprintCaller`
 * throw outside its try. There the throw is load-bearing — a missing salt
 * must remove the limiter loudly, not degrade it silently. Here it is not: a
 * broken log is a broken log, and it is never allowed to fail the read or
 * write it is describing. An empty salt (misconfiguration) is exactly the
 * kind of failure this function exists to swallow, not propagate.
 */
const TIMEOUT_MS = 1500;

export async function logScan(
  req: Request,
  db: ScanLogDb,
  salt: string,
  entry: ScanLogEntry,
): Promise<void> {
  try {
    const caller = await fingerprintCaller(callerKey(req), salt);
    const { error } = await db.from("scan_log").insert({
      caller,
      path: entry.path,
      outcome: entry.outcome,
      names_parsed: entry.namesParsed ?? null,
      names_resolved: entry.namesResolved ?? null,
      image_bytes: entry.imageBytes ?? null,
    });
    if (error) console.error("[scan-log] insert failed:", error);
  } catch (err) {
    console.error("[scan-log] logScan threw:", err);
  }
}

/**
 * `logScan`, bounded to `TIMEOUT_MS` so a slow database never adds a
 * noticeable delay to the response the user is actually waiting on. A
 * timed-out insert is simply a dropped log row, same as any other failure
 * this function already swallows.
 */
export function logScanBounded(
  req: Request,
  db: ScanLogDb,
  salt: string,
  entry: ScanLogEntry,
): Promise<void> {
  return Promise.race([
    logScan(req, db, salt, entry),
    new Promise<void>((resolve) => setTimeout(resolve, TIMEOUT_MS)),
  ]);
}
