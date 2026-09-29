import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { IngredientsCard, type IngredientFilter } from "@/components/result/IngredientsCard";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { SourceLink } from "@/components/SourceLink";
import { Text, useLargeText, useRingScale } from "@/components/Text";
import type { Concern, Ingredient, ProductType, SkinProfile } from "@/data/types";
import { pairingNotesFor } from "@/lib/active-pairings";
import { goalNudgesFor, nudgesFor } from "@/lib/context-nudges";
import { displayIngredientName } from "@/lib/ingredient-name";
import { concernSupport, confidenceLabel, isLowCoverage, ruleFor, type MatchResult } from "@/lib/matching";
import { openQuiz } from "@/lib/open-quiz";
import { CONCERN_PHRASE, isPersonalized } from "@/lib/profile";
import { irritationRisk, poreRisk, type Risk } from "@/lib/risk";
import type { RuleSource } from "@/lib/rules";
import { irritationWarnings, isVerified } from "@/lib/safety";
import {
  CANVAS,
  CARD_RADIUS,
  DISPLAY_FONT,
  HOME_CARD_FILL,
  INK,
  MUTED,
  SPACE,
  SURFACE,
  TYPE,
  VERDICT,
  VERDICT_LABEL,
  VERDICT_NEUTRAL,
  scoreColours,
} from "@/lib/tokens";

type Tab = "match" | "ingredients";
type Wash = { solid: string; deep: string; wash: string };

// The one pairing note that is pure scheduling, not a cost.
const EVENING_NOTE = "retinoid-evening";

/** The big score ring's drawn size (v7), before it grows with large text. */
export const RING_SIZE = 96;
// How far the ring rises above the white sheet's edge: half of it (v7).
const RING_RISE = 62;
// The white sheet's top corners, and how far it tucks up under the switch (v7).
const SHEET_RADIUS = 32;
const SHEET_TUCK = 12;
// The info "i" ring on a filled pill (v7).
const PILL_INFO = "#D9CFC7";
// The routine note's moon badge (v7).
const MOON_BADGE = { fill: "#E9E3E3", ink: "#3F3A4A" } as const;

const RISK_WASH: Record<Risk["tone"], Wash> = {
  good: VERDICT.high,
  watch: VERDICT.medium,
  avoid: VERDICT.low,
  neutral: VERDICT_NEUTRAL,
};

/**
 * The product result under its header (v7): a Skin match | Ingredients
 * switch on the page, then a white sheet with the chosen tab. Skin match
 * opens first; its score ring straddles the sheet's top edge, over the
 * reasons that matter for this person. Ingredients holds the two risks and
 * the ingredient box. Shared by a catalogue product and a label photo.
 * `footer` is what a screen adds under either tab (a note, a stale-formula
 * notice, a retake button); `report` goes under the ingredient box once every
 * ingredient is showing.
 */
