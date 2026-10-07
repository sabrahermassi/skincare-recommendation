import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { router } from "expo-router";

import LabelResult from "@/app/label-result";
import { clearLabelRead, holdLabelRead } from "@/lib/pending-label";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/** With no skin profile a sheet rises over the result (v9) and nothing behind it can be reached: put it away. */
async function putTeaserAway() {
  const close = screen.queryByRole("button", { name: "Close" });
  if (close) await fireEvent.press(close);
}

/**
 * A photographed label's result: the same Skin match / Ingredients tabs as a
 * catalogue product, the Ingredients tab the same with or without a skin profile,
 * and a retake in place of the quiz for a read too thin to score.
 */

// The first render loads the screen's whole module graph.
jest.setTimeout(30_000);

let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), dismissTo: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const RECOGNISED: Record<string, { safety: string }> = {
  water: { safety: "safe" },
  glycerin: { safety: "safe" },
  "xanthan gum": { safety: "safe" },
  "butylene glycol": { safety: "safe" },
  parfum: { safety: "safe" },
  linalool: { safety: "caution" },
};

jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  resolveIngredientNames: (names: string[]) =>
    Promise.resolve(
      names.map((name) => ({
        id: name,
        name,
        comedogenic: 0,
        safety: RECOGNISED[name]?.safety ?? "safe",
        verified: name in RECOGNISED,
      })),
    ),
}));

async function open(names: string[]) {
  holdLabelRead({ ingredients: names });
  await render(<LabelResult />);
  await act(async () => {});
  await putTeaserAway();
}
/** The result as it opens, with whatever sheet it raises left up. */
async function openOnly(names: string[]) {
  holdLabelRead({ ingredients: names });
  await render(<LabelResult />);
  await act(async () => {});
}
// Skin match opens first (owner).
const showSafety = () => fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));

// Skin needs is behind a dev-only switch (#467): on here, off in the test that says so.
beforeEach(() => useAppStore.setState({ skinNeedsEnabled: true }));
afterEach(() => {
  clearLabelRead();
  mockParams = {};
  useAppStore.setState({ profile: EMPTY_PROFILE, history: [], skinNeedsEnabled: false });
});

const LIST = ["water", "glycerin", "xanthan gum", "butylene glycol", "parfum", "linalool", "mystery extract"];
const COUNT = "Read from your photo · 6 of 7 names recognised";

