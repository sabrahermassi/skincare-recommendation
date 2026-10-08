import { act, fireEvent, render, screen } from "@testing-library/react-native";

import TabsLayout from "@/app/(tabs)/_layout";
import Onboarding from "@/app/onboarding";
import ConcernsStep from "@/app/quiz/concerns";
import PregnancyStep, { BUILDING_MS } from "@/app/quiz/pregnancy";
import SkinTypeStep from "@/app/quiz/skin-type";
import { QuizFrame } from "@/components/QuizFrame";
import { openQuiz, openQuizAt } from "@/lib/open-quiz";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * #346: scan first, quiz later. A fresh install goes intro → Home with no
 * quiz; the quiz opens as a modal over whatever asked for it, and finishing
 * or closing it returns there, keeping every answer given.
 */

jest.setTimeout(30_000);

// The routine the closing screen waits for: ready at once unless a test holds it back.
let mockFinishRoutine: (() => void) | null = null;
let mockHoldRoutine = false;
const mockCallOff = jest.fn();
jest.mock("@/lib/routine-build", () => ({
  prepareRoutine: (_profile: unknown, onReady: () => void) => {
    if (mockHoldRoutine) mockFinishRoutine = onReady;
    else onReady();
    return mockCallOff;
  },
}));

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true };
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
  useAppStore.setState({ hasSeenOnboarding: false, profile: EMPTY_PROFILE, profileConsentAt: null });
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

  // #471: answers from before the consent screen existed are shown it once.
  it("sends answers with no agreement to the consent screen, and not again once it is settled", async () => {
    useAppStore.setState({ hasSeenOnboarding: true, profile: { ...EMPTY_PROFILE, concerns: ["dullness"] }, profileConsentAt: null });
    await render(<TabsLayout />);
    expect(mockRedirect).toHaveBeenCalledWith({ href: "/quiz/before" });

    mockRedirect.mockClear();
    useAppStore.getState().agreeToProfile();
    await render(<TabsLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();

    // Not now clears the answers, which ends it just the same.
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dullness"] }, profileConsentAt: null });
    useAppStore.getState().declineProfile();
    await render(<TabsLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("does not ask someone with no answers to agree before they have been asked anything", async () => {
    useAppStore.setState({ hasSeenOnboarding: true, profile: EMPTY_PROFILE, profileConsentAt: null });
    await render(<TabsLayout />);
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("the quiz, as a modal", () => {
  beforeEach(() => useAppStore.setState({ profileConsentAt: "2026-10-08T10:00:00.000Z" }));

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

  // Opened from a result ("Take the 1-minute quiz"), the quiz ends back on that result (owner).
  it("shows the building screen with no button, then closes back to the screen it opened over", async () => {
    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dehydrated"], baseSkinType: "dry" } });
    openQuizAt(Date.now());
    jest.useFakeTimers();
    try {
      await render(
        <QuizFrame>
          <PregnancyStep />
        </QuizFrame>,
      );
      await fireEvent.press(screen.getByText("No"));
      await fireEvent.press(screen.getByText("See my match"));
      expect(screen.getByText("Matching products to your skin…")).toBeTruthy();
      // Nothing to tap, and no step line above: the screen moves on when its bar is full.
      expect(screen.queryByRole("button", { name: "See my match" })).toBeNull();
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(mockGoBack).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(BUILDING_MS);
      });
      expect(mockGoBack).toHaveBeenCalledTimes(1);
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
      expect(useAppStore.getState().profile.pregnancyStatus).toBe("neither");
      expect(useAppStore.getState().justFinishedQuiz).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  // Opened from the Skincare routine, it ends on the routine.
  it("opens the routine when it was opened from the routine", async () => {
    openQuizAt(Date.now(), "routine");
    jest.useFakeTimers();
    try {
      await render(
        <QuizFrame>
          <PregnancyStep />
        </QuizFrame>,
      );
      await fireEvent.press(screen.getByText("No"));
      await fireEvent.press(screen.getByText("See my routine"));
      expect(screen.getByText("Building your skincare routine…")).toBeTruthy();
      await act(async () => {
        jest.advanceTimersByTime(BUILDING_MS);
      });
      expect(mockRouter.dismissTo).toHaveBeenCalledWith("/routine");
      expect(mockGoBack).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  // The wait is for the routine itself, not a clock (owner, 2 October 2026):
  // the routine must be there when it opens.
  it("waits on the building screen until the routine is built, however long the bar has been full", async () => {
    openQuizAt(Date.now(), "routine");
    mockHoldRoutine = true;
    jest.useFakeTimers();
    try {
      await render(
        <QuizFrame>
          <PregnancyStep />
        </QuizFrame>,
      );
      await fireEvent.press(screen.getByText("No"));
      await fireEvent.press(screen.getByText("See my routine"));
      await act(async () => {
        jest.advanceTimersByTime(BUILDING_MS * 3);
      });
      expect(screen.getByText("Building your skincare routine…")).toBeTruthy();
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
      await act(async () => mockFinishRoutine?.());
      expect(mockRouter.dismissTo).toHaveBeenCalledWith("/routine");
    } finally {
      jest.useRealTimers();
      mockHoldRoutine = false;
      mockFinishRoutine = null;
    }
  });

  it("calls the building off when Back is tapped, and does not open the routine when it finishes anyway", async () => {
    openQuizAt(Date.now(), "routine");
    mockHoldRoutine = true;
    mockCallOff.mockClear();
    jest.useFakeTimers();
    try {
      await render(
        <QuizFrame>
          <PregnancyStep />
        </QuizFrame>,
      );
      await fireEvent.press(screen.getByText("No"));
      await fireEvent.press(screen.getByText("See my routine"));
      await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      expect(mockCallOff).toHaveBeenCalledTimes(1);
      await act(async () => {
        jest.advanceTimersByTime(BUILDING_MS * 2);
      });
      expect(screen.getByRole("button", { name: "See my routine" })).toBeTruthy();
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
      mockHoldRoutine = false;
      mockFinishRoutine = null;
    }
  });

  it("does not open the routine before the bar is full, even with the routine built at once", async () => {
    openQuizAt(Date.now(), "routine");
    jest.useFakeTimers();
    try {
      await render(
        <QuizFrame>
          <PregnancyStep />
        </QuizFrame>,
      );
      await fireEvent.press(screen.getByText("No"));
      await fireEvent.press(screen.getByText("See my routine"));
      await act(async () => {
        jest.advanceTimersByTime(BUILDING_MS - 1);
      });
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("goes back to the last question from the building screen, without moving on", async () => {
    openQuizAt(Date.now());
    jest.useFakeTimers();
    try {
      await render(
        <QuizFrame>
          <PregnancyStep />
        </QuizFrame>,
      );
      await fireEvent.press(screen.getByText("No"));
      await fireEvent.press(screen.getByText("See my match"));
      await fireEvent.press(screen.getByRole("button", { name: "Back" }));
      await act(async () => {
        jest.advanceTimersByTime(BUILDING_MS);
      });
      expect(screen.getByRole("button", { name: "See my match" })).toBeTruthy();
      expect(mockRouter.dismissTo).not.toHaveBeenCalled();
      expect(mockGoBack).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  // Nobody has to say either way to finish: Prefer not to say is an answer.
  it("finishes on Prefer not to say, and shows it chosen when coming back", async () => {
    openQuizAt(Date.now());
    await render(
      <QuizFrame>
        <PregnancyStep />
      </QuizFrame>,
    );
    expect(screen.getByRole("button", { name: "See my match" }).props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByText("Prefer not to say"));
    expect(useAppStore.getState().profile.pregnancyStatus).toBe("prefer-not-to-say");
    expect(screen.getByRole("radio", { name: "Prefer not to say" }).props.accessibilityState?.checked).toBe(true);
    expect(screen.getByRole("button", { name: "See my match" }).props.accessibilityState?.disabled).toBe(false);
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
  it("goes Home when closed", async () => {
    mockCanGoBack = false;
    await render(
      <QuizFrame>
        <PregnancyStep />
      </QuizFrame>,
    );
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });
});
