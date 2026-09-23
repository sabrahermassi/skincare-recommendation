import { act, fireEvent, render, screen } from "@testing-library/react-native";

import AddProduct from "@/app/add-product";
import { saveScannedProduct } from "@/data/api";
import { clearLabelRead, heldLabelRead, holdLabelRead } from "@/lib/pending-label";
import { READ_TOKEN_TTL_MS } from "@/supabase/functions/_shared/read-token";

/**
 * Covers issue #193: the ingredient review section, the read-only guarantee,
 * printed-order display, retake, and the expired-read-token path. The save
 * flow itself (name -> saveScannedProduct) already has no test either way;
 * this focuses on what #193 actually added.
 */

const mockReplace = jest.fn();

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    back: jest.fn(),
  },
  useLocalSearchParams: () => ({}),
}));

jest.mock("expo-camera", () => ({
  CameraView: () => null,
  useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()],
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/data/api", () => ({
  failureMessage: () => "",
  fetchProductByBarcode: jest.fn(),
  saveScannedProduct: jest.fn(),
}));

// Structural cast rather than `jest.Mock`: the jest namespace is not in scope here (see jest-globals.d.ts).
type MockFn = { mockReturnValue(value: unknown): void };

const INGREDIENTS = ["Water", "Glycerin", "Niacinamide"];

function freshToken(deadline: number) {
  return `${deadline}.aa`;
}

beforeEach(() => {
  mockReplace.mockClear();
  clearLabelRead();
});

describe("AddProduct — review section", () => {
  it("is collapsed by default and expands to the ingredients in printed order, unsorted", async () => {
    holdLabelRead({ barcode: "1234567890123", ingredients: INGREDIENTS, readToken: freshToken(Date.now() + 60_000) });
    await render(<AddProduct />);

    expect(screen.queryByText("Water")).toBeNull();

    await fireEvent.press(screen.getByText("3 ingredients read — check them"));

    const body = screen.getByText(/1\. Water/);
    expect(body).toBeTruthy();
    expect(screen.getByText(/2\. Glycerin/)).toBeTruthy();
    expect(screen.getByText(/3\. Niacinamide/)).toBeTruthy();
  });

  it("retake clears the held read and returns to the camera with the same barcode", async () => {
    holdLabelRead({ barcode: "1234567890123", ingredients: INGREDIENTS, readToken: freshToken(Date.now() + 60_000) });
    await render(<AddProduct />);

    await fireEvent.press(screen.getByText("3 ingredients read — check them"));
    await fireEvent.press(screen.getByText("Not right? Retake the photo"));

    expect(heldLabelRead()).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/scan-label", params: { barcode: "1234567890123" } });
  });

  it("retake is disabled while a save is in flight, so it can't clobber the save's own clear-and-navigate", async () => {
    // Found in review on #245: without this guard, tapping Retake mid-save
    // let the stale save's `.then` continuation run after a new photo had
    // already been held, wiping it out and navigating to the wrong result.
    let resolveSave!: (value: Awaited<ReturnType<typeof saveScannedProduct>>) => void;
    (saveScannedProduct as unknown as MockFn).mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      })
    );

    holdLabelRead({ barcode: "1234567890123", ingredients: INGREDIENTS, readToken: freshToken(Date.now() + 60_000) });
    await render(<AddProduct />);

    await fireEvent.changeText(screen.getByLabelText("Product name"), "Test Toner");
    await fireEvent.press(screen.getByText("Save and see my match"));
    await fireEvent.press(screen.getByText("3 ingredients read — check them"));
    await fireEvent.press(screen.getByText("Not right? Retake the photo"));

    // Retake did nothing: the held read from before the save is untouched,
    // and nothing navigated to the camera.
    expect(heldLabelRead()).not.toBeNull();
    expect(mockReplace).not.toHaveBeenCalledWith(expect.objectContaining({ pathname: "/scan-label" }));

    await act(async () => {
      resolveSave({ ok: false, reason: "failed" });
    });
  });
});

describe("AddProduct — expired read token", () => {
  it("shows Scan it again instead of a Save button, and does not let the name field be edited", async () => {
    holdLabelRead({
      barcode: "1234567890123",
      ingredients: INGREDIENTS,
      readToken: freshToken(Date.now() + 60_000),
      receivedAt: Date.now() - (READ_TOKEN_TTL_MS + 1000),
    });
    await render(<AddProduct />);

    expect(screen.queryByText("Save and see my match")).toBeNull();
    expect(screen.getByText("Scan it again")).toBeTruthy();
    expect(screen.getAllByText("That photo is too old to save now. Scan it again.").length).toBeGreaterThan(0);
  });

  it("Scan it again clears the held read and returns to the camera", async () => {
    holdLabelRead({
      barcode: "1234567890123",
      ingredients: INGREDIENTS,
      readToken: freshToken(Date.now() + 60_000),
      receivedAt: Date.now() - (READ_TOKEN_TTL_MS + 1000),
    });
    await render(<AddProduct />);

    await fireEvent.press(screen.getByText("Scan it again"));

    expect(heldLabelRead()).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/scan-label", params: { barcode: "1234567890123" } });
  });

  it("a not-yet-expired token still offers Save", async () => {
    holdLabelRead({ barcode: "1234567890123", ingredients: INGREDIENTS, readToken: freshToken(Date.now() + 60_000) });
    await render(<AddProduct />);

    expect(screen.getByText("Save and see my match")).toBeTruthy();
    expect(screen.queryByText("Scan it again")).toBeNull();
  });

  it("a token just received still offers Save even if the device clock reads past the token's own deadline", async () => {
    // Issue #193/#245 review: the eager check used to compare the token's
    // server-signed deadline straight against `Date.now()`, so a device
    // clock running ahead of the server made a token expired on arrival.
    // `freshToken` here is deliberately already past its own deadline —
    // what should decide "expired" is how long ago it was *received*, not
    // that stamp.
    holdLabelRead({
      barcode: "1234567890123",
      ingredients: INGREDIENTS,
      readToken: freshToken(Date.now() - 1000),
      receivedAt: Date.now(),
    });
    await render(<AddProduct />);

    expect(screen.getByText("Save and see my match")).toBeTruthy();
    expect(screen.queryByText("Scan it again")).toBeNull();
  });
});

describe("AddProduct — no held read", () => {
  it("explains itself rather than showing a bare empty state", async () => {
    await render(<AddProduct />);

    expect(
      screen.getByText("There's no ingredient list to add. Scan a product and photograph its ingredients to start.")
    ).toBeTruthy();
  });
});
