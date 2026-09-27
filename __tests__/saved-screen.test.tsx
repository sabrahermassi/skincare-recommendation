import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * Saved and History (owner's reference): both are white cards with the heart
 * in the corner. Untapping a saved card's heart takes it off the shelf at
 * once; a history card's bin asks "Delete product?" before it deletes, and
 * a starred ingredient's bin asks "Delete ingredient?" the same way.
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

it("takes a saved product off the shelf at once when its heart is untapped, with no Undo", async () => {
  useAppStore.setState({ savedProducts: [{ id: "aqua-ceramide-cream", savedAt: 1 }] });
  await render(<Saved />);
  expect(await screen.findByText(NAME)).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Remove from saved" })));
  expect(useAppStore.getState().savedProducts).toEqual([]);
  expect(screen.queryByText("Undo")).toBeNull();
  expect(screen.getByText("No products saved yet")).toBeTruthy();
});

describe("History", () => {
  async function openHistory() {
    await render(<Saved />);
    await act(async () => fireEvent.press(screen.getByRole("tab", { name: /History/ })));
    await screen.findByText(NAME);
  }

  it("shows the score it had then as a pill, and saves from the heart", async () => {
    useAppStore.setState({ history: [viewed("aqua-ceramide-cream")] });
    await openHistory();
    expect(screen.getByText("72/100")).toBeTruthy();

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

  it("keeps the entry when the confirmation is closed with its X", async () => {
    useAppStore.setState({ history: [viewed("aqua-ceramide-cream")] });
    await openHistory();

    await act(async () => fireEvent.press(screen.getByRole("button", { name: `Delete ${NAME}` })));
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Keep it" })));
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

  it("asks before deleting a starred ingredient from the bin, and deletes only on Delete", async () => {
    await openIngredients();

    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Delete Niacinamide" })));
    expect(screen.getByText("Delete ingredient?")).toBeTruthy();
    expect(useAppStore.getState().savedIngredients).toEqual(["niacinamide"]);

    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Delete" })));
    expect(useAppStore.getState().savedIngredients).toEqual([]);
  });

  it("keeps the ingredient when the question is answered Keep it", async () => {
    await openIngredients();

    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Delete Niacinamide" })));
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Keep it" })));
    expect(useAppStore.getState().savedIngredients).toEqual(["niacinamide"]);
  });
});

it("offers the first scan on an empty Saved, and no button on an empty History or Ingredients", async () => {
  await render(<Saved />);
  expect(await screen.findByText("No products saved yet")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Scan your first product" })).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "History" })));
  expect(await screen.findByText("No history yet")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Scan your first product" })).toBeNull();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Ingredients" })));
  expect(await screen.findByText("No starred ingredients yet")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Scan your first product" })).toBeNull();
});

it("shows a label photo in History and opens that same result", async () => {
  useAppStore.setState({
    history: [{ id: "label-7", known: false, firstSeenAt: 1, lastSeenAt: Date.now(), seenCount: 1, scoreAtView: 64, warningsAtView: 0, label: ["water", "glycerin"] }],
  });
  await render(<Saved />);
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "History" })));
  const card = await screen.findByRole("button", { name: /^Label photo, 2 ingredients/ });
  expect(screen.getByText("64/100")).toBeTruthy();
  await act(async () => fireEvent.press(card));
  expect(mockPush).toHaveBeenCalledWith({ pathname: "/label-result", params: { entry: "label-7" } });
});