export function ResultTabs({
  ingredients,
  type,
  match,
  profile,
  onIngredientPress,
  footer,
  report,
}: {
  ingredients: Ingredient[];
  type: ProductType;
  match: MatchResult;
  profile: SkinProfile;
  onIngredientPress: (ingredient: Ingredient) => void;
  footer?: ReactNode;
  report?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("match");
  const [filter, setFilter] = useState<IngredientFilter>("all");
  const personalized = isPersonalized(profile);
  const lowCoverage = isLowCoverage(ingredients);
  // The ring rises out of the sheet only on Skin match with a score to show.
  const ring = tab === "match" && personalized && !lowCoverage;

  return (
    <View style={{ flexGrow: 1 }}>
      <View style={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.section, paddingBottom: ring ? RING_RISE : 28, backgroundColor: CANVAS }}>
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
      <View
        style={{
          flexGrow: 1,
          marginTop: -SHEET_TUCK,
          borderTopLeftRadius: SHEET_RADIUS,
          borderTopRightRadius: SHEET_RADIUS,
          backgroundColor: SURFACE,
          paddingHorizontal: SPACE.gutter,
          paddingTop: SPACE.gutter,
          paddingBottom: 40,
          gap: SPACE.block,
        }}
      >
        {tab === "match" ? (
          <MatchTab ingredients={ingredients} type={type} match={match} profile={profile} ring={ring} />
        ) : (
          <IngredientsTab
            ingredients={ingredients}
            match={match}
            personalized={personalized}
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

function MatchTab({ ingredients, type, match, profile, ring }: { ingredients: Ingredient[]; type: ProductType; match: MatchResult; profile: SkinProfile; ring: boolean }) {
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
      {ring ? <ScoreHead match={match} /> : null}
      <PregnancyCard match={match} />
      <Text style={{ paddingHorizontal: 4, fontSize: TYPE.body, lineHeight: 22, color: INK }}>{explainer(profile)}</Text>
      <Reasons ingredients={ingredients} match={match} profile={profile} />
      <Text style={{ paddingHorizontal: 4, fontSize: TYPE.caption, color: MUTED }}>
        From {identified} of {ingredients.length} ingredients we could identify{confidence === "high" ? "" : ` — ${confidence} confidence`}.
      </Text>
      <RoutineNotes ingredients={ingredients} type={type} profile={profile} />
    </>
  );
}

/** The big ring, half above the sheet in a white circle, and the verdict pill whose "i" opens How scoring works. */
function ScoreHead({ match }: { match: MatchResult }) {
  const colours = scoreColours(match.verdict);
  return (
    <View style={{ alignItems: "center", marginTop: -RING_RISE - SPACE.gutter + 16 }}>
      <View style={{ borderRadius: 999, backgroundColor: SURFACE, shadowColor: INK, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 4 }}>
        <Ring score={match.score} colours={colours} />
      </View>
      <Pressable
        onPress={() => router.push("/scoring")}
        accessibilityRole="button"
        accessibilityLabel={`${VERDICT_LABEL[match.verdict]}. How scoring works`}
        style={{ marginTop: 12, minWidth: 160, height: 32, borderRadius: 16, paddingLeft: 16, paddingRight: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colours.deep }}
        className="active:opacity-80"
      >
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", letterSpacing: -0.15, color: SURFACE }}>{VERDICT_LABEL[match.verdict]}</Text>
        <InfoDot colour={PILL_INFO} />
      </Pressable>
    </View>
  );
}

/** A small "i" in a ring (v7): grey on a card, pale on a filled pill. */
function InfoDot({ colour }: { colour: string }) {
  return (
    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colour, alignItems: "center", justifyContent: "center" }}>
      <Text maxFontSizeMultiplier={1} style={{ fontSize: 12, fontWeight: "700", color: colour }}>
        i
      </Text>
    </View>
  );
}

/** The score in a ring: the band's tint as the track, its colour as the arc from 12 o'clock, the number in the title face. */
function Ring({ score, colours }: { score: number | null; colours: { solid: string; tint: string; deep: string } }) {
  // Drawn for the ordinary text sizes; past them it grows with the words (#334).
  const scale = useRingScale();
  const size = RING_SIZE * scale;
  const radius = 38 * scale;
  const stroke = 6 * scale;
  const circumference = 2 * Math.PI * radius;
  const filled = score === null ? 0 : (score / 100) * circumference;
  return (
    <View testID="score-ring" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colours.tint} strokeWidth={stroke} fill="none" />
        {score !== null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colours.solid}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${filled} ${circumference - filled}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <Text maxFontSizeMultiplier={1} style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.display * scale, lineHeight: TYPE.display * scale + 4, color: colours.deep }}>
        {score ?? "–"}
      </Text>
    </View>
  );
}

/** "We checked its ingredients against your skin profile: oily, somewhat sensitive, with dark spots and acne." */
function explainer(profile: SkinProfile): string {
  const parts = [
    profile.baseSkinType ?? null,
    profile.sensitivity === "high" ? "very sensitive" : profile.sensitivity === "some" ? "somewhat sensitive" : null,
  ].filter((p): p is string => p !== null);
  const concerns = profile.concerns.map((c: Concern) => CONCERN_PHRASE[c]);
  const described = [...parts, ...(concerns.length > 0 ? [`with ${listNames(concerns)}`] : [])].join(", ");
  return `We checked its ingredients against your skin profile${described ? `: ${described}` : ""}. These are the ones that matter most for you.`;
}

