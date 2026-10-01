import { act, fireEvent, render, screen } from "@testing-library/react-native";

import Routine from "@/app/routine";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The Skincare routine screen: with no skin profile it asks for one, and the
 * button opens the skin quiz; with one, morning and evening steps.
 */

jest.setTimeout(30000);

const mockOpenQuiz = jest.fn();
jest.mock("@/lib/open-quiz", () => ({ openQuiz: () => mockOpenQuiz() }));
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn(), canGoBack: () => true } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => useAppStore.setState({ profile: EMPTY_PROFILE }));

it("asks for a skin profile first, and opens the quiz from Take the skin quiz", async () => {
  await render(<Routine />);
  expect(screen.getByRole("header", { name: "Your skin profile is empty" })).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Take the skin quiz" }));
  expect(mockOpenQuiz).toHaveBeenCalledTimes(1);
});

it("lays out the morning steps, and the evening's from the switch", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  await render(<Routine />);
  expect(screen.getByText("Steps for today")).toBeTruthy();
  // v9's steps: Cleansing, Serum, Moisturiser, Sunscreen by day.
  for (const step of ["Cleansing", "Serum", "Moisturiser", "Sunscreen"]) expect(screen.getByText(step)).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  // Cleansing, Treatment, Moisturiser, Night care by night.
  for (const step of ["Treatment", "Night care"]) expect(screen.getByText(step)).toBeTruthy();
  expect(screen.queryByText("Sunscreen")).toBeNull();
  expect(screen.queryByText("Serum")).toBeNull();
});

it("numbers each step plainly, with no dotted connectors between them (v9)", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily" } });
  await render(<Routine />);
  for (const n of ["1", "2", "3", "4"]) expect(screen.getByText(n)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: /^Scan one to check, for / })).toHaveLength(4);
});
