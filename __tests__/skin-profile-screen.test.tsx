import { act, fireEvent, render, screen, within } from "@testing-library/react-native";

import SkinProfileScreen from "@/app/skin-profile";
import { EMPTY_PROFILE, useAppStore } from "@/store/useAppStore";

/**
 * The Skin profile screen (v9): each answer on its own card with its value;
 * Change opens that question in place, and a choice saves at once.
 */

jest.setTimeout(30000);

let mockParams: Record<string, string> = {};
jest.mock("expo-router", () => ({ router: { back: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => mockParams }));
jest.mock("expo-image", () => {
  const { View } = jest.requireActual("react-native");
  return { Image: (props: object) => <View testID="image" {...props} /> };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Agreed already (#471): without it the screen sends the person to the consent screen.
beforeEach(() => useAppStore.setState({ profile: EMPTY_PROFILE, profileConsentAt: "2026-10-08T10:00:00.000Z" }));

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

// v9 drops the answers' pictures: a row is its value and Change, nothing else.
it("shows each answer without a picture", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["atopic", "redness"] } });
  await render(<SkinProfileScreen />);
  const row = screen.getByRole("button", { name: /^Skin concerns: / });
  expect(within(row).queryByTestId("image")).toBeNull();
});

it("says None chosen once no concerns is the answer, and how many may be picked", async () => {
  await render(<SkinProfileScreen />);
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Skin concerns: Not set" })));
  expect(screen.getByText("Pick up to 3. Tap Done when finished.")).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "I don't have any concerns" })));
  expect(screen.getByRole("button", { name: "Skin concerns: None chosen" })).toBeTruthy();
});

it("says how to swap once three concerns are chosen", async () => {
  useAppStore.setState({ profile: { ...EMPTY_PROFILE, concerns: ["dullness", "redness", "acne-prone"] } });
  await render(<SkinProfileScreen />);
  await act(async () => fireEvent.press(screen.getByRole("button", { name: /^Skin concerns: / })));
  expect(screen.getByText("3 chosen. Untick one to swap.")).toBeTruthy();
});

// Owner: one tap puts every answer back to not set, and Undo brings them back.
it("resets every answer with Reset, and puts them back with Undo", async () => {
  useAppStore.setState({ profile: { concerns: ["acne-prone"], baseSkinType: "oily", sensitivity: "some", pregnancyStatus: "neither" } });
  await render(<SkinProfileScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Reset skin profile" }));
  expect(useAppStore.getState().profile).toEqual({ concerns: [], baseSkinType: null, sensitivity: null, pregnancyStatus: null });
  // Nothing left to reset, so the word is gone.
  expect(screen.queryByRole("button", { name: "Reset skin profile" })).toBeNull();
  await fireEvent.press(screen.getByText("Undo"));
  expect(useAppStore.getState().profile).toEqual({ concerns: ["acne-prone"], baseSkinType: "oily", sensitivity: "some", pregnancyStatus: "neither" });
});

// A routine built for the old answers goes with them (review): filling the profile in again must not bring it back.
it("takes the built routine with the answers on Reset, and puts it back with Undo", async () => {
  useAppStore.setState({ profile: { concerns: [], baseSkinType: "oily", sensitivity: null, pregnancyStatus: null }, routineBuilt: true });
  await render(<SkinProfileScreen />);
  await fireEvent.press(screen.getByRole("button", { name: "Reset skin profile" }));
  expect(useAppStore.getState().routineBuilt).toBe(false);
  await fireEvent.press(screen.getByText("Undo"));
  expect(useAppStore.getState().routineBuilt).toBe(true);
});

it("closes with an X on the right, not a back arrow, when it slid up from a Skin needs story", async () => {
  mockParams = { from: "story" };
  await render(<SkinProfileScreen />);
  expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
  expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  mockParams = {};
});
