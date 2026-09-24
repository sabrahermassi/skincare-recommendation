import { manipulateAsync, SaveFormat } from "expo-image-manipulator";

import { MAX_IMAGE_CHARS } from "@/supabase/functions/_shared/image-limits";

/**
 * Smaller versions to try, in order, when a photo is still over the upload
 * limit after the usual resize (#251). A width cap doesn't bound a JPEG's
 * size: a detailed or noisy capture can encode past `MAX_IMAGE_CHARS` even at
 * `LIBRARY_MAX_WIDTH`, and the server then refuses it as an unreadable photo.
 *
 * Each step trades a little resolution and quality for size. The floor keeps
 * small print legible — below it, sending a photo Vision can't read is no
 * better than the refusal.
 */
const SHRINK_STEPS = [
  { scale: 0.75, compress: 0.7 },
  { scale: 0.5, compress: 0.6 },
] as const;
const MIN_WIDTH = 1000;

export type FittedUpload = {
  /** The photo to send — shrunk if it had to be, otherwise the one passed in. */
  base64: string;
  /** Temp files made on the way, for the caller to delete with the rest. */
  tempUris: string[];
};

/**
 * Shrink a label photo until its base64 fits `label-ocr`'s limit.
 *
 * `width` is the width of the image `base64` holds — the steps scale down
 * from it. `sourceUri` can be a larger original: each step resizes from it
 * directly, so quality isn't lost twice. Returns the last attempt if none fit
 * or one fails (the server's own refusal still covers that), and `base64`
 * untouched when it already fits or its width is unknown. Never throws.
 */
export async function fitUpload(sourceUri: string, base64: string, width: number | undefined): Promise<FittedUpload> {
  const tempUris: string[] = [];
  if (base64.length <= MAX_IMAGE_CHARS || !width) return { base64, tempUris };

  let smallest = base64;
  for (const step of SHRINK_STEPS) {
    // Never wider than the photo: one already at or under the floor (a tall
    // PNG screenshot, say) is still re-encoded as a JPEG at its own width,
    // which is often all it needs (#269 review).
    const target = Math.min(width, Math.max(MIN_WIDTH, Math.round(width * step.scale)));
    try {
      const shrunk = await manipulateAsync(sourceUri, [{ resize: { width: target } }], {
        base64: true,
        compress: step.compress,
        format: SaveFormat.JPEG,
      });
      tempUris.push(shrunk.uri);
      if (!shrunk.base64) continue;
      smallest = shrunk.base64;
    } catch {
      // Stop and send the best so far, still handing back every file already
      // made so the caller can delete it — a throw here used to strand them
      // in cache (#269 review).
      break;
    }
    if (smallest.length <= MAX_IMAGE_CHARS) break;
  }
  return { base64: smallest, tempUris };
}
