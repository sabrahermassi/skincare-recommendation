import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import Routine from "@/app/routine";
import { fetchProducts, fetchProductsByIds } from "@/data/api";
import type { ProductType, ProductWithIngredients } from "@/data/types";
import { forgetRoutine } from "@/lib/routine-builder";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The Skincare routine screen: with no skin profile it asks for one, and the
 * button opens the skin quiz; with one, morning and evening steps, each with
 * the catalogue's best matches for that skin (owner, 2 October 2026).
 */

jest.setTimeout(30000);

const mockOpenQuiz = jest.fn();
jest.mock("@/lib/open-quiz", () => ({ openQuiz: () => mockOpenQuiz() }));
let mockFocused = true;
let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true }, useIsFocused: () => mockFocused, useLocalSearchParams: () => mockParams }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/data/api", () => ({ fetchProducts: jest.fn(), fetchProductsByIds: jest.fn() }));
const mockOpenScanner = jest.fn();
jest.mock("@/lib/open-scanner", () => ({ openScanner: (...args: unknown[]) => mockOpenScanner(...args) }));
const fetched = jest.mocked(fetchProducts);
const fetchedByIds = jest.mocked(fetchProductsByIds);

const product = (id: string, type: ProductType, name: string, extra: string[] = []): ProductWithIngredients =>
  ({
    id,
    barcode: id,
    brand: "Brand",
    name,
    type,
    productType: type,
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    fetchedAt: "2026-09-26T00:00:00Z",
    ingredientIds: [],
    ingredients: ["water", "glycerin", "butylene glycol", "sodium hyaluronate", ...extra].map((n) => ({ id: n, name: n, comedogenic: 0, safety: "safe", verified: true })),
  }) as ProductWithIngredients;

const CATALOGUE = [
  product("c1", "cleanser", "Foaming gel"),
  product("m1", "moisturizer", "Day cream"),
  product("m2", "moisturizer", "Night cream", ["niacinamide"]),
  product("s1", "sunscreen", "Sun fluid"),
  product("t1", "serum", "BHA serum", ["salicylic acid"]),
];
const ACNE = { ...EMPTY_PROFILE, baseSkinType: "oily" as const, concerns: ["acne-prone" as const] };

beforeEach(() => {
  useAppStore.setState({ profile: EMPTY_PROFILE });
  fetched.mockReset();
  fetched.mockResolvedValue([]);
  fetchedByIds.mockReset();
  fetchedByIds.mockImplementation(async (ids: string[]) => ({ ok: true, value: CATALOGUE.filter((p) => ids.includes(p.id)) }));
  useAppStore.setState({ routinePicks: {}, routineActives: [], routineStarted: false, routineBuilt: false, routineStepLimit: 4 });
  jest.mocked(router.push).mockClear();
  mockFocused = true;
  mockParams = {};
  forgetRoutine();
});

/** The screen with its routine built: the catalogue read, and scored in its batches. */
async function open() {
  await render(<Routine />);
  await waitFor(() => expect(screen.queryByText("Building your skincare routine…")).toBeNull());
}

it("asks for a skin profile first, and opens the quiz from Take the skin quiz", async () => {
  await render(<Routine />);
  expect(screen.getByRole("header", { name: "Your skin profile is empty" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Take the skin quiz" }));
  expect(mockOpenQuiz).toHaveBeenCalledTimes(1);
});

it("builds the first routine only when it is opened, so Home shows it from then on (owner)", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  expect(useAppStore.getState().routineBuilt).toBe(false);
  await open();
  expect(useAppStore.getState().routineBuilt).toBe(true);
});

it("doesn't count as built while drawn ahead of the tap from Home", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  mockFocused = false;
  await render(<Routine />);
  expect(useAppStore.getState().routineBuilt).toBe(false);
  mockFocused = true;
});

it("lays out the morning steps, and the evening's from the switch", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  await open();
  // The week shows with or without actives added from Skin needs (hand-off R1), on today.
  expect(screen.getByText(/^Steps for (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/)).toBeTruthy();
  expect(screen.getAllByRole("tab").filter((tab) => /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d+$/.test(String(tab.props.accessibilityLabel)))).toHaveLength(7);
  // The switch says which half of the day it is; no caption repeats it.
  expect(screen.queryByText("good morning")).toBeNull();
  // By day: Cleansing, Serum, Moisturiser, Sunscreen.
  for (const step of ["Cleansing", "Serum", "Moisturiser", "Sunscreen"]) expect(screen.getByText(step)).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  // By night it cleanses twice, then the treatment and a moisturiser (owner).
  for (const step of ["First cleanse", "Cleansing", "Treatment", "Moisturiser"]) expect(screen.getByText(step)).toBeTruthy();
  expect(screen.queryByText("Sunscreen")).toBeNull();
  expect(screen.queryByText("Serum")).toBeNull();
});

it("has the morning steps simply there, and brings the evening's in from clear", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  await open();
  expect(screen.getByTestId("swap-fade")).toHaveStyle({ opacity: 1 });
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  expect(screen.getByTestId("swap-fade")).toHaveStyle({ opacity: 0 });
});

