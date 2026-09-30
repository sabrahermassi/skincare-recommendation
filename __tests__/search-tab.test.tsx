import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * Search (#317): search first, no catalogue list. Before typing it
 * shows the box, the scanner and what was viewed last; typing shows ranked
 * matches, and a search with none offers the scanner.
 */

jest.setTimeout(30000);


// Search's own params (`byName`, #323).
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual<typeof import("react")>("react");
  return {
    router: { push: jest.fn(), navigate: jest.fn() },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void | (() => void)) => {
      useEffect(() => effect(), []); // eslint-disable-line react-hooks/exhaustive-deps
    },
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const { useAppStore } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");
const { EMPTY_PROFILE } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");
const Search = (require("@/app/(tabs)/browse") as { default: () => React.JSX.Element }).default;

const viewed = (id: string, at: number) => ({
  id,
  known: true,
  firstSeenAt: at,
  lastSeenAt: at,
  seenCount: 1,
  scoreAtView: null,
  warningsAtView: 0,
});

beforeEach(() => {
  mockParams = {};
  jest.clearAllMocks();
  useAppStore.setState({ profile: EMPTY_PROFILE, history: [] });
});

it("goes back to Home from its back arrow, having no tab of its own", async () => {
  const { router } = require("expo-router") as { router: { navigate: (href: string) => void } };
  await render(<Search />);
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Back to Home" })));
  expect(router.navigate).toHaveBeenCalledWith("/");
});

describe("before typing", () => {
  it("shows the search box, a picture and what Search is for, and no product list", async () => {
    await render(<Search />);
    expect(screen.getByLabelText("Search products or brands")).toBeTruthy();
    expect(screen.getByText("Search by product or brand name. Products you open will show up here.")).toBeTruthy();
    expect(screen.queryByText("Scan a product instead")).toBeNull();
    expect(screen.queryByText("Recently viewed")).toBeNull();
    expect(screen.queryByText("Hanbang Rice Ferment Hydrating Serum")).toBeNull();
  });

  it("lists what was viewed last, newest first, and skips barcodes it never recognised", async () => {
    useAppStore.setState({
      history: [
        viewed("aqua-ceramide-cream", 3),
        { ...viewed("8801234567890", 2), known: false },
        viewed("hanbang-rice-serum", 1),
      ],
    });
    await render(<Search />);
    expect(await screen.findByText("Recently viewed")).toBeTruthy();
    const names = screen.getAllByText(/Aqua Barrier Ceramide Moisturizer|Hanbang Rice Ferment Hydrating Serum/).map((node) => node.props.children);
    expect(names).toEqual(["Aqua Barrier Ceramide Moisturizer", "Hanbang Rice Ferment Hydrating Serum"]);
    // The list takes the picture's place.
    expect(screen.queryByText("Search by product or brand name. Products you open will show up here.")).toBeNull();
  });

  it("clears the whole list at once from Clear all, with no second tap", async () => {
    useAppStore.setState({ history: [viewed("aqua-ceramide-cream", 2), viewed("hanbang-rice-serum", 1)] });
    await render(<Search />);
    await screen.findByText("Recently viewed");
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Clear all recently viewed" })));
    expect(useAppStore.getState().history).toEqual([]);
    expect(screen.queryByText("Recently viewed")).toBeNull();
    expect(screen.queryByText("Aqua Barrier Ceramide Moisturizer")).toBeNull();
  });
});

describe("typing", () => {
  it("shows matches for the query", async () => {
    await render(<Search />);
    await act(async () => fireEvent.changeText(screen.getByLabelText("Search products or brands"), "ceramide"));
    expect(await screen.findByText("Aqua Barrier Ceramide Moisturizer", {}, { timeout: 3000 })).toBeTruthy();
    // No skin-questions card above the results: that lives on Home (owner).
    expect(screen.queryByText("See your skin match")).toBeNull();
    expect(screen.getByText("Barrier Ceramide Body Lotion")).toBeTruthy();
    expect(screen.queryByText("Scan a product instead")).toBeNull();
  });

  it("ranks the matches for the person's skin, best first", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "dry", concerns: ["dehydrated"] } });
    await render(<Search />);
    await act(async () => fireEvent.changeText(screen.getByLabelText("Search products or brands"), "ceramide"));
    await screen.findByText("Aqua Barrier Ceramide Moisturizer", {}, { timeout: 3000 });
    const scores = screen.getAllByText(/^\d+$/).map((node) => Number(node.props.children));
    expect(scores.length).toBeGreaterThan(1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("says nothing was found, and offers the ingredient-list scan (v7)", async () => {
    await render(<Search />);
    await act(async () => fireEvent.changeText(screen.getByLabelText("Search products or brands"), "zzzz nothing"));
    expect(await screen.findByText("Nothing found yet", {}, { timeout: 3000 })).toBeTruthy();
    expect(screen.getByText("Our product library is still small. Scan the ingredient list and we'll read it for you.")).toBeTruthy();
    expect(screen.queryByText("Search by product or brand name. Products you open will show up here.")).toBeNull();
    expect(screen.getByRole("button", { name: "Scan the ingredient list" })).toBeTruthy();
  });

  it("waits for three letters before it searches", async () => {
    await render(<Search />);
    await act(async () => fireEvent.changeText(screen.getByLabelText("Search products or brands"), "ce"));
    // Two letters: still the still life, no results and no "not found", and a
    // line saying why nothing happened yet.
    expect(screen.getByText("Search by product or brand name. Products you open will show up here.")).toBeTruthy();
    expect(screen.getByText("Type at least three letters to search.")).toBeTruthy();
    expect(screen.queryByText("Nothing found yet")).toBeNull();

    await act(async () => fireEvent.changeText(screen.getByLabelText("Search products or brands"), "cer"));
    expect(screen.queryByText("Search by product or brand name. Products you open will show up here.")).toBeNull();
    expect(screen.queryByText("Type at least three letters to search.")).toBeNull();
  });
});

// #323: "Search by name" from the scanner lands on an empty, focused box.
describe("arriving to search by name", () => {
  it("empties the box, whatever was searched before", async () => {
    const view = await render(<Search />);
    await fireEvent.changeText(screen.getByPlaceholderText("Search products or brands"), "serum");
    expect(screen.getByDisplayValue("serum")).toBeTruthy();

    mockParams = { byName: "1" };
    await view.rerender(<Search />);
    expect(screen.queryByDisplayValue("serum")).toBeNull();
  });
});
