import { act, fireEvent, render, screen } from "@testing-library/react-native";

/**
 * Saved draws a page of products at a time (`SAVED_PAGE`), then "Show more":
 * the list is one ScrollView and a shelf has no cap.
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

jest.mock("@/lib/list-page", () => ({ SAVED_PAGE: 3 }));

const IDS = [
  "hanbang-rice-serum",
  "aqua-ceramide-cream",
  "mugwort-gel-cleanser",
  "sheer-shield-spf50",
  "snail-repair-ampoule",
  "green-tea-body-wash",
  "ceramide-body-lotion",
];

beforeEach(() => {
  useAppStore.setState({
    profile: EMPTY_PROFILE,
    savedProducts: IDS.map((id, i) => ({ id, savedAt: 100 - i })),
    savedIngredients: [],
    history: [],
    shelfOwner: null,
  });
});

it("draws a page of saved products, and Show more adds the next page", async () => {
  await render(<Saved />);
  expect(await screen.findAllByRole("button", { name: "Remove from saved" })).toHaveLength(3);
  expect(screen.getByText("7 products")).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByText("Show 3 more")));
  expect(screen.getAllByRole("button", { name: "Remove from saved" })).toHaveLength(6);

  await act(async () => fireEvent.press(screen.getByText("Show 1 more")));
  expect(screen.getAllByRole("button", { name: "Remove from saved" })).toHaveLength(7);
  expect(screen.queryByText(/^Show \d+ more$/)).toBeNull();
});
