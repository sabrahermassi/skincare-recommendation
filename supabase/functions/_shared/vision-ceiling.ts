// One ceiling on Google Vision reads per UTC day, across every caller (#198).
//
// The per-caller limits (`rate-limit.ts`, #241) stop one person or one address
// hammering the endpoint, but a rotating proxy is a new caller on every
// request. This counts every photo read that is about to reach Vision, and
// refuses once the day's total passes the ceiling, so the bill has a top.
//
// It reuses the limiter's own counter — `consume_rate_limit` (migration 0016)
// with a fixed bucket and caller and a one-day window, which Postgres floors
// to UTC midnight — so no new table or function is needed, and
// `purge_rate_limits` already clears old days. Touches no Deno global, so it
// can be tested with a fake database.

import type { RateLimitDb } from "./rate-limit.ts";

/** The reads allowed per UTC day when `VISION_DAILY_CEILING` isn't set. */
export const DEFAULT_VISION_DAILY_CEILING = 1000;

const BUCKET = "label-ocr-vision-daily";
/** Not a caller fingerprint: one row a day holds everyone's count. */
const EVERYONE = "all-callers";
const DAY_SECONDS = 86_400;

/** The ceiling from the environment's text, or the default for a missing or unusable value. */
export function visionDailyCeiling(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_VISION_DAILY_CEILING;
}

/**
 * Counts one Vision read against today, and says whether it may go ahead.
 *
 * A counter that can't be reached lets the read through, the same choice the
 * per-caller limiter makes (`consumeRateLimit`): an outage of our own
 * database shouldn't stop every scan, and the per-caller limits still apply.
 */
export async function spendVisionRead(db: RateLimitDb, ceiling: number): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("consume_rate_limit", {
      p_bucket: BUCKET,
      p_caller: EVERYONE,
      p_window_seconds: DAY_SECONDS,
      p_max_requests: ceiling,
    });
    if (error || typeof data !== "number") {
      console.error("[vision-ceiling] count failed, allowing the read:", error ?? data);
      return true;
    }
    if (data > ceiling) {
      // Once a day, the first refusal: the line that says the ceiling was hit.
      if (data === ceiling + 1) console.error(`[vision-ceiling] daily ceiling of ${ceiling} Vision reads reached`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[vision-ceiling] count threw, allowing the read:", err);
    return true;
  }
}
