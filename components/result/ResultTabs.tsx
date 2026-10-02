import { useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { BottomSheet } from "@/components/BottomSheet";
import { CloseCross, IconCircle } from "@/components/IconCircle";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { IngredientsCard, type IngredientFilter } from "@/components/result/IngredientsCard";
import { ScoreDisc, VerdictLink } from "@/components/result/ScoreRing";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { SourceLink } from "@/components/SourceLink";
import { ReadingScale, Text, useLargeText } from "@/components/Text";
import { VerdictDot } from "@/components/VerdictMarker";
import type { Concern, Ingredient, ProductType, SkinProfile } from "@/data/types";
import { pairingNotesFor } from "@/lib/active-pairings";
import { goalNudgesFor, nudgesFor } from "@/lib/context-nudges";
import { displayIngredientName } from "@/lib/ingredient-name";
import { cardSource, deckFor, JOURNEY_CONCERNS, planFit, ROLE_LABEL, shortLabel } from "@/lib/journey";
import { concernSupport, confidenceLabel, isLowCoverage, matchProduct, ruleFor, type MatchResult } from "@/lib/matching";
import { openQuiz } from "@/lib/open-quiz";
import { CONCERN_PHRASE, isPersonalized } from "@/lib/profile";
import { irritationRisk, poreRisk, type Risk } from "@/lib/risk";
import type { RuleSource } from "@/lib/rules";
import { irritationWarnings, isVerified } from "@/lib/safety";
import { CARD_RADIUS, DIVIDER, DISPLAY_FONT, HOME_CARD_FILL, INK, MUTED, RISK_FILL, RISK_LINE, SEGMENT_TRACK, SHEET, SPACE, STONE, TEASER_INK, TYPE, VERDICT, VERDICT_NEUTRAL, WHITE } from "@/lib/tokens";
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

// v9 measurements, read off the hand-off: the stone under the switch that the
// white sheet rises over (taller when a score ring has to straddle the edge),
// the sheet's top corners, and how far the ring is pulled up over that edge.
const SHEET_RADIUS = 32;
const SHEET_OVERLAP = 16;
const HEAD_SPACER = { ring: 60, plain: 16 } as const;
const RING_LIFT = 76;

/**
 * The scrolling part of a result screen (v9): `header` (the product, or what
 * a label photo read), a Skin match | Ingredients switch on the stone, then
 * the chosen tab on a white sheet that rises over it. The header and the
 * switch hold still and only the sheet scrolls (owner), so the scroll view is
 * this component's own. Skin match opens first: the score ring sitting on the sheet's
 * edge, the verdict pill under it, then what matters for this person.
 * Ingredients is the same for everyone apart from a pregnancy caution: the
 * two risks and the ingredient box. Shared by a catalogue product and a label
 * photo. `footer` is what a screen adds under either tab (a note, a
 * stale-formula notice, a retake button); `report` goes inside the
 * ingredient box once every ingredient is showing. `concerns` are the ones a
 * Skin needs scan carried along; without them the skin profile's are used.
 */
export function ResultTabs({
  header,
  ingredients,
  type,
  match,
  profile,
  onIngredientPress,
  footer,
  report,
  concerns,
}: {
  header: ReactNode;
  ingredients: Ingredient[];
  type: ProductType;
  match: MatchResult;
  profile: SkinProfile;
  onIngredientPress: (ingredient: Ingredient) => void;
  footer?: ReactNode;
  report?: ReactNode;
  concerns?: Concern[];
}) {
  const [tab, setTab] = useState<Tab>("match");
  const [filter, setFilter] = useState<IngredientFilter>("all");
  const lowCoverage = isLowCoverage(ingredients);
  // Only a scored Skin match has a ring to make room for.
  const ring = tab === "match" && isPersonalized(profile) && !lowCoverage;
  const largeText = useLargeText();

  const top = (
    <>
      {/* The reading parts of the screen: their text follows the phone's text
          size all the way up (#334). */}
      <ReadingScale>{header}</ReadingScale>
      {/* The 12pt under the switch belongs to the part below, so this strip
          doesn't cut the top off the score ring that reaches into it. */}
      <View style={{ backgroundColor: STONE, paddingHorizontal: SPACE.gutter, paddingTop: 16 }}>
        <SegmentedSwitch
          tone="stone"
          options={[
            { value: "match", label: "Skin match" },
            { value: "ingredients", label: "Ingredients" },
          ]}
          selected={tab}
          onSelect={setTab}
        />
      </View>
    </>
  );
  return (
    <View style={{ flex: 1, paddingTop: SPACE.text }}>
      {/* The header and the switch stay where they are; only the white sheet
          under them scrolls (owner). At the largest text sizes they would take
          too much of the screen to hold still, so there they scroll with it. */}
      {largeText ? null : top}
      {/* "handled": a note editor's sheet can render inside this scroll view,
          and touches follow the React tree, not the Modal's window. Without
          it, the first tap on "Save note" while typing only closed the keyboard. */}
      <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} alwaysBounceVertical={false}>
        {largeText ? top : null}
        <ReadingScale>
          <View style={{ flexGrow: 1 }}>
            <View style={{ height: SPACE.block + (ring ? HEAD_SPACER.ring : HEAD_SPACER.plain) }} />
            <View
              testID="result-sheet"
              style={{
                flexGrow: 1,
                marginTop: -SHEET_OVERLAP,
                borderTopLeftRadius: SHEET_RADIUS,
                borderTopRightRadius: SHEET_RADIUS,
                backgroundColor: SHEET,
                paddingTop: 24,
                paddingHorizontal: SPACE.gutter,
                paddingBottom: 40,
                gap: SPACE.block,
              }}
            >
              {tab === "match" ? (
                <MatchTab ingredients={ingredients} type={type} match={match} profile={profile} concerns={concerns} />
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
        </ReadingScale>
      </ScrollView>
    </View>
  );
}

function MatchTab({ ingredients, type, match, profile, concerns }: { ingredients: Ingredient[]; type: ProductType; match: MatchResult; profile: SkinProfile; concerns?: Concern[] }) {
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
      <Reasons ingredients={ingredients} match={match} profile={profile} concerns={concerns ?? profile.concerns} />
      <RoutineNotes ingredients={ingredients} type={type} profile={profile} />
      {/* Only said when it changes how far to trust the number. */}
      {confidence === "high" ? null : (
        <Text style={{ paddingHorizontal: 4, fontSize: TYPE.caption, color: MUTED }}>
          From {identified} of {ingredients.length} ingredients we could identify — {confidence} confidence.
        </Text>
      )}
    </>
  );
}

/**
 * The score ring on its white disc, pulled up so it sits on the sheet's top
 * edge, with the verdict pill tucked just under it (v9); the pill opens How
 * scoring works. At the largest text sizes the ring is bigger than the room
 * above the sheet, so it stays inside it.
 */
function ScoreHead({ match }: { match: MatchResult }) {
  const largeText = useLargeText();
  return (
    <View style={{ alignItems: "center", marginTop: largeText ? 0 : -RING_LIFT }}>
      <View style={{ zIndex: 2 }}>
        <ScoreDisc match={match} />
      </View>
      <View style={{ zIndex: 1, marginTop: -8 }}>
        <VerdictLink match={match} />
      </View>
    </View>
  );
}

type Reason = { key: string; name: string; text: string; tag: string; tone: Tone; source?: RuleSource };

/** What the result says first, by how well it scored (v9). */
const REASONS_TITLE: Record<MatchResult["verdict"], string> = {
  excellent: "This makes sense for you",
  good: "This makes sense for you",
  fair: "Could work for you",
  poor: "Probably not for you",
  unknown: "Here's what we found",
};

/**
 * What matters for this person (v9), one result for everyone with a skin
 * profile: a title and a line saying how the product fits, then a box per
 * finding — what to avoid (red), which of the Skin needs recommendations it
 * covers (green), what this skin is warned about (orange), and the concerns
 * it leaves uncovered. Each box is the bold name, a sentence, and a tag; a
 * claim keeps its source under it (#326).
 */
function Reasons({ ingredients, match, profile, concerns }: { ingredients: Ingredient[]; match: MatchResult; profile: SkinProfile; concerns: Concern[] }) {
  const journeyConcerns = concerns.filter((c) => JOURNEY_CONCERNS.some((j) => j.concern === c));
  const deck = journeyConcerns.length > 0 ? deckFor(journeyConcerns, profile) : [];
  const fit = deck.length > 0 ? planFit(ingredients, deck, journeyConcerns) : null;

  const seen = new Set<string>();
  const rows: Reason[] = [];
  // Hazards first: they cap the score for everyone.
  const hazards = match.warnings.filter((w) => w.severity === "hazard");
  for (const w of hazards) {
    if (seen.has(w.ingredient.name)) continue;
    seen.add(w.ingredient.name);
    rows.push({ key: `avoid-${w.ingredient.name}`, name: displayIngredientName(w.ingredient.name), text: stripName(w.reason, w.ingredient.name), tag: "Best avoided", tone: VERDICT.low, source: w.source });
  }
  // Then the recommendations it covers, one box per card.
  for (const { card, role, ingredients: hits } of fit?.covered ?? []) {
    hits.forEach((hit) => seen.add(hit));
    rows.push({
      key: `card-${card.key}`,
      // A group card names what it found ("Glycerin + Panthenol"); a single-ingredient card is its name.
      name: card.key === "hydrating" ? hits.slice(0, 2).map(displayIngredientName).join(" + ") : card.name,
      text: card.key === "hydrating" ? " put water back in and help keep it there." : ` ${card.line.charAt(0).toLowerCase()}${card.line.slice(1)}`,
      tag: ROLE_LABEL[role],
      tone: VERDICT.high,
      source: cardSource(card) ?? undefined,
    });
  }
  // With no recommendations to count (a profile without those concerns):
  // what works on each concern, found the way the score finds it.
  if (!fit) {
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
        text: rule ? ` helps with ${CONCERN_PHRASE[concern]}` : stripName(support.why, support.ingredient),
        tag: "Good for you",
        tone: VERDICT.high,
        source: rule?.source,
      });
    }
  }
  // Then what this skin is warned about, each with its source.
  for (const w of irritationWarnings(match.warnings)) {
    if (seen.has(w.ingredient.name)) continue;
    seen.add(w.ingredient.name);
    rows.push({ key: `watch-${w.ingredient.name}`, name: displayIngredientName(w.ingredient.name), text: stripName(w.reason, w.ingredient.name), tag: "Watch out", tone: VERDICT.medium, source: w.source });
  }
  // The concerns none of its ingredients work on.
  if (fit && fit.notCovered.length > 0) {
    rows.push({
      key: "not-covered",
      name: "Worth knowing:",
      text: ` it won't work on your ${fit.notCovered.map((c) => CONCERN_PHRASE[c]).join(" or ")} on its own.`,
      tag: `Not covered: ${fit.notCovered.map((c) => shortLabel(c).toLowerCase()).join(", ")}`,
      tone: VERDICT.medium,
    });
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
      tag: up ? "Good to know" : "Watch out",
      tone: up ? VERDICT.high : VERDICT.medium,
      source: r.source,
    });
  }
  const shown = rows.slice(0, 6);

  const line =
    hazards.length > 0
      ? "Contains something worth avoiding for your skin."
      : fit
        ? fit.total === 1
          ? fit.covered.length === 1
            ? "It covers the recommendation for your skin."
            : "It doesn't cover the recommendation for your skin."
          : `It covers ${fit.covered.length} of the ${fit.total} recommendations for your skin.`
        : shown.length === 0
          ? "Nothing in it works on your skin in particular, either way."
          : "Checked against your skin profile.";
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ paddingHorizontal: 4, gap: 4 }}>
        <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
          {REASONS_TITLE[match.verdict]}
        </Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{line}</Text>
      </View>
      <View style={{ marginTop: 16, gap: SPACE.block }}>
        {shown.map((row) => (
          <View key={row.key} style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 20, backgroundColor: row.tone.wash, padding: SPACE.gutter }}>
            {/* An open ring in the verdict's colour (v9). */}
            <View style={{ marginTop: 4, width: 12, height: 12, borderRadius: 6, borderWidth: 3, borderColor: row.tone.solid }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: INK }}>
                <Text style={{ fontWeight: "600" }}>{row.name}</Text>
                {row.text}
              </Text>
              <Text style={{ fontSize: TYPE.caption, color: row.tone.deep }}>{row.tag}</Text>
              {/* Every claim traces to what it was checked against (#326). */}
              {row.source ? <SourceLink source={row.source} /> : null}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * What follows the bold name in a reason row. A rule's sentence that opens
 * with the ingredient's own name carries on from it ("Niacinamide moderates
 * oil" → " moderates oil"); any other sentence is set off with a colon, so
 * "Butylene Glycol" + "A humectant solvent" reads "Butylene Glycol: a
 * humectant solvent" rather than running the two together.
 */
