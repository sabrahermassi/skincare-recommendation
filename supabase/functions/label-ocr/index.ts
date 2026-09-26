// Label photo → ingredient list, and a named list → a catalogue product (#203
// split). The decisions live in `handler.ts`; this file only wires them to the
// real project, the network and the keys. See the header there for why this
// function exists and why it uses Google Cloud Vision.
//
// Secrets (function environment, never EXPO_PUBLIC_):
//   GOOGLE_VISION_API_KEY — without it a photo read is refused (503) and logged.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { handleLabelOcr } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve((req: Request) =>
  handleLabelOcr(req, {
    db,
    fetch,
    visionApiKey: VISION_API_KEY,
    // Read tokens are signed with the service-role key; see `_shared/read-token.ts`.
    readTokenSecret: SERVICE_ROLE_KEY,
  })
);
