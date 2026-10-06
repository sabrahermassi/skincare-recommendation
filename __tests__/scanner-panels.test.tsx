import { act, fireEvent, render, screen, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import Scan from "@/app/scanner";
import { fetchProductByBarcode } from "@/data/api";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { useAppStore } from "@/store/useAppStore";

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

// The scanner's own route params (`?mode=photo&barcode=…`, #204).
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => {
  const React = require("react");
  return {
    router: { push: jest.fn(), back: jest.fn(), navigate: jest.fn(), dismissTo: jest.fn(), canGoBack: () => true },
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, []),
    useLocalSearchParams: () => mockParams,
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

// Photo mode's camera: whether it is showing.
let mockLabelCameraShown = false;
jest.mock("@/components/LabelCamera", () => ({
  LabelCamera: () => {
    mockLabelCameraShown = true;
    return null;
  },
}));
jest.mock("@/components/ScanIntro", () => ({ ScanIntro: () => null }));
jest.mock("@/components/ChoosePhotoInstead", () => ({ ChoosePhotoInstead: () => null }));
jest.mock("@/components/ProductThumbnail", () => ({ ProductThumbnail: () => null }));
jest.mock("@/components/ScanViewfinder", () => ({
  ScanViewfinder: () => null,
  barcodeBox: () => undefined,
  SCAN_SIDE_INSET: 20,
}));

jest.mock("@/data/api", () => ({
  isProductBarcode: (id: string) => /^\d{8,14}$/.test(id),
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
  mockParams = {};
  mockLabelCameraShown = false;
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
    ingredients,
  };
}

// #405: the shield on the found card, only when #404's own check applies.
describe("the found card and the EU safety notice", () => {
  const HICC: Ingredient = {
    id: "hicc",
    name: "hydroxyisohexyl 3-cyclohexene carboxaldehyde",
    comedogenic: 0,
    safety: "avoid",
    verified: true,
    note: "Prohibited in cosmetics (EU Annex II/1380: not allowed on the EU market since 23 August 2019 and not to be sold there since 23 August 2021; older stock may still be around)",
  };
  const HYDROQUINONE: Ingredient = { id: "hq", name: "hydroquinone", comedogenic: 0, safety: "avoid", verified: true, note: "Prohibited in cosmetics (EU Annex II/1339 III/14)" };
  const SHIELD = "Contains an ingredient not permitted in EU cosmetics. Check the label.";
  const withExtra = (extra: Ingredient): ProductWithIngredients => {
    const base = foundProduct("8801234567890");
    return { ...base, ingredients: [...base.ingredients, extra], ingredientIds: [...base.ingredientIds, extra.id] };
  };
  async function found(product: ProductWithIngredients) {
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: product });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));
    await scan("8801234567890");
  }
  afterEach(() => useAppStore.setState({ safetyNoticeEnabled: false }, false));

  it("shows the shield beside the pill, and says it in the card's hint, with the flag on", async () => {
    useAppStore.setState({ safetyNoticeEnabled: true }, false);
    await found(withExtra(HICC));
    expect(screen.getByLabelText(SHIELD)).toBeTruthy();
    expect(screen.getByRole("button", { name: "See the full result" }).props.accessibilityHint).toContain(SHIELD);
  });

  it("shows none with the flag off", async () => {
    await found(withExtra(HICC));
    expect(screen.queryByLabelText(SHIELD)).toBeNull();
    expect(screen.getByRole("button", { name: "See the full result" }).props.accessibilityHint).toBe("Brand Toner");
  });

  it("shows none for hydroquinone, whose entry is not verified", async () => {
    useAppStore.setState({ safetyNoticeEnabled: true }, false);
    await found(withExtra(HYDROQUINONE));
    expect(screen.queryByLabelText(SHIELD)).toBeNull();
  });
});

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
    // Centred like the line above it, also on two lines (found in the simulator).
    expect(StyleSheet.flatten(screen.getByText(HINT).props.style).textAlign).toBe("center");
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

  // Search is gone (v9): an unreachable lookup offers no way to it.
  it("offers no Search when the lookup couldn't be made", async () => {
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: false, failure: { kind: "offline" } });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));
    await scan("8801234567890");

    expect(screen.queryByText("Find it in Search")).toBeNull();
  });

  it("lets you leave a plain miss the same way", async () => {
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: null });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("8801234567890");
    expect(screen.getByText("Not in our catalogue yet")).toBeTruthy();

    // One button on the sheet (v9); tapping the dimmed camera puts it back to scanning.
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("button", { name: "Scan the ingredient list" })).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Not in our catalogue yet")).toBeNull();
  });

  // Found during manual device QA on #268: the status panel's render guard
  // only excluded "idle", not "found", and its message ternary has no
  // "found" branch — so a successful scan showed the correct found sheet
  // with the wrong "Not in our catalogue yet" panel stacked
  // underneath it, straight from the panel's own fallback case.
  it("shows only the found sheet, never the status panel, once a barcode resolves to a known product", async () => {
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: foundProduct("8801234567890") });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("8801234567890");
    expect(screen.getByRole("button", { name: "See the full result" })).toBeTruthy();
    expect(screen.queryByText("Not in our catalogue yet")).toBeNull();
    expect(screen.queryByText("Photograph its ingredient list and we'll add it")).toBeNull();
  });

  // Opened from Skin needs, the found card answers that path's question in
  // words (owner, 2 October 2026), and hands the pick on to the result.
  it("says on the found card whether the product has an active for the Skin needs pick, with no score", async () => {
    mockParams = { mode: "photo", from: "journey", need: "pimples.." };
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: foundProduct("8801234567890") });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("8801234567890");
    expect(within(screen.getByTestId("found-pill")).getByText(/^(Works on|Helps a little with|Not made for) pimples$/)).toBeTruthy();
    expect(within(screen.getByTestId("found-pill")).queryByText(/\/100/)).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "See the full result" }));
    const { router } = jest.requireMock("expo-router") as { router: { push: MockFn } };
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ from: "journey", need: "pimples.." }) }));
  });

  // A scan started from a routine step hands that step on to the result, which offers "Add to <step>" (owner, 3 October 2026).
  it("hands the routine step it was opened from on to the result", async () => {
    mockParams = { step: "evening:treatment" };
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: foundProduct("8801234567890") });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("8801234567890");
    await fireEvent.press(screen.getByRole("button", { name: "See the full result" }));
    const { router } = jest.requireMock("expo-router") as { router: { push: MockFn } };
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ step: "evening:treatment" }) }));
  });

  // Found in review on #259 (Codex): "Scan the ingredient list" on a plain miss
  // keeps `status` as `missed` after switching to Photo mode. If the user backs
  // out of that by tapping Barcode instead, the stale sheet used to reappear
  // immediately and block scanning.
  it("clears a stale miss when backing out of the ingredient photo to Barcode", async () => {
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: null });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("8801234567890");
    expect(screen.getByText("Not in our catalogue yet")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Scan the ingredient list" }));
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));
    expect(screen.queryByText("Not in our catalogue yet")).toBeNull();

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

