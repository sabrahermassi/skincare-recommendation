import type { Concern, Pregnancy, Sensitivity, SkinProfile } from "@/data/types";

/**
 * A profile "counts" for matching once it carries a skin signal. Sensitivity
 * alone does not: it scales how harshly irritants are judged, it does not say
 * what the formula should be doing for you.
 */
export function isPersonalized(profile: SkinProfile): boolean {
  return profile.baseSkinType !== null || profile.concerns.length > 0;
}

/**
 * Someone who went through the quiz but gave it nothing to score with — "I
 * don't know", "I don't have any concerns", "Prefer not to say" — as opposed
 * to someone who skipped it (#291). For copy only: `isPersonalized` still
 * decides whether a score exists, and nothing here changes that.
 *
 * "I don't know" is stored as `null`, the same as a skipped step, so the tell
 * is an answer only ever set by answering: sensitivity or pregnancy. Someone
 * who answered the first steps and skipped those two reads as skipped, which
 * errs toward the copy that asks for more rather than the copy that thanks
 * them for answers they didn't give.
 */
export function answeredWithoutSignal(profile: SkinProfile): boolean {
  return !isPersonalized(profile) && (profile.sensitivity !== null || profile.pregnancyStatus !== null);
}

/**
 * The boolean the rules table still speaks. Derived rather than stored, so
 * there is one source of truth and no way for the two to drift — which is
 * exactly what happened when `sensitive` and the skin type were separate
 * stored answers.
 */
export function isSensitive(profile: { sensitivity: Sensitivity | null }): boolean {
  return profile.sensitivity === "some" || profile.sensitivity === "high";
}

/**
 * Whether an irritant should be *charged* as if the skin reacts (#183). Wider
 * than `isSensitive`, on the harm side only: an unset sensitivity — never
 * reached in the quiz, or "I don't know" — is judged at the middle setting,
 * not as "not sensitive". Reading a non-answer as the most lenient one was
 * the false-safe default the scoring rules forbid; `contactWeight` makes the
 * same call for an unknown product type.
 *
 * Only for someone we are actually scoring. A visitor with no profile at all
 * earns no irritant warnings — `contraindications` runs before the
 * not-personalised refusal and its warnings travel out with it, and "the
 * 'avoid' check applies to every visitor" is the only thing they should see.
 *
 * Never used for a benefit or a label: a "good for sensitive skin" bonus is
 * not credited on a non-answer, and no copy calls them sensitive.
 */
export function treatAsReactive(profile: SkinProfile): boolean {
  return isSensitive(profile) || (profile.sensitivity === null && isPersonalized(profile));
}

const SENSITIVITY_LABEL: Record<Sensitivity, string> = {
  none: "Not sensitive",
  some: "Somewhat sensitive",
  high: "Very sensitive",
};

export function sensitivityLabel(sensitivity: Sensitivity): string {
  return SENSITIVITY_LABEL[sensitivity];
}

/**
 * Each concern in the quiz's own words — the option labels on the concerns
 * step and the Skin profile editor, and the chips that echo them back on Home
 * and Profile. One list, so a chip can't say "large pores" about an answer
 * the quiz called "Enlarged pores" (#294).
 */
export const CONCERN_TITLE: Record<Concern, string> = {
  dehydrated: "Dry / Dehydrated",
  dullness: "Dullness",
  "acne-prone": "Acne or pimples",
  hyperpigmentation: "Dark spots",
  "large-pores": "Enlarged pores",
  "fine-lines": "Fine lines and wrinkles",
  redness: "Redness or rosacea",
  "post-acne-marks": "Post-acne marks",
  // No quiz option any more; a profile from before that change can still carry it.
  atopic: "Eczema-prone",
};

const PREGNANCY_LABEL: Record<Pregnancy, string> = {
  pregnant: "Pregnant",
  breastfeeding: "Breastfeeding",
  neither: "Neither",
  "prefer-not-to-say": "Prefer not to say",
};

export function pregnancyLabel(status: Pregnancy): string {
  return PREGNANCY_LABEL[status];
}

/**
 * What the Profile tab calls someone's skin: a title ("Oily skin") and the tags
 * under it (sensitivity, then concerns). With nothing answered there are no tags
 * and the title says so.
 */
export function profileHeadline(profile: SkinProfile): { title: string; tags: string[] } {
  const title = profile.baseSkinType
    ? `${capitalize(profile.baseSkinType)} skin`
    : isPersonalized(profile)
      ? "Your skin"
      : "Your skin profile";
  const tags: string[] = [];
  // The quiz's own words, capitalised like the title chip beside them (#294).
  if (profile.sensitivity && isSensitive(profile)) tags.push(sensitivityLabel(profile.sensitivity));
  tags.push(...profile.concerns.map((c) => CONCERN_TITLE[c]));
  return { title, tags };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Every onboarding route, in order.
 *
 * Gone: "about you" (gender and age, both collected and read by nothing) and
 * the face/body step — `area` has been removed from every client-side
 * consumer of it (this list, `SkinProfile`, `Product`, the browse filter). It
 * never fed scoring, and the one thing it did do (splitting the browse
 * list's type filter by face/body) worked against the app's own premise: a
 * formula is judged against a skin profile, not disqualified from that
 * judgement by which part of the body it's for. The database column itself
 * is a separate matter — see the note on `migratePersisted`'s v5 -> v6 step
 * in `store/useAppStore.ts`.
 */
const STEPS = [
  "/onboarding/concerns",
  "/onboarding/skin-type",
  "/onboarding/sensitivity",
  "/onboarding/pregnancy",
] as const;

export type QuizRoute = (typeof STEPS)[number];

/** Ordered onboarding routes. Single source of truth for the flow. */
export function quizRoutes(): readonly QuizRoute[] {
  return STEPS;
}

/** Total shown in "Step N of M". */
export function quizStepCount(): number {
  return STEPS.length;
}

/**
 * The route after `current`, or `null` when `current` is the last step — which
 * means "finish onboarding" rather than "navigate".
 */
export function nextQuizRoute(current: QuizRoute): QuizRoute | null {
  const i = STEPS.indexOf(current);
  if (i === -1 || i === STEPS.length - 1) return null;
  return STEPS[i + 1];
}

/**
 * The 1-based "Step N of M" number for a quiz route — each screen used to
 * pass this to `QuizScreen` as a hardcoded literal (1, 2, 3, 4), the same
 * class of bug `nextQuizRoute` exists to prevent for navigation: if `STEPS`
 * is ever reordered, a hardcoded literal keeps highlighting the wrong dot on
 * the progress rail with no compiler or test signal.
 */
export function quizStepNumber(route: QuizRoute): number {
  return STEPS.indexOf(route) + 1;
}

/**
 * Where finishing (or skipping) the quiz lands you.
 *
 * Defined once because it was wrong four times: every exit called
 * `router.replace("/")`, and `/` used to resolve to the browse grid — so the
 * skin analysis ended on a list of products, which is exactly what this app
 * stopped being. Reordering the tab bar did not help, because these
 * navigations name the destination explicitly.
 *
 * `/` is the Home screen (`app/(tabs)/index.tsx`), so this and a cold start
 * agree by construction rather than by two routes being kept in step.
 */
export const POST_ONBOARDING_ROUTE = "/" as const;
