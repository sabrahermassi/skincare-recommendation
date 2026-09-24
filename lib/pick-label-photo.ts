import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { launchImageLibraryAsync } from "expo-image-picker";

import { shrinkWidth } from "@/lib/crop-to-guide";
import { fitUpload } from "@/lib/fit-upload";

/**
 * The widest a photo of the ingredient list is sent: the text stays readable,
 * the upload stays small. Shared with the camera path in
 * `components/LabelCamera.tsx` so the two cannot drift apart.
 */
export const LIBRARY_MAX_WIDTH = 2000;

/**
 * Remove a temp photo file from cache once nothing needs it any more — see
 * issue #27. Best-effort: a file the OS will eventually reclaim from cache on
 * its own is a smaller problem than a cleanup step throwing and masking the
 * scan result the user is already looking at.
 *
 * The `file://` guard isn't just defensive — a captured picture's own doc
 * comment says web has no filesystem and returns the base64 string as `uri`
 * instead, so this is a correct, self-documented no-op there rather than
 * something that happens to survive by falling into the `catch`.
 */
export function deleteTempFile(uri: string | undefined) {
  if (!uri || !uri.startsWith("file://")) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Nothing to do — see above.
  }
}

export type PickedLabelPhoto = {
  /** The picture, scaled down if it was large, ready to be cleaned and sent. Undefined if the picker gave no image data. */
  base64: string | undefined;
  /** The chosen picture as the picker returned it, for showing while it is read. */
  previewUri: string;
  /** Deletes the picker's copy and the scaled-down one. Call once the read is over, whatever its outcome. */
  cleanup: () => void;
};

/**
 * Let the user choose a photo of an ingredient list from their library, for the
 * places that read one: the label camera and the two permission screens that
 * offer this when the camera is off. Returns null when they cancel.
 *
 * A picked picture is already the user's own framing: there is no guide box to
 * crop to, so it is sent whole (after being scaled down, which a full-size phone
 * photo needs to stay under the upload limit).
 */
export async function pickLabelPhoto(): Promise<PickedLabelPhoto | null> {
  const picked = await launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.8 });
  if (picked.canceled || !picked.assets?.[0]) return null;

  let photo = picked.assets[0];
  const pickedUri = photo.uri;
  let resizedUri: string | undefined;
  const shrunkUris: string[] = [];
  const cleanup = () => {
    deleteTempFile(pickedUri);
    deleteTempFile(resizedUri);
    for (const uri of shrunkUris) deleteTempFile(uri);
  };

  try {
    const width = shrinkWidth(photo.width, LIBRARY_MAX_WIDTH);
    if (width) {
      const resized = await manipulateAsync(photo.uri, [{ resize: { width } }], {
        base64: true,
        compress: 0.8,
        format: SaveFormat.JPEG,
      });
      resizedUri = resized.uri;
      photo = { ...photo, uri: resized.uri, base64: resized.base64, width: resized.width, height: resized.height };
    }
    // A width cap alone doesn't bound the encoded size (#251).
    if (photo.base64) {
      const fitted = await fitUpload(pickedUri, photo.base64, photo.width);
      shrunkUris.push(...fitted.tempUris);
      photo = { ...photo, base64: fitted.base64 };
    }
  } catch (error) {
    cleanup();
    throw error;
  }

  return { base64: photo.base64 ?? undefined, previewUri: pickedUri, cleanup };
}
