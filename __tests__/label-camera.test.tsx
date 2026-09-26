import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { LabelCamera } from "@/components/LabelCamera";
import type { LabelReadOutcome } from "@/lib/read-label-photo";

/**
 * #204: a failed photo shows a visible "Try again" and keeps the framing tip,
 * and a read in progress (up to 45 s) can be cancelled.
 */

jest.setTimeout(20_000);

jest.mock("expo-router", () => ({ router: { dismissTo: jest.fn() } }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-image-manipulator", () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: "jpeg" } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/haptics", () => ({ haptic: { tap: jest.fn(), success: jest.fn() } }));
jest.mock("@/lib/pick-label-photo", () => ({
  LIBRARY_MAX_WIDTH: 2000,
  deleteTempFile: jest.fn(),
  pickLabelPhoto: () => Promise.resolve({ previewUri: "file://pick.jpg", base64: "abc", cleanup: () => {} }),
}));

// The read, settled by each test when it chooses.
let mockSettle: (outcome: LabelReadOutcome) => void = () => {};
let mockStillWanted: (() => boolean) | undefined;
jest.mock("@/lib/read-label-photo", () => ({
  ...jest.requireActual("@/lib/read-label-photo"),
  readLabelPhoto: (_image: string, _barcode: string | undefined, isStillWanted?: () => boolean) => {
    mockStillWanted = isStillWanted;
    return new Promise((resolve) => (mockSettle = resolve));
  },
}));

const TIP = "Fill the frame with the ingredient list";

function renderCamera(onRead = jest.fn()) {
  return render(
    <LabelCamera camera={{ current: null }} cameraSize={null} window={null} onRead={onRead} bottomInset={0} />,
  );
}

async function chooseAPhoto() {
  await fireEvent.press(screen.getByLabelText("Choose a photo of the ingredient list from your library"));
  // Let the picker's promise land.
  await act(async () => {});
}

describe("LabelCamera", () => {
  it("cancels a read in progress, and drops it when it lands", async () => {
    const onRead = jest.fn();
    await renderCamera(onRead);
    await chooseAPhoto();

    expect(screen.getAllByText("Checking our database…").length).toBeGreaterThan(0);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText(TIP)).toBeTruthy();
    // Not held for anyone: the read is told it is no longer wanted.
    expect(mockStillWanted?.()).toBe(false);

    await act(async () => mockSettle({ kind: "read" }));
    expect(onRead).not.toHaveBeenCalled();
    expect(screen.getByText(TIP)).toBeTruthy();
  });

  it("twinkles stars over the photo while it is read, and says it is checking our database", async () => {
    await render(
      <LabelCamera camera={{ current: null }} cameraSize={null} window={{ x: 0, y: 0, width: 300, height: 400 }} onRead={jest.fn()} bottomInset={0} />,
    );
    expect(screen.queryByTestId("sparkles", { includeHiddenElements: true })).toBeNull();
    await chooseAPhoto();
    expect(screen.getByTestId("sparkles", { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getAllByText("Checking our database…").length).toBeGreaterThan(0);

    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("sparkles", { includeHiddenElements: true })).toBeNull();
  });

  it("keeps the framing tip after a failed photo, with a visible Try again", async () => {
    await renderCamera();
    await chooseAPhoto();
    await act(async () =>
      mockSettle({
        kind: "failed",
        message: "We couldn't read the ingredients",
        hint: "Get closer so the small print fills the frame, and tilt away from any glare.",
        action: "Try again",
        link: "Choose a photo instead",
        retryable: true,
      }),
    );

    expect(screen.getAllByText("We couldn't read the ingredients").length).toBeGreaterThan(0);
    expect(screen.getByText(TIP)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose a photo instead" })).toBeTruthy();

    await fireEvent.press(screen.getByText("Try again"));
    expect(screen.queryByText("Try again")).toBeNull();
    expect(screen.getByLabelText("Take a photo of the ingredient list")).toBeTruthy();
  });
});