// #204: every "Retake the photo" opens the scanner in Photo mode, instead of a
// second camera screen. No barcode rides along: a read is only shown, never
// saved under one.
describe("scanner opened for a photo", () => {
  it("opens in Photo mode", async () => {
    mockParams = { mode: "photo" };
    await render(<Scan />);
    expect(screen.getByRole("tab", { name: "Ingredient list" }).props.accessibilityState).toMatchObject({ selected: true });
    expect(mockLabelCameraShown).toBe(true);
  });

  it("switches an open scanner to Photo when a retake comes back", async () => {
    const view = await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));
    expect(screen.getByRole("tab", { name: "Barcode" }).props.accessibilityState).toMatchObject({ selected: true });

    mockParams = { mode: "photo" };
    await view.rerender(<Scan />);
    expect(screen.getByRole("tab", { name: "Ingredient list" }).props.accessibilityState).toMatchObject({ selected: true });
  });
});

// From a routine step only a catalogue product can be added, and a photographed
// label cannot, so the scanner opens on Barcode (owner, 3 October 2026).
describe("scanner opened from a routine step", () => {
  it("opens on Barcode, not the cold-start Photo", async () => {
    mockParams = { step: "evening:treatment" };
    await render(<Scan />);
    expect(screen.getByRole("tab", { name: "Barcode" }).props.accessibilityState).toMatchObject({ selected: true });
    expect(mockLabelCameraShown).toBe(false);
  });

  it("still opens in Photo when a photo was asked for", async () => {
    mockParams = { step: "evening:treatment", mode: "photo" };
    await render(<Scan />);
    expect(screen.getByRole("tab", { name: "Ingredient list" }).props.accessibilityState).toMatchObject({ selected: true });
  });
});

