import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { IngredientsCard, type IngredientFilter } from "@/components/result/IngredientsCard";
import { ScoreRing, VerdictLink } from "@/components/result/ScoreRing";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { SourceLink } from "@/components/SourceLink";
import { Text, useLargeText } from "@/components/Text";
import { VerdictDot } from "@/components/VerdictMarker";
import type { Concern, Ingredient, ProductType, SkinProfile } from "@/data/types";
import { pairingNotesFor } from "@/lib/active-pairings";
import { goalNudgesFor, nudgesFor } from "@/lib/context-nudges";
import { displayIngredientName } from "@/lib/ingredient-name";
import { deckFor, planFit, ROLE_LABEL, shortLabel } from "@/lib/journey";
import { concernSupport, confidenceLabel, isLowCoverage, matchProduct, ruleFor, type MatchResult } from "@/lib/matching";
import { openQuiz } from "@/lib/open-quiz";
import { CONCERN_PHRASE, isPersonalized } from "@/lib/profile";
import { irritationRisk, poreRisk, type Risk } from "@/lib/risk";
import type { RuleSource } from "@/lib/rules";
import { irritationWarnings, isVerified } from "@/lib/safety";
import { BUTTON, CARD_RADIUS, DIVIDER, DISPLAY_FONT, HOME_CARD_FILL, INK, MUTED, SAVED_OUTLINE, SPACE, TYPE, VERDICT, VERDICT_NEUTRAL, WHITE } from "@/lib/tokens";
import { EMPTY_PROFILE } from "@/store/useAppStore";

type Tab = "match" | "ingredients";
type Tone = { solid: string; deep: string; wash: string; halo: string };

// The one pairing note that is pure scheduling, not a cost.
const EVENING_NOTE = "retinoid-evening";

const RISK_TONE: Record<Risk["tone"], Tone> = {
  good: VERDICT.high,
  watch: VERDICT.medium,
  avoid: VERDICT.low,
  neutral: VERDICT_NEUTRAL,
};

/** A product opened from "What my skin needs": the concerns picked there (`lib/journey.ts`). */
export type JourneyPlan = { concerns: Concern[]; saved: boolean; onSave?: () => void };

/**
 * The product result under its header (v9): a Skin match | Ingredients
 * switch, then the chosen tab on the white page. Skin match opens first: the
 * score ring with its verdict beside it, then the reasons that matter for this
 * person — or, opened from the journey, how the product fits that plan.
 * Ingredients is the same for everyone apart from a pregnancy caution: the
 * two risks and the ingredient box. Shared by a catalogue product and a label
 * photo. `footer` is what a screen adds under either tab (a note, a
 * stale-formula notice, a retake button); `report` goes under the ingredient
 * box once every ingredient is showing.
 */
export function ResultTabs({
  ingredients,
  type,
  match,
  profile,
  onIngredientPress,
  footer,
  report,
  plan,
}: {
  ingredients: Ingredient[];
  type: ProductType;
  match: MatchResult;
  profile: SkinProfile;
  onIngredientPress: (ingredient: Ingredient) => void;
  footer?: ReactNode;
  report?: ReactNode;
  plan?: JourneyPlan;
}) {
  const [tab, setTab] = useState<Tab>("match");
  const [filter, setFilter] = useState<IngredientFilter>("all");

  return (
    <View style={{ flexGrow: 1 }}>
      <View style={{ paddingHorizontal: SPACE.gutter, paddingTop: 12 }}>
        <SegmentedSwitch
          tone="light"
          options={[
            { value: "match", label: "Skin match" },
            { value: "ingredients", label: "Ingredients" },
          ]}
          selected={tab}
          onSelect={setTab}
        />
      </View>
      <View style={{ flexGrow: 1, paddingHorizontal: SPACE.gutter, paddingTop: SPACE.section, paddingBottom: 40, gap: SPACE.block }}>
        {tab === "match" ? (
          <MatchTab ingredients={ingredients} type={type} match={match} profile={profile} plan={plan} />
        ) : (
          <IngredientsTab
            ingredients={ingredients}
            type={type}
            match={match}
            profile={profile}
            filter={filter}
            onFilter={setFilter}
            onIngredientPress={onIngredientPress}
            report={report}
          />
        )}
        {footer}
      </View>
    </View>
  );
}

