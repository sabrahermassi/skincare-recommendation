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
  // Both paths since #184: a label read, or a barcode source's formula,
  // that mostly missed the dictionary. Migration 0024's check already allows
  // it on either path; its comment grouping predates the barcode gate.
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
    insert(row: Record<string, unknown>): PromiseLike<{ error: unknown }> & {
      abortSignal(signal: AbortSignal): PromiseLike<{ error: unknown }>;
    };
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
  /**
   * Wired through from `logScanBounded`, whose timeout aborts this same
   * request rather than merely giving up on awaiting it. Optional so this
   * function stays directly callable (and testable) on its own.
   */
  signal?: AbortSignal,
): Promise<void> {
  try {
    const caller = await fingerprintCaller(callerKey(req), salt);
    const query = db.from("scan_log").insert({
      caller,
      path: entry.path,
      outcome: entry.outcome,
      names_parsed: entry.namesParsed ?? null,
      names_resolved: entry.namesResolved ?? null,
      image_bytes: entry.imageBytes ?? null,
    });
    const { error } = await (signal ? query.abortSignal(signal) : query);
    if (error) console.error("[scan-log] insert failed:", error);
  } catch (err) {
    // An abort fires this same catch (fetch rejects with an AbortError) --
    // indistinguishable here from any other swallowed failure, which is
    // correct: a cancelled log row is just another dropped log row.
    console.error("[scan-log] logScan threw:", err);
  }
}

/**
 * `logScan`, bounded to `TIMEOUT_MS` so a slow database never adds a
 * noticeable delay to the response the user is actually waiting on. A
 * timed-out insert is simply a dropped log row, same as any other failure
 * this function already swallows.
 *
 * The timeout also aborts the underlying request (via `AbortController`)
 * rather than only giving up on awaiting it -- without this, `Promise.race`
 * resolving through the timer left the PostgREST request itself still live,
 * so a database outage could accumulate an unbounded number of in-flight
 * inserts that outlast every response this function claims to have given up
 * on. Found in review on #246.
 */
export function logScanBounded(
  req: Request,
  db: ScanLogDb,
  salt: string,
  entry: ScanLogEntry,
): Promise<void> {
  const controller = new AbortController();
  return Promise.race([
    logScan(req, db, salt, entry, controller.signal),
    new Promise<void>((resolve) =>
      setTimeout(() => {
        controller.abort();
        resolve();
      }, TIMEOUT_MS)
    ),
  ]);
}
