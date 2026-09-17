/**
 * Client-side view of the Edge Functions' rate limiter.
 *
 * A re-export, not a copy — the same arrangement as `lib/image-metadata.ts`,
 * and for the same reason. Nothing in the app calls this: it exists so
 * `__tests__/rate-limit.test.ts` exercises the exact module the Edge Functions
 * run, rather than a lookalike that could drift from it.
 *
 * `_shared/rate-limit.ts` was split out of `_shared/http.ts` precisely so this
 * would work. `http.ts` reads `Deno.env`, which Metro cannot resolve; the
 * limiter touches no Deno global and takes its database client as an argument,
 * so it bundles like any other module.
 */
export * from "@/supabase/functions/_shared/rate-limit";