function stripName(text: string, name: string): string {
  const sentence = text.split(" - ")[0].trim();
  const lower = sentence.toLowerCase();
  const bare = name.toLowerCase();
  if (lower.startsWith(bare)) return ` ${sentence.slice(name.length).replace(/^[\s:,-]+/, "")}`;
  return `: ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}`;
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

/**
 * No skin profile yet (v9): a teaser sheet rises once when the product opens
 * ("Is it right for your skin?", with a ring that is still a question mark),
 * and the tab itself keeps a quieter card with the same way in — the quiz.
 */
function NoProfile() {
  const [teaser, setTeaser] = useState(true);
  const takeQuiz = () => {
    setTeaser(false);
    openQuiz();
  };
  return (
    <>
      <View style={{ alignItems: "center", borderRadius: CARD_RADIUS, backgroundColor: HOME_CARD_FILL, paddingVertical: SPACE.section, paddingHorizontal: SPACE.gutter }}>
        <Text accessibilityRole="header" style={{ textAlign: "center", fontSize: TYPE.card, fontWeight: "600", color: INK }}>
          Is it right for your skin?
        </Text>
        <Text style={{ marginTop: 4, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>4 quick questions. No sign-up needed.</Text>
        <PrimaryButton label="Get my match" onPress={openQuiz} style={{ marginTop: 12, width: BUTTON_WIDTH.inCard }} />
      </View>

      <BottomSheet
        visible={teaser}
        onClose={() => setTeaser(false)}
        floating
        bare
        corner={
          <IconCircle onPress={() => setTeaser(false)} accessibilityLabel="Close">
            <CloseCross />
          </IconCircle>
        }
      >
        {/* The top half: a ring with no score yet, and the verdict as a question. */}
        <View style={{ alignItems: "center", gap: 12, backgroundColor: HOME_CARD_FILL, paddingTop: 32, paddingHorizontal: 20, paddingBottom: 24 }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: WHITE, alignItems: "center", justifyContent: "center" }}>
            <Svg width={80} height={80} style={{ position: "absolute" }}>
              <Circle cx={40} cy={40} r={34} stroke={SEGMENT_TRACK} strokeWidth={6} fill="none" />
              <Circle cx={40} cy={40} r={34} stroke={VERDICT.high.solid} strokeWidth={6} strokeLinecap="round" fill="none" strokeDasharray="180 999" transform="rotate(-90 40 40)" />
            </Svg>
            <Text maxFontSizeMultiplier={1} style={{ fontFamily: DISPLAY_FONT, fontSize: 30, lineHeight: 34, color: TEASER_INK }}>
              ?
            </Text>
          </View>
          <View style={{ height: 36, paddingHorizontal: 20, borderRadius: 14, backgroundColor: TEASER_INK, justifyContent: "center" }}>
            <Text style={{ fontSize: 16, fontWeight: "600", color: WHITE }}>Good match?</Text>
          </View>
        </View>
        <View style={{ alignItems: "center", gap: 8, paddingTop: 24, paddingHorizontal: 20, paddingBottom: 20 }}>
          <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
            Is it right for your skin?
          </Text>
          <Text style={{ maxWidth: 300, textAlign: "center", fontSize: 16, lineHeight: 23, color: MUTED }}>Answer 4 quick questions and we&apos;ll match every product to your skin.</Text>
          <PrimaryButton label="Take the 1-minute quiz" onPress={takeQuiz} style={{ marginTop: 12, width: BUTTON_WIDTH.secondary }} />
        </View>
      </BottomSheet>
    </>
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
  // The same for everyone (v9): read without the person's skin, keeping only
  // a pregnancy, which is a caution rather than a preference.
  const general = matchProduct({ type, ingredients }, { ...EMPTY_PROFILE, pregnancyStatus: profile.pregnancyStatus });
  const irritation = irritationRisk({ ingredients }, general);
  const pore = poreRisk({ ingredients });
  return (
    <>
      <PregnancyCard match={match} />
      <Text style={{ paddingHorizontal: 4, fontSize: TYPE.body, lineHeight: 21, color: INK }}>General ingredients info, the same for everyone.</Text>
      {/* The two risks in one box, a row each (v9); either opens the list filtered to its watch-outs. */}
      <View testID="risk-cards" style={{ borderRadius: 20, backgroundColor: RISK_FILL, paddingVertical: 4, paddingHorizontal: 16 }}>
        <RiskRow title="Irritation risk" risk={irritation} onPress={irritation.hasEntries ? () => onFilter("watch") : undefined} />
        <RiskRow title="Pore-clogging risk" risk={pore} divider onPress={pore.hasEntries ? () => onFilter("pore") : undefined} />
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

/** One of the two risks (v9): the verdict's dot, its name over why, and the level at the end in the verdict's text colour. */
function RiskRow({ title, risk, divider = false, onPress }: { title: string; risk: Risk; divider?: boolean; onPress?: () => void }) {
  const tone = RISK_TONE[risk.tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${title}: ${risk.level}. ${risk.note}`}
      style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: divider ? 0.5 : 0, borderTopColor: RISK_LINE }}
      className={onPress ? "active:opacity-70" : undefined}
    >
      <VerdictDot colour={tone.solid} halo={tone.halo} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{title}</Text>
        <Text numberOfLines={2} style={{ fontSize: TYPE.caption, lineHeight: 17.5, color: MUTED }}>
          {risk.note}
        </Text>
      </View>
      <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: tone.deep }}>{risk.level}</Text>
    </Pressable>
  );
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
