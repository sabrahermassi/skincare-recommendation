// Label photo → ingredient list, and a named list → a catalogue product (#203
// split). The decisions live in `handler.ts`; this file only wires them to the
// real project, the network and the keys. See the header there for why this
// function exists and why it uses Google Cloud Vision.
//
// Secrets (function environment, never EXPO_PUBLIC_):
//   GOOGLE_VISION_API_KEY — without it a photo read is refused (503) and logged.
//   READ_TOKEN_SECRET — signs read tokens (#198). Without it they are signed
//     with the service-role key, as before, and a warning is logged: set it so
//     the token key can be rotated without rotating the database credential.
//     Setting or changing it voids tokens already handed out (30 minutes'
//     worth), so a save in flight at that moment asks for a new photo.
//   VISION_DAILY_CEILING — optional, Vision reads allowed per UTC day across
//     every caller; defaults to `DEFAULT_VISION_DAILY_CEILING`.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { visionDailyCeiling } from "../_shared/vision-ceiling.ts";
import { handleLabelOcr } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VISION_API_KEY = Deno.env.get("GOOGLE_VISION_API_KEY") ?? "";
const READ_TOKEN_SECRET = Deno.env.get("READ_TOKEN_SECRET") ?? "";
const VISION_DAILY_CEILING = visionDailyCeiling(Deno.env.get("VISION_DAILY_CEILING"));

if (!READ_TOKEN_SECRET) {
  console.warn("[config] READ_TOKEN_SECRET is unset: signing read tokens with the service-role key instead");
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve((req: Request) =>
  handleLabelOcr(req, {
    db,
    fetch,
    visionApiKey: VISION_API_KEY,
    readTokenSecret: READ_TOKEN_SECRET || SERVICE_ROLE_KEY,
    visionDailyCeiling: VISION_DAILY_CEILING,
  })
);
