/**
 * Whether a product from the whole Open Beauty Facts database is face
 * skincare, for the sweep that reads every product rather than six categories
 * (`import-obf.mjs --dump`).
 *
 * The category sweep can trust OBF's own tags: everything under `en:face` is
 * face care. The whole database cannot. About a third of its complete
 * products carry no category at all, and the type guessed from a name is
 * wrong in ways that only show at this scale (measured over the 2 October
 * 2026 dump, 76,857 products): a "Cremeseife" (cream soap) and a "Zahncreme"
 * (toothpaste) read as moisturisers, a shaving gel as a cleanser, the make-up
 * brand "Essence" and the shampoo "Herbal Essences" as essences, a "serum
 * lipstick" as a serum. The first time a sweep ran without a relevance filter
 * it filled the catalogue with deodorant, shampoo and dish soap.
 *
 * So a row is kept only when both hold:
 *   1. the type guessed from its name and tags is one a face routine uses.
 *      The guess from ingredients alone is not enough here: a UV filter makes
 *      a hairspray a "sunscreen" and lactic acid makes a hand soap a "serum";
 *   2. nothing in its name, brand or tags says it is something else.
 *
 * It errs towards dropping. A real face cream lost to a stray word costs one
 * product out of thousands; a hand soap kept is scored against someone's skin
 * profile and offered as their moisturiser.
 */

/** The types a face routine uses. Lip balms, hand creams, body and hair care are other imports' business. */
export const FACE_TYPES = new Set([
  "cleanser",
  "micellar-water",
  "toner",
  "essence",
  "serum",
  "ampoule",
  "exfoliator",
  "facial-mist",
  "moisturizer",
  "facial-oil",
  "night-mask",
  "sunscreen",
  "eye-cream",
  "face-mask",
  "sheet-mask",
]);

// OBF tags, in any of its languages, that place a product outside face care.
const OTHER_CATEGORY =
  /(^|:)(hair|shampoo|conditioner|apres-shampo|cheveux|haar|capelli|cabello|body($|-)|corps|koerper|corpo|showers?-|bath|douche|soaps?($|-)|savons|seifen|liquid-soaps|hand-|hands$|mains|feet|foot|pieds|shaving|rasage|rasur|scheren|deodorants?|anti-perspirants|perfumes?|parfum|cologne|eau-de|makeup|make-up|maquillage|lipsticks?|mascara|eyeliner|foundations?|nail|baby-wipes|moist-wipes|wipes|lingettes|intimate|oral|tooth|dentifrice|mouthwash|beard|bart|barbe|tattoo|massage|insect|self-tann)/i;

// Words in a name that say what a product is, when it is not face care. Whole
// words, in the languages the database holds most of: English, French,
// German, Dutch, Spanish, Italian, Portuguese, Turkish, Norwegian.
const OTHER_NAME = [
  // Soap, shower and bath. The soap words are matched inside longer ones too:
  // Dutch and German write "handzeep" and "Cremeseife" as one word.
  /(soap|savon|seife|sabun|jab[oó]n|sapone|s[åa]pe|zeep|handwash|hand wash)/i,
  /\b(shower|douche|dusch\w*|doccia|ducha|bath|bain|bade\w*|bagno|ba[ñn]o|lavante? (mains|corps))\b/i,
  // Hands, feet, body.
  /\b(hand|hands|mains|manos|mani|h[äa]nde|hand(creme|cr[èe]me|balsam)|el kremi|foot|feet|pieds|pies|piedi|f[üu](ss|ß)\w*|body|corps|corporal|corporel|k[öo]rper\w*|corpo|v[üu]cut|bodylotion|bodymilk)\b/i,
  // Hair, scalp, beard. "hair" inside a longer word too ("hairfood").
  /(hair|leave-in|\bplex\b|\bcurls?\b)/i,
  /\b(cheveux|capillaire|haar\w*|cabello|capelli|sa[çc]|shampoo\w*|shampoing|shampooing|champ[uú]|champ[oô]|[şs]ampuan|conditioner|apr[èe]s-shampo+ing|sp[üu]lung|balsam|styling|coloration|h[åa]rfarge|scalp|beard|barbe|bart\w*|barba|pentear|peinar|coiffant|crème toner|creme toner)\b/i,
  // Shaving and hair removal.
  /\b(shav\w*|rasage|raser|rasier\w*|rasur|scheer\w*|scheren|afeitar|afeitado|barbear|aftershave|after-shave|d[ée]pilatoire|epil\w*|wax|cire)\b/i,
  // Make-up and nails.
  /\b(lipstick|rouge [àa] l[èe]vres|lippenstift|mascara|eyeliner|eye liner|eyeshadow|foundation|fond de teint|concealer|correcteur|blush|bronzer|highlighter|primer|powder|poudre|puder|nail|nagel\w*|ongles|u[ñn]as|gloss|kajal|brow|sourcils|lash|cils|wimpern|camouflage|abdeck\w*)\b/i,
  // Wipes and cotton.
  /\b(wipes?|lingettes?|feuchtt[üu]cher|toallitas|salviett\w*|v[åa]tservietter|cotton|coton|watte\w*)\b/i,
  // Deodorant and perfume.
  /\b(deo|deodorant\w*|d[ée]odorant|desodorante|antiperspirant|anti-transpirant|parfum|perfume|profumo|cologne|eau de (toilette|parfum|cologne)|k[öo]lnisch\w*|kolonya)\b/i,
  // Mouth and teeth.
  /\b(tooth\w*|zahn\w*|dent\w*|mouth\w*|mund\w*|bouche|lip balm|lippenbalsam|baume [àa] l[èe]vres)\b/i,
  // Everything else that is not a face product.
  /\b(intimate?|intime|intim\w*|insect|mosquito|moustique|tattoo|massage|self[- ]tan\w*|autobronz\w*|selbstbr[äa]un\w*|sanitizer|desinfect\w*|d[ée]sinfect\w*|anti-friction|[öo]ronreng[öo]ring\w*|ear|oreilles|bb cream|cc cream|bb cr[èe]me)\b/i,
];

// Brands whose name is itself a product word the type guess trips on.
const OTHER_BRAND = /^(essence|herbal essences?|catrice|maybelline|rimmel|opi|essie|gillette|wilkinson|colgate|oral-b|signal|axe|rexona|head & shoulders|pantene|elvive|schwarzkopf|syoss|tresemm[ée])\b/i;

/**
 * Why a product is not kept by the whole-database sweep, or null when it is
 * face skincare as far as its type, name, brand and tags can say.
 *
 * @param {{ type: string, name?: string | null, brand?: string | null, categories?: string[] | null }} product
 *   `type` is the guess from the name and tags (`guessType`), "unknown" when they say nothing.
 * @returns {string | null}
 */
export function notFaceSkincareReason({ type, name, brand, categories }) {
  if (!FACE_TYPES.has(type)) return "not a face-care type";
  if ((categories ?? []).some((tag) => OTHER_CATEGORY.test(tag))) return "tagged as another kind of product";
  if (OTHER_BRAND.test((brand ?? "").trim())) return "brand of another kind of product";
  // "Herbal Essences" also turns up in the name with no brand given.
  if (/\bherbal essences?\b/i.test(name ?? "")) return "named as another kind of product";
  if (OTHER_NAME.some((pattern) => pattern.test(name ?? ""))) return "named as another kind of product";
  return null;
}
