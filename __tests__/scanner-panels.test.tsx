import { act, fireEvent, render, screen } from "@testing-library/react-native";

import Scan from "@/app/scanner";
import { fetchProductByBarcode } from "@/data/api";
import type { Ingredient, ProductWithIngredients } from "@/data/types";

/**
 * The scanner's status panels (#192, #259 review): every panel that stops the
 * camera from reading must offer a visible way back to Ready. Re-tapping the
 * selected Barcode pill used to be the hidden exit; it no longer is, so each
 * panel's own control is the only one.
 */

// The first render of the scanner screen loads its whole module graph, which
// ran past jest's default 5s under a full, parallel suite run.
jest.setTimeout(20_000);

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

// The real AppState mock (@react-native/jest-preset) never actually calls a
// registered handler, so it can't play the part of a background/foreground
// transition. Captures the handler instead, same trick as `mockCamera` above.
// Mocked at its own module path, not the whole "react-native" package —
// react-native-css-interop wraps that package's own View/Text/etc. exports
// at require time, and replacing the package wholesale broke that wrapping.
let mockAppStateHandler: ((state: string) => void) | undefined;
jest.mock("react-native/Libraries/AppState/AppState", () => ({
  __esModule: true,
  default: {
    addEventListener: (_type: string, handler: (state: string) => void) => {
      mockAppStateHandler = handler;
      return { remove: jest.fn() };
    },
  },
}));

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true },
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
  mockAppStateHandler = undefined;
});

const HINT = "Barcode not scanning? Photograph the ingredients instead.";

function ingredient(name: string): Ingredient {
  return { id: name, name, comedogenic: 0, safety: "safe", verified: true };
}

function foundProduct(barcode: string): ProductWithIngredients {
  const ingredients = [ingredient("water"), ingredient("glycerin")];
  return {
    id: `obf-${barcode}`,
    barcode,
    brand: "Brand",
    name: "Toner",
    type: "toner",
    productType: "serum",
    price: 0,
    volume: "",
    suitableFor: [],
    targets: [],
    description: "",
    benefits: [],
    imageUrl: null,
    attribution: null,
    fetchedAt: "2026-09-23T00:00:00Z",
    source: "obf",
    ingredientIds: ingredients.map((i) => i.id),
    inStock: true,
    ingredients,
  };
}

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
    expect(screen.getByText("We couldn't check that just now")).toBeTruthy();

    // The camera refuses every read while the panel is up.
    await scan("8809999999999");
    expect(fetchProductByBarcode).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByRole("button", { name: "Scan something else" }));
    expect(screen.queryByText("We couldn't check that just now")).toBeNull();

    // Rescanning the same code the panel was just dismissed for must not
    // reopen it — dismissGuard suppresses it (#190). Found in review on
    // #259 (CodeRabbit): the test proved the panel could be left, but not
    // that this specific guard is what's doing it.
    await scan("8801234567890");
    expect(fetchProductByBarcode).toHaveBeenCalledTimes(1);

    await scan("8809999999999");
    expect(fetchProductByBarcode).toHaveBeenLastCalledWith("8809999999999");
  });

  it("closes the scanner to reach Search, rather than stacking Search inside it", async () => {
    // The scanner is a full-screen modal (#313): a push put a second copy of
    // the tabs inside it, with the scanner still underneath (#315 review).
    const { router } = jest.requireMock("expo-router") as { router: { push: MockFn; dismissTo: MockFn } };
    router.push.mockClear();
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: false, failure: { kind: "offline" } });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));
    await scan("8801234567890");

    await fireEvent.press(screen.getByText("Find it in Search"));
    expect(router.dismissTo).toHaveBeenCalledWith("/browse");
    expect(router.push).not.toHaveBeenCalled();
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

  // Found during manual device QA on #268: the status panel's render guard
  // only excluded "idle", not "found", and its message ternary has no
  // "found" branch — so a successful scan showed the correct found sheet
  // with the wrong "We don't have this product yet" panel stacked
  // underneath it, straight from the panel's own fallback case.
  it("shows only the found sheet, never the status panel, once a barcode resolves to a known product", async () => {
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: foundProduct("8801234567890") });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("8801234567890");
    expect(screen.getByRole("button", { name: "See the full result" })).toBeTruthy();
    expect(screen.queryByText("We don't have this product yet")).toBeNull();
    expect(screen.queryByText("Photograph its ingredient list and we'll add it")).toBeNull();
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
    expect(screen.getByText("That's not a product barcode")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Scan again" }));
    expect(screen.queryByText("That's not a product barcode")).toBeNull();
  });
});

// #260 review (Codex): backgrounding the app doesn't blur this screen's
// navigation focus, so the torch must be reset by an AppState listener too,
// not only by the focus-effect cleanup that covers actually leaving the screen.
describe("scanner torch", () => {
  it("turns the torch off when the app backgrounds, without a new tap", async () => {
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await fireEvent.press(screen.getByRole("button", { name: "Turn on the torch" }));
    expect(screen.getByRole("button", { name: "Turn off the torch" })).toBeTruthy();

    await act(async () => {
      mockAppStateHandler?.("background");
    });
    expect(screen.getByRole("button", { name: "Turn on the torch" })).toBeTruthy();
  });
});
