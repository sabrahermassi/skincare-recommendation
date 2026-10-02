import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * Saved, History and Ingredients (v9): one list layout, stone cards under a
 * caps group label. Untapping a saved card's heart or a starred ingredient's
 * star takes it off at once, with an Undo toast; only History swipes to a bin,
 * which asks first ("Delete product?").
 */

jest.setTimeout(30000);

const mockPush = jest.fn();
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: { push: (...a: unknown[]) => mockPush(...a), navigate: jest.fn() },
    useScrollToTop: () => undefined,
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => effect(), []); // eslint-disable-line react-hooks/exhaustive-deps
    },
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { useAppStore, EMPTY_PROFILE } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");
const Saved = (require("@/app/(tabs)/saved") as { default: () => React.JSX.Element }).default;

const NAME = "Aqua Barrier Ceramide Moisturizer";

const viewed = (id: string) => ({
  id,
  known: true,
  firstSeenAt: 1,
  lastSeenAt: Date.now(),
  seenCount: 1,
  scoreAtView: 72,
  warningsAtView: 0,
});

beforeEach(() => {
  useAppStore.setState({ profile: EMPTY_PROFILE, savedProducts: [], savedIngredients: [], history: [], shelfOwner: null });
});

describe("unsaving from Saved", () => {
  it("takes a saved product off the shelf at once when its heart is untapped, and offers Undo", async () => {
    useAppStore.setState({ savedProducts: [{ id: "aqua-ceramide-cream", savedAt: 1 }] });
    await render(<Saved />);
    expect(await screen.findByText(NAME)).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Remove from saved" })));
    expect(useAppStore.getState().savedProducts).toEqual([]);
    expect(screen.queryByText("Remove from saved?")).toBeNull();
    expect(screen.getByText("Removed from saved")).toBeTruthy();
    expect(screen.getByText("No products saved yet")).toBeTruthy();
  });

  // Undo is why it no longer asks first about a note: the note comes back too.
  it("puts the product back with its date, step and note on Undo", async () => {
    const entry = { id: "aqua-ceramide-cream", savedAt: 5, note: "Stings a bit", routineStep: 3 as const };
    useAppStore.setState({ savedProducts: [{ id: "snail-repair-ampoule", savedAt: 9 }, entry] });
    await render(<Saved />);
    expect(await screen.findByText(NAME)).toBeTruthy();

    await act(async () => fireEvent.press(screen.getAllByRole("button", { name: "Remove from saved" })[1]));
    expect(useAppStore.getState().savedProducts.map((p) => p.id)).toEqual(["snail-repair-ampoule"]);
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Undo" })));
    expect(useAppStore.getState().savedProducts).toEqual([{ id: "snail-repair-ampoule", savedAt: 9 }, entry]);
    expect(screen.queryByTestId("undo-toast")).toBeNull();
  });

  it("drops the toast after four seconds", async () => {
    jest.useFakeTimers();
    try {
      useAppStore.setState({ savedProducts: [{ id: "aqua-ceramide-cream", savedAt: 1 }] });
      await render(<Saved />);
      expect(await screen.findByText(NAME)).toBeTruthy();
      await act(async () => fireEvent.press(screen.getByRole("button", { name: "Remove from saved" })));
      expect(screen.getByTestId("undo-toast")).toBeTruthy();
      await act(async () => jest.advanceTimersByTime(4000));
      expect(screen.queryByTestId("undo-toast")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("History", () => {
  async function openHistory() {
    await render(<Saved />);
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: /History/ })));
    await screen.findByText(NAME);
  }

  it("shows the score it had then, and saves from the heart", async () => {
    useAppStore.setState({ history: [viewed("aqua-ceramide-cream")] });
    await openHistory();
    expect(screen.getByRole("button", { name: /72 out of 100$/ })).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Save" })));
    expect(useAppStore.getState().savedProducts.map((p) => p.id)).toEqual(["aqua-ceramide-cream"]);
  });

  it("asks before deleting from the bin, and deletes only on Delete", async () => {
    useAppStore.setState({ history: [viewed("aqua-ceramide-cream")] });
    await openHistory();

    await act(async () => fireEvent.press(screen.getByRole("button", { name: `Delete ${NAME}` })));
    expect(screen.getByText("Delete product?")).toBeTruthy();
    expect(useAppStore.getState().history).toHaveLength(1);

    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Delete" })));
    expect(useAppStore.getState().history).toEqual([]);
  });

  it("says whether it was scanned or opened (v9), and when for an older entry", async () => {
    useAppStore.setState({
      history: [
        { ...viewed("aqua-ceramide-cream"), source: "scanned" as const },
        { ...viewed("snail-repair-ampoule"), source: "opened" as const },
        viewed("hanbang-rice-serum"),
      ],
    });
    await openHistory();
    expect(screen.getByText(/· Scanned$/)).toBeTruthy();
    expect(screen.getByText(/· Opened$/)).toBeTruthy();
    expect(screen.getByText(/· just now$/i)).toBeTruthy();
    expect(screen.queryByText(/Checked \d+ times/)).toBeNull();
  });

  it("keeps the entry when the confirmation is closed with its X", async () => {
    useAppStore.setState({ history: [viewed("aqua-ceramide-cream")] });
    await openHistory();

    await act(async () => fireEvent.press(screen.getByRole("button", { name: `Delete ${NAME}` })));
    // One button on this sheet (owner): the X is the way out.
    expect(screen.queryByRole("button", { name: "Keep it" })).toBeNull();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Close" })));
    expect(useAppStore.getState().history).toHaveLength(1);
  });
});

describe("Ingredients", () => {
  async function openIngredients() {
    useAppStore.setState({ savedIngredients: ["niacinamide"] });
    await render(<Saved />);
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: /Ingredients/ })));
    await screen.findByText("Niacinamide");
  }

  it("unstars at once from the star, with no swipe and no question, and Undo puts it back", async () => {
    await openIngredients();
    expect(screen.queryByRole("button", { name: "Delete Niacinamide" })).toBeNull();

    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Remove from starred ingredients" })));
    expect(useAppStore.getState().savedIngredients).toEqual([]);
    expect(screen.getByText("Removed from starred")).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Undo" })));
    expect(useAppStore.getState().savedIngredients).toEqual(["niacinamide"]);
  });
});