function MatchTab({ ingredients, type, match, profile, plan }: { ingredients: Ingredient[]; type: ProductType; match: MatchResult; profile: SkinProfile; plan?: JourneyPlan }) {
  const lowCoverage = isLowCoverage(ingredients);
  if (!isPersonalized(profile) && !lowCoverage) return <NoProfile />;

  const identified = ingredients.filter(isVerified).length;
  if (lowCoverage) {
    return (
      <View style={{ gap: 4, borderRadius: CARD_RADIUS, backgroundColor: VERDICT.medium.wash, padding: SPACE.gutter }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.card, fontWeight: "600", color: VERDICT.medium.deep }}>
          We only recognised {identified} of {ingredients.length} names
        </Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: INK }}>That&apos;s too few to score it fairly.</Text>
      </View>
    );
  }

  const confidence = confidenceLabel(match.confidence);
  return (
    <>
      <ScoreHead match={match} />
      <PregnancyCard match={match} />
      {plan ? (
        <PlanFitBlock ingredients={ingredients} type={type} profile={profile} plan={plan} />
      ) : (
        <>
          <Explainer profile={profile} />
          <Reasons ingredients={ingredients} match={match} profile={profile} />
          <RoutineNotes ingredients={ingredients} type={type} profile={profile} />
        </>
      )}
      {/* Only said when it changes how far to trust the number. */}
      {confidence === "high" ? null : (
        <Text style={{ paddingHorizontal: 4, fontSize: TYPE.caption, color: MUTED }}>
          From {identified} of {ingredients.length} ingredients we could identify — {confidence} confidence.
        </Text>
      )}
    </>
  );
}

/** The score ring with its verdict beside it; the verdict's "i" opens How scoring works (v9). */
function ScoreHead({ match }: { match: MatchResult }) {
  const largeText = useLargeText();
  return (
    <View style={{ flexDirection: largeText ? "column" : "row", alignItems: largeText ? "flex-start" : "center", gap: 16 }}>
      <ScoreRing match={match} />
      <VerdictLink match={match} />
    </View>
  );
}

/**
 * Opened from "What my skin needs" (v9): how many of the journey's cards
 * this product has an ingredient for, one row per card it covers, and the
 * concerns it leaves uncovered — then the routine notes and Save.
 */
function PlanFitBlock({ ingredients, type, profile, plan }: { ingredients: Ingredient[]; type: ProductType; profile: SkinProfile; plan: JourneyPlan }) {
  const deck = deckFor(plan.concerns, profile);
  const fit = planFit(ingredients, deck, plan.concerns);
  const count = fit.covered.length;
  const title = count >= 2 ? "This makes sense for you" : count === 1 ? "Partly what you need" : "Not what your plan needs";
  return (
    <View>
      <View style={{ marginTop: 8, paddingHorizontal: 4, gap: 4 }}>
        <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: 26, lineHeight: 28.6, color: INK }}>
          {title}
        </Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
          It covers {count} of the {fit.total} recommendations for your skin.
        </Text>
      </View>
      <View style={{ marginTop: 8 }}>
        {fit.covered.map(({ card, role, ingredients: hits }, i) => (
          <PlanRow
            key={card.key}
            first={i === 0}
            tone={VERDICT.high}
            // A group card names what it found ("Glycerin + Panthenol"); a single-ingredient card is its name.
            name={card.key === "hydrating" ? hits.slice(0, 2).map(displayIngredientName).join(" + ") : card.name}
            text={card.key === "hydrating" ? "put water back in and help keep it there." : card.line.charAt(0).toLowerCase() + card.line.slice(1)}
            tag={ROLE_LABEL[role]}
          />
        ))}
        {fit.notCovered.length > 0 ? (
          <PlanRow
            first={fit.covered.length === 0}
            tone={VERDICT.medium}
            name="Worth knowing:"
            text={`it won't work on your ${fit.notCovered.map((c) => CONCERN_PHRASE[c]).join(" or ")} on its own.`}
            tag={`Not covered: ${fit.notCovered.map((c) => shortLabel(c).toLowerCase()).join(", ")}`}
          />
        ) : null}
      </View>
      <RoutineNotes ingredients={ingredients} type={type} profile={profile} />
      {plan.onSave ? <SaveToPlan saved={plan.saved} onPress={plan.onSave} /> : null}
    </View>
  );
}

