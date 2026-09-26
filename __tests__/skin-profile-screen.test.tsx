import { act, fireEvent, render, screen } from "@testing-library/react-native";

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
const mockDispatch = jest.fn();
// A stand-in for the navigator's prevent-remove check: every leave the screen
// starts goes through it, the way a real stack runs `beforeRemove`, and the
// ones that get through land in `mockLeft`. A system back (the iOS swipe) is
// `mockSystemBack`, which the screen never calls itself.
let mockPrevent: { active: boolean; onPrevented: (e: { data: { action: unknown } }) => void } | null = null;
const mockLeft: unknown[] = [];
function mockLeave(action: unknown) {
  if (mockPrevent?.active) mockPrevent.onPrevented({ data: { action } });
  else mockLeft.push(action);
}
const mockSystemBack = () => mockLeave({ type: "POP" });

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => {
      mockReplace(...args);
      mockLeave({ type: "REPLACE", args });
    },
    back: (...args: unknown[]) => {
      mockBack(...args);
      mockLeave({ type: "GO_BACK" });
    },
    canGoBack: (...args: unknown[]) => mockCanGoBack(...args),
  },
  useLocalSearchParams: () => ({}),
  useNavigation: () => ({
    dispatch: (action: unknown) => {
      mockDispatch(action);
      mockLeft.push(action);
    },
  }),
}));

jest.mock("expo-router/react-navigation", () => ({
  usePreventRemove: (active: boolean, onPrevented: (e: { data: { action: unknown } }) => void) => {
    mockPrevent = { active, onPrevented };
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const DISCARD_PROMPT = "You have unsaved changes. Leave without saving?";

beforeEach(() => {
  mockReplace.mockClear();
  mockBack.mockClear();
  mockCanGoBack.mockClear();
  mockDispatch.mockClear();
  mockPrevent = null;
  mockLeft.length = 0;
  useAppStore.setState({ profile: EMPTY_PROFILE }, false);
});

describe("SkinProfileScreen", () => {
  it("renders an empty profile as unset, with no save bar yet", async () => {
    await render(<SkinProfileScreen />);

    expect(screen.getAllByText("Not set").length).toBeGreaterThan(0);
    expect(screen.getAllByText("I don't know").length).toBeGreaterThan(0);
    expect(screen.queryByText("Save")).toBeNull();
  });

  it("says 'No concerns', not 'Not set', once the quiz was answered without any (#291)", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, pregnancyStatus: "prefer-not-to-say" } }, false);
    await render(<SkinProfileScreen />);

    expect(screen.getByText("No concerns")).toBeTruthy();
  });

  it("selecting a concern makes the draft dirty and reveals the save bar, without touching the store until saved", async () => {
    await render(<SkinProfileScreen />);

    await fireEvent.press(screen.getAllByText("Edit")[0]);
    await fireEvent.press(screen.getByText("Dullness"));

    expect(screen.getByText("Save")).toBeTruthy();
    expect(useAppStore.getState().profile.concerns).toEqual([]);

    await fireEvent.press(screen.getByText("Save"));

    expect(useAppStore.getState().profile.concerns).toEqual(["dullness"]);
    // Saving leaves without the discard question, though `dirty` was still true
    // on the render the save started from.
    expect(mockLeft).toEqual([{ type: "REPLACE", args: [expect.any(String)] }]);
    expect(screen.queryByText(DISCARD_PROMPT)).toBeNull();
  });

  it("tapping back with unsaved changes asks before discarding, and only navigates once confirmed", async () => {
    await render(<SkinProfileScreen />);

    await fireEvent.press(screen.getAllByText("Edit")[0]);
    await fireEvent.press(screen.getByText("Dullness"));

    await fireEvent.press(screen.getByLabelText("Back"));
    expect(screen.getByText(DISCARD_PROMPT)).toBeTruthy();
    // The confirmation itself must not navigate or discard anything yet.
    expect(mockLeft).toEqual([]);

    await fireEvent.press(screen.getByText("Keep editing"));
    expect(screen.queryByText(DISCARD_PROMPT)).toBeNull();
    // Still just a draft — "Keep editing" must not have saved or discarded it.
    expect(screen.getByText("Save")).toBeTruthy();
    expect(useAppStore.getState().profile.concerns).toEqual([]);

    await fireEvent.press(screen.getByLabelText("Back"));
    await fireEvent.press(screen.getByText("Discard changes"));

    // canGoBack() is mocked false, so leave() falls back to /browse rather
    // than router.back(), and "Discard changes" finishes that same held leave.
    expect(mockReplace).toHaveBeenCalledWith("/browse");
    expect(mockLeft).toEqual([{ type: "REPLACE", args: ["/browse"] }]);
    expect(useAppStore.getState().profile.concerns).toEqual([]);
  });

  it("a swipe back with unsaved changes asks too, instead of being switched off (#313)", async () => {
    await render(<SkinProfileScreen />);

    await fireEvent.press(screen.getAllByText("Edit")[0]);
    await fireEvent.press(screen.getByText("Dullness"));

    await act(() => mockSystemBack());
    expect(screen.getByText(DISCARD_PROMPT)).toBeTruthy();
    expect(mockLeft).toEqual([]);

    await fireEvent.press(screen.getByText("Discard changes"));
    // The swipe's own back goes through, not a fresh one of the screen's.
    expect(mockLeft).toEqual([{ type: "POP" }]);
    expect(useAppStore.getState().profile.concerns).toEqual([]);
  });

  it("with nothing changed, back leaves straight away", async () => {
    await render(<SkinProfileScreen />);

    await fireEvent.press(screen.getByLabelText("Back"));
    expect(screen.queryByText(DISCARD_PROMPT)).toBeNull();
    expect(mockLeft).toEqual([{ type: "REPLACE", args: ["/browse"] }]);
  });
});