it("numbers each step plainly, with no dotted connectors between them (v9)", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  await open();
  // The week's dates can share a number with a step, so each is there at least once.
  for (const n of ["1", "2", "3", "4"]) expect(screen.getAllByText(n).length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: /^Scan one to check, for / })).toHaveLength(4);
});

it("shows the building screen until the routine is built, then that none was picked where the catalogue has none", async () => {
  useAppStore.setState({ profile: ACNE });
  let arrive: (products: ProductWithIngredients[]) => void = () => undefined;
  fetched.mockReturnValue(new Promise((resolve) => (arrive = resolve)));
  await render(<Routine />);
  expect(screen.getByText("Building your skincare routine…")).toBeTruthy();
  // Not shown until it is built (owner): no steps behind the loading screen.
  expect(screen.queryByText(/^Steps for /)).toBeNull();
  await act(async () => arrive([]));
  await waitFor(() => expect(screen.queryByText("Building your skincare routine…")).toBeNull());
  // Three basic steps with nothing picked, and the serum step with its active and nothing to suggest.
  expect(screen.getAllByText("No product picked yet.")).toHaveLength(3);
  expect(screen.getByText("No product to suggest yet.")).toBeTruthy();
});

it("names the best match for each step, and opens the product screen from it", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  expect(screen.getByText("Foaming gel")).toBeTruthy();
  expect(screen.getByText("Sun fluid")).toBeTruthy();
  // The name leads: semibold, over a verdict line one step lighter.
  expect(screen.getByText("Foaming gel")).toHaveStyle({ fontWeight: "600" });
  expect(screen.getAllByText(/ match · \d+\/100$/)[0]).toHaveStyle({ fontWeight: "500" });
  // The serum step has nothing gentle to name for acne here: its active leads, in big letters.
  expect(screen.getByText("Azelaic acid")).toBeTruthy();
  expect(screen.getByText("For acne.")).toBeTruthy();
  expect(screen.getByText("No product to suggest yet.")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: /^Brand Foaming gel\. / }));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/product/[id]", params: { id: "c1" } });
});

// One product a step (owner, 2 October 2026): a shortlist left the choosing to
// someone who came to be told.
it("suggests one product a step, with no list of others to choose from", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  // Two moisturisers in the catalogue: only the better match is named.
  expect(screen.getAllByText(/cream$/)).toHaveLength(1);
  expect(screen.queryByRole("button", { name: /more for/ })).toBeNull();
});

it("names a treatment with the active for the concern in the evening, with what to look for and a way to scan one", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  expect(screen.getByText("BHA serum")).toBeTruthy();
  // The step is named for the active that serum holds.
  expect(screen.getByText("Salicylic acid")).toBeTruthy();
  expect(screen.getByText("For acne. Benzoyl peroxide or Retinoids would do too.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Scan one to check, for treatment" })).toBeTruthy();
});

it("starts a scan from a step carrying that step, so the result can add the product there", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  await fireEvent.press(screen.getByRole("button", { name: "Scan one to check, for treatment" }));
  expect(mockOpenScanner).toHaveBeenCalledWith({ step: "evening:treatment" });
});

it("says so when the catalogue cannot be read, and tries again from there", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockRejectedValue(new Error("offline"));
  await open();
  expect(screen.getByText("We couldn't load products, so the steps have none yet.")).toBeTruthy();
  expect(screen.getAllByText("No product picked yet.")).toHaveLength(3);
  expect(screen.getByText("Azelaic acid")).toBeTruthy();
});

