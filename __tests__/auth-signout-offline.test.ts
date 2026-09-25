/**
 * #270 review asked whether signing out with no network leaves the session in
 * the Keychain. `lib/auth.ts`'s `signOut` relies on the installed
 * @supabase/auth-js removing the stored session even when the logout request
 * fails. This pins that against the real client, so a library upgrade that
 * changes it fails here rather than on someone's phone.
 */
import { createClient } from "@supabase/supabase-js";

import { createMemoryStorage } from "@/lib/secure-storage";

jest.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0 }));

async function signedInClient() {
  const storage = createMemoryStorage();
  const key = "sb-example-auth-token";
  const now = Math.floor(Date.now() / 1000);
  await storage.setItem(
    key,
    JSON.stringify({
      access_token: "header.payload.signature",
      refresh_token: "refresh",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: now + 3600,
      user: { id: "00000000-0000-0000-0000-00000000000a", aud: "authenticated" },
    }),
  );

  const offline = jest.fn(async () => {
    throw new TypeError("Network request failed");
  });
  const client = createClient("https://example.supabase.co", "anon", {
    auth: { storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: offline as unknown as typeof fetch },
  });
  return { client, storage, key, offline };
}

it("removes the stored session even when the logout request cannot reach the server", async () => {
  const { client, storage, key, offline } = await signedInClient();
  await client.auth.signOut({ scope: "local" });
  expect(offline).toHaveBeenCalled();
  expect(await storage.getItem(key)).toBeNull();
});

// #272 review: "Sign out on every device" tells the person this phone is
// signed out even when the server could not be reached. That is only true
// if the global scope clears the stored session offline too — pinned here,
// along with the signed-out event the account screen follows.
it("does the same for sign-out on every device, and reports it as signed out", async () => {
  const { client, storage, key, offline } = await signedInClient();
  const events: string[] = [];
  client.auth.onAuthStateChange((event) => events.push(event));

  const { error } = await client.auth.signOut({ scope: "global" });

  expect(offline).toHaveBeenCalled();
  expect(error).not.toBeNull();
  expect(await storage.getItem(key)).toBeNull();
  expect(events).toContain("SIGNED_OUT");
});
