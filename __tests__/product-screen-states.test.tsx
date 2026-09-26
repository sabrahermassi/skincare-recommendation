import { act, fireEvent, render, screen } from "@testing-library/react-native";

import ProductRoute from "@/app/product/[id]";
import ResultRoute from "@/app/result/[id]";
import { fetchProduct } from "@/data/api";

/**
 * #155: the product screen's states before there is a product to show —
 * loading, a request that failed, and the catalogue answering "no such
 * product" — which a pure-logic test can't see. The scan's result route is
 * the same screen, so it must behave the same way.
 */

// The first render loads the screen's whole module graph.
jest.setTimeout(30_000);

let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  fetchProduct: jest.fn(),
  peekProducts: () => undefined,
}));

type FetchMock = {
  mockReturnValueOnce(value: unknown): FetchMock;
  mockClear(): void;
  mock: { calls: unknown[][] };
};
const fetched = fetchProduct as unknown as FetchMock;

beforeEach(() => {
  fetched.mockClear();
  mockParams = { id: "obf-8801234567890" };
});

describe.each([
  ["the product screen", ProductRoute],
  ["the scan's result screen", ResultRoute],
])("%s", (_name: string, Screen: () => React.JSX.Element) => {
  it("shows a spinner while the product loads, and nothing claiming it doesn't exist", async () => {
    fetched.mockReturnValueOnce(new Promise(() => undefined));
    await render(<Screen />);
    expect(screen.getByLabelText("Loading the product")).toBeTruthy();
    expect(screen.queryByText("Product not found")).toBeNull();
  });

  it("says it couldn't load, not that the product doesn't exist, and tries again", async () => {
    fetched.mockReturnValueOnce(Promise.resolve({ ok: false, failure: { kind: "offline" } }));
    await render(<Screen />);
    await act(async () => {});

    expect(screen.getByText("Couldn't load this product")).toBeTruthy();
    expect(screen.queryByText("Product not found")).toBeNull();

    fetched.mockReturnValueOnce(new Promise(() => undefined));
    await fireEvent.press(screen.getByText("Try again"));
    expect(fetched.mock.calls.length).toBe(2);
    expect(fetched.mock.calls[1][0]).toBe("obf-8801234567890");
  });

  it("says Product not found only when the catalogue answers that", async () => {
    fetched.mockReturnValueOnce(Promise.resolve({ ok: true, value: null }));
    await render(<Screen />);
    await act(async () => {});

    expect(screen.getByText("Product not found")).toBeTruthy();
    expect(screen.getByText("Search instead")).toBeTruthy();
    expect(screen.queryByText("Couldn't load this product")).toBeNull();
  });
});
