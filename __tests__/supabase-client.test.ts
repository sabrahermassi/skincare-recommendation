/**
 * `persistSession` and `storage` must change together (#218): a persisted
 * session with no explicit storage lands in `localStorage` on web and in
 * plaintext on a phone. This pins the pair.
 */
const mockCreateClient = jest.fn((..._args: unknown[]) => ({}));
jest.mock("@supabase/supabase-js", () => ({ createClient: (...args: unknown[]) => mockCreateClient(...args) }));
jest.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 0 }));

it("persists the session only through the secure storage adapter", () => {
  const env = process.env;
  process.env = { ...env, EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co", EXPO_PUBLIC_SUPABASE_ANON_KEY: "anon" };
  try {
    jest.isolateModules(() => {
      require("@/lib/supabase");
      const { authStorage } = require("@/lib/secure-storage") as typeof import("@/lib/secure-storage");
      const options = mockCreateClient.mock.calls[0][2] as { auth: Record<string, unknown> };
      expect(options.auth.persistSession).toBe(true);
      expect(options.auth.storage).toBe(authStorage);
      expect(options.auth.detectSessionInUrl).toBe(false);
    });
  } finally {
    process.env = env;
  }
});
