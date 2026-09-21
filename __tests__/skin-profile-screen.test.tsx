import { fireEvent, render, screen } from "@testing-library/react-native";

import SkinProfileScreen from "@/app/skin-profile";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * Screen-render tests for the edit-profile screen (`app/skin-profile.tsx`), split out of
 * profile-screen.test.tsx when the Profile tab became a menu and the editor moved to its
 * own route — see issue #153.
 */

// The first render pulls in the whole screen module graph, which can exceed the 5s default when
// the full suite runs in parallel.
jest.setTimeout(30000);

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockCanGoBack = jest.fn(() => false);

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    back: (...args: unknown[]) => mockBack(...args),
    canGoBack: (...args: unknown[]) => mockCanGoBack(...args),
  },
  // The screen only uses these to set header options and read a `returnTo` param.
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({}),
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

describe("SkinProfileScreen", () => {
  it("renders an empty profile as unset, with no save bar yet", async () => {
    await render(<SkinProfileScreen />);

    expect(screen.getAllByText("Not set").length).toBeGreaterThan(0);
    expect(screen.getAllByText("I don't know").length).toBeGreaterThan(0);
    expect(screen.queryByText("Find my matches")).toBeNull();
  });

  it("selecting a concern makes the draft dirty and reveals the save bar, without touching the store until saved", async () => {
    await render(<SkinProfileScreen />);

    await fireEvent.press(screen.getAllByText("Edit")[0]);
    await fireEvent.press(screen.getByText("Dullness"));

    expect(screen.getByText("Find my matches")).toBeTruthy();
    expect(useAppStore.getState().profile.concerns).toEqual([]);

    await fireEvent.press(screen.getByText("Find my matches"));

    expect(useAppStore.getState().profile.concerns).toEqual(["dullness"]);
    expect(mockReplace).toHaveBeenCalled();
  });

  it("tapping back with unsaved changes asks before discarding, and only navigates once confirmed", async () => {
    await render(<SkinProfileScreen />);

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
