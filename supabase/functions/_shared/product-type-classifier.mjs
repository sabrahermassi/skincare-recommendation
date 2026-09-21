/**
 * Product-type classification shared by the Node OBF importer and the Deno
 * product-lookup Edge Function.
 *
 * Keep this module runtime-neutral: plain ESM, no Node, Deno, React Native, or
 * Supabase imports. Both callers can therefore execute the same decisions
 * instead of comparing two hand-maintained regex copies after the fact.
 */

const BEFORE_MASK_RULES = [
  [/hand.?cream|crème mains|handcreme/, "hand-cream"],
  [/eye[\s-]?cream/, "eye-cream"],
  [/body.?butter/, "body-butter"],
  [/body.?(wash|gel)|shower|douche|duschgel/, "body-wash"],
  [/body.?scrub|body.?exfoliat/, "body-scrub"],
  [/body.?(lotion|milk)|body ?lotion|lait corporel/, "body-lotion"],
  [/foot[\s-]?(cream|balm)/, "foot-cream"],
  // A lip balm with SPF is still a lip balm.
  [/lip[\s-]?(balm|butter|care)|l[èe]vres|dudak|губ/, "lip-balm"],
  // These must beat the broad cleanser wording in names such as "Deep
  // Cleansing Shampoo".
  [/shampoo/, "shampoo"],
  // "Skin Conditioner" is a face product, not a hair conditioner.
  [/(?<!skin[\s-])conditioner/, "conditioner"],
];

const AFTER_MASK_RULES = [
  // A micellar water is wiped off rather than rinsed. Explicit rinse-off
  // format words keep the product out of this full-contact type regardless
  // of whether they occur before or after "micellar water".
  [
    /^(?=.*micellar)(?=.*water)(?!.*(\bcleanser\b|foam|wash|gel|nettoyant|lavante?|reinigings|schuimende|limpiador|detergente|waschgel|syndet))/,
    "micellar-water",
  ],
  [
    /cleanser|foam|cleansing|nettoyant|lavante?|reinigings|schuimende|limpiador|detergente|waschgel|syndet/,
    "cleanser",
  ],
  [/sun|spf|uv|solaire|zonnebrand/, "sunscreen"],
  [/toner|tonic|lotion tonique/, "toner"],
  [/essence/, "essence"],
  [/ampoule/, "ampoule"],
  [/(facial|face)[\s-]?oil/, "facial-oil"],
  [/hair[\s-]?oil/, "hair-oil"],
  [/serum|sérum/, "serum"],
  [/perfume|eau de (parfum|toilette)/, "perfume"],
  [/(facial|face)[\s-]?mist/, "facial-mist"],
  [/deodorant|antiperspirant/, "deodorant"],
  [/exfoliat|scrub/, "exfoliator"],
  [/cream|moisturi[sz]er|lotion|emulsion|crème|creme|crema|gezichtscrème/, "moisturizer"],
];

const MASK_TYPE_PRIORITY = [
  "pimple-patch",
  "eye-patch",
  "hair-mask",
  "sheet-mask",
  "night-mask",
  "face-mask",
];

const HAIR_WORDS = new Set([
  "hair",
  "capillaire",
  "capillare",
  "capelli",
  "capilar",
  "haar",
  "cheveux",
]);

// A body-part mask must never fall through to either the night-mask or the
// generic face-mask type. Unknown is intentional until the app has a matching
// product family. The localized words are all examples observed in catalogue
// or review data, not a claim that this is a translation dictionary.
const NON_FACE_BODY_WORDS = new Set([
  ...HAIR_WORDS,
  "body",
  "foot",
  "feet",
  "hand",
  "hands",
  "lip",
  "lips",
  "neck",
  "chest",
  "breast",
  "belly",
  "butt",
  "buttocks",
  "leg",
  "legs",
  "arm",
  "arms",
  "heel",
  "heels",
  "elbow",
  "elbows",
  "mains",
  "pieds",
  "pies",
  "manos",
  "mani",
  "piedi",
  "labbra",
  "labios",
]);

// A pad or mask that wipes makeup off is a cleanser-family product, not an eye
// patch — micellar water (and its German/French spellings) is the same idea.
const REMOVAL_WORDS = new Set([
  "makeup",
  "cotton",
  "wipe",
  "wipes",
  "micellar",
  "micellaire",
  "mizellar",
  "mizellen",
  "entferner",
]);

function words(value) {
  return String(value ?? "").toLowerCase().match(/[\p{L}\p{N}.]+/gu) ?? [];
}

function hasAny(tokens, choices) {
  return tokens.some((token) => choices.has(token));
}

function hasStem(tokens, stems) {
  return tokens.some((token) => stems.some((stem) => token.startsWith(stem)));
}

function isMaskWord(token) {
  return /^(?:masks?|masken|maskes?|maski|maskesi|mascher[ae]|masques?|mascarillas?)$/.test(
    token
  );
}

