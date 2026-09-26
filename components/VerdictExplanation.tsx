import { router } from "expo-router";
import { Pressable, View } from "react-native";

import { SourceLink } from "@/components/SourceLink";
import { Text } from "@/components/Text";
import { displayIngredientName } from "@/lib/ingredient-name";
import type { PairingNote } from "@/lib/active-pairings";
import type { ContextNudge } from "@/lib/context-nudges";
import type { MatchReason, ScoreLine, Verdict } from "@/lib/matching";
import type { RuleSource } from "@/lib/rules";
import type { Contraindication } from "@/lib/safety";
import { BORDER_INACTIVE, INK, MUTED, TOUCH_TARGET, TYPE, VERDICT, VERDICT_LABEL, VERDICT_NEUTRAL, toneForVerdict } from "@/lib/tokens";

/**
 * The verdict panel's colours and label — shared by `app/product/[id].tsx`
 * and `app/label-result.tsx` (issue #214), which is why it lives here rather
 * than in either screen. Both screens compute a `MatchResult` and both need
 * the same panel dressing for it; copying this would have let them drift.
 */
export function panelFor(verdict: Verdict): { bg: string; border: string; label: string; ink: string } {
  const tone = toneForVerdict(verdict);
  const colors = tone
    ? { bg: VERDICT[tone].tint, border: VERDICT[tone].solid, ink: VERDICT[tone].deep }
    : { bg: VERDICT_NEUTRAL.tint, border: BORDER_INACTIVE, ink: VERDICT_NEUTRAL.deep };
  return { ...colors, label: VERDICT_LABEL[verdict] };
}

/**
 * One line of "why", naming the ingredient and carrying its own sentence.
 *
 * The sentence comes from `lib/rules.ts`, where every claim the app makes is
 * written next to the rule that makes it — so anything on screen here can be
 * traced to a line of code and argued with — and, where the rule has one,
 * to the source it was checked against (#326).
 */
export function ReasonLine({ reason }: { reason: MatchReason }) {
  return (
    <ExplanationLine
      label={displayIngredientName(reason.ingredient ?? "")}
      detail={reason.reason}
      direction={reason.effect > 0 ? "up" : "down"}
      source={reason.source}
    />
  );
}

/**
 * "While pregnant or breastfeeding" — pregnancy/breastfeeding-caution
 * ingredients get their own place on the result screen, rather than sitting
 * inside the Irritation-risk count under a "good fit" headline (#187).
 *
 * Renders whenever `warnings` carries a pregnancy-origin hit — no separate
 * profile check needed, since `contraindications` only ever pushes a
 * pregnancy hit when the profile's `pregnancyStatus` is "pregnant" or
 * "breastfeeding". Shared by `app/product/[id].tsx` and
 * `app/label-result.tsx`, same reason as `panelFor` above: both screens
 * compute a `MatchResult` and both need this section, including on the
 * `unknown` verdict — `contraindications` runs before the low-coverage
 * refusal, so an unreadable formula can still carry a pregnancy hit.
 */
export function PregnancySection({ warnings }: { warnings: Contraindication[] }) {
  const hits = warnings.filter((w) => w.origin === "pregnancy");
  if (hits.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>
        While pregnant or breastfeeding
      </Text>
      {hits.map((hit) => (
        <ExplanationLine
          key={hit.ingredient.id}
          label={displayIngredientName(hit.ingredient.name)}
          detail={hit.reason}
          direction="down"
          source={hit.source}
        />
      ))}
    </View>
  );
}

/**
 * "Worth knowing" — hand-written context nudges from `lib/context-nudges.ts`
 * (#234). Same heading-then-lines layout as `PregnancySection` above, but
 * `direction="neutral"` rather than `"down"`: a nudge carries no score effect
 * and isn't a caution the way a pregnancy hit is, so it shouldn't borrow that
 * section's red minus-sign treatment (#262 review, CodeRabbit) — it gets its
 * own, calmer indicator instead.
 */
