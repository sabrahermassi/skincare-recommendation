// Account deletion (#224). The decisions live in `handler.ts`; this file
// only wires them to the real project and Apple. See the header there for
// the two rules it exists to hold.
//
// Service-role access is needed to delete an auth user, which is why this is
// an Edge Function at all: that key never ships in the app.
//
// Secrets (function environment, never EXPO_PUBLIC_):
//   APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY
// Without them an Apple-linked account cannot be deleted — the reply says so
// (503 apple_not_configured) instead of deleting without revoking.

import { createClient } from "jsr:@supabase/supabase-js@2";

import { json, preflight } from "../_shared/http.ts";
import { appleKeysFrom, revokeAppleGrant } from "./apple.ts";
import { handleDeleteAccount } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const appleKeys = appleKeysFrom((name) => Deno.env.get(name));

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return preflight(req);

  const reply = await handleDeleteAccount(req, {
    userFromToken: async (token) => {
      // Verified by Supabase Auth against its own signing key: a forged or
      // expired token comes back as an error, never as a user.
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return null;
      const providers = [
        ...(data.user.identities ?? []).map((identity) => identity.provider),
        ...((data.user.app_metadata?.providers as string[] | undefined) ?? []),
      ];
      return { id: data.user.id, appleLinked: providers.includes("apple") };
    },
    revokeApple: (code) => revokeAppleGrant(appleKeys, code),
    deleteUser: async (id) => {
      const { error } = await admin.auth.admin.deleteUser(id);
      return !error;
    },
  });

  return json(req, reply.body, reply.status);
});
