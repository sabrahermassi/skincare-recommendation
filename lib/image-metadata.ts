/**
 * Client-side view of the image metadata stripper.
 *
 * A re-export, not a copy. `lib/inci.ts` duplicates the Edge Function's parser
 * — with `__tests__/inci-parser-parity.test.ts` guarding the two against
 * drift — only because `label-ocr/index.ts` imports `jsr:` specifiers Metro
 * cannot bundle. `_shared/strip-metadata.ts` imports nothing at all and
 * touches no Deno global, so Metro resolves it like any other module and
 * there is exactly one implementation to keep correct.
 *
 * That also means `__tests__/image-metadata.test.ts` exercises the bytes the
 * Edge Function actually runs, rather than a lookalike that could drift.
 *
 * Stripping here is a convenience rather than a control — the control is the
 * server-side pass in `label-ocr`, because a hostile or simply outdated client
 * will not cooperate. It is worth doing anyway: it means the GPS coordinates
 * never leave the handset, instead of being removed after they have already
 * crossed the network to Supabase.
 */
export * from "@/supabase/functions/_shared/strip-metadata";
