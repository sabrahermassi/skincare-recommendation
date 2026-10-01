import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import Journey from "@/app/journey";
import { openScanner } from "@/lib/open-scanner";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/** "What my skin needs" (v9, per #155): pick concerns, read the deck, scan from it. */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));
jest.mock("@/lib/open-scanner", () => ({ openScanner: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/reduce-motion", () => ({ reduceMotionNow: () => true }));

afterEach(() => useAppStore.setState({ profile: EMPTY_PROFILE }));

it("starts from the skin profile's concerns, and stops at three", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["acne-prone"] } });
  await render(<Journey />);
  expect(screen.getByRole("checkbox", { name: "Acne" }).props.accessibilityState.checked).toBe(true);
  for (const name of ["Dehydration", "Redness"]) await fireEvent.press(screen.getByRole("checkbox", { name }));
  expect(screen.getByRole("checkbox", { name: "Pores" }).props.accessibilityState.disabled).toBe(true);
});

it("needs a concern before it shows what helps", async () => {
  await render(<Journey />);
  expect(screen.getByRole("button", { name: /Show what helps/ }).props.accessibilityState.disabled).toBe(true);
});

it("shows the deck for the chosen concerns, and flips a card to how to use it", async () => {
  await render(<Journey />);
  await fireEvent.press(screen.getByRole("checkbox", { name: "Acne" }));
  await fireEvent.press(screen.getByRole("button", { name: /Show what helps/ }));
  expect(screen.getByText("Based on your skin")).toBeTruthy();
  expect(screen.getByText("Best match for you")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: /^Azelaic acid\. / }));
  expect(screen.getByRole("button", { name: "Azelaic acid, how to use it" })).toBeTruthy();
});

it("scans from the deck in label mode, carrying the concerns to the result", async () => {
  await render(<Journey />);
  await fireEvent.press(screen.getByRole("checkbox", { name: "Dehydration" }));
  await fireEvent.press(screen.getByRole("checkbox", { name: "Acne" }));
  await fireEvent.press(screen.getByRole("button", { name: /Show what helps/ }));
  await fireEvent.press(screen.getByRole("button", { name: /Scan a product/ }));
  expect(openScanner).toHaveBeenCalledWith({ mode: "photo", from: "journey", concerns: "acne-prone,dehydrated" });
});

it("goes back from the deck to the concerns, and from the concerns out", async () => {
  await render(<Journey />);
  await fireEvent.press(screen.getByRole("checkbox", { name: "Acne" }));
  await fireEvent.press(screen.getByRole("button", { name: /Show what helps/ }));
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("What do you want to work on?")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(router.back).toHaveBeenCalled();
});
