import { openScannerAt } from "@/lib/open-scanner";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

// #315 review: a double tap pushed two scanners; `navigate` fixed that but
// slid back to an older scanner lower in the stack.
describe("openScanner", () => {
  beforeEach(() => mockPush.mockClear());

  it("pushes a fresh scanner", () => {
    openScannerAt(10_000);
    expect(mockPush).toHaveBeenCalledWith("/scanner");
  });

  it("ignores a second tap while the first open is still landing", () => {
    openScannerAt(20_000);
    openScannerAt(20_100);
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("opens again once the first open has landed", () => {
    openScannerAt(30_000);
    openScannerAt(31_000);
    expect(mockPush).toHaveBeenCalledTimes(2);
  });
});
