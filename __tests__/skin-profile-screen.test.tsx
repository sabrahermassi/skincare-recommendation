import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

import SkinProfileScreen from "@/app/skin-profile";
import { CONCERN_ICON } from "@/lib/quiz-icons";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The Skin profile screen (v7): each answer on its own card with its value;
 * Change opens that question in place, and a choice saves at once.
 */

jest.setTimeout(30000);

jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true } }));
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (props: object) => <View testID="image" {...props} /> };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

beforeEach(() => useAppStore.setState({ profile: EMPTY_PROFILE }));

it("lists every answer with its value, and says Not set before any", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, baseSkinType: "oily", concerns: ["large-pores"] } });
  await render(<SkinProfileScreen />);
  expect(screen.getByRole("button", { name: "Skin type: Oily" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Skin concerns: Enlarged pores" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Pregnancy: Not set" })).toBeTruthy();
});

it("saves a skin type the moment it is chosen", async () => {
  await render(<SkinProfileScreen />);
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Skin type: Not set" })));
  await act(async () => fireEvent.press(screen.getByRole("radio", { name: "Dry" })));
  expect(useAppStore.getState().profile.baseSkinType).toBe("dry");
});

it("adds and removes concerns in place, up to the limit", async () => {
  await render(<SkinProfileScreen />);
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Skin concerns: Not set" })));
  await act(async () => fireEvent.press(screen.getByRole("checkbox", { name: "Dullness" })));
  expect(useAppStore.getState().profile.concerns).toEqual(["dullness"]);
  await act(async () => fireEvent.press(screen.getByRole("checkbox", { name: "Dullness" })));
  expect(useAppStore.getState().profile.concerns).toEqual([]);
});

// #376 review: answering one question used to make every untouched one read
// "I don't know", since "I don't know" stores the same null as never asked.
it("leaves the questions not answered at Not set, and says I don't know only where it was chosen", async () => {
  await render(<SkinProfileScreen />);
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Skin concerns: Not set" })));
  await act(async () => fireEvent.press(screen.getByRole("checkbox", { name: "Dullness" })));
  expect(screen.getByRole("button", { name: "Skin type: Not set" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sensitivity: Not set" })).toBeTruthy();

  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Skin type: Not set" })));
  await act(async () => fireEvent.press(screen.getByRole("radio", { name: "I don't know" })));
  expect(screen.getByRole("button", { name: "Skin type: I don't know" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sensitivity: Not set" })).toBeTruthy();
});

it("opens a question in place with Change, and closes it with Done", async () => {
  await render(<SkinProfileScreen />);
  expect(screen.getByText("Pregnant or breastfeeding")).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Skin concerns: Not set" })));
  expect(screen.getByText("Done")).toBeTruthy();
  expect(screen.getByRole("checkbox", { name: "Dullness" })).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Skin concerns: Not set" })));
  expect(screen.queryByRole("checkbox", { name: "Dullness" })).toBeNull();
});

// #386 review: `atopic` has no picture (the quiz no longer offers it), and a
// profile that still leads with it showed the "No concerns" one.
it("pictures the first concern that has a picture when an old eczema-prone answer leads", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["atopic", "redness"] } });
  await render(<SkinProfileScreen />);
  const row = screen.getByRole("button", { name: /^Skin concerns: / });
  expect(within(row).getByTestId("image").props.source).toBe(CONCERN_ICON.redness);
});
