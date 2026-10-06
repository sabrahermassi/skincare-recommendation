import { safetyNoticeEnabled } from "@/lib/features";
import { useAppStore } from "@/store/useAppStore";

describe("safetyNoticeEnabled (#403)", () => {
  const g = globalThis as { __DEV__?: boolean };
  const wasDev = g.__DEV__;

  afterEach(() => {
    g.__DEV__ = wasDev;
    useAppStore.setState({ safetyNoticeEnabled: false }, false);
  });

  it("follows the saved value in a development build", () => {
    g.__DEV__ = true;
    useAppStore.setState({ safetyNoticeEnabled: true }, false);
    expect(safetyNoticeEnabled()).toBe(true);
  });

  it("ignores a saved On in a release build", () => {
    g.__DEV__ = false;
    useAppStore.setState({ safetyNoticeEnabled: true }, false);
    expect(safetyNoticeEnabled()).toBe(false);
  });
});
