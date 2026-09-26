import { openQuizAt } from "@/lib/open-quiz";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

// #349 review: a double tap on "See your skin match" pushed two quizzes.
describe("openQuiz", () => {
  beforeEach(() => mockPush.mockClear());

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
});