// Home draws this screen ahead of the tap, and the skin quiz opens over it and
// changes the profile with every answer. Scoring the catalogue then froze the
// app while nobody was looking at the routine (owner, 2 October 2026).
it("neither reads the catalogue nor builds a routine while it is not the screen showing", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  mockFocused = false;
  const view = await render(<Routine />);
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(fetched).not.toHaveBeenCalled();
  expect(screen.getByText("Building your skincare routine…")).toBeTruthy();
  // Not shown until it is built (owner): no steps behind the loading screen.
  expect(screen.queryByText(/^Steps for /)).toBeNull();

  // Shown: now it reads and builds.
  mockFocused = true;
  await view.rerender(<Routine />);
  await waitFor(() => expect(screen.getByText("Foaming gel")).toBeTruthy());
  expect(fetched).toHaveBeenCalledTimes(1);

  // An answer changed behind another screen: the old routine is not shown as
  // if it were for the new profile, and nothing is rebuilt until it is back.
  mockFocused = false;
  await act(async () => useAppStore.setState({ profile: { ...ACNE, sensitivity: "high" } }));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(screen.queryByText("Foaming gel")).toBeNull();
  mockFocused = true;
  await view.rerender(<Routine />);
  await waitFor(() => expect(screen.getByText("Foaming gel")).toBeTruthy());
  // Once per build: the first, and the one for the changed profile.
  expect(fetched).toHaveBeenCalledTimes(2);
});

// The screen is drawn afresh on every visit; scoring the catalogue again each
// time made every visit wait a second for its products (owner).
it("shows the routine at once on a second visit, without building it again", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  const first = await render(<Routine />);
  await waitFor(() => expect(screen.getByText("Foaming gel")).toBeTruthy());
  await act(async () => first.unmount());

  await render(<Routine />);
  // There on the first frame: no building screen to wait through.
  expect(screen.getByText("Foaming gel")).toBeTruthy();
  expect(screen.queryByText("Building your skincare routine…")).toBeNull();
});

it("builds it again when the catalogue it reads has changed", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  const first = await render(<Routine />);
  await waitFor(() => expect(screen.getByText("Foaming gel")).toBeTruthy());
  await act(async () => first.unmount());

  fetched.mockResolvedValue([product("c2", "cleanser", "Cream wash"), ...CATALOGUE.slice(1)]);
  await render(<Routine />);
  await waitFor(() => expect(screen.getByText("Cream wash")).toBeTruthy());
  expect(screen.queryByText("Foaming gel")).toBeNull();
});

it("leads with the skin profile it is built from, as a way in", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  await fireEvent.press(screen.getByRole("button", { name: "Your skin profile. Your skincare routine is based on this." }));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/skin-profile", params: {} });
});

// "Add to my routine" (owner, 2 October 2026): a product the person added
// stands in its step in front of ours, and can be taken out again.
it("leads a step with the product the person added, and takes it out again", async () => {
  useAppStore.setState({ profile: ACNE, routinePicks: { "morning:moisturise": "m2" } });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  await waitFor(() => expect(screen.getByText("Your pick · Brand")).toBeTruthy());
  expect(screen.getByRole("button", { name: /^Your pick: Brand Night cream\. / })).toBeTruthy();
  // Theirs stands in place of ours, not beside it; taking it out brings ours back.
  expect(screen.getAllByText(/cream$/)).toHaveLength(1);
  await fireEvent.press(screen.getByRole("button", { name: "Remove Night cream from my routine" }));
  expect(useAppStore.getState().routinePicks).toEqual({});
  expect(screen.queryByText("Your pick · Brand")).toBeNull();
  expect(screen.getAllByText(/cream$/)).toHaveLength(1);
});

it("loads the products on Try again", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockRejectedValueOnce(new Error("offline"));
  await open();
  fetched.mockResolvedValue(CATALOGUE);
  await fireEvent.press(screen.getByRole("button", { name: "Try loading products again" }));
  await waitFor(() => expect(screen.getByText("Foaming gel")).toBeTruthy());
  expect(screen.queryByText("We couldn't load products, so the steps have none yet.")).toBeNull();
});

it("warns on a product of one's own that we would no longer pick", async () => {
  // Added when it suited; the profile now says pregnant, and it holds salicylic acid.
  useAppStore.setState({ profile: { ...ACNE, pregnancyStatus: "pregnant" }, routinePicks: { "evening:treatment": "t1" } });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  await waitFor(() => expect(screen.getByText("Your pick · Brand")).toBeTruthy());
  expect(screen.getByText("We wouldn't pick this for your skin profile as it is now.")).toBeTruthy();
});

