import { manipulateAsync } from "expo-image-manipulator";
import { launchImageLibraryAsync } from "expo-image-picker";

import { deleteTempFile, pickLabelPhoto } from "@/lib/pick-label-photo";
import { MAX_IMAGE_CHARS } from "@/supabase/functions/_shared/image-limits";

const deleted: string[] = [];

jest.mock("expo-image-picker", () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: jest.fn(),
  SaveFormat: { JPEG: "jpeg" },
}));
jest.mock("expo-file-system", () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    exists: true,
    delete: () => {
      deleted.push(uri);
    },
  })),
}));

// Structural cast rather than `jest.Mock`: the jest namespace is not in scope here (see jest-globals.d.ts).
type MockFn = { mockResolvedValue(value: unknown): void; mockRejectedValue(value: unknown): void };
const pick = launchImageLibraryAsync as unknown as MockFn;
const manipulate = manipulateAsync as unknown as MockFn;

const asset = (over: Record<string, unknown> = {}) => ({
  uri: "file:///cache/picked.jpg",
  base64: "PICKED",
  width: 1200,
  height: 900,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  deleted.length = 0;
});

/**
 * The chosen-photo step shared by the label camera and the permission screens: pick,
 * scale down if it is large, and hand back something that cleans up after itself.
 */
describe("pickLabelPhoto", () => {
  it("returns null when the person cancels", async () => {
    pick.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickLabelPhoto()).toBeNull();
  });

  it("returns a photo that is already small enough as it is, without re-encoding it", async () => {
    pick.mockResolvedValue({ canceled: false, assets: [asset()] });
    const photo = await pickLabelPhoto();
    expect(photo).toMatchObject({ base64: "PICKED", previewUri: "file:///cache/picked.jpg" });
    expect(manipulate).not.toHaveBeenCalled();
  });

  it("scales a large photo down to the widest size that is sent", async () => {
    pick.mockResolvedValue({ canceled: false, assets: [asset({ width: 4000, height: 3000 })] });
    manipulate.mockResolvedValue({ uri: "file:///cache/small.jpg", base64: "SMALL", width: 2000, height: 1500 });
    const photo = await pickLabelPhoto();
    expect(manipulate).toHaveBeenCalledWith(
      "file:///cache/picked.jpg",
      [{ resize: { width: 2000 } }],
      expect.objectContaining({ base64: true })
    );
    expect(photo?.base64).toBe("SMALL");
    // The preview is what the person chose, not the scaled copy.
    expect(photo?.previewUri).toBe("file:///cache/picked.jpg");
  });

  it("deletes both the picker's copy and the scaled one when cleaned up", async () => {
    pick.mockResolvedValue({ canceled: false, assets: [asset({ width: 4000 })] });
    manipulate.mockResolvedValue({ uri: "file:///cache/small.jpg", base64: "SMALL", width: 2000, height: 1500 });
    const photo = await pickLabelPhoto();
    photo?.cleanup();
    expect(deleted).toEqual(["file:///cache/picked.jpg", "file:///cache/small.jpg"]);
  });

  it("cleans up the picker's copy itself when scaling fails, then reports the failure", async () => {
    pick.mockResolvedValue({ canceled: false, assets: [asset({ width: 4000 })] });
    manipulate.mockRejectedValue(new Error("no memory"));
    await expect(pickLabelPhoto()).rejects.toThrow("no memory");
    expect(deleted).toEqual(["file:///cache/picked.jpg"]);
  });

  // #251: a width cap doesn't bound the encoded size.
  it("shrinks further when the scaled photo is still over the upload limit, and cleans that copy up too", async () => {
    const tooBig = "x".repeat(MAX_IMAGE_CHARS + 1);
    pick.mockResolvedValue({ canceled: false, assets: [asset({ width: 4000, height: 3000 })] });
    const resize = manipulateAsync as unknown as { mockResolvedValueOnce(value: unknown): typeof resize };
    resize
      .mockResolvedValueOnce({ uri: "file:///cache/small.jpg", base64: tooBig, width: 2000, height: 1500 })
      .mockResolvedValueOnce({ uri: "file:///cache/smaller.jpg", base64: "FITS", width: 1500, height: 1125 });

    const photo = await pickLabelPhoto();
    expect(manipulate).toHaveBeenLastCalledWith(
      "file:///cache/picked.jpg",
      [{ resize: { width: 1500 } }],
      expect.objectContaining({ base64: true })
    );
    expect(photo?.base64).toBe("FITS");
    photo?.cleanup();
    expect(deleted).toContain("file:///cache/smaller.jpg");
  });

  it("reports missing image data as undefined, for the caller to turn into a message", async () => {
    pick.mockResolvedValue({ canceled: false, assets: [asset({ base64: null })] });
    expect((await pickLabelPhoto())?.base64).toBeUndefined();
  });
});

describe("deleteTempFile", () => {
  it("only touches real files: web has no filesystem and returns the data as the uri", () => {
    deleteTempFile("data:image/jpeg;base64,AAAA");
    deleteTempFile(undefined);
    expect(deleted).toEqual([]);
    deleteTempFile("file:///cache/x.jpg");
    expect(deleted).toEqual(["file:///cache/x.jpg"]);
  });
});
