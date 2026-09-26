import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { ScanViewfinder, type Box } from "@/components/ScanViewfinder";

/**
 * The scanner's framing (after OnSkin's scanner): Barcode is a small window
 * in the middle with a hint under it, Photo a tall one; outside the window the
 * camera is blurred. What the camera and the photo crop read is the window the
 * mode is settling on.
 */

const SCREEN = { width: 390, height: 844 };
const TOP = 100;
const BOTTOM = 120;

async function renderFrame(frame: "corners" | "full", onWindow: (box: Box) => void, hint: string | null = null) {
  await render(<ScanViewfinder topInset={TOP} bottomInset={BOTTOM} locked={false} frame={frame} hint={hint} onWindow={onWindow} />);
  // The viewfinder sizes itself from its own layout.
  const root = screen.getByTestId("scan-viewfinder");
  await act(async () => fireEvent(root, "layout", { nativeEvent: { layout: SCREEN } }));
}

it("frames a barcode in a small window in the middle, twice as wide as tall", async () => {
  const onWindow = jest.fn();
  await renderFrame("corners", onWindow);
  const box = onWindow.mock.calls.at(-1)?.[0] as Box;
  expect(box.width).toBeCloseTo(SCREEN.width * 0.63);
  expect(box.width / box.height).toBeCloseTo(2);
  expect(box.x + box.width / 2).toBeCloseTo(SCREEN.width / 2);
});

it("frames a photo in a tall window filling the room between the insets", async () => {
  const onWindow = jest.fn();
  await renderFrame("full", onWindow);
  const box = onWindow.mock.calls.at(-1)?.[0] as Box;
  expect(box.height).toBeGreaterThan(box.width);
  expect(box.y + box.height).toBeCloseTo(SCREEN.height - BOTTOM);
});

it("shows the barcode hint under the window", async () => {
  await renderFrame("corners", jest.fn(), "Point your camera at the barcode");
  expect(screen.getByText("Point your camera at the barcode", { includeHiddenElements: true })).toBeTruthy();
});
