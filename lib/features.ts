import { useAppStore } from "@/store/useAppStore";

/**
 * Feature flags (#403). One today: the regulatory-safety notice (#404, #405).
 *
 * Off by default, so with it off every screen is exactly what it was. It is a
 * persisted boolean in the store (`safetyNoticeEnabled`), switched by a
 * development-only row on Profile (next to "Fill with test data"): a release
 * build has no way to turn it on until the owner makes it the default. A
 * release build also ignores a saved "On" (a phone that had it on in a
 * development build keeps the value on disk), so the flag reads as
 * `__DEV__ && saved`. Remove the `__DEV__` guard when it becomes the default.
 * Tests flip it with `useAppStore.setState({ safetyNoticeEnabled: true })`;
 * when nothing sets it, it is off, so a test that never mentions it is
 * hermetic.
 */

/** For render code: re-renders when the flag changes. */
export function useSafetyNoticeEnabled(): boolean {
  return useAppStore((state) => __DEV__ && state.safetyNoticeEnabled);
}

/** For code outside a component (scoring helpers, share text): reads the flag now. */
export function safetyNoticeEnabled(): boolean {
  return __DEV__ && useAppStore.getState().safetyNoticeEnabled;
}
