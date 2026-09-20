import { createStaleGuard } from "@/lib/stale-guard";

/**
 * A request that finishes after the screen was left, or after a newer request began,
 * must not put its answer on screen.
 */
describe("createStaleGuard", () => {
  it("treats the latest request as current", () => {
    const guard = createStaleGuard();
    expect(guard.isCurrent(guard.begin())).toBe(true);
  });

  it("makes an older request stale once a newer one has begun", () => {
    const guard = createStaleGuard();
    const older = guard.begin();
    const newer = guard.begin();
    expect(guard.isCurrent(older)).toBe(false);
    expect(guard.isCurrent(newer)).toBe(true);
  });

  it("makes everything in flight stale when the screen is left", () => {
    const guard = createStaleGuard();
    const pending = guard.begin();
    guard.invalidate();
    expect(guard.isCurrent(pending)).toBe(false);
  });

  it("lets a request begun after leaving and coming back be current", () => {
    const guard = createStaleGuard();
    guard.begin();
    guard.invalidate();
    expect(guard.isCurrent(guard.begin())).toBe(true);
  });
});
