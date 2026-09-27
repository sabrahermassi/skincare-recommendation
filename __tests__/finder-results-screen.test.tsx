import { fireEvent, render, screen } from "@testing-library/react-native";

import FinderResults from "@/app/finder-results";
import { useFinderChoices } from "@/lib/finder-choices";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/**
 * The finder's results: the catalogue best match first, the answers as chips
 * with Edit back to the finder, and Filter to narrow them to one product type.
 */

jest.setTimeout(30000);

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
// test-renderer 1.3 ships its own React reconciler, which throws inside
// React's `startTransition` (it reads transition types this React doesn't
// pass). The app renders with React Native's own renderer, where it works; here
// the filter's transition just runs straight through.
jest.mock("react", () => ({ ...jest.requireActual("react"), startTransition: (run: () => void) => run() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => useFinderChoices.setState({ choices: { ...EMPTY_PROFILE, baseSkinType: "oily", concerns: ["dullness"] } }));

it("ranks the catalogue for the answers, best score first", async () => {
  await render(<FinderResults />);
  expect(await screen.findByText("Results")).toBeTruthy();
  expect(screen.getByText("Oily skin")).toBeTruthy();
  const scores = screen.getAllByText(/^\d+$/).map((n) => Number(n.props.children));
  expect(scores.length).toBeGreaterThan(1);
  expect([...scores].sort((a, b) => b - a)).toEqual(scores);
});

it("goes back to the finder from Edit beside the answers", async () => {
  await render(<FinderResults />);
  await screen.findByText("Results");
  await fireEvent.press(screen.getByRole("button", { name: "Edit your answers" }));
  expect(mockBack).toHaveBeenCalled();
});

it("narrows the results to one product type from Filter", async () => {
  await render(<FinderResults />);
  await screen.findByText("Results");
  const all = screen.getAllByText(/^\d+$/).length;

  await fireEvent.press(screen.getByRole("button", { name: "Filter: All" }));
  // The first type after All, and how many products it holds.
  const option = screen.getAllByRole("radio")[1];
  const [label, count] = String(option.props.accessibilityLabel).split(", ");
  await fireEvent.press(option);

  expect(screen.getByRole("button", { name: `Filter: ${label}` })).toBeTruthy();
  expect(screen.getAllByText(/^\d+$/)).toHaveLength(Number(count));
  expect(Number(count)).toBeLessThan(all);
});

it("saves a product from its heart, without opening it", async () => {
  const { useAppStore } = require("@/store/useAppStore") as typeof import("@/store/useAppStore");
  useAppStore.setState({ savedProducts: [] });
  await render(<FinderResults />);
  await screen.findByText("Results");
  await fireEvent.press(screen.getAllByRole("button", { name: "Save" })[0]);
  expect(useAppStore.getState().savedProducts).toHaveLength(1);
});
