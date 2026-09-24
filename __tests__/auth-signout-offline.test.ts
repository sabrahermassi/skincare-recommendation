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

it("removes the stored session even when the logout request cannot reach the server", async () => {
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

  await client.auth.signOut({ scope: "local" });

  expect(offline).toHaveBeenCalled();
  expect(await storage.getItem(key)).toBeNull();
});
