/**
 * Client-side view of the Edge Functions' scan-outcome logger.
 *
 * A re-export, not a copy — the same arrangement as `lib/rate-limit.ts`, and
 * for the same reason. Nothing in the app calls this: it exists so
 * `__tests__/scan-log.test.ts` exercises the exact module `label-ocr` and
 * `product-lookup` run, rather than a lookalike that could drift from it.
 *
 * `_shared/scan-log.ts` touches no Deno global and takes its database client
 * as an argument, so it bundles like any other module.
 */
export * from "@/supabase/functions/_shared/scan-log";
