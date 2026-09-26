import { act, fireEvent, render, screen } from "@testing-library/react-native";

import Finder from "@/app/finder";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The skincare finder: the four questions on one page, "Show products" once
 * any one is answered, and the answers saved as the skin profile.
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
});

it("shows all four questions at once, and waits for one answer before showing products", async () => {
  await render(<Finder />);
  for (const title of ["Skin concerns", "Skin type", "Sensitivity", "Pregnant or breastfeeding?"]) {
    expect(screen.getByRole("header", { name: title })).toBeTruthy();
  }
  await fireEvent.press(screen.getByRole("button", { name: "Show products" }));
  expect(mockPush).not.toHaveBeenCalled();
});

it("shows products from a single answer, saving it as the skin profile", async () => {
  await render(<Finder />);
  await act(async () => fireEvent.press(screen.getByRole("radio", { name: "Oily" })));
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Show products" })));
  expect(useAppStore.getState().profile.baseSkinType).toBe("oily");
  expect(mockPush).toHaveBeenCalledWith("/finder-results");
});

it("counts an \"I don't know\" as an answer", async () => {
  await render(<Finder />);
  const [skinTypeUnknown] = screen.getAllByRole("radio", { name: "I don't know" });
  await act(async () => fireEvent.press(skinTypeUnknown));
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Show products" })));
  expect(mockPush).toHaveBeenCalledWith("/finder-results");
});
