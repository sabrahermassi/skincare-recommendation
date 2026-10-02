import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";
import { Linking } from "react-native";

import Journey from "@/app/journey";
import { openScanner } from "@/lib/open-scanner";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/** "Skin needs" (per #155): pick one thing to work on, read the deck, scan from it. */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  // Focused as soon as it is on screen, as it is when opened by a tap.
  useFocusEffect: (effect: () => void) => jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect]),
}));
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

const pick = (name: string) => fireEvent.press(screen.getByRole("radio", { name }));
const showCards = () => fireEvent.press(screen.getByRole("button", { name: /Show what helps/ }));

// Owner, 2 October 2026: what someone wants to work on today is asked fresh,
// whatever their skin profile says.
it("asks what to work on even when the skin profile already names concerns", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["acne-prone"], pregnancyStatus: "pregnant" } });
  await render(<Journey />);
  expect(screen.getByText("What do you want to work on?")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Clear pimples" }).props.accessibilityState.checked).toBe(false);
  // Nor is the profile's pregnancy carried in: fine lines still offers retinoids.
  await pick("Fine lines and wrinkles");
  await showCards();
  expect(await screen.findByRole("button", { name: /^Retinoids\. / })).toBeTruthy();
});

it("offers the thirteen things to work on, and takes one", async () => {
  await render(<Journey />);
  // One question, so no step count and no progress line (owner).
  expect(screen.queryByText(/^Step \d of 2$/)).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.getByRole("radio", { name: "Even out skin tone" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Support skin barrier" })).toBeTruthy();
  await pick("Clear pimples");
  await pick("Calm redness");
  expect(screen.getByRole("radio", { name: "Clear pimples" }).props.accessibilityState.checked).toBe(false);
  expect(screen.getByRole("radio", { name: "Calm redness" }).props.accessibilityState.checked).toBe(true);
});

it("needs one thing to work on before it shows what helps, and nothing more", async () => {
  await render(<Journey />);
  expect(screen.getByRole("button", { name: /Show what helps/ }).props.accessibilityState.disabled).toBe(true);
  await pick("Clear pimples");
  // The two optional questions can be left alone; the second says why it is asked.
  expect(screen.getByText(/We ask so we can leave out ingredients commonly advised against/)).toBeTruthy();
  expect(screen.getByRole("button", { name: /Show what helps/ }).props.accessibilityState.disabled).toBe(false);
});

it("shows the deck for what was picked, and flips a card to how to use it", async () => {
  await render(<Journey />);
  await pick("Clear pimples");
  await showCards();
  expect(await screen.findByRole("header", { name: "Clear pimples" })).toBeTruthy();
  expect(screen.getByText("Best match for you")).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: /^Benzoyl peroxide\. / }));
  expect(screen.getByRole("button", { name: "Benzoyl peroxide, how to use it" })).toBeTruthy();
});

it("leaves the pregnancy-caution cards out after a yes, and warns on them when unanswered", async () => {
  await render(<Journey />);
  await pick("Fine lines and wrinkles");
  await showCards();
  await screen.findByRole("header", { name: "Fine lines and wrinkles" });
  expect(screen.getByText(/Commonly advised against while pregnant or breastfeeding\./)).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  await pick("Pregnant or breastfeeding? Yes");
  await showCards();
  await screen.findByRole("header", { name: "Fine lines and wrinkles" });
  expect(screen.queryByRole("button", { name: /^Retinoids\. / })).toBeNull();
  expect(screen.getByRole("button", { name: /^Bakuchiol\. / })).toBeTruthy();
});

it("takes an optional answer back when it is tapped again", async () => {
  await render(<Journey />);
  await pick("Is your skin sensitive? Very");
  expect(screen.getByRole("radio", { name: "Is your skin sensitive? Very" }).props.accessibilityState.checked).toBe(true);
  await pick("Is your skin sensitive? Very");
  expect(screen.getByRole("radio", { name: "Is your skin sensitive? Very" }).props.accessibilityState.checked).toBe(false);
});

// With motion on, so the wait is long enough to see: with Reduce Motion it is
// a 0 ms timer, and asserting on it raced the deck.
it("shows the finding screen between the question and the deck, with no step count or line", async () => {
  mockReduceMotion = false;
  jest.useFakeTimers();
  try {
    await render(<Journey />);
    await pick("Clear pimples");
    await showCards();
    expect(screen.getByText("Finding what your skin needs…")).toBeTruthy();
    expect(screen.queryByText(/^Step \d of 2$/)).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("header", { name: "Clear pimples" })).toBeTruthy();
  } finally {
    jest.useRealTimers();
  }
});

it("opens the evidence only from a card that is turned over", async () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  await render(<Journey />);
  await pick("Calm redness");
  await showCards();
  await screen.findByRole("header", { name: "Calm redness" });
  // On the front the link is out of sight, so a tap where it sits turns the card instead.
  await fireEvent.press(screen.getAllByRole("link", { name: /^See the evidence/ })[0]);
  expect(openURL).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Niacinamide, how to use it" })).toBeTruthy();
  await fireEvent.press(screen.getAllByRole("link", { name: /^See the evidence/ })[0]);
  expect(openURL).toHaveBeenCalledTimes(1);
  openURL.mockRestore();
});

it("scans from the deck in label mode, carrying what was picked to the result", async () => {
  await render(<Journey />);
  await pick("Clear pimples");
  await pick("Is your skin sensitive? Very");
  await pick("Pregnant or breastfeeding? No");
  await showCards();
  await screen.findByRole("header", { name: "Clear pimples" });
  await fireEvent.press(screen.getByRole("button", { name: /Scan a product/ }));
  expect(openScanner).toHaveBeenCalledWith({ mode: "photo", from: "journey", need: "pimples.high.no" });
});

it("goes back from the deck to the question, with the answer kept, and from there out", async () => {
  await render(<Journey />);
  await pick("Clear pimples");
  await showCards();
  await screen.findByRole("header", { name: "Clear pimples" });
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(screen.getByText("What do you want to work on?")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Clear pimples" }).props.accessibilityState.checked).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(router.back).toHaveBeenCalled();
});

// Opened straight from a link there is nothing behind it: Back must still lead somewhere.
it("goes Home from the question when there is no screen to go back to", async () => {
  jest.mocked(router.canGoBack).mockReturnValueOnce(false);
  jest.mocked(router.back).mockClear();
  await render(<Journey />);
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith("/");
});
