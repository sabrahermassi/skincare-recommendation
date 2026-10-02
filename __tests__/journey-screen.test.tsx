import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Linking } from "react-native";

import Journey from "@/app/journey";
import { openScanner } from "@/lib/open-scanner";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/** "Skin needs" (v9, per #155): pick concerns (or use the profile's), read the deck, scan from it. */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) } }));
jest.mock("@/lib/open-scanner", () => ({ openScanner: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
let mockReduceMotion = true;
jest.mock("@/lib/reduce-motion", () => ({ reduceMotionNow: () => mockReduceMotion }));

afterEach(() => {
  useAppStore.setState({ profile: EMPTY_PROFILE });
  mockReduceMotion = true;
});

it("opens straight on the cards when the skin profile already names concerns", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["acne-prone"] } });
  await render(<Journey />);
  expect(screen.getByText("Based on your skin")).toBeTruthy();
  expect(screen.queryByRole("checkbox")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(router.back).toHaveBeenCalled();
});

it("asks for concerns without a skin profile, and stops at three", async () => {
  await render(<Journey />);
  // Owner: one question, so no step count and no progress line.
  expect(screen.queryByText(/^Step \d of 2$/)).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  for (const name of ["Acne or pimples", "Dry / Dehydrated", "Redness or rosacea"]) await fireEvent.press(screen.getByRole("checkbox", { name }));
  expect(screen.getByRole("checkbox", { name: "Enlarged pores" }).props.accessibilityState.disabled).toBe(true);
});

it("needs a concern before it shows what helps", async () => {
  await render(<Journey />);
  expect(screen.getByRole("button", { name: /Show what helps/ }).props.accessibilityState.disabled).toBe(true);
});

it("shows the deck for the chosen concerns, and flips a card to how to use it", async () => {
  await render(<Journey />);
  await fireEvent.press(screen.getByRole("checkbox", { name: "Acne or pimples" }));
  await fireEvent.press(screen.getByRole("button", { name: /Show what helps/ }));
  expect(await screen.findByText("Based on your skin")).toBeTruthy();
  expect(screen.getByText("Best match for you")).toBeTruthy();
  expect(screen.queryByText(/^Step \d of 2$/)).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: /^Azelaic acid\. / }));
  expect(screen.getByRole("button", { name: "Azelaic acid, how to use it" })).toBeTruthy();
});

// With motion on, so the wait is long enough to see: with Reduce Motion it is
// a 0 ms timer, and asserting on it raced the deck.
it("shows the finding screen between the concerns and the deck, with no step count or line", async () => {
  mockReduceMotion = false;
  jest.useFakeTimers();
  try {
    await render(<Journey />);
    await fireEvent.press(screen.getByRole("checkbox", { name: "Acne or pimples" }));
    await fireEvent.press(screen.getByRole("button", { name: /Show what helps/ }));
    expect(screen.getByText("Finding what your skin needs…")).toBeTruthy();
    expect(screen.queryByText(/^Step \d of 2$/)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText("Based on your skin")).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

it("opens the evidence only from a card that is turned over", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await render(<Journey />);
  await fireEvent.press(screen.getByRole("checkbox", { name: "Acne or pimples" }));
  await fireEvent.press(screen.getByRole("button", { name: /Show what helps/ }));
  await screen.findByText("Based on your skin");
  // On the front the link is out of sight, so a tap where it sits turns the card instead.
  await fireEvent.press(screen.getAllByRole("link", { name: /^See the evidence/ })[0]);
  expect(openURL).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Azelaic acid, how to use it" })).toBeTruthy();
  await fireEvent.press(screen.getAllByRole("link", { name: /^See the evidence/ })[0]);
  expect(openURL).toHaveBeenCalledTimes(1);
  openURL.mockRestore();
});

it("scans from the deck in label mode, carrying the concerns to the result", async () => {
  await render(<Journey />);
  await fireEvent.press(screen.getByRole("checkbox", { name: "Dry / Dehydrated" }));
  await fireEvent.press(screen.getByRole("checkbox", { name: "Acne or pimples" }));
  await fireEvent.press(screen.getByRole("button", { name: /Show what helps/ }));
  await screen.findByText("Based on your skin");
  await fireEvent.press(screen.getByRole("button", { name: /Scan a product/ }));
  expect(openScanner).toHaveBeenCalledWith({ mode: "photo", from: "journey", concerns: "acne-prone,dehydrated" });
});

it("goes back from the deck to the concerns, and from the concerns out", async () => {
  await render(<Journey />);
  await fireEvent.press(screen.getByRole("checkbox", { name: "Acne or pimples" }));
  await fireEvent.press(screen.getByRole("button", { name: /Show what helps/ }));
  await screen.findByText("Based on your skin");
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("What do you want to work on?")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(router.back).toHaveBeenCalled();
});

// Opened straight from a link there is nothing behind it: Back must still lead somewhere.
it("goes Home from the concerns when there is no screen to go back to", async () => {
  jest.mocked(router.canGoBack).mockReturnValueOnce(false);
  jest.mocked(router.back).mockClear();
  await render(<Journey />);
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith("/");
});
