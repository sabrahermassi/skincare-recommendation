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
// Skin match opens first (owner).
const showSafety = () => fireEvent.press(screen.getByRole("tab", { name: "Ingredients" }));

afterEach(() => {
  clearLabelRead();
  mockParams = {};
  useAppStore.setState({ profile: EMPTY_PROFILE, history: [] });
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

  it("opens an ingredient from the list", async () => {
    await open(LIST);
    await showSafety();
    await fireEvent.press(screen.getByLabelText(/^Linalool,/));
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: "/ingredient/[inci]" }));
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
