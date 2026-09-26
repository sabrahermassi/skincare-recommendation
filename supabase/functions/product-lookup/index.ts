// Barcode → product (#203 split). The decisions live in `handler.ts`; this
// file only wires them to the real project, the network and the INCI API key.
// See the header there for why this function exists at all.
//
// Secrets (function environment, never EXPO_PUBLIC_):
//   INCI_API_KEY — optional; without it the INCI API source is skipped.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { handleProductLookup } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INCI_API_KEY = Deno.env.get("INCI_API_KEY") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve((req: Request) => handleProductLookup(req, { db, fetch, inciApiKey: INCI_API_KEY }));
