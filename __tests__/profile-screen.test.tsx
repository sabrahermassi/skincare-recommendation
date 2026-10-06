import { act, fireEvent, render, screen } from "@testing-library/react-native";

import ProfileScreen from "@/app/(tabs)/profile";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The first screen-render test in this repo — see issue #153. Everything
 * up to this point (__tests__/*.test.ts) tests exported functions and store
 * state in isolation; nothing renders a component or simulates a tap. This
 * proved the pattern on the Profile tab. Its "Delete my profile" flow has
 * since moved to Account (account-deletion.test.tsx); the edit-profile editor
 * is covered in skin-profile-screen.test.tsx.
 */

// The first render pulls in the whole screen module graph, which can exceed the 5s default when
// the full suite runs in parallel.
jest.setTimeout(30000);

const mockPush = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useScrollToTop: () => undefined,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  mockPush.mockClear();
  useAppStore.setState({ profile: EMPTY_PROFILE }, false);
});

describe("ProfileScreen", () => {
  // #346: the skin questions until the answers score, then the editor.
  it("opens the skin profile list from Skin profile, answered or not", async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText("Skin profile"));
    expect(mockPush).toHaveBeenLastCalledWith("/skin-profile");
  });

  it("asks to fill in the skin profile only until the answers score", async () => {
    await render(<ProfileScreen />);
    expect(screen.getByRole("button", { name: "Skin profile. Tap to fill in" })).toBeTruthy();
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dullness"] } }, false);
    await render(<ProfileScreen />);
    expect(screen.queryByText("Tap to fill in")).toBeNull();
    expect(screen.getByRole("button", { name: "Skin profile" })).toBeTruthy();
  });

  // v7: only the avatar above the menu. The answers live behind the Skin
  // profile row, with no title or chips of them here.
  it("shows no title or chips of an answered profile", async () => {
    useAppStore.setState(
      { profile: { concerns: ["large-pores", "hyperpigmentation"], baseSkinType: "combination", sensitivity: "some", pregnancyStatus: null } },
      false
    );
    await render(<ProfileScreen />);
    expect(screen.queryByText("Combination skin")).toBeNull();
    expect(screen.queryByText("Somewhat sensitive")).toBeNull();
    expect(screen.queryByText("Dark spots")).toBeNull();
    expect(screen.getByRole("button", { name: "Skin profile" })).toBeTruthy();
  });

  it("asks to answer questions only while nothing scores, not for a skin type alone (found in the simulator)", async () => {
    const ASK = "Answer a few questions and every score will be made for your skin.";
    await render(<ProfileScreen />);
    expect(screen.getByText(ASK)).toBeTruthy();
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } }, false);
    await render(<ProfileScreen />);
    expect(screen.queryByText(ASK)).toBeNull();
  });

  it("no longer offers deleting the profile: that lives on Account now", async () => {
    await render(<ProfileScreen />);
    expect(screen.queryByText("Delete my profile")).toBeNull();
  });

  // #403: the regulatory-safety flag has a row beside "Fill with test data" in
  // a development build, and no row at all in a release build.
  describe("the EU safety notice row", () => {
    afterEach(() => {
      (globalThis as { __DEV__?: boolean }).__DEV__ = true;
      useAppStore.setState({ safetyNoticeEnabled: false }, false);
    });

    it("shows Off by default and flips the flag when pressed", async () => {
      await render(<ProfileScreen />);
      expect(screen.getByRole("button", { name: /EU safety notice.*Off/ })).toBeTruthy();

      await fireEvent.press(screen.getByRole("button", { name: /EU safety notice/ }));
      expect(useAppStore.getState().safetyNoticeEnabled).toBe(true);
      expect(screen.getByRole("button", { name: /EU safety notice.*On/ })).toBeTruthy();

      await fireEvent.press(screen.getByRole("button", { name: /EU safety notice/ }));
      expect(useAppStore.getState().safetyNoticeEnabled).toBe(false);
    });

    it("is not in a release build, next to the test-data rows", async () => {
      (globalThis as { __DEV__?: boolean }).__DEV__ = false;
      await render(<ProfileScreen />);
      expect(screen.queryByText("EU safety notice")).toBeNull();
      expect(screen.queryByText("Fill with test data")).toBeNull();
    });
  });

  it("opens the skincare routine, account, privacy policy and support from the menu", async () => {
    await render(<ProfileScreen />);
    for (const [label, route] of [
      ["Skincare routine", "/routine"],
      ["Account", "/account"],
      ["Privacy policy", "/privacy"],
      ["Support", "/support"],
    ] as const) {
      await fireEvent.press(screen.getByRole("button", { name: label }));
      expect(mockPush).toHaveBeenLastCalledWith(route);
    }
  });
});
