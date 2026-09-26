import { canPhotographLabelFor } from "@/data/api";

/**
 * Route parameters as they arrive from a link (#29).
 *
 * Any web page, QR code or other app can open `forme://…` with whatever it
 * likes in the path and query, and Expo Router hands it to the screen as-is.
 * Each screen that reads a parameter passes it through one of these first, so
 * a malformed value becomes "not there" — the not-found or empty state — and
 * never reaches a query, the saved shelf or the screen's text. Which routes
 * may be opened from a link is listed in `docs/threat-model.md`.
 *
 * Expo Router gives a repeated query key (`?id=a&id=b`) as an array, which no
 * screen expects: that is refused too.
 */
type Raw = string | string[] | undefined;

function single(raw: Raw): string | null {
  return typeof raw === "string" ? raw : null;
}

/** Longer than any id the catalogue makes (`obf-` + a 14-digit barcode, a DailyMed UUID). */
export const MAX_PRODUCT_ID_LENGTH = 128;

/**
 * A catalogue product id: letters, digits, `-` and `_`, starting with a letter
 * or digit — `obf-8801234567890`, `ocr-…`, `inci-…`, `hanbang-rice-serum`.
 */
export function productIdParam(raw: Raw): string | null {
  const value = single(raw);
  if (!value || value.length > MAX_PRODUCT_ID_LENGTH) return null;
  return /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(value) ? value : null;
}

/**
 * Past the longest name in the dictionary (1,928 characters on staging, 26 Sep
 * 2026 — 145 names run over 200), so every stored name still opens; it bounds
 * what a link can put on screen, not what counts as a plausible name.
 */
export const MAX_INGREDIENT_NAME_LENGTH = 2048;

/**
 * An ingredient name. Names are free text — any script, spaces, brackets,
 * slashes, `%` — so this refuses only what no name contains: nothing at all,
 * something past `MAX_INGREDIENT_NAME_LENGTH`, and control or invisible
 * formatting characters (a right-to-left override can make one name display
 * as another).
 */
export function ingredientNameParam(raw: Raw): string | null {
  const value = single(raw);
  if (!value || value.trim().length === 0 || value.length > MAX_INGREDIENT_NAME_LENGTH) return null;
  return /[\p{Cc}\p{Cf}]/u.test(value) ? null : value;
}

/** A barcode the label functions will accept (`canPhotographLabelFor`), or undefined. */
export function barcodeParam(raw: Raw): string | undefined {
  const value = single(raw);
  return value !== null && canPhotographLabelFor(value) ? value : undefined;
}