// Every tab stays mounted so a change only fades (owner: no hard cut), but
// only the tab showing is heard by a screen reader.
it("keeps the other tabs mounted but hidden when switching", async () => {
  useAppStore.setState({ history: [viewed("aqua-ceramide-cream")] });
  await render(<Saved />);
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: /History/ })));
  expect(await screen.findByRole("button", { name: `Delete ${NAME}` })).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByRole("tab", { name: /Saved/ })));
  expect(screen.queryByRole("button", { name: `Delete ${NAME}` })).toBeNull();
  expect(screen.getByRole("button", { name: `Delete ${NAME}`, includeHiddenElements: true })).toBeTruthy();
});

it("offers the first scan on an empty Saved, and no button on an empty History or Ingredients", async () => {
  await render(<Saved />);
  expect(await screen.findByText("No products saved yet")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Scan your first product" })).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "History" })));
  expect(await screen.findByText("Nothing checked yet")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Scan your first product" })).toBeNull();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Ingredients" })));
  expect(await screen.findByText("No starred ingredients yet")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Scan your first product" })).toBeNull();
});

it("shows a label photo in History and opens that same result", async () => {
  useAppStore.setState({
    history: [
      { id: "label-7", known: false, firstSeenAt: 1, lastSeenAt: Date.now(), seenCount: 1, scoreAtView: 64, warningsAtView: 0, label: ["water", "glycerin", "niacinamide"], labelNo: 2 },
      // Scanned before label photos were numbered: it keeps its old name.
      { id: "label-3", known: false, firstSeenAt: 1, lastSeenAt: Date.now() - 1000, seenCount: 1, scoreAtView: 50, warningsAtView: 0, label: ["water", "glycerin"] },
    ],
  });
  await render(<Saved />);
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "History" })));
  // Numbered, and named by what says most about it (owner): its active first.
  expect(await screen.findByText("Product 2: Niacinamide, Glycerin")).toBeTruthy();
  expect(screen.getByText("Label photo: Glycerin")).toBeTruthy();
  const card = screen.getByRole("button", { name: /^Product 2: Niacinamide, Glycerin, 3 ingredients, Scanned · we don't have this product/ });
  expect(screen.getByLabelText("64 out of 100")).toBeTruthy();
  await act(async () => fireEvent.press(card));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/label-result", params: { entry: "label-7" } });
});

describe("v9 list layout", () => {
  it("has no swipe-to-remove on Saved", async () => {
    useAppStore.setState({ savedProducts: [{ id: "aqua-ceramide-cream", savedAt: 1 }] });
    await render(<Saved />);
    expect(await screen.findByText("1 product")).toBeTruthy();
    expect(screen.queryByRole("button", { name: `Remove ${NAME}` })).toBeNull();
    expect(screen.queryByText(/Swipe left/)).toBeNull();
  });

  it("clears the whole shelf from Clear all, after asking with one Delete button", async () => {
    useAppStore.setState({ savedProducts: [{ id: "aqua-ceramide-cream", savedAt: 1 }] });
    await render(<Saved />);
    await screen.findByText(NAME);
    await act(async () => fireEvent.press(screen.getAllByRole("button", { name: "Clear all" })[0]));
    expect(screen.getByText("Clear all saved?")).toBeTruthy();
    expect(useAppStore.getState().savedProducts).toHaveLength(1);
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Delete" })));
    expect(useAppStore.getState().savedProducts).toEqual([]);
  });

  it("shows a dash for a product with no score", async () => {
    useAppStore.setState({ history: [{ ...viewed("aqua-ceramide-cream"), scoreAtView: null }] });
    await render(<Saved />);
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: /History/ })));
    await screen.findByText(NAME);
    expect(screen.getByText("–", { includeHiddenElements: true })).toBeTruthy();
  });

  it("groups History into today and earlier", async () => {
    const day = 24 * 60 * 60 * 1000;
    useAppStore.setState({ history: [viewed("aqua-ceramide-cream"), { ...viewed("hanbang-rice-serum"), lastSeenAt: Date.now() - 30 * day }] });
    await render(<Saved />);
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: /History/ })));
    await screen.findByText(NAME);
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Earlier")).toBeTruthy();
  });

  it("shows a starred ingredient's verdict under its name", async () => {
    useAppStore.setState({ savedIngredients: ["niacinamide"] });
    await render(<Saved />);
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: /Ingredients/ })));
    await screen.findByText("Niacinamide");
    expect(screen.getByText("1 starred")).toBeTruthy();
    expect(screen.getByLabelText(/^Niacinamide, /)).toBeTruthy();
  });
});
