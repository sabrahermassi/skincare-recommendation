import { act, fireEvent, render, screen } from "@testing-library/react-native";

import ConcernsStep from "@/app/quiz/concerns";
import SkinTypeStep from "@/app/quiz/skin-type";
import { QuizFrame } from "@/components/QuizFrame";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The skin quiz's steps (v9): a back arrow on every step (on the first it
 * closes the quiz), the step bars, answer tiles with no pictures, and the
 * concerns counter over the footer button.
 */

jest.setTimeout(30_000);

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockGoBack = jest.fn();

jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  useNavigation: () => ({ goBack: mockGoBack, canGoBack: () => true }),
  useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(effect, [effect]),
}));
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (props: object) => <View testID="image" {...props} /> };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => {
  useAppStore.setState({ profile: EMPTY_PROFILE });
  mockGoBack.mockClear();
  mockRouter.back.mockClear();
});

const quiz = (step: React.ReactElement) =>
  render(<QuizFrame>{step}</QuizFrame>);

it("closes the quiz from the first step's back arrow", async () => {
  await quiz(<ConcernsStep />);
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(mockGoBack).toHaveBeenCalledTimes(1);
  expect(mockRouter.back).not.toHaveBeenCalled();
});

it("goes back a step from a later step's back arrow", async () => {
  await quiz(<SkinTypeStep />);
  await fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockGoBack).not.toHaveBeenCalled();
});

it("keeps the title's last two words on one line", async () => {
  await quiz(<ConcernsStep />);
  // The text matcher folds a non-breaking space into a plain one, so read the rendered string itself.
  expect(screen.getByText("What would you like to work on?").props.children).toBe("What would you like to work on?");
});

it("asks with v9's words, says which question it is, and waits for an answer", async () => {
  await quiz(<ConcernsStep />);
  expect(screen.getByText("What would you like to work on?")).toBeTruthy();
  expect(screen.getByText("Pick up to 3. We score every product for these.")).toBeTruthy();
  expect(screen.getByText("Question 1 of 4")).toBeTruthy();
  expect(screen.getByRole("progressbar", { name: "Step 1 of 4" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next" }).props.accessibilityState?.disabled).toBe(true);
  await act(async () => fireEvent.press(screen.getByRole("checkbox", { name: "Dullness" })));
  expect(screen.getByRole("button", { name: "Next" }).props.accessibilityState?.disabled).toBe(false);
  // "No concerns" is a real answer too.
  await act(async () => fireEvent.press(screen.getByRole("radio", { name: "I don't have any concerns" })));
  expect(screen.getByRole("button", { name: "Next" }).props.accessibilityState?.disabled).toBe(false);
});

it("shows each answer with a line saying what it means, and no pictures", async () => {
  await quiz(<SkinTypeStep />);
  expect(screen.getByText("What is your skin type?")).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Oily. Shiny all over, visible pores" })).toBeTruthy();
  expect(screen.getByRole("radio", { name: "Not sure. We'll keep things gentle" })).toBeTruthy();
  expect(screen.queryAllByTestId("image")).toHaveLength(0);
});

// An unchosen row keeps a grey outline, so choosing one never nudges the layout.
it("outlines an unchosen answer and rings a chosen one", async () => {
  const { StyleSheet } = jest.requireActual<typeof import("react-native")>("react-native");
  const { BUTTON, OPTION_LINE } = jest.requireActual<typeof import("@/lib/tokens")>("@/lib/tokens");
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["acne-prone"] } });
  await render(<QuizFrame><ConcernsStep /></QuizFrame>);
  const border = (name: string) => StyleSheet.flatten(screen.getByRole("checkbox", { name }).props.style).borderColor;
  expect(border("Dullness")).toBe(OPTION_LINE);
  expect(border("Breakouts")).toBe(BUTTON.primary.fill);
});
