import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Animated } from "react-native";

import JourneyStory from "@/app/journey-story";
import { fetchProductsByIds } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { openScanner } from "@/lib/open-scanner";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * An active's story (design_handoff "october 3d", 2–7, 7b–7f, C1–C3, per
 * #155): the cards, and what "Add to my routine" does.
 */

jest.setTimeout(30_000);

const mockRedirect = jest.fn((_props: { href: string }) => null);
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
  useLocalSearchParams: jest.fn(),
  Redirect: (props: { href: string }) => mockRedirect(props),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/open-scanner", () => ({ openScanner: jest.fn() }));
jest.mock("@/data/api", () => ({ fetchProductsByIds: jest.fn() }));
jest.mock("@/lib/reduce-motion", () => ({ reduceMotionNow: () => true }));

const params = jest.mocked(useLocalSearchParams);
const byIds = jest.mocked(fetchProductsByIds);
const ACNE = { ...EMPTY_PROFILE, baseSkinType: "oily" as const, concerns: ["acne-prone" as const] };

beforeEach(() => {
  // Skin needs is behind a dev-only switch (#467): on here.
  useAppStore.setState({ skinNeedsEnabled: true });
  // A routine already built from this skin profile (opened once), unless a test says otherwise.
  useAppStore.setState({ profile: ACNE, routineBuilt: true, routineActives: [], routineStarted: false, routineStepLimit: 4, routinePicks: {}, savedIngredients: [] });
  byIds.mockResolvedValue({ ok: true, value: [] } as never);
  jest.mocked(router.push).mockClear();
  jest.mocked(router.back).mockClear();
});

const open = async (active: string, answers = "oil.some.no.") => {
  params.mockReturnValue({ active, answers });
  await render(<JourneyStory />);
};
/** Taps the right side of the card until the last one. */
const toLast = async (cards: number) => {
  for (let i = 1; i < cards; i++) await fireEvent.press(screen.getByText("Tap to continue"));
};

it("drops back into place without a spring when a swipe is let go with Reduce Motion on", async () => {
  const spring = jest.spyOn(Animated, "spring");
  await open("bha");
  const story = screen.root;
  await act(async () => {
    story!.props.onResponderTerminate({ nativeEvent: {}, touchHistory: { touchBank: [], numberActiveTouches: 0, indexOfSingleActiveTouch: -1, mostRecentTimeStamp: 0 } });
  });
  expect(spring).not.toHaveBeenCalled();
  spring.mockRestore();
});

it("tells the BHA story in six cards, the start plan set by the sensitivity", async () => {
  await open("bha");
  // A meta line: medium, not semibold (DESIGN.md, weights).
  expect(screen.getByText("1 / 6")).toHaveStyle({ fontWeight: "500" });
  expect(screen.getByRole("header", { name: "Why BHA?" })).toBeTruthy();
  expect(screen.getByText("Control oil")).toBeTruthy();
  expect(screen.getByRole("link", { name: /See the evidence/ })).toBeTruthy();
  await fireEvent.press(screen.getByText("Tap to continue"));
  expect(screen.getByRole("header", { name: "How often do I use it?" })).toBeTruthy();
  expect(screen.getByText("Twice a week first. More only if it feels fine.")).toBeTruthy();
  expect(screen.getByText("Your skin is somewhat sensitive, so give it time.")).toBeTruthy();
  await toLast(5);
  expect(screen.getByText("6 / 6")).toBeTruthy();
  expect(screen.getByRole("header", { name: "When shopping" })).toBeTruthy();
  expect(screen.getByText("Salicylic Acid")).toBeTruthy();
});

it("tells a story with nothing to avoid in five cards", async () => {
  await open("hydrating", "hydrate..no.");
  expect(screen.getByText("1 / 5")).toBeTruthy();
  await fireEvent.press(screen.getByText("Tap to continue"));
  expect(screen.getByText("Every day, from the start. It's a gentle one.")).toBeTruthy();
  await toLast(4);
  expect(screen.getByRole("header", { name: "When shopping" })).toBeTruthy();
});

it("sends a link to a story back to Home while the switch is off (#467)", async () => {
  useAppStore.setState({ skinNeedsEnabled: false });
  jest.mocked(useLocalSearchParams).mockReturnValue({ active: "bha", answers: "oil.some.no." });
  await render(<JourneyStory />);
  expect(mockRedirect).toHaveBeenCalledWith({ href: "/" });
});