// #204: history is for products someone could find again.
describe("scanner history", () => {
  it("keeps a QR code out of history, and still records an unknown product barcode", async () => {
    useAppStore.setState({ history: [] });
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: null });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));

    await scan("https://example.com/promo");
    expect(useAppStore.getState().history).toEqual([]);

    await fireEvent.press(screen.getByRole("button", { name: "Scan again" }));
    await scan("8801234567890");
    expect(useAppStore.getState().history.map((entry) => entry.id)).toEqual(["8801234567890"]);
  });
});

// #323: a code that isn't a product offers the name on the pack as a way in.
// A barcode we don't have no longer does (v9): its way on is the ingredient
// list, below.
// The top row (v7): the glass close button, both modes in one pill with a
// thumb that slides between them, and the torch.
describe("scanner controls", () => {
  it("has a glass close button that goes back", async () => {
    const { router } = jest.requireMock("expo-router") as { router: { back: MockFn } };
    router.back.mockClear();
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("button", { name: "Close scanner" }));
    expect(router.back).toHaveBeenCalled();
  });

  it("raises a no-match pop-up for a barcode we don't have, with the ingredient photo and Try again (v9)", async () => {
    (fetchProductByBarcode as unknown as MockFn).mockResolvedValue({ ok: true, value: null });
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));
    await scan("8801234567890");

    expect(screen.getByText("Not in our catalogue yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scan the ingredient list" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Search by name" })).toBeNull();

    // Tapping the dimmed camera closes it too.
    await fireEvent.press(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByText("Not in our catalogue yet")).toBeNull();
    expect(screen.getByRole("tab", { name: "Barcode" })).toBeTruthy();
  });

  it("offers scanning again for a code that isn't a product, and never Search or adding it", async () => {
    await render(<Scan />);
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));
    await scan("https://example.com/promo");

    expect(screen.getByText("That's not a product barcode")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Scan again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Search by name" })).toBeNull();
    expect(screen.queryByText(/add/i)).toBeNull();
  });

  it("offers both modes as tabs, and moves the selection when a mode is tapped", async () => {
    await render(<Scan />);
    expect(screen.getAllByRole("tab").map((tab) => tab.props.accessibilityLabel)).toEqual(["Barcode", "Ingredient list"]);
    await fireEvent.press(screen.getByRole("tab", { name: "Ingredient list" }));
    expect(screen.getByRole("tab", { name: "Ingredient list" }).props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByRole("tab", { name: "Barcode" }).props.accessibilityState).toMatchObject({ selected: false });
    await fireEvent.press(screen.getByRole("tab", { name: "Barcode" }));
    expect(screen.getByRole("tab", { name: "Barcode" }).props.accessibilityState).toMatchObject({ selected: true });
  });
});
