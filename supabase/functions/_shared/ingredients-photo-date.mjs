/**
 * When a product's ingredient list was photographed, read from Open Beauty
 * Facts' `images` (#446). Shared by the Node importers and the Deno
 * product-lookup Edge Function, so it stays runtime-neutral: plain ESM, no
 * imports.
 *
 * It is the only date OBF holds that follows the formula. `last_modified_t`
 * moves whenever one of OBF's bots touches a product, and our own `fetched_at`
 * is when we last read the row. The photo of the ingredient list is what the
 * text was typed or read from, so its upload time is how old the list is.
 *
 * `images` holds every uploaded photo under its number, and the photo chosen
 * for a role and language under `<role>_<language>`, pointing back by `imgid`:
 *
 *   { "2": { uploaded_t: "1523208574", … }, "ingredients_fr": { imgid: "2", … } }
 *
 * `uploaded_t` is seconds since 1970, a number in newer records and a string in
 * older ones. OBF has also described a nested layout
 * (`images.selected.ingredients.<language>` and `images.uploaded.<number>`);
 * its API and its export file both still answered in the flat one on 7 October
 * 2026, and both are read here.
 */

/** Seconds since 1970 as an ISO string, or null for anything that is not a real date. */
function isoFromSeconds(value) {
  const seconds = Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** The upload times of every photo selected as an ingredients picture, one per language. */
function selectedUploadTimes(images) {
  const uploaded = images.uploaded && typeof images.uploaded === "object" ? images.uploaded : images;
  const times = [];
  const add = (selected) => {
    if (!selected || typeof selected !== "object" || selected.imgid === undefined || selected.imgid === null) return;
    const photo = uploaded[String(selected.imgid)];
    const iso = photo && typeof photo === "object" ? isoFromSeconds(photo.uploaded_t) : null;
    if (iso) times.push(iso);
  };
  for (const [key, value] of Object.entries(images)) {
    if (key === "ingredients" || key.startsWith("ingredients_")) add(value);
  }
  const nested = images.selected && typeof images.selected === "object" ? images.selected.ingredients : null;
  if (nested && typeof nested === "object") for (const value of Object.values(nested)) add(value);
  return times;
}

/**
 * The newest upload time among the photos OBF has selected as this product's
 * ingredients picture, as an ISO string.
 *
 * - `undefined` when `images` was not in the answer at all: the caller did not
 *   look, so it must not write anything over a date already stored.
 * - `null` when it was there and no ingredients photo is selected: OBF has
 *   none, and the list's age is unknown.
 *
 * With one photo per language, the newest is taken: any of them is somebody
 * holding the product on that day.
 */
export function ingredientsPhotographedAt(images) {
  if (images === undefined) return undefined;
  if (images === null || typeof images !== "object" || Array.isArray(images)) return null;
  const times = selectedUploadTimes(images);
  return times.length > 0 ? times.sort()[times.length - 1] : null;
}
