import { act, fireEvent, render, screen } from "@testing-library/react-native";

import TabsLayout from "@/app/(tabs)/_layout";
import Onboarding from "@/app/onboarding";
import ConcernsStep from "@/app/quiz/concerns";
import PregnancyStep from "@/app/quiz/pregnancy";
import SkinTypeStep from "@/app/quiz/skin-type";
import { QuizFrame } from "@/components/QuizFrame";
import { openQuiz } from "@/lib/open-quiz";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * #346: scan first, quiz later. A fresh install goes intro → Home with no
 * quiz; the quiz opens as a modal over whatever asked for it, and finishing
 * or closing it returns there, keeping every answer given.
 */

jest.setTimeout(30_000);

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockGoBack = jest.fn();
let mockCanGoBack = true;
const mockRedirect = jest.fn((_props: { href: string }) => null);

jest.mock("expo-router", () => {
  const Tabs = Object.assign(() => null, { Screen: () => null });
  return {
    // A getter: the module loads before `mockRouter` is assigned.
    get router() {
      return mockRouter;
    },
    Redirect: (props: { href: string }) => mockRedirect(props),
    Tabs,
    Stack: { Screen: () => null },
    Link: ({ children }: { children: unknown }) => children,
    useLocalSearchParams: () => ({}),
    // The quiz frame's own screen on the root stack: going back closes the modal.
    useNavigation: () => ({ goBack: mockGoBack, canGoBack: () => mockCanGoBack }),
    useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(effect, [effect]),
    useScrollToTop: () => undefined,
  };
});

// The tab bar's scan button animates; nothing here tests the animation.
jest.mock("react-native-worklets", () => require("react-native-worklets/src/mock"));
jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockProduct = {
  id: "p",
  barcode: "0000000000000",
  brand: "Brand",
  name: "Toner",
  type: "toner",
  productType: "toner",
  price: 0,
  volume: "",
  suitableFor: [],
  targets: [],
  description: "",
  benefits: [],
  imageUrl: null,
  attribution: null,
  ingredientIds: [],
  inStock: true,
  ingredients: [],
};

jest.mock("@/data/api", () => ({
  ...jest.requireActual("@/data/api"),
  peekProducts: () => [mockProduct],
  fetchProductsByIds: () => Promise.resolve({ ok: true, value: [] }),
}));

// Each test is a separate tap, well past openQuiz's double-tap guard. The
// clock still runs, so waitFor can time out.
const realNow = Date.now;
let clockOffset = 0;

beforeEach(() => {
  jest.clearAllMocks();
  clockOffset += 10_000;
  jest.spyOn(Date, "now").mockImplementation(() => realNow() + clockOffset);
  mockCanGoBack = true;
  useAppStore.setState({ hasSeenOnboarding: false, profile: EMPTY_PROFILE });
});

describe("first launch", () => {
  it("goes from the intro to Home, with no quiz", async () => {
    await render(<Onboarding />);
    await fireEvent.press(screen.getByText("Continue"));
    await fireEvent.press(screen.getByText("Continue"));
    await fireEvent.press(screen.getByText("Get started"));
    expect(useAppStore.getState().hasSeenOnboarding).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("goes Home when the intro is skipped, too", async () => {
    await render(<Onboarding />);
    await fireEvent.press(screen.getByText("Skip"));
    expect(useAppStore.getState().hasSeenOnboarding).toBe(true);
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });

  it("sends a fresh install to the intro, and a returning user straight to the tabs", async () => {
    await render(<TabsLayout />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: "/onboarding" });

    mockRedirect.mockClear();
    useAppStore.setState({ hasSeenOnboarding: true });
    await render(<TabsLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("the quiz, as a modal", () => {
  it("opens on its first step", () => {
    openQuiz();
    expect(mockRouter.push).toHaveBeenCalledWith("/quiz/concerns");
  });

  it("moves to the next step inside the modal", async () => {
    await render(
      <QuizFrame>
        <ConcernsStep />
      </QuizFrame>,
    );
    await fireEvent.press(screen.getByText("Dry / Dehydrated"));
    await fireEvent.press(screen.getByText("Next"));
    expect(mockRouter.push).toHaveBeenCalledWith("/quiz/skin-type");
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it("closes back to the screen it opened over when finished", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dehydrated"], baseSkinType: "dry" } });
    await render(
      <QuizFrame>
        <PregnancyStep />
      </QuizFrame>,
    );
    await fireEvent.press(screen.getByText("No"));
    // The last question hands over to the closing screen, whose button ends the quiz.
    await fireEvent.press(screen.getByText("Build my profile"));
    expect(screen.getByText("Building your skincare routine…")).toBeTruthy();
    await fireEvent.press(screen.getByText("See my routine"));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(useAppStore.getState().profile.pregnancyStatus).toBe("neither");
  });

  // Nobody has to say either way to finish: Prefer not to say is an answer.
  it("finishes on Prefer not to say, and shows it chosen when coming back", async () => {
    await render(
      <QuizFrame>
        <PregnancyStep />
      </QuizFrame>,
    );
    expect(screen.getByRole("button", { name: "Build my profile" }).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByText("Prefer not to say"));
    expect(useAppStore.getState().profile.pregnancyStatus).toBe("prefer-not-to-say");
    expect(screen.getByRole("radio", { name: "Prefer not to say" }).props.accessibilityState?.checked).toBe(true);
    expect(screen.getByRole("button", { name: "Build my profile" }).props.accessibilityState?.disabled).toBe(false);
  });

  it("has no Skip, and saves each answer as it's tapped, so a quiz swiped away keeps it", async () => {
    await render(
      <QuizFrame>
        <SkinTypeStep />
      </QuizFrame>,
    );
    expect(screen.queryByText("Skip")).toBeNull();
    await fireEvent.press(screen.getByText("Oily"));
    expect(useAppStore.getState().profile.baseSkinType).toBe("oily");
  });

  it("closes on VoiceOver's escape gesture, since there is no Skip to tap", async () => {
    await render(
      <QuizFrame>
        <SkinTypeStep />
      </QuizFrame>,
    );
    type Node = { props?: { onAccessibilityEscape?: () => void }; children?: (Node | string)[] | null };
    const find = (node: Node | string | null | undefined): (() => void) | undefined => {
      if (!node || typeof node === "string") return undefined;
      return node.props?.onAccessibilityEscape ?? node.children?.map(find).find(Boolean);
    };
    const tree = screen.toJSON() as Node | Node[] | null;
    const escape = (Array.isArray(tree) ? tree : [tree]).map(find).find(Boolean);
    expect(escape).toBeDefined();
    await act(async () => escape?.());
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});

describe("the quiz opened from a link, with nothing behind it", () => {
  it("goes Home when finished", async () => {
    mockCanGoBack = false;
    await render(
      <QuizFrame>
        <PregnancyStep />
      </QuizFrame>,
    );
    await fireEvent.press(screen.getByText("No"));
    // The last question hands over to the closing screen, whose button ends the quiz.
    await fireEvent.press(screen.getByText("Build my profile"));
    expect(screen.getByText("Building your skincare routine…")).toBeTruthy();
    await fireEvent.press(screen.getByText("See my routine"));
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });
});
