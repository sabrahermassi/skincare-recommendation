/**
 * #270 review (CodeRabbit, backed by the library's own docs: "idToken is not
 * null only if you specify a valid webClientId"): a build with only the iOS
 * client ID set offered the Google button, but every tap would fail with
 * "Google returned no identity token" since the native module never returns
 * one without a web client ID configured too. Each case reloads the module
 * fresh with its own `process.env`, since `isGoogleSignInConfigured` is
 * computed once at import time.
 */
jest.mock("@/lib/supabase", () => ({ supabase: {} }));

const ORIGINAL_ENV = process.env;

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

function loadWith(vars: { ios?: string; web?: string }): boolean {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  if (vars.ios) process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID = vars.ios;
  else delete process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  if (vars.web) process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = vars.web;
  else delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  return (require("@/lib/auth") as typeof import("@/lib/auth")).isGoogleSignInConfigured;
}

it("is configured only when both the iOS and the web client ID are set", () => {
  expect(loadWith({ ios: "ios-id", web: "web-id" })).toBe(true);
});

it("is not configured with only the iOS client ID — idToken would never arrive", () => {
  expect(loadWith({ ios: "ios-id" })).toBe(false);
});

it("is not configured with only the web client ID", () => {
  expect(loadWith({ web: "web-id" })).toBe(false);
});

it("is not configured with neither client ID", () => {
  expect(loadWith({})).toBe(false);
});