type Reason = { key: string; name: string; text: string; tone: Wash; source?: RuleSource };

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
    <View style={{ gap: 8 }}>
      {shown.map((row) => (
        <View key={row.key} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: CARD_RADIUS, backgroundColor: row.tone.wash, padding: 16 }}>
          <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 3.5, borderColor: row.tone.solid }} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: INK }}>
              <Text style={{ fontWeight: "600", color: row.tone.deep }}>{row.name}</Text> {row.text}
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
          <View key={note.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: CARD_RADIUS, backgroundColor: SURFACE, borderWidth: 1, borderColor: VERDICT_NEUTRAL.tint, paddingVertical: 12, paddingHorizontal: 16 }}>
            <View
              testID={caution ? "routine-caution" : undefined}
              style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: caution ? VERDICT.medium.tint : MOON_BADGE.fill }}
            >
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
                <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" stroke={caution ? VERDICT.medium.deep : MOON_BADGE.ink} strokeWidth={2} strokeLinejoin="round" />
              </Svg>
            </View>
            <View style={{ flex: 1, gap: 1 }}>
              <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>In a routine</Text>
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
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: CARD_RADIUS, backgroundColor: VERDICT.low.wash, padding: 16 }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: VERDICT.low.solid }}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
          <Path d="M12 7v6M12 17h.01" stroke={SURFACE} strokeWidth={2.8} strokeLinecap="round" />
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

/** No skin profile yet (v7): the warm card and the way to one. */
function NoProfile() {
  return (
    <View style={{ alignItems: "center", borderRadius: 24, backgroundColor: HOME_CARD_FILL, paddingVertical: SPACE.section, paddingHorizontal: SPACE.gutter }}>
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
  match,
  personalized,
  filter,
  onFilter,
  onIngredientPress,
  report,
}: {
  ingredients: Ingredient[];
  match: MatchResult;
  personalized: boolean;
  filter: IngredientFilter;
  onFilter: (filter: IngredientFilter) => void;
  onIngredientPress: (ingredient: Ingredient) => void;
  report?: ReactNode;
}) {
  const largeText = useLargeText();
  const irritation = irritationRisk({ ingredients }, match);
  const pore = poreRisk({ ingredients });
  return (
    <>
      <PregnancyCard match={match} />
      {/* The two risks; either opens the list filtered to its watch-outs. */}
      <View testID="risk-cards" style={{ flexDirection: largeText ? "column" : "row", gap: 12 }}>
        <RiskCard title="Irritation risk" risk={irritation} onPress={irritation.hasEntries ? () => onFilter("watch") : undefined} />
        <RiskCard title="Pore-clogging risk" risk={pore} onPress={pore.hasEntries ? () => onFilter("watch") : undefined} />
      </View>
      {ingredients.length > 0 ? (
        <IngredientsCard
          ingredients={ingredients}
          match={match}
          personalized={personalized}
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

/** One of the two risks (v7): its name, the level in the verdict colour, why, on the verdict's light wash. */
function RiskCard({ title, risk, onPress }: { title: string; risk: Risk; onPress?: () => void }) {
  const tone = RISK_WASH[risk.tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${title}: ${risk.level}. ${risk.note}`}
      style={{ flex: 1, gap: 2, borderRadius: CARD_RADIUS, backgroundColor: tone.wash, paddingVertical: 12, paddingHorizontal: 16 }}
      className={onPress ? "active:opacity-70" : undefined}
    >
      <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{title}</Text>
      <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: tone.deep }}>{risk.level}</Text>
      <Text numberOfLines={2} style={{ fontSize: TYPE.caption, lineHeight: 17, color: MUTED }}>
        {risk.note}
      </Text>
    </Pressable>
  );
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