/**
 * Resolve only the mask/patch family from already-tokenized text.
 *
 * Specific physical formats win before use-time words: an overnight sheet
 * mask is a sheet mask, not a night mask. Body-part evidence is a hard stop
 * before the two face-oriented fallbacks. This removes the sequence of regex
 * gap/exclusion fixes that previously made every review expose a new neighbor.
 */
function maskOrPatchFromTokens(tokens) {
  const hasMask = tokens.some(isMaskWord);
  const hasPatch = tokens.some((token) => token === "patch" || token === "patches");
  const hasPad = tokens.some((token) => token === "pad" || token === "pads");
  const hasAcne = tokens.some((token) =>
    ["acne", "pimple", "pimples", "blemish", "blemishes"].includes(token)
  );
  const hasEye = tokens.some((token) =>
    ["eye", "eyes", "undereye", "under-eye"].includes(token)
  );
  const hasEyePatchCompound = tokens.some((token) =>
    ["eyepatch", "eyepatches", "eyemask", "eyemasks"].includes(token)
  );
  const hasEyePadCompound = tokens.some((token) =>
    ["eyepad", "eyepads"].includes(token)
  );
  const hasRemovalContext =
    hasAny(tokens, REMOVAL_WORDS) || hasStem(tokens, ["cleans", "remov"]);

  if (hasAcne && hasPatch) return { matched: true, type: "pimple-patch" };
  if (
    hasEyePatchCompound ||
    (hasEye && (hasPatch || hasMask || (hasPad && !hasRemovalContext))) ||
    (hasEyePadCompound && !hasRemovalContext)
  ) {
    return { matched: true, type: "eye-patch" };
  }
  if (hasMask && hasAny(tokens, HAIR_WORDS)) {
    return { matched: true, type: "hair-mask" };
  }
  if (hasMask && tokens.some((token) => token === "sheet" || token === "sheets")) {
    return { matched: true, type: "sheet-mask" };
  }
  if (hasMask && hasAny(tokens, NON_FACE_BODY_WORDS)) {
    return { matched: true, type: null };
  }
  if (
    hasMask &&
    tokens.some((token) => ["sleeping", "night", "overnight"].includes(token))
  ) {
    return { matched: true, type: "night-mask" };
  }
  return hasMask
    ? { matched: true, type: "face-mask" }
    : { matched: false, type: null };
}

/**
 * Classify mask/patch tags independently before using the product title.
 * One broad category tag must not leak body-part words into an otherwise
 * specific title, which was possible when tags and name shared one haystack.
 */
function guessMaskOrPatchType(tags, text) {
  const titleCandidate = maskOrPatchFromTokens(words(text));
  // A body-part mask named in the title is direct contrary evidence. Do not
  // let a broad face-mask category relabel it as a facial product.
  if (titleCandidate.matched && !titleCandidate.type) return "unknown";

  const tagCandidates = (tags ?? []).map((tag) => maskOrPatchFromTokens(words(tag)));
  const candidates = [
    ...tagCandidates.map((candidate) => candidate.type).filter(Boolean),
    titleCandidate.type,
  ].filter(Boolean);
  for (const type of MASK_TYPE_PRIORITY) {
    if (candidates.includes(type)) return type;
  }

  // A body-mask tag with no more specific evidence is intentionally unknown.
  return tagCandidates.some((candidate) => candidate.matched) ? "unknown" : null;
}

function firstMatch(rules, text) {
  for (const [pattern, type] of rules) {
    if (pattern.test(text)) return type;
  }
  return null;
}

/**
 * Best-effort ProductType classification for sources already known to be
 * cosmetic/skincare. Ambiguous input returns "unknown" rather than inventing
 * a specific answer.
 *
 * @param {string[]} tags source category tags
 * @param {string} text product name/title
 * @returns {string}
 */
export function guessType(tags = [], text = "") {
  const haystack = `${tags.join(" ")} ${text}`.toLowerCase();
  const beforeMask = firstMatch(BEFORE_MASK_RULES, haystack);
  if (beforeMask) return beforeMask;

  const maskOrPatch = guessMaskOrPatchType(tags, text);
  if (maskOrPatch) return maskOrPatch;

  return firstMatch(AFTER_MASK_RULES, haystack) ?? "unknown";
}

/**
 * Generic UPC catalogue gate retained for unambiguous non-mask products.
 *
 * "deodorant"/"antiperspirant" were missing until issue #86's audit script
 * flagged a real CRYSTAL Mineral Deodorant hit as non-cosmetic junk — the
 * same category `guessType`'s `AFTER_MASK_RULES` already types as
 * "deodorant" above, this gate just never recognised it as cosmetic at all.
 */
export function looksCosmetic(text) {
  return /beauty|cosmetic|personal care|skin|face|facial|body care|hair care|lotion|cream|crème|creme|serum|cleanser|shampoo|toner|sunscreen|spf|balm|moisturi|nettoyant|reinigings|limpiador|crema|deodorant|antiperspirant/i
    .test(text);
}
