import { act, fireEvent, render, screen } from "@testing-library/react-native";

import BeforeWeAsk from "@/app/quiz/before";
import SkinProfileScreen from "@/app/skin-profile";
import { ConsentGate } from "@/components/ConsentGate";
import { QuizFrame } from "@/components/QuizFrame";
import { CONSENT_COPY } from "@/lib/consent-copy";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The screen before the skin quiz (#471): what it says, where its two buttons
 * go, what each does to the answers on the phone, and that the Skin profile
 * editor does not let anyone fill in a profile around it.
 */

jest.setTimeout(30_000);

const mockRouter = { back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true };
const mockGoBack = jest.fn();

jest.mock("expo-router", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    get router() {
      return mockRouter;
    },
    useNavigation: () => ({ goBack: mockGoBack, canGoBack: () => true }),
    useFocusEffect: (effect: () => void) => jest.requireActual("react").useEffect(effect, [effect]),
    useLocalSearchParams: () => ({}),
    Redirect: ({ href }: { href: string }) => <Text testID="redirect">{href}</Text>,
  };
});
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (props: object) => <View testID="image" {...props} /> };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const ANSWERED = { ...EMPTY_PROFILE, concerns: ["dullness" as const], sensitivity: "some" as const };

beforeEach(() => {
  useAppStore.setState({ profile: EMPTY_PROFILE, profileConsentAt: null, consentDeferred: false, routineBuilt: false });
  mockGoBack.mockClear();
  mockRouter.back.mockClear();
  mockRouter.push.mockClear();
  mockRouter.replace.mockClear();
});

const renderScreen = () =>
  render(
    <QuizFrame>
      <BeforeWeAsk />
    </QuizFrame>,
  );

it("says what is asked, what it is for, where it stays and the age line, with a privacy link", async () => {
  await renderScreen();
  expect(screen.getByText("Before we ask about your skin")).toBeTruthy();
  for (const line of CONSENT_COPY.lines) expect(screen.getByText(line)).toBeTruthy();
  expect(screen.getByText("You must be 16 or older to use for.me.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "I agree, continue" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Not now" })).toBeTruthy();

  await fireEvent.press(screen.getByRole("link", { name: "Read the privacy policy" }));
  expect(mockRouter.push).toHaveBeenCalledWith("/privacy");
});

describe("closing without a choice", () => {
  it("defers the screen to the next launch and keeps everything as it was", async () => {
    useAppStore.setState({ profile: ANSWERED });
    const { unmount } = await renderScreen();
    expect(useAppStore.getState().consentDeferred).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    // Leaving the screen, by Close or a swipe down, is what defers it.
    await act(async () => unmount());
    expect(useAppStore.getState().consentDeferred).toBe(true);
    expect(useAppStore.getState().profile).toEqual(ANSWERED);
    expect(useAppStore.getState().profileConsentAt).toBeNull();
  });
});

describe("a new person", () => {
  it("records when they agreed and goes on to the first question", async () => {
    await renderScreen();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "I agree, continue" })));
    expect(Number.isNaN(Date.parse(useAppStore.getState().profileConsentAt as string))).toBe(false);
    // Replaced, so the quiz's back arrow closes it instead of returning here.
    expect(mockRouter.replace).toHaveBeenCalledWith("/quiz/concerns");
  });

  it("closes the quiz on Not now, with nothing recorded and no profile", async () => {
    await renderScreen();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Not now" })));
    expect(useAppStore.getState().profileConsentAt).toBeNull();
    expect(useAppStore.getState().profile).toEqual(EMPTY_PROFILE);
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});

describe("someone who already has answers", () => {
  beforeEach(() => useAppStore.setState({ profile: ANSWERED, routineBuilt: true }));

  it("keeps them and closes on I agree, without starting the quiz again", async () => {
    await renderScreen();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "I agree, continue" })));
    expect(useAppStore.getState().profile).toEqual(ANSWERED);
    expect(useAppStore.getState().profileConsentAt).not.toBeNull();
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("clears them, and the routine built from them, on Not now", async () => {
    await renderScreen();
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Not now" })));
    expect(useAppStore.getState().profile).toEqual(EMPTY_PROFILE);
    expect(useAppStore.getState().routineBuilt).toBe(false);
    expect(useAppStore.getState().profileConsentAt).toBeNull();
  });
});

describe("the Skin profile editor after Not now", () => {
  it("sends someone with no answers and no agreement to the screen instead of the editor", async () => {
    await render(<SkinProfileScreen />);
    expect(screen.getByTestId("redirect").props.children).toBe("/quiz/before");
    expect(screen.queryByText("Skin profile")).toBeNull();
  });

  it("lets someone with answers from before the screen reset them without being sent away", async () => {
    useAppStore.setState({ profile: ANSWERED, profileConsentAt: null, consentDeferred: true });
    await render(<SkinProfileScreen />);
    await act(async () => fireEvent.press(screen.getByRole("button", { name: "Reset skin profile" })));
    expect(useAppStore.getState().profile).toEqual(EMPTY_PROFILE);
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(screen.getByText("Skin profile reset")).toBeTruthy();
  });

  it("opens for someone who agreed", async () => {
    useAppStore.setState({ profileConsentAt: "2026-10-08T10:00:00.000Z" });
    await render(<SkinProfileScreen />);
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(screen.getByText("Skin profile")).toBeTruthy();
  });
});

// Rendered by the root layout beside the navigator, so it holds whichever
// screen the app was opened on, not only the tabs.
describe("the gate for answers from before the screen existed", () => {
  const gate = async () => {
    await render(<ConsentGate />);
    return screen.queryByTestId("redirect")?.props.children ?? null;
  };

  it("sends answers with no agreement to the consent screen", async () => {
    useAppStore.setState({ profile: ANSWERED });
    expect(await gate()).toBe("/quiz/before");
  });

  it("stops once they agreed, or said Not now, which clears the answers", async () => {
    useAppStore.setState({ profile: ANSWERED });
    useAppStore.getState().agreeToProfile();
    expect(await gate()).toBeNull();

    useAppStore.setState({ profile: ANSWERED, profileConsentAt: null });
    useAppStore.getState().declineProfile();
    expect(await gate()).toBeNull();
  });

  it("stands down for the rest of the launch once closed without a choice, or Close would land back on it", async () => {
    useAppStore.setState({ profile: ANSWERED });
    useAppStore.getState().deferConsent();
    expect(await gate()).toBeNull();
  });

  it("does not ask someone who has answered nothing", async () => {
    expect(await gate()).toBeNull();
  });
});
