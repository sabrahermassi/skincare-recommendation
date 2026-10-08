import { openQuizAt } from "@/lib/open-quiz";
import { useAppStore } from "@/store/useAppStore";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

// #349 review: a double tap on "See your skin match" pushed two quizzes.
describe("openQuiz", () => {
  beforeEach(() => {
    mockPush.mockClear();
    useAppStore.setState({ profileConsentAt: "2026-10-08T10:00:00.000Z" });
  });

  it("opens the quiz on its first step", () => {
    openQuizAt(10_000);
    expect(mockPush).toHaveBeenCalledWith("/quiz/concerns");
  });

  it("ignores a second tap while the first open is still landing", () => {
    openQuizAt(20_000);
    openQuizAt(20_100);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("opens again once the first open has landed", () => {
    openQuizAt(30_000);
    openQuizAt(31_000);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  // #471: the first time, the screen that asks to be asked comes first.
  it("opens on the screen before the questions until the person has agreed", () => {
    useAppStore.setState({ profileConsentAt: null });
    openQuizAt(50_000);
    expect(mockPush).toHaveBeenCalledWith("/quiz/before");
  });
});