export function ContextNudgesSection({ nudges }: { nudges: ContextNudge[] }) {
  return <NotesSection title="Worth knowing" notes={nudges} />;
}

/**
 * "In a routine" — the evening note and layering line from
 * `lib/active-pairings.ts` (#233), in the same treatment as the two sections
 * above so the three read as one kind of context — except a pairing note
 * isn't uniformly neutral the way a context nudge is: the evening-routine
 * note is pure scheduling, but the layering/shelf-pairing notes say plainly
 * that a combination "can add up to more dryness and irritation" — a real
 * caution, not a calmer FYI, so it keeps the warning-style indicator.
 */
export function PairingSection({ notes }: { notes: PairingNote[] }) {
  return (
    <NotesSection
      title="In a routine"
      notes={notes.map((note) => ({ ...note, direction: note.id === "retinoid-evening" ? "neutral" : "down" }))}
    />
  );
}

/**
 * A heading, then one line per note — the shared treatment for context that
 * isn't a warning, though an individual note can still opt into the warning
 * indicator via `direction` when it genuinely is one (see `PairingSection`
 * above). Defaults to "neutral": every `ContextNudge` is purely informational
 * (#262 review, CodeRabbit), so `ContextNudgesSection` never needs to set it.
 */
export function NotesSection({
  title,
  notes,
}: {
  title: string;
  notes: { id: string; label: string; text: string; direction?: ExplanationDirection }[];
}) {
  if (notes.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>
        {title}
      </Text>
      {notes.map((note) => (
        <ExplanationLine key={note.id} label={note.label} detail={note.text} direction={note.direction ?? "neutral"} />
      ))}
    </View>
  );
}

type ExplanationDirection = ScoreLine["direction"] | "neutral";

/** A verdict-level explanation, rendered before its ingredient-level evidence. */
export function ExplanationLine({
  label,
  detail,
  direction,
  source,
}: {
  label: string;
  detail: string;
  direction: ExplanationDirection;
  source?: RuleSource;
}) {
  const glyph = direction === "up" ? "+" : direction === "down" ? "−" : "•";
  const dotColor =
    direction === "up" ? VERDICT.high.tint : direction === "down" ? VERDICT.low.tint : VERDICT_NEUTRAL.tint;
  const glyphColor = direction === "neutral" ? VERDICT_NEUTRAL.deep : INK;
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      {/* Inline style, not a Tailwind className: `bg-tint-mint`/`bg-tint-pink`
          are also the scanner's unrelated "looking/missed" status icon, so
          they can't be repointed at the verdict ramp without recoloring that
          too. This reads the same VERDICT tokens the score ring above uses,
          rather than a third green/pink pair. */}
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          marginTop: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: dotColor,
        }}
      >
        <Text style={{ fontSize: TYPE.caption, fontWeight: "bold", lineHeight: 14, color: glyphColor }}>{glyph}</Text>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        {/* First letter only: a `capitalize` transform also title-cased the
            score lines ("Irritation Risk", "Your Concerns") and INCI
            abbreviations ("Stearate Se") — #294. Ingredient names arrive
            already cased by `displayIngredientName`. */}
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </Text>
        <Text style={{ fontSize: TYPE.label, lineHeight: 19, color: MUTED }}>{detail}</Text>
        {source ? <SourceLink source={source} /> : null}
      </View>
    </View>
  );
}

/**
 * "How is this scored?" under a result's "Why this score" (#325): the reasons
 * say what moved this score, the page says how every score works.
 */
export function HowScoringLink() {
  return (
    <Pressable
      onPress={() => router.push("/scoring")}
      accessibilityRole="link"
      style={{ minHeight: TOUCH_TARGET, justifyContent: "center", alignSelf: "flex-start" }}
      className="active:opacity-70"
    >
      <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
        How is this scored?
      </Text>
    </Pressable>
  );
}