function PlanRow({ name, text, tag, tone, first }: { name: string; text: string; tag: string; tone: Tone; first: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderTopWidth: first ? 0 : 0.5, borderTopColor: DIVIDER }}>
      <View style={{ marginTop: 3 }}>
        <VerdictDot colour={tone.solid} halo={tone.halo} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: INK }}>
          <Text style={{ fontWeight: "600" }}>{name}</Text> {text}
        </Text>
        <Text style={{ fontSize: TYPE.caption, color: tone.deep }}>{tag}</Text>
      </View>
    </View>
  );
}

/**
 * "Save to my plan" (v9): the plan is the saved shelf — saving here is the
 * same save as the heart, so it shows on Saved and syncs like any save.
 */
function SaveToPlan({ saved, onPress }: { saved: boolean; onPress: () => void }) {
  const ink = saved ? BUTTON.tertiary.label : BUTTON.primary.label;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      style={{
        marginTop: 16,
        height: 48,
        borderRadius: 24,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        backgroundColor: saved ? WHITE : BUTTON.primary.fill,
        borderWidth: saved ? 1.5 : 0,
        borderColor: SAVED_OUTLINE,
      }}
      className="active:opacity-90"
    >
      <Svg width={17} height={17} viewBox="0 0 24 24" fill={saved ? ink : "none"}>
        <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" stroke={ink} strokeWidth={1.8} strokeLinejoin="round" />
      </Svg>
      <Text style={{ fontSize: 16, fontWeight: "500", color: ink }}>{saved ? "Saved to your plan" : "Save to my plan"}</Text>
    </Pressable>
  );
}

/** "We checked its ingredients against your skin profile: **oily**, **somewhat sensitive**, with **dark spots**." (v9: the answers in bold). */
function Explainer({ profile }: { profile: SkinProfile }) {
  const parts = [
    profile.baseSkinType ?? null,
    profile.sensitivity === "high" ? "very sensitive" : profile.sensitivity === "some" ? "somewhat sensitive" : null,
  ].filter((p): p is string => p !== null);
  const concerns = profile.concerns.map((c: Concern) => CONCERN_PHRASE[c]);
  const bold = (text: string) => (
    <Text key={text} style={{ fontWeight: "600" }}>
      {text}
    </Text>
  );
  const pieces: ReactNode[] = [];
  parts.forEach((part, i) => {
    if (i > 0) pieces.push(", ");
    pieces.push(bold(part));
  });
  if (concerns.length > 0) {
    if (parts.length > 0) pieces.push(", ");
    pieces.push("with ");
    concerns.forEach((concern, i) => {
      if (i > 0) pieces.push(i === concerns.length - 1 ? " and " : ", ");
      pieces.push(bold(concern));
    });
  }
  return (
    <Text style={{ marginTop: 4, paddingHorizontal: 4, fontSize: TYPE.body, lineHeight: 22, color: INK }}>
      We checked its ingredients against your skin profile{pieces.length > 0 ? ": " : ""}
      {pieces}. These are the ones that matter most for you.
    </Text>
  );
}

type Reason = { key: string; name: string; text: string; tone: Tone; source?: RuleSource };

