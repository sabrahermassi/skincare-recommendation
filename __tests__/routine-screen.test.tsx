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
  expect(screen.getByText("Sun protection")).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole("tab", { name: "Evening" })));
  expect(screen.getByText("Serum")).toBeTruthy();
  expect(screen.queryByText("Sun protection")).toBeNull();
});
