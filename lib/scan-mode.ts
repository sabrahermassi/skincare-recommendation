/**
 * Which scanner mode to open in, remembered for the session only.
 *
 * A cold start always opens Photo (issue #214, decision 1) — reading a label
 * works everywhere, a barcode only when the catalogue already has the
 * product. Switching modes within a session is remembered so backgrounding
 * the app, or leaving the scanner and coming back, doesn't keep resetting to
 * Photo out from under someone who picked Barcode on purpose. A persisted
 * mode would be a store shape change needing a version bump and a
 * `migratePersisted` case, for a preference not worth one — same reasoning as
 * `lib/pending-label.ts`, so this is a module value too.
 */

export type ScanMode = "Barcode" | "Photo";

let remembered: ScanMode = "Photo";

export function rememberedScanMode(): ScanMode {
  return remembered;
}

export function rememberScanMode(mode: ScanMode): void {
  remembered = mode;
}
