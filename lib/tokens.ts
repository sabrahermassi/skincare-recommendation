import type { Verdict } from "./matching";

/**
 * THE MANASSA DESIGN TOKENS — the single source of truth for colour.
 *
 * Every screen imports from here. Nothing re-declares a hex locally: that was
 * the phased-migration compromise while half the app still ran on the old
 * lilac system (`lib/colors.ts`), and it meant a contrast fix had to be made
 * in twenty-one files instead of one. It doesn't any more.
 *
 * `lib/colors.ts` still exists and still owns the *old* system. The screens
 * that have not been converted (the safety pill, the ingredient-rung ramp)
 * read from it. Do not merge the two: they are different systems, and the
 * seam between them is deliberate until the last screen crosses over.
 *
 * Contrast figures below are measured against CANVAS unless stated.
 */

// ── Surfaces ────────────────────────────────────────────────────────────────

/** The page ground everywhere. */
export const CANVAS = "#FBF4EE";

/**
 * Raised card fill. White, not a tint of the canvas — a card has to separate
 * from the ground by its own value, and canvas-on-canvas needed a border to
 * do the job the fill should have been doing.
 */
export const SURFACE = "#FFFFFF";

// ── Text ────────────────────────────────────────────────────────────────────

/**
 * Body copy and headings. Warm near-black at 15:1 — the previous #5A342C was
 * a mid-brown at 9.8:1, which passed on paper and read as washed out on a
 * screen, because it sat only a couple of steps from the accents around it.
 */
export const INK = "#241F1E";

/** Secondary text, 6.0:1. The old #96605A was close enough to the accent
 *  browns that a muted line and a peach surface read as the same weight. */
export const MUTED = "#6B5A54";

/** Third-level text — meta lines, timestamps, "/100" suffixes. */
export const MUTED_FAINT = "rgba(107,90,84,0.65)";

/** Chevrons and other non-text marks that must not compete with a label. */
export const MUTED_SOFT = "rgba(107,90,84,0.45)";

// ── Lines ───────────────────────────────────────────────────────────────────

/** Hairlines, dividers, unselected control borders, inactive progress dots. */
export const LINE = "#E4D3C8";

/** @deprecated Prefer {@link LINE}. Kept because it names the same value in
 *  the control-state code that already reads well as "border, inactive". */
export const BORDER_INACTIVE = LINE;
export const DOT_INACTIVE = LINE;

// ── Primary action ──────────────────────────────────────────────────────────

/**
 * The one call to action per screen.
 *
 * NOT the peach accent — that distinction is the whole point of this pair.
 * The old fill was the accent peach itself at 1.51:1 against the canvas, so
 * the button dissolved into the page and had to be found rather than seen.
 * This is 2.3:1 against the canvas and 6.5:1 against its own label, which is
 * a button you can see and read. Pill shape, 26px radius, weight 500.
 */
export const CTA = "#E09070";
export const CTA_PRESSED = "#C97C58";
export const CTA_INK = INK;

/**
 * Selected-control fill — a very light, watery peach.
 *
 * This was ink at 6% alpha, which is a neutral grey wash: correct on paper,
 * and on screen it read as "disabled" rather than "chosen". A warm tint says
 * the same thing in the palette's own voice. Derived from CTA (#E09070) at
 * roughly 12% over the canvas, so selection and the primary action come from
 * one family without a selected chip ever being mistaken for a button — the
 * chip is a pale tint behind an ink border, the button is a saturated fill.
 *
 * INK at 15:1 on this fill, so a selected label is the highest-contrast text
 * on the screen, which is what "chosen" should look like.
 */
export const SELECTED = "#F9E7DC";
/** One step warmer, for a selected surface that needs to sit above SELECTED. */
export const SELECTED_STRONG = "#F5DCCC";

/** Neutral pressed/active wash for controls that are not selections. */
export const INK_TINT = "rgba(36,31,30,0.06)";
export const INK_TINT_STRONG = "rgba(36,31,30,0.08)";

/**
 * One shape for every selectable control in the app — chips, option cards,
 * filter pills, segmented tabs. Size varies with the job (a 2-per-row quiz
 * chip is not a filter pill), the corner never does: a screen mixing 999-px
 * pills with 14-px chips reads as two design systems arguing.
 */
export const RADIUS_SELECTOR = 14;

// ── Illustration accents ────────────────────────────────────────────────────

/**
 * Illustration and status only — never a UI surface, and never a button.
 * `peach` here is the *accent* peach and is deliberately not {@link CTA}.
 */
export const ACCENT = {
  peach: "#FCD6C6",
  blush: "#FCE1DB",
  rose: "#F6CAC9",
  sage: "#CDD8BE",
  lilac: "#D1B7DA",
} as const;

// ── Match verdict ───────────────────────────────────────────────────────────

export type VerdictTone = "high" | "medium" | "low";

/**
 * Green / orange / red, pulled warm and desaturated so they belong to this
 * palette rather than to a browser's default alert colours.
 *
 * Three roles per tone, and they are not interchangeable:
 *
 *   solid  the 4px bar down a card's leading edge. Carries the verdict when
 *          someone is scanning a list and reading nothing.
 *   tint   the badge fill. Quiet enough to sit on a white card without
 *          becoming the loudest thing in the row.
 *   deep   the badge label on that tint. Every pairing clears 4.5:1.
 *
 * The previous set were muted derivatives of the peach and rose accents,
 * which meant "fair" and "poor" differed by about as much as two neighbouring
 * swatches — legible side by side, indistinguishable one at a time.
 */
export const VERDICT: Record<
  VerdictTone,
  { solid: string; tint: string; deep: string; label: string }
> = {
  high: { solid: "#3E7D5A", tint: "#DCEBE0", deep: "#2E5F44", label: "Great match" },
  medium: { solid: "#C2662B", tint: "#FAE3CE", deep: "#8F4A1C", label: "Fair match" },
  low: { solid: "#B23A32", tint: "#F7D9D5", deep: "#8C2A24", label: "Poor match" },
};

/**
 * The unscored case. A formula we could not read is not a bad match — it is
 * an absent one, and giving it a red bar would say something we don't know.
 */
export const VERDICT_NEUTRAL = {
  solid: LINE,
  tint: "#F1EAE4",
  deep: MUTED,
  label: "Can't tell yet",
} as const;

/**
 * `Verdict` carries five values because the MVP's score bands do; `matchTone`
 * carries three because that is how many colours a person can tell apart at a
 * glance. This is the bridge: excellent and good are both a yes, and the
 * number beside the badge is what separates 92 from 78.
 */
export function toneForVerdict(verdict: Verdict): VerdictTone | null {
  if (verdict === "excellent" || verdict === "good") return "high";
  if (verdict === "fair") return "medium";
  if (verdict === "poor") return "low";
  return null; // "unknown" — use VERDICT_NEUTRAL
}

/** Warning text that is not a verdict: flagged-ingredient counts, cautions. */
export const WARN = VERDICT.medium.deep;

/** Destructive actions — "erase my profile", and nothing else. */
export const DANGER = VERDICT.low.deep;

/**
 * A token color at partial opacity, as an `rgba()` string — for translucent
 * overlays a plain hex can't express (light-on-dark camera chrome, a pressed
 * wash) without hand-typing the same RGB triplet at every call site. Derives
 * from the token itself, so a token's hex value changing — CANVAS already
 * has once — doesn't leave stale hand-typed copies scattered across screens.
 */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
