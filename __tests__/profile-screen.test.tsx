import { act, fireEvent, render, screen } from "@testing-library/react-native";

import ProfileScreen from "@/app/(tabs)/profile";
import type { HistoryEntry, SavedProduct } from "@/store/useAppStore";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";
import { profileErasedNoticePending } from "@/lib/erase-notice";

/**
 * The first screen-render test in this repo — see issue #153. Everything
 * up to this point (__tests__/*.test.ts) tests exported functions and store
 * state in isolation; nothing renders a component or simulates a tap. This
 * proves the pattern on the Profile tab (the destructive "Delete my profile"
 * flow); the edit-profile editor is covered in skin-profile-screen.test.tsx.
 * #153 was the one Core Product flow a route-inventory audit found wasn't
 * covered by any of the other launch-checklist issues — a bug in the
 * confirmation gate here is exactly the kind of thing a unit test on
 * `lib/matching.ts` would never catch.
 */

// The first render pulls in the whole screen module graph, which can exceed the 5s default when
// the full suite runs in parallel.
jest.setTimeout(30000);

const mockReplace = jest.fn();
const mockPush = jest.fn();
// Cleanups the screen registered through useFocusEffect; running them is how a test
// simulates the tab losing focus.
const mockBlurCallbacks: (() => void)[] = [];

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
  useScrollToTop: () => undefined,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // The real hook re-runs on every focus; a single mount is enough here. Its cleanup is
    // kept so a test can trigger a blur with `blur()`.
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(() => {
      const cleanup = effect();
      if (typeof cleanup === "function") mockBlurCallbacks.push(cleanup);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const blur = () => act(() => mockBlurCallbacks.forEach((cleanup) => cleanup()));

beforeEach(() => {
  mockBlurCallbacks.length = 0;
  mockReplace.mockClear();
  mockPush.mockClear();
  useAppStore.setState({ profile: EMPTY_PROFILE }, false);
});

describe("ProfileScreen", () => {
  it("delete requires a second, explicit confirmation before wiping anything", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dullness"] } }, false);
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByText("Delete my profile"));
    expect(screen.getByText("Are you sure?")).toBeTruthy();
    // The one tap that opened the modal must not itself have erased anything.
    expect(useAppStore.getState().profile.concerns).toEqual(["dullness"]);

    await fireEvent.press(screen.getByText("Cancel"));
    expect(screen.queryByText("Are you sure?")).toBeNull();
    expect(useAppStore.getState().profile.concerns).toEqual(["dullness"]);
  });

  it("leaving the tab with the erase confirmation open closes it, without erasing", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dullness"] } }, false);
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByText("Delete my profile"));
    expect(screen.getByText("Are you sure?")).toBeTruthy();

    await blur();

    expect(screen.queryByText("Are you sure?")).toBeNull();
    expect(useAppStore.getState().profile.concerns).toEqual(["dullness"]);
  });

  it("confirming delete wipes the profile and navigates to onboarding", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dullness"] } }, false);
    await render(<ProfileScreen />);

    await fireEvent.press(screen.getByText("Delete my profile"));
    await fireEvent.press(screen.getByText("Yes, delete my profile"));

    expect(useAppStore.getState().profile).toEqual(EMPTY_PROFILE);
    expect(mockReplace).toHaveBeenCalledWith("/onboarding");
    // The "erased" notice travels in memory, never in a URL a link could set (#29).
    expect(profileErasedNoticePending()).toBe(true);
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

    await fireEvent.press(screen.getByText("Delete my profile"));
    await fireEvent.press(screen.getByText("Yes, delete my profile"));

    expect(useAppStore.getState()).toMatchObject({
      profile: EMPTY_PROFILE,
      savedProducts: [],
      savedIngredients: [],
      history: [],
      hasSeenOnboarding: false,
    });
  });

  // #346: the skin questions until the answers score, then the editor.
  it("opens the quiz from Skin profile while nothing scores, and the editor once it does", async () => {
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText("Skin profile"));
    expect(mockPush).toHaveBeenLastCalledWith("/quiz/concerns");
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dullness"] } }, false);
    await render(<ProfileScreen />);
    await fireEvent.press(screen.getByText("Skin profile"));
    expect(mockPush).toHaveBeenLastCalledWith("/skin-profile");
  });
});
