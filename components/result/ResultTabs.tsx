import { useRef, useState, type ReactNode } from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { BottomSheet } from "@/components/BottomSheet";
import { CloseCross, IconCircle } from "@/components/IconCircle";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { GlassHeader } from "@/components/GlassHeader";
import { ReferenceLink } from "@/components/ReferenceLink";
import { SafetyShield } from "@/components/SafetyShield";
import { SectionLabel } from "@/components/SectionLabel";
import { IngredientsCard, type IngredientFilter } from "@/components/result/IngredientsCard";
import { ScoreDisc, VerdictLink } from "@/components/result/ScoreRing";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { ReadingScale, Text, useLargeText } from "@/components/Text";
import { VerdictDot } from "@/components/VerdictMarker";
import type { Ingredient, ProductType, SkinProfile } from "@/data/types";
import { pairingNotesFor } from "@/lib/active-pairings";
import { goalNudgesFor, nudgesFor } from "@/lib/context-nudges";
import { useSafetyNoticeHits } from "@/lib/features";
import { displayIngredientName } from "@/lib/ingredient-name";
import { deckFor, needVerdict, PLAN_CONCERNS, planFit, type Need, type NeedLevel } from "@/lib/journey";
import { concernSupport, confidenceLabel, isLowCoverage, matchProduct, ruleFor, type Contraindication, type MatchResult } from "@/lib/matching";
import { openQuiz } from "@/lib/open-quiz";
import { CONCERN_PHRASE, isPersonalized } from "@/lib/profile";
import { cloggerConfidence, PORE_COUNTS_TEXT, poreCountedNames, poreVerdict } from "@/lib/pore-clogging";
import { irritationRisk, poreRisk, type Risk } from "@/lib/risk";
import { EU_PROHIBITED_SOURCE, irritationWarnings, isVerified, SAFETY_NOTICE_COPY, type SafetyNoticeHit } from "@/lib/safety";
import { inSentence } from "@/lib/skin-needs";
import { CARD_RADIUS, DIVIDER, DISPLAY_FONT, HOME_CARD_FILL, INK, MUTED, RISK_FILL, RISK_LINE, SEGMENT_TRACK, SHEET, SPACE, STONE, STONE_GLASS, TEASER_INK, TYPE, VERDICT, VERDICT_NEUTRAL, WHITE, RADIUS } from "@/lib/tokens";
import { EMPTY_PROFILE } from "@/store/useAppStore";
import { noOrphan } from "@/lib/text";

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
const SHEET_RADIUS = RADIUS.sheet;
const SHEET_OVERLAP = 16;
const HEAD_SPACER = { ring: 60, plain: 16 } as const;
const RING_LIFT = 76;
// How long after its button the no-profile sheet is put away: once the quiz has risen over it.
const TEASER_GONE_MS = 600;

/**
 * The scrolling part of a result screen (v9): `header` (the product, or what
 * a label photo read), a Skin match | Ingredients switch on the stone, then
 * the chosen tab on a white sheet that rises over it. The top bar (`nav`),
 * the header and the switch hold still on frosted stone, and the sheet
 * scrolls up behind them, blurred (owner), so the scroll view is this
 * component's own. Skin match opens first: the score ring sitting on the sheet's
 * edge, the verdict pill under it, then what matters for this person.
 * Ingredients is the same for everyone apart from a pregnancy caution: the
 * two risks and the ingredient box. Shared by a catalogue product and a label
 * photo. `footer` is what a screen adds under either tab (a note, a
 * stale-formula notice, a retake button); `report` goes inside the
 * ingredient box once every ingredient is showing. `need` is what a Skin
 * needs scan carried along: Skin match then answers a different question,
 * whether the product holds an active for that goal (`NeedMatch`), with no
 * score, and `profile` is the one made from the goal, used for warnings only.
 */
