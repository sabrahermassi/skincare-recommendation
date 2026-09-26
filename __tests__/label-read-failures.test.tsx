import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { LabelCamera } from "@/components/LabelCamera";
import { readLabel } from "@/data/api";

/**
 * #155: what the label camera shows for each way a read can fail, through the
 * real mapping (`readLabelPhoto` → `failureCopy` → `scanStateCopy`, #204) —
 * only the server's answer is faked. "Couldn't read it" is the photo's fault
 * and offers another photo; "couldn't reach us" never blames the photo; a
 * rate limit says so in its own words.
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
// The picture is fine; what the server says about it is the test.
jest.mock("@/lib/image-metadata", () => ({ stripBase64ImageMetadata: (base64: string) => ({ ok: true, base64 }) }));
jest.mock("@/data/api", () => ({ ...jest.requireActual("@/data/api"), readLabel: jest.fn() }));

type ReadMock = { mockResolvedValueOnce(value: unknown): void };

async function readAPhotoThatFails(reason: string) {
  (readLabel as unknown as ReadMock).mockResolvedValueOnce({ ok: false, reason });
  await render(<LabelCamera camera={{ current: null }} cameraSize={null} window={null} onRead={jest.fn()} bottomInset={0} />);
  await fireEvent.press(screen.getByLabelText("Choose a photo of the ingredient list from your library"));
  await act(async () => {});
}

describe("a label read that fails", () => {
  it("couldn't read it: blames the photo, and offers Try again or another photo", async () => {
    await readAPhotoThatFails("too_little_text");
    expect(screen.getAllByText("We couldn't read the ingredients").length).toBeGreaterThan(0);
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Choose a photo instead" })).toBeTruthy();
  });

  it("couldn't reach us: says it's us or the connection, and offers Search", async () => {
    await readAPhotoThatFails("network_error");
    expect(screen.getAllByText("We couldn't check that just now").length).toBeGreaterThan(0);
    expect(screen.getAllByText("It's us or the connection, not your scan.").length).toBeGreaterThan(0);
    expect(screen.getByText("Try again")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Find it in Search" })).toBeTruthy();
    expect(screen.queryByText("We couldn't read the ingredients")).toBeNull();
  });

  it("rate limited: asks for a short break, in its own words", async () => {
    await readAPhotoThatFails("rate_limited");
    expect(screen.getAllByText("Let's take a short break").length).toBeGreaterThan(0);
    expect(screen.getAllByText("That was a lot of scans at once. Try again in a minute or two.").length).toBeGreaterThan(0);
    expect(screen.queryByText("We couldn't read the ingredients")).toBeNull();
  });

  it("a list in names we don't know yet: doesn't tell someone to get closer", async () => {
    await readAPhotoThatFails("unrecognised_names");
    expect(screen.getAllByText("We don't know enough of these names yet").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Get closer/)).toBeNull();
  });
});
