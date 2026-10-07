import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import Home from "@/app/(tabs)/index";
import * as api from "@/data/api";
import { openScanner } from "@/lib/open-scanner";
import { forgetRoutine } from "@/lib/routine-builder";
import { EVENING_TIPS, MORNING_TIPS } from "@/lib/skin-tips";
import { HOME_TILE } from "@/lib/tokens";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * Home (per #155, handoff_home_and_tip): "Hi there!", one top card — Start
 * your routine, or today's routine once there is one — Explore's two tiles,
 * and the skincare tip in its envelope.
 */

jest.setTimeout(30_000);

jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn(), prefetch: jest.fn() }, useIsFocused: () => true }));
jest.mock("@/lib/open-scanner", () => ({ openScanner: jest.fn() }));
// The catalogue read, which one test makes fail.
jest.mock("@/data/api", () => {
  const actual = jest.requireActual("@/data/api");
  return { ...actual, fetchProducts: jest.fn(actual.fetchProducts) };
});
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
  // Skin needs is behind a dev-only switch (#467); on here, as the tests below were written with it.
  useAppStore.setState({ skinNeedsEnabled: true });
});
afterEach(() => {
  forgetRoutine();
  jest.useRealTimers();
  useAppStore.setState({ profile: EMPTY_PROFILE, routineActives: [], routinePicks: {}, routineStarted: false, routineBuilt: false, tipRead: null, skinNeedsEnabled: false });
  jest.mocked(router.push).mockClear();
});

it("has no Skin needs tile, and warms nothing of it, while the switch is off (#467)", async () => {
  useAppStore.setState({ skinNeedsEnabled: false });
  await render(<Home />);
  expect(screen.getByRole("button", { name: "Scan Any Product" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Find Your Actives" })).toBeNull();
  // Alone in its row it is a wide card, not a square the width of the screen.
  expect(screen.getByRole("button", { name: "Scan Any Product" }).children[0]).toHaveStyle({ aspectRatio: 2 });
  await act(async () => jest.runOnlyPendingTimers());
  expect(router.prefetch).not.toHaveBeenCalledWith("/journey");
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

it("gives both Explore tiles one tint, so the routine card is the only warm one", async () => {
  await render(<Home />);
  for (const tile of ["Scan Any Product", "Find Your Actives"]) {
    // The tint sits on the card inside the pressable (BounceCard's animated view).
    expect(screen.getByRole("button", { name: tile }).children[0]).toHaveStyle({ backgroundColor: HOME_TILE.tile });
  }
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
  // Grey placeholders hold the card's and the tip's place until then: never a blank.
  expect(screen.getByRole("progressbar", { name: "Loading your skincare routine" })).toBeTruthy();
  expect(screen.getByRole("progressbar", { name: "Loading your skincare tip" })).toBeTruthy();
  await waitFor(() => expect(screen.getByRole("button", { name: /^Your skincare routine\. This morning · \d steps\./ })).toBeTruthy());
  expect(screen.queryByRole("progressbar")).toBeNull();
});

it("shows a remembered routine at once, and checks it against the catalogue again each time Home is shown", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" }, routineBuilt: true });
  const first = await render(<Home />);
  await waitFor(() => expect(screen.getByRole("button", { name: /^Your skincare routine\./ })).toBeTruthy());
  const reads = jest.mocked(api.fetchProducts).mock.calls.length;
  await act(async () => first.unmount());
  await render(<Home />);
  // The one remembered for this profile is there at once, with no placeholder...
  expect(screen.getByRole("button", { name: /^Your skincare routine\./ })).toBeTruthy();
  expect(screen.queryByRole("progressbar")).toBeNull();
  // ...and the catalogue is read again to see whether it still holds.
  await waitFor(() => expect(jest.mocked(api.fetchProducts).mock.calls.length).toBeGreaterThan(reads));
});

it("shows the card, not a skeleton for ever, when the catalogue can't be read", async () => {
  jest.mocked(api.fetchProducts).mockRejectedValueOnce(new Error("offline"));
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" }, routineBuilt: true });
  await render(<Home />);
  await waitFor(() => expect(screen.getByRole("button", { name: /^Your skincare routine\. This morning · \d steps\./ })).toBeTruthy());
  expect(screen.queryByRole("progressbar")).toBeNull();
});

it("counts products of one's own in the routine as a routine, with no skin profile built for it", async () => {
  useAppStore.setState({ routinePicks: { "evening:treatment": "retinol" } });
  await render(<Home />);
  expect(screen.queryByRole("button", { name: /^Start your routine/ })).toBeNull();
  expect(screen.getByRole("button", { name: /^Your skincare routine\./ })).toBeTruthy();
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
  // It opens once the envelope's place on the page has been read, a moment after the tap.
  await waitFor(() => expect(MORNING_TIPS.some((candidate) => screen.queryByText(candidate.tip))).toBe(true));
  const shown = MORNING_TIPS.find((candidate) => screen.queryByText(candidate.tip));
  expect(shown).toBeTruthy();
  expect(screen.getByText(shown!.why)).toBeTruthy();
  expect(screen.getByText("This morning · SPF")).toBeTruthy();
  // One Close for a screen reader: the dim area behind the note is not a second one.
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  // The note folds away, then it is gone.
  await waitFor(() => expect(screen.queryByText(shown!.tip)).toBeNull());
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