/** The ingredients that matter for this person, as short cards: what helps (green), what counts against (orange), what to avoid (red). */
function Reasons({ ingredients, match, profile }: { ingredients: Ingredient[]; match: MatchResult; profile: SkinProfile }) {
  const seen = new Set<string>();
  const rows: Reason[] = [];
  // Hazards first: they cap the score for everyone.
  for (const w of match.warnings) {
    if (w.severity !== "hazard" || seen.has(w.ingredient.name)) continue;
    seen.add(w.ingredient.name);
    rows.push({ key: `avoid-${w.ingredient.name}`, name: displayIngredientName(w.ingredient.name), text: stripName(w.reason, w.ingredient.name), tone: VERDICT.low, source: w.source });
  }
  // Then what works on each of the person's concerns, found the way the
  // score finds it: a curated rule, else a declared function.
  for (const concern of profile.concerns) {
    const support = concernSupport(ingredients, concern);
    if (!support || seen.has(support.ingredient)) continue;
    seen.add(support.ingredient);
    const ingredient = ingredients.find((i) => i.name === support.ingredient);
    const rule = ingredient ? ruleFor(ingredient) : undefined;
    rows.push({
      key: `concern-${concern}`,
      name: displayIngredientName(support.ingredient),
      // A rule names the concern; a declared function says only what it is.
      text: rule ? `helps with ${CONCERN_PHRASE[concern]}` : stripName(support.why, support.ingredient),
      tone: VERDICT.high,
      source: rule?.source,
    });
  }
  // Then what this skin is warned about (the old "Flagged for your skin"),
  // each with its source.
  for (const w of irritationWarnings(match.warnings)) {
    if (seen.has(w.ingredient.name)) continue;
    seen.add(w.ingredient.name);
    rows.push({ key: `watch-${w.ingredient.name}`, name: displayIngredientName(w.ingredient.name), text: stripName(w.reason, w.ingredient.name), tone: VERDICT.medium, source: w.source });
  }
  // Then the rest of what moved the score, biggest first.
  const ranked = [...match.reasons].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  for (const r of ranked) {
    if (!r.ingredient || seen.has(r.ingredient)) continue;
    seen.add(r.ingredient);
    const up = r.effect > 0;
    rows.push({
      key: `${up ? "up" : "down"}-${r.ingredient}`,
      name: displayIngredientName(r.ingredient),
      text: stripName(r.reason, r.ingredient),
      tone: up ? VERDICT.high : VERDICT.medium,
      source: r.source,
    });
  }
  const shown = rows.slice(0, 6);
  if (shown.length === 0) {
    return <Text style={{ paddingHorizontal: 4, fontSize: TYPE.body, color: MUTED }}>Nothing in it works on your skin in particular, either way.</Text>;
  }
  return (
    <View>
      {shown.map((row, i) => (
        <View
          key={row.key}
          style={{ minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderTopWidth: i === 0 ? 0 : 0.5, borderTopColor: DIVIDER }}
        >
          <VerdictDot colour={row.tone.solid} halo={row.tone.halo} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: INK }}>
              <Text style={{ fontWeight: "600" }}>{row.name}</Text> {row.text}
            </Text>
            {/* Every claim traces to what it was checked against (#326). */}
            {row.source ? <SourceLink source={row.source} /> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

/** A rule's sentence without the ingredient's own name at its start ("Niacinamide moderates oil" → "moderates oil"). */
function stripName(text: string, name: string): string {
  const sentence = text.split(" - ")[0].trim();
  const lower = sentence.toLowerCase();
  const bare = name.toLowerCase();
  if (lower.startsWith(bare)) return sentence.slice(name.length).replace(/^[\s:,-]+/, "");
  const first = sentence.charAt(0).toLowerCase() + sentence.slice(1);
  return first;
}

/**
 * Notes on using it with the rest of a routine (v7's "In a routine" card):
 * layering and sunlight, the same for everyone, and the one that depends on
 * the person (working on dark spots). A layering note states a real
 * irritation cost, so its badge takes the caution colour (#264).
 */
function RoutineNotes({ ingredients, type, profile }: { ingredients: Ingredient[]; type: ProductType; profile: SkinProfile }) {
  const pairing = pairingNotesFor(ingredients);
  const pairingIds = new Set(pairing.map((note) => note.id));
  const notes = [...pairing, ...nudgesFor(ingredients, type), ...goalNudgesFor(ingredients, profile.concerns, type)];
  return (
    <>
      {notes.map((note) => {
        const caution = pairingIds.has(note.id) && note.id !== EVENING_NOTE;
        return (
          <View key={note.id} style={{ minHeight: 52, flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderTopWidth: 0.5, borderTopColor: DIVIDER }}>
            <View testID={caution ? "routine-caution" : undefined} style={{ width: 16, height: 32, alignItems: "center", justifyContent: "center" }}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" stroke={caution ? VERDICT.medium.deep : MUTED} strokeWidth={2} strokeLinejoin="round" />
              </Svg>
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: caution ? VERDICT.medium.deep : INK }}>In a routine</Text>
              <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: INK }}>{note.text}</Text>
            </View>
          </View>
        );
      })}
    </>
  );
}

