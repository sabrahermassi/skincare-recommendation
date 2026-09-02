import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for the catalogue.
 *
 * On the two keys, because they are not equivalent:
 *
 *   EXPO_PUBLIC_SUPABASE_ANON_KEY  is *designed* to ship in the client. It
 *     grants exactly what row-level security allows, which here is read-only
 *     access to public reference data. Inlining it into the bundle is fine.
 *
 *   The INCI API key is NOT. Anything prefixed `EXPO_PUBLIC_` is substituted
 *     into the JS bundle at build time and can be read straight out of a
 *     shipped app, so that key lives only in the Edge Function's environment.
 *
 * `isSupabaseConfigured` is false until both variables are set, and `data/api`
 * falls back to the bundled sample catalogue in that case — so a checkout with
 * no credentials still runs.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url as string, anonKey as string, {
      auth: {
        // There are no accounts. Persisting or refreshing a session would be
        // machinery for a feature that does not exist.
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storage: AsyncStorage,
      },
    })
  : null;

/** Name of the Edge Function that owns the third-party key and the cascade. */
export const LOOKUP_FUNCTION = "product-lookup";

/** Reads an ingredient list off a photographed label. Holds the Vision key. */
export const OCR_FUNCTION = "label-ocr";