it("closes on the cross, and refuses a link it can't read", async () => {
  await open("bha");
  await fireEvent.press(screen.getByRole("button", { name: "Close the story" }));
  expect(router.back).toHaveBeenCalled();
  params.mockReturnValue({ active: "nonsense", answers: "oil.some.no." });
  await render(<JourneyStory />);
  expect(screen.getByText("This story can't be shown.")).toBeTruthy();
});

it("goes Home on the cross when it was opened straight from a link", async () => {
  jest.mocked(router.canGoBack).mockReturnValueOnce(false);
  await open("bha");
  await fireEvent.press(screen.getByRole("button", { name: "Close the story" }));
  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith("/");
});

it("starts another story opened in the same place at its first card", async () => {
  await open("bha");
  await toLast(6);
  expect(screen.getByText("6 / 6")).toBeTruthy();
  params.mockReturnValue({ active: "niacinamide", answers: "oil.some.no." });
  await screen.rerender(<JourneyStory />);
  expect(screen.getByText(/^1 \/ /)).toBeTruthy();
  expect(screen.getByRole("header", { name: "Why niacinamide?" })).toBeTruthy();
});

it("adds it straight in, says where, and Undo takes it out again (7e)", async () => {
  await open("bha");
  await toLast(6);
  await fireEvent.press(screen.getByRole("button", { name: "Add BHA to my routine" }));
  expect(useAppStore.getState().routineActives).toEqual([{ active: "bha", time: "evening", days: [0, 3] }]);
  expect(screen.getByText("Added to your routine")).toBeTruthy();
  expect(screen.getByText("Evening, after cleansing")).toBeTruthy();
  expect(screen.getByRole("button", { name: "See my routine" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
  expect(useAppStore.getState().routineActives).toEqual([]);
  expect(screen.getByRole("button", { name: "Add BHA to my routine" })).toBeTruthy();
});

it("asks to start a routine when there is a skin profile but no routine built yet (owner)", async () => {
  useAppStore.setState({ routineBuilt: false });
  await open("bha");
  await toLast(6);
  await fireEvent.press(screen.getByRole("button", { name: "Add BHA to my routine" }));
  expect(screen.getByRole("header", { name: "Let's start your routine" })).toBeTruthy();
  expect(useAppStore.getState().routineActives).toEqual([]);
});

it("doesn't ask to start a routine when products of one's own are in it, with no routine built (review)", async () => {
  useAppStore.setState({ routineBuilt: false, routinePicks: { "evening:treatment": "retinol" } });
  await open("bha");
  await toLast(6);
  await fireEvent.press(screen.getByRole("button", { name: "Add BHA to my routine" }));
  expect(screen.queryByRole("header", { name: "Let's start your routine" })).toBeNull();
});

it("starts a routine when there is none, with the step count chosen (7c)", async () => {
  useAppStore.setState({ profile: EMPTY_PROFILE });
  await open("bha");
  await toLast(6);
  await fireEvent.press(screen.getByRole("button", { name: "Add BHA to my routine" }));
  expect(screen.getByRole("header", { name: "Let's start your routine" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Start my routine" }));
  const state = useAppStore.getState();
  expect(state.routineStarted).toBe(true);
  expect(state.routineStepLimit).toBe(4);
  expect(state.routineActives).toHaveLength(1);
  expect(screen.getByText("Routine started")).toBeTruthy();
  // Undo takes the new routine away too.
  await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
  expect(useAppStore.getState().routineStarted).toBe(false);
  expect(useAppStore.getState().routineActives).toEqual([]);
});

it("alternates quietly with a clash for skin that isn't sensitive (C1)", async () => {
  useAppStore.setState({ routineActives: [{ active: "retinoids", time: "evening", days: [0, 3] }] });
  await open("bha", "oil.none.no.");
  await toLast(6);
  await fireEvent.press(screen.getByRole("button", { name: "Add BHA to my routine" }));
  expect(screen.getByText("Added on different nights")).toBeTruthy();
  const bha = useAppStore.getState().routineActives.find((entry) => entry.active === "bha")!;
  expect(bha.days.some((day) => [0, 3].includes(day))).toBe(false);
});

it("asks to alternate for somewhat sensitive skin (C2), and swaps when asked", async () => {
  useAppStore.setState({ routineActives: [{ active: "retinoids", time: "evening", days: [0, 3] }] });
  await open("bha");
  await toLast(6);
  await fireEvent.press(screen.getByRole("button", { name: "Add BHA to my routine" }));
  expect(screen.getByRole("header", { name: "You already use a retinoid" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Swap" }));
  expect(useAppStore.getState().routineActives.map((entry) => entry.active)).toEqual(["bha"]);
  expect(screen.getByText("Swapped into your routine")).toBeTruthy();
});

it("suggests one at a time for very sensitive skin (C3), and Not now stars it", async () => {
  await open("bha", "oil.high.no.retinoids");
  await toLast(6);
  await fireEvent.press(screen.getByRole("button", { name: "Add BHA to my routine" }));
  expect(screen.getByRole("header", { name: "One at a time is kinder" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Not now" }));
  expect(useAppStore.getState().savedIngredients).toContain("salicylic acid");
  expect(useAppStore.getState().routineActives).toEqual([]);
  expect(screen.getByText("Saved to Ingredients")).toBeTruthy();
});

it("offers swap or add a step when its step is taken (7b)", async () => {
  useAppStore.setState({ routineActives: [{ active: "ceramides", time: "evening", days: [0, 1, 2, 3, 4, 5, 6] }] });
  await open("bha");
  await toLast(6);
  await fireEvent.press(screen.getByRole("button", { name: "Add BHA to my routine" }));
  expect(screen.getByRole("header", { name: "Swap or add a step?" })).toBeTruthy();
  expect(screen.getByText(/active step already has ceramides\./)).toBeTruthy();
  expect(screen.getByText("Adding makes it 5 steps.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Add a step" }));
  expect(useAppStore.getState().routineActives.map((entry) => entry.active).sort()).toEqual(["bha", "ceramides"]);
});

it("says it is in the routine when a product of theirs holds it (7f)", async () => {
  const gel = { id: "p1", brand: "B", name: "Clear Days Gel Cleanser", type: "cleanser", ingredients: ["water", "salicylic acid"].map((name) => ({ id: name, name, comedogenic: 0, safety: "safe", verified: true })) } as unknown as ProductWithIngredients;
  byIds.mockResolvedValue({ ok: true, value: [gel] } as never);
  useAppStore.setState({ routinePicks: { "evening:cleanse": "p1" } });
  await open("bha");
  await toLast(6);
  await waitFor(() => expect(screen.getByLabelText("In your routine: Clear Days Gel Cleanser")).toBeTruthy());
  expect(screen.queryByRole("button", { name: "Add BHA to my routine" })).toBeNull();
  // Taken out of the routine, it is not theirs any more.
  await act(async () => useAppStore.setState({ routinePicks: {} }));
  expect(screen.queryByLabelText("In your routine: Clear Days Gel Cleanser")).toBeNull();
  expect(screen.getByRole("button", { name: "Add BHA to my routine" })).toBeTruthy();
});

it("checks a product against what was picked, and opens the routine", async () => {
  await open("bha");
  await toLast(6);
  await fireEvent.press(screen.getByRole("button", { name: "Have one in mind? Check a product" }));
  expect(openScanner).toHaveBeenCalledWith({ mode: "photo", from: "journey", need: "oil.some.no" });
  await fireEvent.press(screen.getByRole("button", { name: "Add BHA to my routine" }));
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "See my routine" })));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/routine", params: { from: "story" } });
});

it("says SPF is already in the routine, with no Add, and opens the trial as its evidence", async () => {
  await open("spf", "lines.some.no.");
  expect(screen.getByText("1 / 5")).toBeTruthy();
  expect(screen.getByRole("link", { name: "See the evidence: Hughes et al. 2013: sunscreen and skin ageing" })).toBeTruthy();
  await toLast(5);
  expect(screen.getByLabelText("Already in your routine: every morning")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Add SPF/ })).toBeNull();
  expect(screen.getByRole("button", { name: "See my routine" })).toBeTruthy();
});

it("undoes the new routine too when one was started and a clash sheet followed", async () => {
  useAppStore.setState({ profile: EMPTY_PROFILE });
  await open("bha", "oil.some.no.retinoids");
  await toLast(6);
  await fireEvent.press(screen.getByRole("button", { name: "Add BHA to my routine" }));
  await fireEvent.press(screen.getByRole("button", { name: "Start my routine" }));
  expect(screen.getByRole("header", { name: "You already use a retinoid" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Alternate" }));
  expect(useAppStore.getState().routineStarted).toBe(true);
  await fireEvent.press(screen.getByRole("button", { name: "Undo" }));
  expect(useAppStore.getState().routineStarted).toBe(false);
  expect(useAppStore.getState().routineActives).toEqual([]);
});
