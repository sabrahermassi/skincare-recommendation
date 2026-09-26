import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import TabsLayout from "@/app/(tabs)/_layout";
import SearchScreen from "@/app/(tabs)/browse";
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
  searchProducts: () => Promise.resolve({ ok: true, value: [mockProduct] }),
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
    await fireEvent.press(screen.getByText("Continue"));
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
    await fireEvent.press(screen.getByText("Neither"));
    await fireEvent.press(screen.getByText("Finish"));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(useAppStore.getState().profile.pregnancyStatus).toBe("neither");
  });

  it("keeps what was answered when closed early", async () => {
    await render(
      <QuizFrame>
        <SkinTypeStep />
      </QuizFrame>,
    );
    await fireEvent.press(screen.getByText("Oily"));
    await fireEvent.press(screen.getByText("Skip"));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(useAppStore.getState().profile.baseSkinType).toBe("oily");
  });
});

describe("the quiz opened from a link, with nothing behind it", () => {
  it("goes Home when closed", async () => {
    mockCanGoBack = false;
    await render(
      <QuizFrame>
        <SkinTypeStep />
      </QuizFrame>,
    );
    await fireEvent.press(screen.getByText("Skip"));
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith("/");
  });
});

describe("the other ways into the quiz", () => {
  it("offers it above Search results while nothing scores, and not once the answers do", async () => {
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByLabelText("Search products or brands"), "Toner");
    await waitFor(() => expect(screen.getByText("See your skin match")).toBeTruthy());
    await fireEvent.press(screen.getByText("See your skin match"));
    expect(mockRouter.push).toHaveBeenCalledWith("/quiz/concerns");
    await act(async () => screen.unmount());

    useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dullness"] } });
    await render(<SearchScreen />);
    await fireEvent.changeText(screen.getByLabelText("Search products or brands"), "Toner");
    await waitFor(() => expect(screen.getAllByText("Toner").length).toBeGreaterThan(0));
    expect(screen.queryByText("See your skin match")).toBeNull();
  });
});
