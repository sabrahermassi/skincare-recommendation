import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { ChoosePhotoInstead } from "@/components/ChoosePhotoInstead";

jest.setTimeout(30000);

let resolvePick: (value: unknown) => void = () => {};
jest.mock("@/lib/pick-label-photo", () => ({
  pickLabelPhoto: () => new Promise((resolve) => (resolvePick = resolve)),
}));
// Never settles: the test only needs the moment after a photo was chosen.
jest.mock("@/lib/read-label-photo", () => ({ readLabelPhoto: () => new Promise(() => {}) }));

// #295: "Reading the ingredients…" appeared the moment the link was
// tapped, behind the photo picker, before anything had been chosen.
describe("ChoosePhotoInstead", () => {
  it("says it is reading only once a photo has been chosen", async () => {
    await render(<ChoosePhotoInstead onRead={() => {}} />);

    await fireEvent.press(screen.getByLabelText("Choose a photo of the ingredient list from your library"));
    expect(screen.getByText("Choose a photo instead")).toBeTruthy();
    expect(screen.queryByText("Reading the ingredients…")).toBeNull();

    await act(async () => resolvePick({ base64: "abc", cleanup: () => {} }));
    // Shown, and announced in the same words.
    expect(screen.getAllByText("Reading the ingredients…").length).toBeGreaterThan(0);
  });
});
