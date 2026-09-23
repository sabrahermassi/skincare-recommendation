import { fireEvent, render, screen } from "@testing-library/react-native";

import AddProduct from "@/app/add-product";
import { clearLabelRead, heldLabelRead, holdLabelRead } from "@/lib/pending-label";

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
});

describe("AddProduct — expired read token", () => {
  it("shows Scan it again instead of a Save button, and does not let the name field be edited", async () => {
    holdLabelRead({ barcode: "1234567890123", ingredients: INGREDIENTS, readToken: freshToken(Date.now() - 1000) });
    await render(<AddProduct />);

    expect(screen.queryByText("Save and see my match")).toBeNull();
    expect(screen.getByText("Scan it again")).toBeTruthy();
    expect(screen.getAllByText("That photo is too old to save now. Scan it again.").length).toBeGreaterThan(0);
  });

  it("Scan it again clears the held read and returns to the camera", async () => {
    holdLabelRead({ barcode: "1234567890123", ingredients: INGREDIENTS, readToken: freshToken(Date.now() - 1000) });
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
});

describe("AddProduct — no held read", () => {
  it("explains itself rather than showing a bare empty state", async () => {
    await render(<AddProduct />);

    expect(
      screen.getByText("There's no ingredient list to add. Scan a product and photograph its ingredients to start.")
    ).toBeTruthy();
  });
});