export function ResultTabs({
  nav,
  header,
  ingredients,
  type,
  match,
  profile,
  onIngredientPress,
  footer,
  report,
  need,
}: {
  /** The screen's top bar: it stays put, above the header. */
  nav?: ReactNode;
  header: ReactNode;
  ingredients: Ingredient[];
  type: ProductType;
  match: MatchResult;
  profile: SkinProfile;
  onIngredientPress: (ingredient: Ingredient) => void;
  footer?: ReactNode;
  report?: ReactNode;
  need?: Need;
}) {
  const [tab, setTab] = useState<Tab>("match");
  const [filter, setFilter] = useState<IngredientFilter>("all");
  const lowCoverage = isLowCoverage(ingredients);
  // Only a scored Skin match has a ring to make room for.
  const ring = tab === "match" && !need && isPersonalized(profile) && !lowCoverage;
  const largeText = useLargeText();
  // The fixed header's height, once laid out: the room the result leaves for it.
  const [fixedHeight, setFixedHeight] = useState(0);
  // With no skin profile, a sheet rises once over the result to offer the quiz.
  const [teaser, setTeaser] = useState(true);
  const noProfile = !need && !isPersonalized(profile) && !lowCoverage;
  const takeQuiz = () => {
    // The quiz rises at once, over the sheet; the sheet is gone by the time
    // the quiz is closed.
    openQuiz();
    setTimeout(() => setTeaser(false), TEASER_GONE_MS);
  };
  const [scrollY] = useState(() => new Animated.Value(0));
  // The two tabs are different lengths, so one's scroll position means nothing on
  // the other: Ingredients used to open already scrolled, with its two risk
  // cards hidden behind the header. A tab starts at its top.
  const scrollRef = useRef<ScrollView | null>(null);
  const selectTab = (next: Tab) => {
    setTab(next);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  const top = (
    <>
      {/* The reading parts of the screen: their text follows the phone's text
          size all the way up (#334). */}
      <ReadingScale>{header}</ReadingScale>
      {/* The 12pt under the switch is frosted too, so nothing is cut at the
          switch's own edge. */}
      <View style={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.gutter, paddingBottom: SPACE.block }}>
        <SegmentedSwitch
          tone="stone"
          options={[
            { value: "match", label: "Skin match" },
            { value: "ingredients", label: "Ingredients" },
          ]}
          selected={tab}
          onSelect={selectTab}
        />
      </View>
    </>
  );
  return (
    <View style={{ flex: 1 }}>
      {/* "handled": a note editor's sheet can render inside this scroll view,
          and touches follow the React tree, not the Modal's window. Without
          it, the first tap on "Save note" while typing only closed the keyboard. */}
      <Animated.ScrollView
        ref={scrollRef}
        testID="result-scroll"
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1 }}
        // The result starts under the fixed header and scrolls up behind it.
        contentContainerStyle={{ flexGrow: 1, paddingTop: fixedHeight }}
        scrollIndicatorInsets={{ top: fixedHeight }}
        alwaysBounceVertical={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        {largeText ? <View style={{ paddingTop: SPACE.text }}>{top}</View> : null}
        <ReadingScale>
          <View style={{ flexGrow: 1 }}>
            {/* The extra 12pt keeps the score ring, which reaches above its own
                room, clear of the frosted header. */}
            <View style={{ height: SPACE.block + (ring ? HEAD_SPACER.ring : HEAD_SPACER.plain) }} />
            <View
              testID="result-sheet"
              style={{
                flexGrow: 1,
                marginTop: -SHEET_OVERLAP,
                borderTopLeftRadius: SHEET_RADIUS,
                borderTopRightRadius: SHEET_RADIUS,
                backgroundColor: SHEET,
                paddingTop: SPACE.section,
                paddingHorizontal: SPACE.gutter,
                paddingBottom: 40,
                gap: SPACE.block,
              }}
            >
              {tab === "match" ? (
                <MatchTab ingredients={ingredients} type={type} match={match} profile={profile} need={need} />
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
      </Animated.ScrollView>
      {/* The top bar, the header and the switch stay where they are (owner),
          on glass: what scrolls up passes behind them, blurred. At the
          largest text sizes the header and switch would take too much of the
          screen to hold still, so there they scroll and only the bar stays. */}
      <GlassHeader scrollY={scrollY} solid={STONE} glass={STONE_GLASS} onHeight={setFixedHeight}>
        {nav}
        {largeText ? null : <View style={{ paddingTop: SPACE.text }}>{top}</View>}
      </GlassHeader>
      {noProfile ? <ProfileTeaser visible={teaser} onClose={() => setTeaser(false)} onQuiz={takeQuiz} /> : null}
    </View>
  );
}

function MatchTab({ ingredients, type, match, profile, need }: { ingredients: Ingredient[]; type: ProductType; match: MatchResult; profile: SkinProfile; need?: Need }) {
  const lowCoverage = isLowCoverage(ingredients);
  // The EU safety notice (#404): none with the flag off, so those two
  // states are exactly what they were.
  const noticeHits = useSafetyNoticeHits(ingredients);
  if (!need && !isPersonalized(profile) && !lowCoverage) {
    return (
      <>
        <NoticeCard hits={noticeHits} />
        <NoProfile />
      </>
    );
  }

  const identified = ingredients.filter(isVerified).length;
  if (lowCoverage) {
    return (
      <>
        <NoticeCard hits={noticeHits} />
        <View style={{ gap: 4, borderRadius: CARD_RADIUS, backgroundColor: VERDICT.medium.wash, padding: SPACE.gutter }}>
          <Text accessibilityRole="header" style={{ fontSize: TYPE.card, fontWeight: "600", color: VERDICT.medium.deep }}>
            We only recognised {identified} of {ingredients.length} names
          </Text>
          <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: INK }}>That&apos;s too few to score it fairly.</Text>
        </View>
      </>
    );
  }

  const confidence = confidenceLabel(match.confidence);
  return (
    <>
      {need ? null : <ScoreHead match={match} />}
      <PregnancyCard match={match} />
      {need ? <NeedMatch ingredients={ingredients} match={match} profile={profile} need={need} /> : <Reasons ingredients={ingredients} match={match} profile={profile} />}
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

type Reason = { key: string; name: string; text: string; tone: Tone; /** The EU safety notice (#404): a shield, a link and a caveat. */ notice?: boolean };

/**
 * The EU safety notice above what a result with no profile, or too little
 * read, says (#404): "Please check the label", then each name. Nothing when
 * the flag is off or no verified ingredient is on the label.
 */
function NoticeCard({ hits }: { hits: SafetyNoticeHit[] }) {
  if (hits.length === 0) return null;
  return (
    <View style={{ marginBottom: SPACE.block, flexDirection: "row", alignItems: "flex-start", gap: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: VERDICT.low.wash, padding: SPACE.gutter }}>
      <View style={{ marginTop: 1 }}>
        <SafetyShield />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.card, fontWeight: "600", color: VERDICT.low.deep }}>
          {SAFETY_NOTICE_COPY.cardTitle}
        </Text>
        {hits.map((hit) => (
          <Text key={hit.ingredient.name} style={{ fontSize: TYPE.body, lineHeight: 21, color: INK }}>
            <Text style={{ fontWeight: "600" }}>{displayIngredientName(hit.ingredient.name)}</Text>
            {SAFETY_NOTICE_COPY.cardText}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** A hazard's red box: its own sentence, or (#404) the EU notice for an ingredient on the verified list. */
function hazardRow(w: Contraindication, noticeHits: SafetyNoticeHit[]): Reason {
  const noticed = noticeHits.some((hit) => hit.ingredient.name === w.ingredient.name);
  return {
    key: `avoid-${w.ingredient.name}`,
    name: displayIngredientName(w.ingredient.name),
    text: noticed ? SAFETY_NOTICE_COPY.rowText : stripName(w.reason, w.ingredient.name),
    tone: VERDICT.low,
    ...(noticed ? { notice: true } : {}),
  };
}

/** What the result says first, by how well it scored (v9). */
const REASONS_TITLE: Record<MatchResult["verdict"], string> = {
  excellent: "This makes sense for you",
  good: "This makes sense for you",
  fair: "Could work for you",
  poor: "Probably not for you",
  unknown: "Here's what we found",
};

/**
 * The order of a result's boxes, by colour, for a verdict (owner):
 * a good or excellent match leads with what works (green, then orange); a
 * fair or poor one leads with what doesn't (orange, then green). Red is a
 * banned or hazardous ingredient, a safety warning, and is first on every
 * product, so it never sits under the praise.
 */
export function reasonOrder(verdict: MatchResult["verdict"]): ("red" | "green" | "orange")[] {
  return verdict === "fair" || verdict === "poor" ? ["red", "orange", "green"] : ["red", "green", "orange"];
}

/**
 * What matters for this person (v9), one result for everyone with a skin
 * profile: a title and a line saying how the product fits, then a box per
 * finding — what to avoid (red), which of the Skin needs recommendations it
 * covers (green), what this skin is warned about (orange), and the concerns
 * it leaves uncovered — in the order `reasonOrder` gives for the verdict. Each box is its colour, the bold name and a sentence, with no label under it (owner). No
 * sources here (owner): they are on each ingredient's own sheet, in its
 * Sources card.
 */
function Reasons({ ingredients, match, profile }: { ingredients: Ingredient[]; match: MatchResult; profile: SkinProfile }) {
  const planConcerns = profile.concerns.filter((c) => PLAN_CONCERNS.includes(c));
  const fit = planConcerns.length > 0 ? planFit(ingredients, deckFor(planConcerns, profile), planConcerns) : null;

  const seen = new Set<string>();
  const rows: Reason[] = [];
  // The EU safety notice (#404): with the flag off there are no hits, and
  // every line below is what it was.
  const noticeHits = useSafetyNoticeHits(ingredients);
  // Hazards first: they cap the score for everyone.
  const hazards = match.warnings.filter((w) => w.severity === "hazard");
  for (const w of hazards) {
    if (seen.has(w.ingredient.name)) continue;
    seen.add(w.ingredient.name);
    rows.push(hazardRow(w, noticeHits));
  }
  // A pore-clogger, for the skin it matters to (owner): acne or enlarged
  // pores in the profile. Strong evidence is red, moderate orange; a
  // contested one is never warned about.
  if (profile.concerns.some((c) => c === "acne-prone" || c === "large-pores")) {
    for (const ingredient of ingredients) {
      const confidence = cloggerConfidence(ingredient);
      if (confidence === null || confidence === "contested" || seen.has(ingredient.name)) continue;
      seen.add(ingredient.name);
      rows.push({ key: `clog-${ingredient.name}`, name: displayIngredientName(ingredient.name), text: " is comedogenic and may clog pores.", tone: confidence === "high" ? VERDICT.low : VERDICT.medium });
    }
  } else if (profile.baseSkinType === "oily") {
    // Oily skin without a pore-led concern is charged a little for pore-cloggers
    // (`poreRelevance`, lib/matching.ts), so say what for: one box naming up to
    // three, amber because it counts a little. Contested ones are never named.
    const counted = poreCountedNames(ingredients).filter((name) => !seen.has(name));
    if (counted.length > 0) {
      counted.forEach((name) => seen.add(name));
      const shown = counted.slice(0, 3).map(displayIngredientName);
      rows.push({
        key: "pore-counts",
        name: counted.length > 3 ? `${shown.join(", ")} and others` : listNames(shown),
        text: ` ${PORE_COUNTS_TEXT}`,
        tone: VERDICT.medium,
      });
    }
  }
  // Then the recommendations it covers, one box per card.
  for (const { card, ingredients: hits } of fit?.covered ?? []) {
    hits.forEach((hit) => seen.add(hit));
    rows.push({
      key: `card-${card.key}`,
      // A card with its own sentence names what it found ("Glycerin + Panthenol"); any other is its name, then its line.
      name: card.found ? hits.slice(0, 2).map(displayIngredientName).join(" + ") : card.name,
      text: card.found ? ` ${card.found}` : ` ${card.line.charAt(0).toLowerCase()}${card.line.slice(1)}`,
      tone: VERDICT.high,
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
        tone: VERDICT.high,
      });
    }
  }
  // Then what this skin is warned about.
  for (const w of irritationWarnings(match.warnings)) {
    if (seen.has(w.ingredient.name)) continue;
    seen.add(w.ingredient.name);
    rows.push({ key: `watch-${w.ingredient.name}`, name: displayIngredientName(w.ingredient.name), text: stripName(w.reason, w.ingredient.name), tone: VERDICT.medium });
  }
  // The concerns none of its ingredients work on.
  if (fit && fit.notCovered.length > 0) {
    rows.push({
      key: "not-covered",
      name: "Worth knowing:",
      text: ` it won't work on your ${fit.notCovered.map((c) => CONCERN_PHRASE[c]).join(" or ")} on its own.`,
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
      tone: up ? VERDICT.high : VERDICT.medium,
    });
  }
  // What is read first follows the verdict (owner, 2 October 2026), so the
  // first box never argues with the score above it. The sort is stable: within
  // a colour the order built above stands.
  const order = reasonOrder(match.verdict);
  const colourOf = (row: Reason) => (row.tone === VERDICT.low ? "red" : row.tone === VERDICT.high ? "green" : "orange");
  const sorted = mergeSameSentence(rows).sort((a, b) => order.indexOf(colourOf(a)) - order.indexOf(colourOf(b)));
  const shown = limitBoxes(sorted, colourOf, order);
  // What the first view says about the orange boxes: on a good match they sit
  // under the green ones, out of sight, and the green read as the whole answer.
  const watching = order[1] === "green" ? shown.filter((row) => colourOf(row) === "orange" && !row.notice).length : 0;

  const line =
    noticeHits.length > 0
      ? SAFETY_NOTICE_COPY.matchLine
      : hazards.length > 0
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
    <View style={{ marginTop: SPACE.text }}>
      <View style={{ paddingHorizontal: 4, gap: 4 }}>
        <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
          {noOrphan(REASONS_TITLE[match.verdict])}
        </Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
          {noOrphan(`${line}${watching > 0 ? ` ${watching === 1 ? "One thing to watch" : `${watching} things to watch`} below.` : ""}`)}
        </Text>
      </View>
      <ReasonGroups rows={shown} order={order} colourOf={colourOf} />
    </View>
  );
}

/** What the green and the orange boxes are, once a result has both. Red is never labelled: it is the first thing read, and says what it is. */
const GROUP_LABEL = { green: "Working for you", orange: "Worth watching" } as const;

/**
 * The reason boxes, grouped by colour (the squint test: what works, then what to
 * watch, instead of one run of equal boxes). Boxes in a group sit close (8pt) and
 * the groups are a section apart, each opened by a small label once there are
 * both greens and oranges. The first box of the first group leads: set a size
 * larger than the rest.
 */
function ReasonGroups({ rows, order, colourOf }: { rows: Reason[]; order: ("red" | "green" | "orange")[]; colourOf: (row: Reason) => "red" | "green" | "orange" }) {
  const groups = order.map((colour) => ({ colour, rows: rows.filter((row) => colourOf(row) === colour) })).filter((group) => group.rows.length > 0);
  const labelled = groups.some((g) => g.colour === "green") && groups.some((g) => g.colour === "orange");
  let first = true;
  return (
    <View style={{ marginTop: labelled ? 0 : SPACE.gutter, gap: labelled ? 0 : SPACE.text }}>
      {groups.map((group) => (
        <View key={group.colour} style={{ gap: SPACE.text }}>
          {labelled && group.colour !== "red" ? <SectionLabel title={GROUP_LABEL[group.colour]} /> : null}
          {group.rows.map((row) => {
            const lead = first;
            first = false;
            return <ReasonBox key={row.key} row={row} lead={lead} />;
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * Findings that say the same sentence become one box: "Ceramide NP", "Ceramide
 * AP" and "Ceramide EOP" each carried "ceramides supply barrier lipids…", three
 * near-identical boxes in a row. Only plain boxes of one colour merge, never the
 * EU notice, and the merged one keeps the first's place.
 */
function mergeSameSentence(rows: Reason[]): Reason[] {
  const names = new Map<Reason, string[]>();
  const merged: Reason[] = [];
  for (const row of rows) {
    const twin = row.notice || row.text.trim() === "" ? undefined : merged.find((other) => !other.notice && other.tone === row.tone && other.text === row.text);
    if (twin) names.get(twin)?.push(row.name);
    else {
      const first = { ...row };
      names.set(first, [row.name]);
      merged.push(first);
    }
  }
  return merged.map((row) => {
    const all = names.get(row) ?? [];
    return all.length > 1 ? { ...row, name: listNames(all) } : row;
  });
}

/** The most boxes a result shows. */
const MAX_BOXES = 6;
/** On a result that leads with green, the orange boxes (what this skin is warned about) that are never cut for more green. */
const KEPT_ORANGE = 2;

/**
 * At most six boxes, but never at the cost of the ones that matter: the EU
 * notice is never cut (Codex review on #414), and on a result that leads with
 * green, up to two orange boxes keep their place. Without that, six green
 * boxes filled the six and a warning sitting under them was dropped; a
 * flagged ingredient's own sheet said "lowers your score" while the result
 * above it said nothing. Shown in `rows` order.
 */
function limitBoxes(rows: Reason[], colourOf: (row: Reason) => "red" | "green" | "orange", order: ("red" | "green" | "orange")[]): Reason[] {
  const kept = new Set(rows.filter((row) => row.notice));
  const oranges = rows.filter((row) => !row.notice && colourOf(row) === "orange");
  // Held back from the green ones: the oranges that would otherwise be cut.
  const reserved = order[1] === "green" ? new Set(oranges.slice(0, KEPT_ORANGE)) : new Set<Reason>();
  let room = MAX_BOXES - kept.size - reserved.size;
  for (const row of rows) if (!row.notice && !reserved.has(row) && room > 0) { kept.add(row); room--; }
  reserved.forEach((row) => kept.add(row));
  return rows.filter((row) => kept.has(row));
}

/**
 * One finding: its colour, the app's one marker, the bold name and a sentence.
 * The EU safety notice (#404) wears a shield instead of the dot, and adds the
 * regulation's link and a line that formulas vary and scans can be wrong.
 */
function ReasonBox({ row, lead = false }: { row: Reason; lead?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SPACE.block, borderRadius: RADIUS.card, backgroundColor: row.tone.wash, padding: SPACE.gutter }}>
      {/* The dot in its halo (owner). The halo is white here: the verdict's
          own pale halo is the card's colour and would not show on it. */}
      <View style={{ marginTop: row.notice ? 0 : 2 }}>{row.notice ? <SafetyShield /> : <VerdictDot colour={row.tone.solid} halo={WHITE} />}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: lead ? TYPE.card : TYPE.body, lineHeight: lead ? 24 : 20, color: INK }}>
          <Text style={{ fontWeight: "600" }}>{row.name}</Text>
          {row.text}
        </Text>
        {row.notice ? (
          <>
            <ReferenceLink label={EU_PROHIBITED_SOURCE.label} url={EU_PROHIBITED_SOURCE.url} />
            <Text style={{ fontSize: TYPE.caption, lineHeight: 17, color: MUTED }}>{SAFETY_NOTICE_COPY.rowCaveat}</Text>
          </>
        ) : null}
      </View>
    </View>
  );
}

const TRACE_NOTE = " It is near the end of the list, so there may be very little of it.";

const NEED_TONE: Record<NeedLevel, Tone> = { works: VERDICT.high, little: VERDICT.medium, none: VERDICT_NEUTRAL };

/**
 * Skin match for a scan opened from Skin needs (owner, 2 October 2026): not
 * "does it suit my skin" but "does it hold an active for what I picked". The
 * answer is a sentence on a pill, with no score; then the actives it has,
 * what it would be better for when it misses, and the same warnings any
 * result gives (a pore-clogger where pores are the point, an irritant, a
 * hazard). Support such as hydration is named once and never counted.
 */
function NeedMatch({ ingredients, match, profile, need }: { ingredients: Ingredient[]; match: MatchResult; profile: SkinProfile; need: Need }) {
  const verdict = needVerdict(ingredients, need);
  const tone = NEED_TONE[verdict.level];
  const names = (list: string[]) => listNames(list.slice(0, 3).map(displayIngredientName));
  const seen = new Set<string>();
  const rows: Reason[] = [];
  const noticeHits = useSafetyNoticeHits(ingredients);
  for (const w of match.warnings.filter((warning) => warning.severity === "hazard")) {
    if (seen.has(w.ingredient.name)) continue;
    seen.add(w.ingredient.name);
    rows.push(hazardRow(w, noticeHits));
  }
  for (const finding of verdict.actives) {
    finding.ingredients.forEach((name) => seen.add(name));
    const { card } = finding;
    rows.push({
      key: `active-${finding.ingredients[0]}`,
      name: !card || card.found ? names(finding.ingredients) : card.name,
      text: `${finding.line ? ` ${finding.line}` : card ? (card.found ? ` ${card.found}` : ` ${card.line.charAt(0).toLowerCase()}${card.line.slice(1)}`) : stripName(finding.reason, finding.ingredients[0])}${finding.trace ? TRACE_NOTE : ""}`,
      // Near the end of the list it may be there in name only: amber, not green.
      tone: finding.trace ? VERDICT.medium : VERDICT.high,
    });
  }
  if (verdict.level === "none" && verdict.missing.length > 0) {
    rows.push({ key: "missing", name: "We looked for:", text: ` ${listNames(verdict.missing.map(inSentence), "or")}.`, tone: VERDICT_NEUTRAL });
  }
  for (const other of verdict.betterFor) {
    rows.push({ key: `better-${other.label}`, name: "Better for:", text: ` ${other.label.toLowerCase()} (${names(other.ingredients)}).`, tone: VERDICT_NEUTRAL });
  }
  // A pore-clogger, where pores are what the goal is about. Strong evidence is red, moderate orange.
  const poreGoal = profile.concerns.some((c) => c === "acne-prone" || c === "large-pores") || profile.baseSkinType === "oily";
  if (poreGoal) {
    for (const ingredient of ingredients) {
      const confidence = cloggerConfidence(ingredient);
      if (confidence === null || confidence === "contested" || seen.has(ingredient.name)) continue;
      seen.add(ingredient.name);
      rows.push({ key: `clog-${ingredient.name}`, name: displayIngredientName(ingredient.name), text: " is comedogenic and may clog pores.", tone: confidence === "high" ? VERDICT.low : VERDICT.medium });
    }
    // Said only when the pore check itself is clean: no listed name, disputed
    // ones included, and enough of the label recognised to say so.
    if (poreVerdict(ingredients).kind === "clean") rows.push({ key: "no-clog", name: "Nothing in it", text: " is on the pore-clogging lists.", tone: VERDICT.high });
  }
  for (const w of irritationWarnings(match.warnings)) {
    if (seen.has(w.ingredient.name)) continue;
    seen.add(w.ingredient.name);
    rows.push({ key: `watch-${w.ingredient.name}`, name: displayIngredientName(w.ingredient.name), text: stripName(w.reason, w.ingredient.name), tone: VERDICT.medium });
  }
  if (verdict.helpful.length > 0) {
    rows.push({ key: "helpful", name: "Also in it:", text: ` ${names(verdict.helpful)}, which support skin but are not actives for this.`, tone: VERDICT_NEUTRAL });
  }
  return (
    <View style={{ gap: SPACE.gutter }}>
      {/* Where the score ring's verdict pill sits on any other result: the answer, in words. */}
      <View testID="need-verdict" style={{ alignSelf: "center", minHeight: 40, borderRadius: RADIUS.control, paddingHorizontal: 20, justifyContent: "center", backgroundColor: tone.deep }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.card, lineHeight: 22, fontWeight: "600", color: WHITE }}>
          {verdict.headline}
        </Text>
      </View>
      <Text style={{ paddingHorizontal: 4, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{verdict.line}</Text>
      <View style={{ gap: SPACE.block }}>
        {rows.map((row) => (
          <ReasonBox key={row.key} row={row} />
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
          <View key={note.id} style={{ minHeight: 52, flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: SPACE.block, paddingHorizontal: 4, borderTopWidth: 0.5, borderTopColor: DIVIDER }}>
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

/** "Best avoided while pregnant" (v7): shown only when the profile says so. Its sources are on each ingredient's own sheet. */
function PregnancyCard({ match }: { match: MatchResult }) {
  const pregnancy = match.warnings.filter((w) => w.origin === "pregnancy");
  if (pregnancy.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: SPACE.block, borderRadius: CARD_RADIUS, backgroundColor: VERDICT.low.wash, padding: SPACE.gutter }}>
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
  return (
    <View style={{ alignItems: "center", borderRadius: CARD_RADIUS, backgroundColor: HOME_CARD_FILL, paddingVertical: SPACE.section, paddingHorizontal: SPACE.gutter }}>
      <Text accessibilityRole="header" style={{ textAlign: "center", fontSize: TYPE.card, fontWeight: "600", color: INK }}>
        Is it right for your skin?
      </Text>
      <Text style={{ marginTop: 4, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>4 quick questions. No sign-up needed.</Text>
      <PrimaryButton label="Get my match" onPress={openQuiz} style={{ marginTop: SPACE.block, width: BUTTON_WIDTH.inCard }} />
    </View>
  );
}

/**
 * The sheet that rises over a result opened with no skin profile
 * ("Is it right for your skin?"), sending them to the quiz. Drawn in the
 * screen, not in a window of its own (`inline`), so the quiz rises the moment
 * its button is tapped rather than waiting for this sheet to go.
 */
function ProfileTeaser({ visible, onClose, onQuiz }: { visible: boolean; onClose: () => void; onQuiz: () => void }) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      floating
      bare
      inline
      corner={
        <IconCircle onPress={onClose} accessibilityLabel="Close">
          <CloseCross />
        </IconCircle>
      }
    >
      {/* The top half: a ring with no score yet, and the verdict as a question. */}
      <View style={{ alignItems: "center", gap: SPACE.block, backgroundColor: HOME_CARD_FILL, paddingTop: 32, paddingHorizontal: 20, paddingBottom: SPACE.section }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: WHITE, alignItems: "center", justifyContent: "center" }}>
          <Svg width={80} height={80} style={{ position: "absolute" }}>
            <Circle cx={40} cy={40} r={34} stroke={SEGMENT_TRACK} strokeWidth={6} fill="none" />
            <Circle cx={40} cy={40} r={34} stroke={VERDICT.high.solid} strokeWidth={6} strokeLinecap="round" fill="none" strokeDasharray="180 999" transform="rotate(-90 40 40)" />
          </Svg>
          <Text maxFontSizeMultiplier={1} style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.large, lineHeight: 34, color: TEASER_INK }}>
            ?
          </Text>
        </View>
        <View style={{ height: 36, paddingHorizontal: 20, borderRadius: RADIUS.control, backgroundColor: TEASER_INK, justifyContent: "center" }}>
          <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: WHITE }}>Good match?</Text>
        </View>
      </View>
      <View style={{ alignItems: "center", gap: SPACE.text, paddingTop: SPACE.section, paddingHorizontal: 20, paddingBottom: 20 }}>
        <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
          Is it right for your skin?
        </Text>
        <Text style={{ maxWidth: 300, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>Answer 4 quick questions and we&apos;ll match every product to your skin.</Text>
        <PrimaryButton label="Take the 1-minute quiz" onPress={onQuiz} style={{ marginTop: SPACE.block, width: BUTTON_WIDTH.secondary }} />
      </View>
    </BottomSheet>
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
      <View testID="risk-cards" style={{ borderRadius: RADIUS.card, backgroundColor: RISK_FILL, paddingVertical: 4, paddingHorizontal: SPACE.gutter }}>
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
      style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingVertical: SPACE.block, borderTopWidth: divider ? 0.5 : 0, borderTopColor: RISK_LINE }}
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
function listNames(names: string[], joiner: "and" | "or" = "and"): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${joiner} ${names[names.length - 1]}`;
}
