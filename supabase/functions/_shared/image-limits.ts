/**
 * The largest label photo `label-ocr` accepts, as the length of its base64
 * string — roughly 4 MB, well past what a legible label photo needs.
 *
 * Shared with the app (`lib/fit-upload.ts`) so a photo is shrunk to fit
 * before it's sent, rather than refused after (#251). Imports nothing and
 * touches no Deno global, so Node and Deno read the same number.
 */
export const MAX_IMAGE_CHARS = 5_500_000;
