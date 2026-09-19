import { fireEvent, render, screen } from "@testing-library/react-native";

import ProfileScreen from "@/app/(tabs)/profile";
import type { HistoryEntry, SavedProduct } from "@/store/useAppStore";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The first screen-render test in this repo — see issue #153. Everything
 * up to this point (__tests__/*.test.ts) tests exported functions and store
 * state in isolation; nothing renders a component or simulates a tap. This
 * proves the pattern on the profile screen specifically because #153 (edit
 * profile, destructive erase) was the one Core Product flow a route-inventory
 * audit found wasn't covered by any of the other launch-checklist issues —
 * a bug in the confirmation gate here is exactly the kind of thing a unit
 * test on `lib/matching.ts` would never catch.
 */

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    back: (...args: unknown[]) => mockBack(...args),
    canGoBack: (...args: unknown[]) => mockCanGoBack(...args),
  },
  useFocusEffect: (effect: () => void | (() => void)) => {
    // The real hook re-runs on every focus; a single mount is enough here —
    // the screen only uses it to clear confirmation state on blur, which
    // no test below relies on.
    effect();
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  mockReplace.mockClear();
  mockBack.mockClear();
  mockCanGoBack.mockClear();
  useAppStore.setState({ profile: EMPTY_PROFILE }, false);
});

describe("ProfileScreen", () => {
  it("renders an empty profile as unset, with no save bar yet", async () => {
    await render(<ProfileScreen />);

    expect(screen.getAllByText("Not set").length).toBeGreaterThan(0);
    expect(screen.getAllByText("I don't know").length).toBeGreaterThan(0);
    expect(screen.queryByText("Find my matches")).toBeNull();
  });

  it("selecting a concern makes the draft dirty and reveals the save bar, without touching the store until saved", async () => {
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getAllByText("Edit")[0]);
    await fireEvent.press(screen.getByText("Dullness"));

    expect(screen.getByText("Find my matches")).toBeTruthy();
    expect(useAppStore.getState().profile.concerns).toEqual([]);

    await fireEvent.press(screen.getByText("Find my matches"));

    expect(useAppStore.getState().profile.concerns).toEqual(["dullness"]);
    expect(mockReplace).toHaveBeenCalled();
  });

  it("erase requires a second, explicit confirmation before wiping anything", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dullness"] } }, false);
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByText("Erase my profile"));
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    // The one tap that opened the modal must not itself have erased anything.
    expect(useAppStore.getState().profile.concerns).toEqual(["dullness"]);

    await fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByText("Are you sure?")).toBeNull();
    expect(useAppStore.getState().profile.concerns).toEqual(["dullness"]);
  });

  it("confirming erase wipes the profile and navigates to onboarding", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dullness"] } }, false);
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByText("Erase my profile"));
    await fireEvent.press(screen.getByText("Yes, delete my profile"));

    expect(useAppStore.getState().profile).toEqual(EMPTY_PROFILE);
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: "/onboarding",
      params: { erased: "1" },
    });
  });

  it("erase also clears the saved shelf, starred ingredients and history, not just the profile", async () => {
    const savedProduct: SavedProduct = { id: "p1", savedAt: Date.now() };
    const historyEntry: HistoryEntry = {
      id: "p1",
      known: true,
      firstSeenAt: 1,
      lastSeenAt: 1,
      seenCount: 1,
      scoreAtView: 80,
      warningsAtView: 0,
    };
    useAppStore.setState(
      {
        profile: { ...EMPTY_PROFILE, concerns: ["dullness"] },
        savedProducts: [savedProduct],
        savedIngredients: ["glycerin"],
        history: [historyEntry],
        hasSeenOnboarding: true,
      },
      false
    );
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByText("Erase my profile"));
    await fireEvent.press(screen.getByText("Yes, delete my profile"));

    expect(useAppStore.getState()).toMatchObject({
      profile: EMPTY_PROFILE,
      savedProducts: [],
      savedIngredients: [],
      history: [],
      hasSeenOnboarding: false,
    });
  });

  it("tapping back with unsaved changes asks before discarding, and only navigates once confirmed", async () => {
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getAllByText("Edit")[0]);
    await fireEvent.press(screen.getByText("Dullness"));

    await fireEvent.press(screen.getByLabelText("Back"));
    expect(screen.getByText("You have unsaved changes. Leave without saving?")).toBeTruthy();
    // The confirmation itself must not navigate or discard anything yet.
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByText("Keep editing"));
    expect(screen.queryByText("You have unsaved changes. Leave without saving?")).toBeNull();
    // Still just a draft — "Keep editing" must not have saved or discarded it.
    expect(screen.getByText("Find my matches")).toBeTruthy();
    expect(useAppStore.getState().profile.concerns).toEqual([]);

    await fireEvent.press(screen.getByLabelText("Back"));
    await fireEvent.press(screen.getByText("Discard changes"));

    // canGoBack() is mocked false, so leave() falls back to /browse rather
    // than router.back() — same branch the profile pill's push relies on.
    expect(mockReplace).toHaveBeenCalledWith("/browse");
    expect(useAppStore.getState().profile.concerns).toEqual([]);
  });
});
