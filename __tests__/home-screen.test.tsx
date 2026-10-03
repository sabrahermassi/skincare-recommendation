import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import Home from "@/app/(tabs)/index";
import { openScanner } from "@/lib/open-scanner";
import { EVENING_TIPS, MORNING_TIPS } from "@/lib/skin-tips";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * Home (per #155, handoff_home_and_tip): "Hi there!", one top card — Start
 * your routine, or today's routine once there is one — Explore's two tiles,
 * and the skincare tip in its envelope.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn(), prefetch: jest.fn() }, useIsFocused: () => true }));
jest.mock("@/lib/open-scanner", () => ({ openScanner: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// Reduce Motion on: a tap acts at once, and the note is simply there.
jest.mock("@/lib/reduce-motion", () => ({ reduceMotionNow: () => true }));

// A Monday: 9 am is the morning, 8 pm the evening.
const MONDAY_9AM = new Date(2026, 9, 5, 9, 0);
const MONDAY_8PM = new Date(2026, 9, 5, 20, 0);
const BHA_MONDAYS = [{ active: "bha" as const, time: "evening" as const, days: [0] }];

beforeEach(() => {
  jest.useFakeTimers({ now: MONDAY_9AM, doNotFake: ["nextTick", "setImmediate"] });
});
afterEach(() => {
  jest.useRealTimers();
  useAppStore.setState({ profile: EMPTY_PROFILE, routineActives: [], routineStarted: false, routineBuilt: false, tipRead: null });
  jest.mocked(router.push).mockClear();
});

it("shows Start your routine, the two tiles and the tip, and nothing of the old Home", async () => {
  await render(<Home />);
  expect(screen.getByRole("header", { name: "Hi there!" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Start your routine. Build my routine" })).toBeTruthy();
  expect(screen.queryByText("Your skincare routine")).toBeNull();
  expect(screen.getByRole("header", { name: "Explore" })).toBeTruthy();
  for (const tile of ["Scan Any Product", "Find Your Actives"]) expect(screen.getByRole("button", { name: tile })).toBeTruthy();
  for (const gone of ["Skincare Routine", "Skin Needs"]) expect(screen.queryByRole("button", { name: gone })).toBeNull();
  expect(screen.getByText("Skincare tip")).toBeTruthy();
  expect(screen.getByText("A quick one for your skin")).toBeTruthy();
});

it("opens the routine, the scanner and Skin needs from their cards", async () => {
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: "Start your routine. Build my routine" }));
  expect(router.push).toHaveBeenCalledWith("/routine");
  await fireEvent.press(screen.getByRole("button", { name: "Scan Any Product" }));
  expect(openScanner).toHaveBeenCalledWith();
  await fireEvent.press(screen.getByRole("button", { name: "Find Your Actives" }));
  expect(router.push).toHaveBeenCalledWith("/journey");
});

it("turns into today's routine once there is one, by day before 3 pm and by night after", async () => {
  useAppStore.setState({ routineActives: BHA_MONDAYS, routineStarted: true });
  await render(<Home />);
  expect(screen.queryByRole("button", { name: /^Start your routine/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Your skincare routine. This morning · 4 steps. Morning basics" })).toBeTruthy();
  expect(screen.getByText("This morning: about your SPF")).toBeTruthy();
  // The clock moves on by itself at 3 pm.
  await act(async () => jest.advanceTimersByTime(MONDAY_8PM.getTime() - MONDAY_9AM.getTime()));
  const card = screen.getByRole("button", { name: "Your skincare routine. Tonight · 4 steps. BHA night" });
  expect(screen.getByText("BHA")).toBeTruthy();
  expect(screen.getByText("+3")).toBeTruthy();
  expect(screen.getByText("Tonight: about your BHA night")).toBeTruthy();
  await fireEvent.press(card);
  expect(router.push).toHaveBeenCalledWith("/routine");
});

it("keeps Start your routine for a skin profile alone, and shows the routine once it was opened", async () => {
  // Filled in after a scan: a skin profile, but no routine yet (owner).
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  await render(<Home />);
  expect(screen.getByRole("button", { name: "Start your routine. Build my routine" })).toBeTruthy();
  await act(async () => useAppStore.setState({ routineBuilt: true }));
  // Built in the background the same way the routine screen builds it: neither card nor tip until it is ready.
  expect(screen.queryByRole("button", { name: /^Start your routine/ })).toBeNull();
  await waitFor(() => expect(screen.getByRole("button", { name: /^Your skincare routine\. This morning · \d steps\./ })).toBeTruthy());
});

it("goes back to Start your routine when the routine is gone", async () => {
  useAppStore.setState({ routineActives: BHA_MONDAYS, routineStarted: true });
  await render(<Home />);
  await act(async () => useAppStore.setState({ routineActives: [], routineStarted: false }));
  expect(screen.getByRole("button", { name: "Start your routine. Build my routine" })).toBeTruthy();
});

it("opens the tip as a note with a close button only, then says it was read and when the next one comes", async () => {
  useAppStore.setState({ routineActives: BHA_MONDAYS, routineStarted: true });
  await render(<Home />);
  const tip = MORNING_TIPS.find((candidate) => screen.queryByText(candidate.tip)) ?? null;
  expect(tip).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Open skincare tip. This morning: about your SPF" }));
  const shown = MORNING_TIPS.find((candidate) => screen.queryByText(candidate.tip));
  expect(shown).toBeTruthy();
  expect(screen.getByText(shown!.why)).toBeTruthy();
  expect(screen.getByText("This morning · SPF")).toBeTruthy();
  const buttons = screen.getAllByRole("button", { name: "Close" });
  await fireEvent.press(buttons[buttons.length - 1]);
  expect(screen.queryByText(shown!.tip)).toBeNull();
  expect(screen.getByText("Tip read ✓")).toBeTruthy();
  expect(screen.getByText("Next tip: tonight")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Tip read. Next tip: tonight. Read again" })).toBeTruthy();
});

it("brings the evening tip at 3 pm, unread, about tonight's active", async () => {
  useAppStore.setState({ routineActives: BHA_MONDAYS, routineStarted: true });
  await render(<Home />);
  await fireEvent.press(screen.getByRole("button", { name: /^Open skincare tip/ }));
  // The clock moves on by itself at 3 pm.
  await act(async () => jest.advanceTimersByTime(MONDAY_8PM.getTime() - MONDAY_9AM.getTime()));
  expect(screen.getByText("Skincare tip")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Open skincare tip. Tonight: about your BHA night" }));
  expect(screen.getByText(EVENING_TIPS.bha!.tip)).toBeTruthy();
});