it("keeps the place of a product of one's own that cannot be shown, so it can still be taken out", async () => {
  useAppStore.setState({ profile: ACNE, routinePicks: { "morning:moisturise": "gone" } });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  await waitFor(() => expect(screen.getByText("Your pick for this step can't be shown right now.")).toBeTruthy());
  await fireEvent.press(screen.getByRole("button", { name: "Remove my pick from this step" }));
  expect(useAppStore.getState().routinePicks).toEqual({});
});

// Found in review on #394: the step named a retinoid or salicylic acid with
// nothing about pregnancy for a profile that had not answered that question.
it("says the pregnancy caution under a step's active when the profile does not say either way", async () => {
  useAppStore.setState({ profile: ACNE });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  expect(screen.getByText("Salicylic acid")).toBeTruthy();
  expect(screen.getByText("Commonly advised against while pregnant or breastfeeding.")).toBeTruthy();
});

it("leaves the caution out once the profile says not pregnant", async () => {
  useAppStore.setState({ profile: { ...ACNE, pregnancyStatus: "neither" } });
  fetched.mockResolvedValue(CATALOGUE);
  await open();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  expect(screen.getByText("Salicylic acid")).toBeTruthy();
  expect(screen.queryByText("Commonly advised against while pregnant or breastfeeding.")).toBeNull();
});

