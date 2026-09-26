import { fireEvent, render, screen } from "@testing-library/react-native";

import FinderResults from "@/app/finder-results";
import { useFinderChoices } from "@/lib/finder-choices";
import { EMPTY_PROFILE } from "@/store/useAppStore";

/** The finder's results: the catalogue best match first, the answers as chips, and Filter back to the finder. */

jest.setTimeout(30000);

const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true },
  Link: ({ children }: { children: React.ReactNode }) => children,
}));
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

it("goes back to the finder from Filter", async () => {
  await render(<FinderResults />);
  await screen.findByText("Results");
  await fireEvent.press(screen.getByRole("button", { name: "Filter" }));
  expect(mockBack).toHaveBeenCalled();
});
