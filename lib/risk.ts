import type { ProductWithIngredients } from "@/data/types";
import { isCommonIrritant } from "@/lib/ingredient-labels";
import type { MatchResult } from "@/lib/matching";
import { poreVerdict, type CloggerHit } from "@/lib/pore-clogging";
import { irritationWarnings, isVerified } from "@/lib/safety";

/**
 * The two risks people actually ask about — irritation and pore clogging —
 * both computed from the formula rather than quoted from a hazard database,
 * each said in words with its own tone on the four-rung ramp. The Safety tab
 * draws them as its two risk cards (`components/result/ResultTabs.tsx`).
 */
export type Risk = { level: string; note: string; tone: "good" | "watch" | "avoid" | "neutral"; hasEntries: boolean };

/**
 * Irritation risk, from the EU regulatory status of what is actually in the
 * bottle plus anything contraindicated for this profile (pregnancy hits
 * excluded — they get their own section, see #187), plus any active the
 * score charged as an irritant for this profile (`match.irritants`), which is
 * "safe" on the regulatory list but still shows as Avoid in the ingredient list.
 * Not a hazard score — a count of entries, said in words.
 */
export function irritationRisk(product: Pick<ProductWithIngredients, "ingredients">, match: MatchResult): Risk {
  const { personal, restricted, common } = irritationCounts(product, match);
  const hasPregnancyOnlyHit = personal === 0 && match.warnings.some((w) => w.origin === "pregnancy");

  if (product.ingredients.length === 0) {
    return { level: "Unknown", note: "Label not read yet", tone: "neutral", hasEntries: false };
  }
  if (personal > 0) {
    return {
      level: "Elevated",
      note: `${personal} flagged for your skin`,
      tone: "avoid",
      hasEntries: true,
    };
  }
  if (restricted === 0 && common > 0) {
    // Fragrance or a common irritant is "to watch" for everyone in the Safety
    // tab's ingredient list (#345, #379). "Nothing restricted" is true of it,
    // but read beside a watched ingredient it sounds like a contradiction.
    return {
      level: "Low",
      note: `${common} common ${common === 1 ? "irritant" : "irritants"}`,
      tone: "watch",
      hasEntries: true,
    };
  }
  if (restricted === 0) {
    // "Nothing restricted" is an absolute claim — it must not run alongside
    // a pregnancy section saying there's something to check (#187).
    return hasPregnancyOnlyHit
      ? { level: "Low", note: "See the pregnancy note above", tone: "good", hasEntries: false }
      : { level: "Low", note: "Nothing restricted", tone: "good", hasEntries: false };
  }
  if (restricted <= 2) {
    return {
      level: "Moderate",
      note: `${restricted} restricted ${restricted === 1 ? "entry" : "entries"}`,
      tone: "watch",
      hasEntries: true,
    };
  }
  return {
    level: "Elevated",
    note: `${restricted} restricted ${restricted === 1 ? "entry" : "entries"}`,
    tone: "avoid",
    hasEntries: true,
  };
}

/**
 * The two numbers the irritation card is built from, shared with the browse
 * row (`ProductRow`) so a product never reads "1 flagged" in the list and "3
 * flagged for your skin" on its own page (#290).
 *
 * `personal` is what this profile is warned about or was charged for;
 * `restricted` is what carries an EU restriction whoever you are; `common` is
 * the unrestricted fragrance and common irritants the Safety tab's list puts
 * "to watch" for everyone (#345, #379).
 */
export function irritationCounts(
  product: Pick<ProductWithIngredients, "ingredients">,
  match: MatchResult
): { personal: number; restricted: number; common: number } {
  const restricted = product.ingredients.filter((i) => isVerified(i) && i.safety !== "safe").length;
  const common = product.ingredients.filter((i) => isVerified(i) && i.safety === "safe" && isCommonIrritant(i)).length;
  // Pregnancy hits get their own section on the result (#187) — they are not
  // an irritation risk, so they must not inflate this count.
  const nonPregnancyWarnings = irritationWarnings(match.warnings);
  // An ingredient can be both warned about and charged as an irritant: count it once.
  const warned = new Set(nonPregnancyWarnings.map((w) => w.ingredient.name));
  const charged = new Set(match.irritants.filter((name) => !warned.has(name)));
  return { personal: nonPregnancyWarnings.length + charged.size, restricted, common };
}

/**
 * Pore-clogging risk, read from the same detection the band at the top of the
 * product screen uses.
 *
 * It used to compute its own answer from `comedogenic` (null on every real
 * row) with a fallback to the netted `pore-clogging` score factor. That could
 * disagree with the band on the same screen — the factor nets a positive like
 * salicylic acid against a genuine clogger and reports "Nothing flagged" — so
 * the card now summarises `poreVerdict` rather than racing it to a different
 * conclusion. Two answers to one question is worse than either answer.
 */
export function poreRisk(product: Pick<ProductWithIngredients, "ingredients">): Risk {
  const verdict = poreVerdict(product.ingredients);

  if (verdict.kind === "unknown") {
    return {
      level: "Unknown",
      note: verdict.total === 0 ? "Label not read yet" : "Too little recognised",
      tone: "neutral",
      hasEntries: false,
    };
  }
  if (verdict.kind === "clean") {
    return { level: "Low", note: "Nothing flagged", tone: "good", hasEntries: false };
  }

  // Every branch below is `verdict.kind === "hits"` — there is something to
  // name, even the contested-only case, so the card is clickable throughout.
  const { hits, warned } = verdict;
  if (warned.length === 0) {
    // Not `neutral` — that tone also means "Unknown" (no data at all) a few
    // lines up, and "sources disagree" is a real signal, just an uncertain
    // one. `watch` is the same "worth knowing" weight the ingredient detail
    // screen gives its own middle rung.
    return {
      level: "Contested",
      note: `${hits.length} ${hits.length === 1 ? "ingredient" : "ingredients"}, mixed evidence`,
      tone: "watch",
      hasEntries: true,
    };
  }
  // The Pore clogging tab this card opens lists contested entries too, so the
  // note names them — "1 on the lists" above a tab of three read as a
  // miscount (#290).
  const contested = hits.length - warned.length;
  const note = contested > 0 ? `${warned.length} on the lists · ${contested} disputed` : `${warned.length} on the lists`;
  if (warned.some((h: CloggerHit) => h.confidence === "high")) {
    return { level: "Elevated", note, tone: "avoid", hasEntries: true };
  }
  return { level: "Moderate", note, tone: "watch", hasEntries: true };
}