describe("by day, with actives added from Skin needs (design_handoff october 3d, R1–R3)", () => {
  const BHA_NIGHTS = { active: "bha" as const, time: "evening" as const, days: [0, 3] };
  // Monday the 28th of September 2026, so Monday is today.
  beforeEach(() => jest.useFakeTimers({ now: new Date(2026, 8, 28, 9), toFake: ["Date"] }));
  afterEach(() => jest.useRealTimers());

  it("shows the week, opens on today, and names tonight's active with a product that holds it", async () => {
    useAppStore.setState({ profile: ACNE, routineActives: [BHA_NIGHTS] });
    fetched.mockResolvedValue(CATALOGUE);
    await open();
    expect(screen.getByRole("tab", { name: "Monday 28, an active" }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole("tab", { name: "Thursday 1, an active" })).toBeTruthy();
    expect(screen.getByText("Steps for Monday")).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
    expect(screen.getByText("Tonight’s active")).toBeTruthy();
    expect(screen.getByText("BHA")).toBeTruthy();
    expect(screen.getByText("A 0.5–2% leave-on, fragrance-free.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /BHA serum/ })).toBeTruthy();
  });

  it("scans from an added active's row to check a product only, with no step to add it to", async () => {
    useAppStore.setState({ profile: ACNE, routineActives: [BHA_NIGHTS] });
    fetched.mockResolvedValue(CATALOGUE);
    await open();
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
    mockOpenScanner.mockClear();
    await fireEvent.press(screen.getByRole("button", { name: "Scan one to check, for tonight’s active" }));
    expect(mockOpenScanner).toHaveBeenCalledWith(undefined);
    // The steps around it still carry theirs.
    await fireEvent.press(screen.getByRole("button", { name: "Scan one to check, for moisturiser" }));
    expect(mockOpenScanner).toHaveBeenLastCalledWith({ step: "evening:moisturise" });
  });

  it("calls a night without one a rest night, and says when the next is", async () => {
    useAppStore.setState({ profile: ACNE, routineActives: [BHA_NIGHTS] });
    await open();
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Tuesday 29" })));
    expect(screen.getByText("Rest night")).toBeTruthy();
    expect(screen.getByText("No active tonight. Next BHA: Thursday.")).toBeTruthy();
    expect(screen.queryByText("Treatment")).toBeNull();
  });

  it("asks not to skip the sunscreen on a morning with an active", async () => {
    useAppStore.setState({ profile: ACNE, routineActives: [{ active: "vitamin-c", time: "morning", days: [0, 2, 4] }] });
    await open();
    expect(screen.getByText("Today’s active")).toBeTruthy();
    expect(screen.getByText("Sunscreen · don’t skip")).toBeTruthy();
    expect(screen.getByText("SPF 50 keeps Vitamin C working.")).toBeTruthy();
  });

  it("takes an added active out with Remove", async () => {
    useAppStore.setState({ profile: ACNE, routineActives: [BHA_NIGHTS] });
    await open();
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Take BHA out of my routine" })));
    expect(useAppStore.getState().routineActives).toEqual([]);
  });

  it("shows a routine started from a story without a skin profile: its steps, nothing picked", async () => {
    useAppStore.setState({ profile: EMPTY_PROFILE, routineStarted: true, routineActives: [BHA_NIGHTS] });
    await render(<Routine />);
    expect(screen.queryByRole("header", { name: "Your skin profile is empty" })).toBeNull();
    expect(screen.getByText("Steps for Monday")).toBeTruthy();
    expect(fetched).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole("button", { name: /Your skin profile is empty\. Fill it in/ }));
    expect(mockOpenQuiz).toHaveBeenCalled();
  });

  it("changes the step limit it was started with", async () => {
    useAppStore.setState({ profile: ACNE, routineActives: [BHA_NIGHTS] });
    await open();
    await act(async () => fireEvent.press(screen.getByRole("radio", { name: "5 steps per routine" })));
    expect(useAppStore.getState().routineStepLimit).toBe(5);
  });
});

it("closes with an X on the right, not a back arrow, when opened from a Skin needs story", async () => {
  mockParams = { from: "story" };
  await render(<Routine />);
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  await fireEvent.press(screen.getByRole("button", { name: "Close" }));
  expect(router.back).toHaveBeenCalled();
});

it("opens the skin profile with the same X when it was itself opened from a story", async () => {
  mockParams = { from: "story" };
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  await open();
  await fireEvent.press(screen.getByRole("button", { name: /^Your skin profile\./ }));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/skin-profile", params: { from: "story" } });
});

// #405: a shield beside the verdict on a product the person added, when #404's check applies.
describe("a pick the EU safety notice applies to", () => {
  const HICC = {
    id: "hicc",
    name: "hydroxyisohexyl 3-cyclohexene carboxaldehyde",
    comedogenic: 0 as const,
    safety: "avoid" as const,
    verified: true,
    note: "Prohibited in cosmetics (EU Annex II/1380: not allowed on the EU market since 23 August 2019 and not to be sold there since 23 August 2021; older stock may still be around)",
  };
  const SHIELD = "Contains an ingredient not permitted in EU cosmetics. Check the label.";
  const own = () => {
    const base = product("m9", "moisturizer", "Night cream");
    return { ...base, ingredients: [...base.ingredients, HICC], ingredientIds: [...base.ingredientIds, HICC.id] };
  };
  async function openOwn() {
    useAppStore.setState({ profile: ACNE, routinePicks: { "morning:moisturise": "m9" } });
    fetched.mockResolvedValue(CATALOGUE);
    fetchedByIds.mockImplementation(async (ids: string[]) => ({ ok: true, value: [...CATALOGUE, own()].filter((p) => ids.includes(p.id)) }));
    await open();
    await waitFor(() => expect(screen.getByText("Your pick · Brand")).toBeTruthy());
  }
  afterEach(() => useAppStore.setState({ safetyNoticeEnabled: false }, false));

  it("says it in the row's label, with the flag on", async () => {
    useAppStore.setState({ safetyNoticeEnabled: true }, false);
    await openOwn();
    expect(screen.getByRole("button", { name: new RegExp(`^Your pick: Brand Night cream\\..*${SHIELD.replace(/\./g, "\\.")}$`) })).toBeTruthy();
  });

  // Codex review on #415: a pick with no score (a formula too short to read) must still say it.
  it("says it for a pick with no score too", async () => {
    useAppStore.setState({ safetyNoticeEnabled: true }, false);
    const base = product("m9", "moisturizer", "Night cream");
    const short = { ...base, ingredients: [HICC], ingredientIds: [HICC.id] };
    useAppStore.setState({ profile: ACNE, routinePicks: { "morning:moisturise": "m9" } });
    fetched.mockResolvedValue(CATALOGUE);
    fetchedByIds.mockImplementation(async (ids: string[]) => ({ ok: true, value: [...CATALOGUE, short].filter((p) => ids.includes(p.id)) }));
    await open();
    await waitFor(() => expect(screen.getByText("Your pick · Brand")).toBeTruthy());
    const row = screen.getByRole("button", { name: /^Your pick: Brand Night cream\./ });
    expect(row.props.accessibilityLabel).not.toContain("out of 100");
    expect(row.props.accessibilityLabel).toContain(SHIELD);
  });

  it("says nothing with the flag off", async () => {
    await openOwn();
    const row = screen.getByRole("button", { name: /^Your pick: Brand Night cream\. / });
    expect(row.props.accessibilityLabel).not.toContain("not permitted");
  });
});