/** "Best avoided while pregnant" (v7): shown only when the profile says so, with each caution's source. */
function PregnancyCard({ match }: { match: MatchResult }) {
  const pregnancy = match.warnings.filter((w) => w.origin === "pregnancy");
  if (pregnancy.length === 0) return null;
  const sources = [...new Map(pregnancy.flatMap((w) => (w.source ? [[w.source.url, w.source] as const] : []))).values()];
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: CARD_RADIUS, backgroundColor: VERDICT.low.wash, padding: SPACE.gutter }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: VERDICT.low.solid }}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path d="M12 7v6M12 17h.01" stroke={WHITE} strokeWidth={2.8} strokeLinecap="round" />
        </Svg>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.card, fontWeight: "600", color: VERDICT.low.deep }}>
          Best avoided while pregnant
        </Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: INK }}>
          It contains {listNames(pregnancy.map((w) => displayIngredientName(w.ingredient.name)))}. If you&apos;re unsure, ask your doctor or midwife.
        </Text>
        {sources.map((source) => (
          <SourceLink key={source.url} source={source} />
        ))}
      </View>
    </View>
  );
}

/** No skin profile yet (v9): the pale sage card and the way to one. */
function NoProfile() {
  return (
    <View style={{ alignItems: "center", borderRadius: CARD_RADIUS, backgroundColor: HOME_CARD_FILL, paddingVertical: SPACE.section, paddingHorizontal: SPACE.gutter }}>
      <Text accessibilityRole="header" style={{ textAlign: "center", fontSize: TYPE.card, fontWeight: "600", color: INK }}>
        Is it right for your skin?
      </Text>
      <Text style={{ marginTop: 4, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>4 quick questions. No sign-up needed.</Text>
      <PrimaryButton label="Get my match" onPress={openQuiz} style={{ marginTop: 12, width: BUTTON_WIDTH.inCard }} />
    </View>
  );
}

function IngredientsTab({
  ingredients,
  type,
  match,
  profile,
  filter,
  onFilter,
  onIngredientPress,
  report,
}: {
  ingredients: Ingredient[];
  type: ProductType;
  match: MatchResult;
  profile: SkinProfile;
  filter: IngredientFilter;
  onFilter: (filter: IngredientFilter) => void;
  onIngredientPress: (ingredient: Ingredient) => void;
  report?: ReactNode;
}) {
  const largeText = useLargeText();
  // The same for everyone (v9): read without the person's skin, keeping only
  // a pregnancy, which is a caution rather than a preference.
  const general = matchProduct({ type, ingredients }, { ...EMPTY_PROFILE, pregnancyStatus: profile.pregnancyStatus });
  const irritation = irritationRisk({ ingredients }, general);
  const pore = poreRisk({ ingredients });
  return (
    <>
      <PregnancyCard match={match} />
      <Text style={{ paddingHorizontal: 4, fontSize: TYPE.body, lineHeight: 21, color: INK }}>General ingredients info, the same for everyone.</Text>
      {/* The two risks in one box; either opens the list filtered to its watch-outs. */}
      <View testID="risk-cards" style={{ flexDirection: largeText ? "column" : "row", borderRadius: CARD_RADIUS, backgroundColor: WHITE }}>
        <RiskCell title="Irritation risk" risk={irritation} onPress={irritation.hasEntries ? () => onFilter("watch") : undefined} />
        <RiskCell title="Pore-clogging risk" risk={pore} divider={largeText ? "top" : "left"} onPress={pore.hasEntries ? () => onFilter("pore") : undefined} />
      </View>
      {ingredients.length > 0 ? (
        <IngredientsCard
          ingredients={ingredients}
          match={general}
          personalized={false}
          filter={filter}
          onFilter={onFilter}
          onIngredientPress={onIngredientPress}
          afterAll={report}
        />
      ) : (
        // No list read yet: nothing to show but the way to tell us.
        report
      )}
    </>
  );
}

/** One of the two risks (v9): its name, the level in the verdict's text colour, why. */
function RiskCell({ title, risk, divider, onPress }: { title: string; risk: Risk; divider?: "left" | "top"; onPress?: () => void }) {
  const tone = RISK_TONE[risk.tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${title}: ${risk.level}. ${risk.note}`}
      style={{
        flex: 1,
        gap: 2,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderLeftWidth: divider === "left" ? 0.5 : 0,
        borderTopWidth: divider === "top" ? 0.5 : 0,
        borderColor: DIVIDER,
      }}
      className={onPress ? "active:opacity-70" : undefined}
    >
      <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{title}</Text>
      <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: tone.deep }}>{risk.level}</Text>
      <Text numberOfLines={2} style={{ fontSize: TYPE.caption, lineHeight: 17.5, color: MUTED }}>
        {risk.note}
      </Text>
    </Pressable>
  );
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
