import { act, fireEvent, render, screen } from "@testing-library/react-native";

import Scan from "@/app/(tabs)/scanner";
import { fetchProductByBarcode } from "@/data/api";

/**
 * The scanner's status panels (#192, #259 review): every panel that stops the
 * camera from reading must offer a visible way back to Ready. Re-tapping the
 * selected Barcode pill used to be the hidden exit; it no longer is, so each
 * panel's own control is the only one.
 */

// The camera is mocked down to a prop sink: the test plays the part of the
// camera by calling the `onBarcodeScanned` the screen last handed it.
const mockCamera: { onBarcodeScanned?: (result: unknown) => void } = {};

jest.mock("expo-camera", () => ({
  CameraView: (props: { onBarcodeScanned?: (result: unknown) => void }) => {
    mockCamera.onBarcodeScanned = props.onBarcodeScanned;
    return null;
  },
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), canGoBack: () => true },
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, []),
  };
});

jest.mock("expo-haptics", () => ({
  notificationAsync: () => Promise.resolve(),
  NotificationFeedbackType: { Success: "success" },
}));

jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/components/GenieShell", () => {
  const React = require("react");
  return { GenieShell: React.forwardRef(({ children }: { children: unknown }, _ref: unknown) => children) };
});
jest.mock("@/components/LabelCamera", () => ({ LabelCamera: () => null }));
jest.mock("@/components/ScanIntro", () => ({ ScanIntro: () => null }));
jest.mock("@/components/ChoosePhotoInstead", () => ({ ChoosePhotoInstead: () => null }));
jest.mock("@/components/ProductThumbnail", () => ({ ProductThumbnail: () => null }));
jest.mock("@/components/ScanViewfinder", () => ({
  ScanViewfinder: () => null,
  barcodeBox: () => undefined,
  SCAN_SIDE_INSET: 20,
}));
jest.mock("@/components/IngredientsSheet", () => ({ SHEET_INSET: 0, SHEET_OUTLINE: "#000", SHEET_RADIUS: 0 }));

jest.mock("@/data/api", () => ({
  canPhotographLabelFor: (id: string) => /^\d{8,14}$/.test(id),
  failureMessage: () => "Couldn't reach our catalogue. Check your connection.",
  fetchProductByBarcode: jest.fn(),
}));

type MockFn = { mockResolvedValue(value: unknown): void; mockClear(): void };

function scan(code: string) {
  return act(async () => {
    mockCamera.onBarcodeScanned?.({ data: code, bounds: undefined, cornerPoints: [] });
  });
}

beforeEach(() => {
  (fetchProductByBarcode as unknown as MockFn).mockClear();
});

describe("scanner status panels", () => {
  it("lets you leave an unreachable panel and scan a different barcode", async () => {
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: false, failure: { kind: "offline" } });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("8801234567890");
    expect(screen.getByText("Couldn't check this barcode")).toBeTruthy();

    // The camera refuses every read while the panel is up.
    await scan("8809999999999");
    expect(fetchProductByBarcode).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: "Scan something else" }));
    expect(screen.queryByText("Couldn't check this barcode")).toBeNull();

    // Rescanning the same code the panel was just dismissed for must not
    // reopen it — dismissGuard suppresses it (#190). Found in review on
    // #259 (CodeRabbit): the test proved the panel could be left, but not
    // that this specific guard is what's doing it.
    await scan("8801234567890");
    expect(fetchProductByBarcode).toHaveBeenCalledTimes(1);

    await scan("8809999999999");
    expect(fetchProductByBarcode).toHaveBeenLastCalledWith("8809999999999");
  });

  it("lets you leave a plain miss the same way", async () => {
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: null });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("8801234567890");
    expect(screen.getByText("We don't have this product yet")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Scan something else" }));
    expect(screen.queryByText("We don't have this product yet")).toBeNull();
  });

  // Found in review on #259 (Codex): "Add via Photo" on a plain miss keeps
  // `status` as `missed` after switching to Photo mode, so `IngredientsStage`
  // can still read the barcode. If the user backs out of that by tapping
  // Barcode instead, the stale panel used to reappear immediately and block
  // scanning until "Scan something else" was also pressed.
  it("clears a stale miss when backing out of Add via Photo to Barcode", async () => {
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: null });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("8801234567890");
    expect(screen.getByText("We don't have this product yet")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Photograph the ingredients" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));
    expect(screen.queryByText("We don't have this product yet")).toBeNull();

    // Same guard, same reason as the unreachable-panel test above: the
    // barcode can still be in frame the moment Barcode mode remounts.
    await scan("8801234567890");
    expect(fetchProductByBarcode).toHaveBeenCalledTimes(1);

    await scan("8809999999999");
    expect(fetchProductByBarcode).toHaveBeenLastCalledWith("8809999999999");
  });

  it("lets you leave a non-product code with Scan again", async () => {
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("https://example.com/not-a-barcode");
    expect(screen.getByText("That isn't a product barcode")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Scan again" }));
    expect(screen.queryByText("That isn't a product barcode")).toBeNull();
  });
});
