import { AccessibilityInfo } from "react-native";

/**
 * The shared Reduce Motion value (#318 review): read synchronously by an
 * animation as it starts, so it must already hold the system's answer by
 * then, and follow the setting when it changes.
 */
describe("reduceMotionNow", () => {
  function load(enabled: boolean) {
    let changed: ((enabled: boolean) => void) | undefined;
    jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockResolvedValue(enabled);
    jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((_event: string, listener: (e: boolean) => void) => {
      changed = listener;
      return { remove: () => {} };
    }) as never);
    let reduceMotionNow!: () => boolean;
    jest.isolateModules(() => {
      ({ reduceMotionNow } = require("@/lib/reduce-motion") as typeof import("@/lib/reduce-motion"));
    });
    return { reduceMotionNow, change: (to: boolean) => changed?.(to) };
  }

  afterEach(() => jest.restoreAllMocks());

  it("holds the system's answer as soon as it lands, for any component that mounts after", async () => {
    const { reduceMotionNow } = load(true);
    await Promise.resolve();
    expect(reduceMotionNow()).toBe(true);
  });

  it("follows the setting when it is switched while the app is open", async () => {
    const { reduceMotionNow, change } = load(false);
    await Promise.resolve();
    expect(reduceMotionNow()).toBe(false);
    change(true);
    expect(reduceMotionNow()).toBe(true);
  });
});
