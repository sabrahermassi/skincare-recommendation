import { act, fireEvent, render, screen } from "@testing-library/react-native";

import Finder from "@/app/finder";
import { useFinderChoices } from "@/lib/finder-choices";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The skincare finder: the four questions on one page, "Show products" once
 * any one is answered, and the answers kept apart from the skin profile.
 */

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: (...a: unknown[]) => mockPush(...a), canGoBack: () => true } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  mockPush.mockClear();
  useAppStore.setState({ profile: EMPTY_PROFILE });
  useFinderChoices.setState({ choices: EMPTY_PROFILE });
});

it("shows all four questions at once, and waits for one answer before showing products", async () => {
  await render(<Finder />);
  for (const title of ["Skin concerns", "Skin type", "Sensitivity", "Pregnant or breastfeeding?"]) {
    expect(screen.getByRole("header", { name: title })).toBeTruthy();
  }
  await fireEvent.press(screen.getByRole("button", { name: "Show products" }));
  expect(mockPush).not.toHaveBeenCalled();
});

it("shows products from a single answer, without touching the skin profile", async () => {
  await render(<Finder />);
  await act(async () => fireEvent.press(screen.getByRole("radio", { name: "Oily" })));
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Show products" })));
  expect(useFinderChoices.getState().choices.baseSkinType).toBe("oily");
  expect(useAppStore.getState().profile).toEqual(EMPTY_PROFILE);
  expect(mockPush).toHaveBeenCalledWith("/finder-results");
});

it("counts an \"I don't know\" as an answer", async () => {
  await render(<Finder />);
  const [skinTypeUnknown] = screen.getAllByRole("radio", { name: "I don't know" });
  await act(async () => fireEvent.press(skinTypeUnknown));
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Show products" })));
  expect(mockPush).toHaveBeenCalledWith("/finder-results");
});

it("starts from its own last choices, not the skin profile", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "dry" } });
  await render(<Finder />);
  expect(screen.getByRole("radio", { name: "Dry" }).props.accessibilityState.checked).toBe(false);
});