describe("the label result", () => {
  it("shows the same Ingredients tab without a profile and with one", async () => {
    await open(LIST);
    await showSafety();
    expect(screen.getByText(COUNT)).toBeTruthy();
    expect(screen.getByLabelText(/^Irritation risk:/)).toBeTruthy();
    await act(async () => screen.unmount());

    useAppStore.setState({
      profile: { concerns: ["redness"], baseSkinType: "combination", sensitivity: "some", pregnancyStatus: null },
    });
    await open(LIST);
    await showSafety();
    expect(screen.getByText(COUNT)).toBeTruthy();
  });

  // A photo has no name of its own: it is numbered as it goes into History (owner).
  it("names the result by its number in History", async () => {
    await open(LIST);
    expect(screen.getByText("Product 1")).toBeTruthy();
    expect(useAppStore.getState().history[0]).toMatchObject({ labelNo: 1, label: LIST });
  });

  it("opens an ingredient from the list", async () => {
    await open(LIST);
    await showSafety();
    await fireEvent.press(screen.getByLabelText(/^Linalool,/));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/ingredient/[inci]" }));
  });

  // Scanned from Skin needs (owner, 2 October 2026): the answer is whether the
  // list holds an active for what was picked, profile or no profile.
  it("reads a Skin needs link as an ordinary label result while Skin needs is hidden (#467)", async () => {
    useAppStore.setState({ skinNeedsEnabled: false });
    mockParams = { from: "journey", need: "pimples.." };
    await open(["water", "glycerin", "xanthan gum", "butylene glycol"]);
    expect(screen.queryByRole("header", { name: "Not made for pimples" })).toBeNull();
  });

  it("answers for what was picked when the scan came from Skin needs", async () => {
    mockParams = { from: "journey", need: "pimples.." };
    await open(["water", "glycerin", "xanthan gum", "butylene glycol"]);
    expect(screen.getByRole("header", { name: "Not made for pimples" })).toBeTruthy();
    expect(screen.queryByText("Is it right for your skin?")).toBeNull();
    expect(screen.queryByText("/100")).toBeNull();
    await act(async () => screen.unmount());

    mockParams = { from: "journey", need: "hydrate.." };
    await open(["water", "glycerin", "xanthan gum", "butylene glycol"]);
    expect(screen.getByRole("header", { name: "Works on dry skin" })).toBeTruthy();
  });

  // design_handoff "october 3d", D and Dp: Skin needs covers over-the-counter
  // actives only, so a prescription one gets the doctor sheet, once.
  it("says to talk to a doctor first about a prescription active scanned from Skin needs", async () => {
    // The actives they already use go into the story too, for its clash checks.
    mockParams = { from: "journey", need: "lines..no.bha" };
    await openOnly(["water", "tretinoin", "glycerin"]);
    expect(screen.getByRole("header", { name: "Talk to a doctor first" })).toBeTruthy();
    expect(screen.getByText("This has tretinoin, a prescription-strength retinoid. A doctor should guide how you use it.")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Learn about retinol" }));
    expect(router.push).toHaveBeenCalledWith({ pathname: "/journey-story", params: { active: "retinoids", answers: "lines..no.bha" } });
    await act(async () => screen.unmount());

    // Pregnant, breastfeeding or not said: nothing in its place.
    mockParams = { from: "journey", need: "lines.." };
    await openOnly(["water", "tretinoin", "glycerin"]);
    expect(screen.getByText(/usually avoided while pregnant\. Ask your doctor or midwife/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Learn about/ })).toBeNull();
    await act(async () => screen.unmount());

    // Not from Skin needs: the normal result, no sheet.
    mockParams = {};
    await openOnly(["water", "tretinoin", "glycerin"]);
    expect(screen.queryByRole("header", { name: "Talk to a doctor first" })).toBeNull();
  });

  // #346: the quiz in place of an empty score, gone once the answers score.
  it("asks for the skin profile on Skin match, and not once the answers score", async () => {
    await open(LIST);
    await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
    expect(screen.getAllByText("Is it right for your skin?").length).toBeGreaterThan(0);
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "dry" } });
    await open(LIST);
    await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
    expect(screen.queryByText("Is it right for your skin?")).toBeNull();
  });

  it("says a thin read can't be scored, and asks for a retake, not the quiz", async () => {
    await open(["water", "mystery extract", "another unknown"]);
    expect(screen.getByText("Retake the photo")).toBeTruthy();
    await fireEvent.press(screen.getByRole("tab", { name: "Skin match" }));
    expect(screen.getByText(/^We only recognised \d+ of \d+ names$/)).toBeTruthy();
    expect(screen.queryByText("Is it right for your skin?")).toBeNull();
  });
});

// A label photo goes into History with the list it read, so History can open
// the same result again (owner).
describe("History", () => {
  it("logs a new label read once, with its ingredient list", async () => {
    await open(LIST);
    const log = useAppStore.getState().history;
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ known: false, label: LIST });
    expect(log[0].id).toMatch(/^label-/);
  });

  it("opens a logged read again from its entry, without logging it twice", async () => {
    useAppStore.setState({
      history: [{ id: "label-1", known: false, firstSeenAt: 1, lastSeenAt: 1, seenCount: 1, scoreAtView: null, warningsAtView: 0, label: LIST }],
    });
    mockParams = { entry: "label-1" };
    await render(<LabelResult />);
    await act(async () => {});
    await putTeaserAway();
    await showSafety();
    expect(screen.getByText(COUNT)).toBeTruthy();
    expect(useAppStore.getState().history).toHaveLength(1);
  });

  it("shows nothing to show for an entry that isn't on this phone", async () => {
    mockParams = { entry: "label-nope" };
    await render(<LabelResult />);
    expect(screen.getByText(/no ingredient list to show/)).toBeTruthy();
  });
});
