import { render, screen } from "@testing-library/react-native";

import QuizLayout from "@/app/quiz/_layout";
import { useAppStore } from "@/store/useAppStore";

/**
 * The quiz's questions are never reached without the consent screen (#471),
 * however the quiz was opened: `openQuiz` goes to the screen itself, but a
 * link straight to /quiz/concerns does not.
 */

let mockSegments: string[] = [];
jest.mock("expo-router", () => {
  const { Text: T } = jest.requireActual("react-native");
  return {
    Redirect: ({ href }: { href: string }) => <T testID="redirect">{href}</T>,
    Stack: () => <T testID="stack">steps</T>,
    useSegments: () => mockSegments,
    router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
    useNavigation: () => ({ goBack: jest.fn(), canGoBack: () => true }),
  };
});
jest.mock("expo-router/react-navigation", () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  useTheme: () => ({ colors: { background: "#fff" } }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => useAppStore.setState({ profileConsentAt: null }));

it("sends a link to a question to the consent screen when nobody has agreed", async () => {
  mockSegments = ["quiz", "concerns"];
  await render(<QuizLayout />);
  expect(screen.getByTestId("redirect").props.children).toBe("/quiz/before");
  expect(screen.queryByTestId("stack")).toBeNull();
});

it("shows the consent screen itself, and a page pushed over the quiz, without redirecting", async () => {
  mockSegments = ["quiz", "before"];
  await render(<QuizLayout />);
  expect(screen.getByTestId("stack")).toBeTruthy();

  // The privacy policy, opened from the consent screen, is on top of the quiz: not a quiz step.
  mockSegments = ["privacy"];
  await render(<QuizLayout />);
  expect(screen.queryByTestId("redirect")).toBeNull();
});

it("lets the questions through once agreed", async () => {
  mockSegments = ["quiz", "concerns"];
  useAppStore.setState({ profileConsentAt: "2026-10-08T10:00:00.000Z" });
  await render(<QuizLayout />);
  expect(screen.queryByTestId("redirect")).toBeNull();
  expect(screen.getByTestId("stack")).toBeTruthy();
});
