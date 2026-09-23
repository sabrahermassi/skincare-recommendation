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
const mockPermission = { granted: true, canAskAgain: true };

jest.mock("expo-camera", () => ({
  CameraView: (props: { onBarcodeScanned?: (result: unknown) => void }) => {
    mockCamera.onBarcodeScanned = props.onBarcodeScanned;
    return null;
  },
  useCameraPermissions: () => [mockPermission, jest.fn()],
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
  mockPermission.granted = true;
});

const HINT = "Not scanning? Photograph the ingredient list instead.";

// #195: the idle hint, and the permission gate on it (#260 review).
describe("scanner idle hint", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("appears after eight idle seconds in Barcode mode, and switches to Photo when tapped", async () => {
    jest.useFakeTimers();
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));
    expect(screen.queryByText(HINT)).toBeNull();

    await act(async () => {
      jest.advanceTimersByTime(8_000);
    });
    await fireEvent.press(screen.getByRole("button", { name: HINT }));
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it("never appears while the camera isn't granted — it would sit on top of the permission screen", async () => {
    mockPermission.granted = false;
    jest.useFakeTimers();
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(screen.queryByText(HINT)).toBeNull();
  });
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

  it("lets you leave a non-product code with Scan again", async () => {
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("https://example.com/not-a-barcode");
    expect(screen.getByText("That isn't a product barcode")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Scan again" }));
    expect(screen.queryByText("That isn't a product barcode")).toBeNull();
  });
});
