import { createScanDismissGuard, DISMISS_WINDOW_MS } from "@/lib/scan-dismiss-guard";

describe("createScanDismissGuard", () => {
  it("ignores the same code inside the window", () => {
    const guard = createScanDismissGuard();
    guard.noteDismissal("123", 1000);
    expect(guard.shouldIgnoreScan("123", 1000 + DISMISS_WINDOW_MS - 1)).toBe(true);
  });

  it("accepts the same code once the window has passed", () => {
    const guard = createScanDismissGuard();
    guard.noteDismissal("123", 1000);
    expect(guard.shouldIgnoreScan("123", 1000 + DISMISS_WINDOW_MS)).toBe(false);
  });

  it("accepts a different code inside the window, and drops the window for the original code", () => {
    const guard = createScanDismissGuard();
    guard.noteDismissal("123", 1000);

    expect(guard.shouldIgnoreScan("456", 1000 + 100)).toBe(false);
    // The window for "123" is gone now, even though we're still inside what
    // would have been its original 2s — a different code was seen since.
    expect(guard.shouldIgnoreScan("123", 1000 + 200)).toBe(false);
  });

  it("resets so the next read of a just-dismissed code is accepted", () => {
    const guard = createScanDismissGuard();
    guard.noteDismissal("123", 1000);
    guard.reset();
    expect(guard.shouldIgnoreScan("123", 1000 + 1)).toBe(false);
  });

  it("never ignores anything before a dismissal has been noted", () => {
    const guard = createScanDismissGuard();
    expect(guard.shouldIgnoreScan("123", 1000)).toBe(false);
  });
});
