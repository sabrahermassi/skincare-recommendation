import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { BottomSheet } from "@/components/BottomSheet";
import { HeartIcon } from "@/components/icons";
import { PrimaryButton } from "@/components/PrimaryButton";
import { IngredientsCard, type IngredientFilter } from "@/components/result/IngredientsCard";
import { SegmentedSwitch } from "@/components/SegmentedSwitch";
import { SourceLink } from "@/components/SourceLink";
import { Text, useLargeText, useRingScale } from "@/components/Text";
import type { Ingredient, ProductType, SkinProfile } from "@/data/types";
import { pairingNotesFor } from "@/lib/active-pairings";
import { goalNudgesFor, nudgesFor } from "@/lib/context-nudges";
import { displayIngredientName } from "@/lib/ingredient-name";
import { confidenceLabel, isLowCoverage, ruleFor, verdictHeadline, type MatchResult } from "@/lib/matching";
import { openQuiz } from "@/lib/open-quiz";
import { CONCERN_TITLE, isPersonalized } from "@/lib/profile";
import { irritationRisk, poreRisk, type Risk } from "@/lib/risk";
import { irritationWarnings, isVerified } from "@/lib/safety";
import {
  BUTTON,
  CANVAS,
  CARD_SHADOW,
  CHOSEN,
  FLOATING_SHADOW,
  INK,
  MUTED,
  SPACE,
  SURFACE,
  TYPE,
  VERDICT,
  VERDICT_LABEL,
  VERDICT_NEUTRAL,
  toneForVerdict,
} from "@/lib/tokens";

type Tab = "safety" | "match";
type Tone = { solid: string; tint: string; deep: string };

// The one pairing note that is pure scheduling, not a cost.
const EVENING_NOTE = "retinoid-evening";

// The score ring's drawn size (handoff), before it grows with large text.
export const RING_SIZE = 128;

const RISK_TONES: Record<"good" | "watch" | "avoid" | "neutral", Tone> = {
  good: VERDICT.high,
  watch: VERDICT.medium,
  avoid: VERDICT.low,
  neutral: { solid: MUTED, tint: VERDICT_NEUTRAL.tint, deep: MUTED },
};

// The empty state's picture: a woman weighing up a serum.
const MATCH_ART = require("@/assets/illustrations/home-match.webp");

/**
 * The product result, below its header (design_handoff_skincare_cards): a
 * Safety / Skin match switch and the two tabs. Safety is the same for
 * everyone; Skin match needs the skin profile, and asks for one without it.
 * Shared by a catalogue product (`app/product/[id].tsx`) and a label photo
 * (`app/label-result.tsx`). `safetyFooter` is whatever a screen adds at the
 * end of the Safety tab (a note, a stale-formula notice, a retake button).
 */
export function ResultTabs({
  ingredients,
  type,
  match,
  profile,
  onIngredientPress,
  safetyFooter,
}: {
  ingredients: Ingredient[];
  type: ProductType;
  match: MatchResult;
  profile: SkinProfile;
  onIngredientPress: (ingredient: Ingredient) => void;
  safetyFooter?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("safety");
  const [filter, setFilter] = useState<IngredientFilter>("all");
  const personalized = isPersonalized(profile);

  return (
    <View style={{ gap: 20 }}>
      <SegmentedSwitch
        tone="light"
        options={[
          { value: "safety", label: "Safety" },
          { value: "match", label: "Skin match" },
        ]}
        selected={tab}
        onSelect={setTab}
        style={{ paddingHorizontal: 20 }}
      />
      <View style={{ paddingHorizontal: 20, gap: 14 }}>
        {tab === "safety" ? (
          <SafetyTab
            ingredients={ingredients}
            type={type}
            match={match}
            personalized={personalized}
            filter={filter}
            onFilter={setFilter}
            onIngredientPress={onIngredientPress}
          />
        ) : (
          <MatchTab ingredients={ingredients} type={type} match={match} profile={profile} />
        )}
        {tab === "safety" ? safetyFooter : null}
      </View>
    </View>
  );
}

function SafetyTab({
  ingredients,
  type,
  match,
  personalized,
  filter,
  onFilter,
  onIngredientPress,
}: {
  ingredients: Ingredient[];
  type: ProductType;
  match: MatchResult;
  personalized: boolean;
  filter: IngredientFilter;
  onFilter: (filter: IngredientFilter) => void;
  onIngredientPress: (ingredient: Ingredient) => void;
}) {
  const largeText = useLargeText();
  const irritation = irritationRisk({ ingredients }, match);
  const pore = poreRisk({ ingredients });
  const pregnancy = match.warnings.filter((w) => w.origin === "pregnancy");
  const pregnancySources = [...new Map(pregnancy.flatMap((w) => (w.source ? [[w.source.url, w.source] as const] : []))).values()];
  const pairing = pairingNotesFor(ingredients);
  const pairingIds = new Set(pairing.map((note) => note.id));
  const routine = [...pairing, ...nudgesFor(ingredients, type)];

  return (
    <>
      {/* The two risks, each opening the list filtered to what's behind it. */}
      <View testID="risk-cards" style={{ flexDirection: largeText ? "column" : "row", gap: 12 }}>
        <RiskCard title="Irritation risk" risk={irritation} onPress={irritation.hasEntries ? () => onFilter("watch") : undefined} />
        <RiskCard title="Pore-clogging risk" risk={pore} onPress={pore.hasEntries ? () => onFilter("pore") : undefined} />
      </View>

      {pregnancy.length > 0 ? (
        <View style={{ flexDirection: "row", gap: 14, borderRadius: 24, backgroundColor: SURFACE, paddingTop: 18, paddingHorizontal: 20, paddingBottom: 20, ...CARD_SHADOW }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: VERDICT.low.tint }}>
            <Ionicons name="warning-outline" size={20} color={VERDICT.low.solid} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <AccentBar colour={VERDICT.low.solid} />
            <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: "600", color: INK }}>
              While pregnant or breastfeeding
            </Text>
            <Text style={{ fontSize: 15, lineHeight: 22, color: MUTED }}>
              <Text style={{ fontWeight: "600", color: INK }}>{listNames(pregnancy.map((w) => displayIngredientName(w.ingredient.name)))}</Text>
              {pregnancy.length === 1 ? " is" : " are"} best avoided. If you&apos;re unsure, check with your doctor or midwife.
            </Text>
            {pregnancySources.map((source) => (
              <SourceLink key={source.url} source={source} />
            ))}
          </View>
        </View>
      ) : null}

      {routine.map((note) => (
        <RoutineNote key={note.id} text={note.text} caution={pairingIds.has(note.id) && note.id !== EVENING_NOTE} />
      ))}

      {ingredients.length > 0 ? (
        <IngredientsCard
          ingredients={ingredients}
          match={match}
          personalized={personalized}
          filter={filter}
          onFilter={onFilter}
          onIngredientPress={onIngredientPress}
        />
      ) : null}
    </>
  );
}

function RiskCard({ title, risk, onPress }: { title: string; risk: Risk; onPress?: () => void }) {
  const tone = RISK_TONES[risk.tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${title}: ${risk.level}. ${risk.note}`}
      style={{ flex: 1, gap: 4, borderRadius: 24, backgroundColor: SURFACE, paddingTop: 18, paddingRight: 16, paddingBottom: 18, paddingLeft: 18, ...CARD_SHADOW }}
      className={onPress ? "active:opacity-70" : undefined}
    >
      <AccentBar colour={tone.solid} />
      <Text style={{ marginTop: 2, fontSize: 13, fontWeight: "500", color: MUTED }}>{title}</Text>
      <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 22, color: tone.solid }}>{risk.level}</Text>
      <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, color: MUTED }}>
        {risk.note}
      </Text>
    </Pressable>
  );
}

/**
 * A note on using this with the rest of a routine: layering, sunlight. A
 * layering note states a real irritation cost, so its icon takes the caution
 * colour; the evening note and the sunlight ones are scheduling (#264).
 */
function RoutineNote({ text, caution = false }: { text: string; caution?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, borderRadius: 24, backgroundColor: VERDICT_NEUTRAL.tint, paddingVertical: 16, paddingHorizontal: 20 }}>
      <Ionicons testID={caution ? "routine-caution" : undefined} name="layers-outline" size={22} color={caution ? VERDICT.medium.solid : MUTED} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: "600", color: MUTED }}>In a routine</Text>
        <Text style={{ fontSize: 15, lineHeight: 22, color: INK }}>{text}</Text>
      </View>
    </View>
  );
}

function AccentBar({ colour }: { colour: string }) {
  return <View style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: colour, marginBottom: 2 }} />;
}

function MatchTab({
  ingredients,
  type,
  match,
  profile,
}: {
  ingredients: Ingredient[];
  type: ProductType;
  match: MatchResult;
  profile: SkinProfile;
}) {
  const [why, setWhy] = useState(false);
  const largeText = useLargeText();
  const lowCoverage = isLowCoverage(ingredients);

  if (!isPersonalized(profile) && !lowCoverage) return <NoProfile />;

  const tone = toneOf(match);

  return (
    <>
      {/* The score, and an "i" that opens why. */}
      <View testID="score-card" style={{ flexDirection: largeText ? "column" : "row", alignItems: largeText ? "flex-start" : "center", gap: 20, borderRadius: 24, backgroundColor: SURFACE, paddingVertical: 22, paddingHorizontal: 20, ...CARD_SHADOW }}>
        <Ring score={match.score} tone={tone} />
        <View style={{ flex: 1, gap: 8, paddingRight: 24 }}>
          {lowCoverage ? (
            <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 20, color: INK }}>Couldn&apos;t score this one</Text>
          ) : (
            <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: tone.tint }}>
              <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: tone.deep }}>{VERDICT_LABEL[match.verdict]}</Text>
            </View>
          )}
          <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: INK }}>
            {lowCoverage ? "We read this list, but don't recognise enough of these ingredient names yet." : verdictHeadline(match)}
          </Text>
        </View>
        {lowCoverage ? null : (
          <Pressable
            onPress={() => setWhy(true)}
            accessibilityRole="button"
            accessibilityLabel="Why this score"
            hitSlop={8}
            style={{ position: "absolute", top: 12, right: 12, width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: SURFACE, ...FLOATING_SHADOW }}
            className="active:opacity-70"
          >
            {/* Drawn to fit its 32pt disc: large text would clip it. */}
            <Text maxFontSizeMultiplier={1} style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontStyle: "italic", fontSize: 16, color: INK }}>
              i
            </Text>
          </Pressable>
        )}
      </View>

      {lowCoverage ? null : (
        <>
          <ConcernsCard ingredients={ingredients} profile={profile} />
          <FlaggedCard ingredients={ingredients} match={match} />
          {/* The one note that depends on the person: working on dark spots. */}
          {goalNudgesFor(ingredients, profile.concerns, type).map((note) => (
            <RoutineNote key={note.id} text={note.text} />
          ))}
          <WhySheet visible={why} onClose={() => setWhy(false)} ingredients={ingredients} match={match} tone={tone} />
        </>
      )}
    </>
  );
}

/** The score in a ring: its verdict colour, filled to the score, over a soft blob. */
function Ring({ score, tone }: { score: number | null; tone: Tone }) {
  // Drawn for the ordinary text sizes; past them it grows with the words (#334).
  const scale = useRingScale();
  const size = RING_SIZE * scale;
  const radius = 54 * scale;
  const stroke = 10 * scale;
  const circumference = 2 * Math.PI * radius;
  const filled = score === null ? 0 : (score / 100) * circumference;
  return (
    <View testID="score-ring" style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size - 8 * scale, height: size - 12 * scale, borderTopLeftRadius: 70 * scale, borderTopRightRadius: 52 * scale, borderBottomRightRadius: 66 * scale, borderBottomLeftRadius: 58 * scale, backgroundColor: tone.tint, opacity: 0.5 }} />
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={tone.tint} strokeWidth={stroke} fill="none" />
        {score !== null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={tone.solid}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${filled} ${circumference - filled}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text maxFontSizeMultiplier={1} style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 42 * scale, color: INK }}>
          {score ?? "–"}
        </Text>
        {score !== null ? (
          <Text maxFontSizeMultiplier={1} style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 15 * scale, color: MUTED }}>
            /100
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Each of the person's concerns, and the ingredient here that works on it. */
function ConcernsCard({ ingredients, profile }: { ingredients: Ingredient[]; profile: SkinProfile }) {
  if (profile.concerns.length === 0) return null;
  const rows = profile.concerns.flatMap((concern) => {
    const helper = ingredients.find((i) => ruleFor(i)?.helps?.concerns?.includes(concern));
    const rule = helper ? ruleFor(helper) : undefined;
    return helper && rule ? [{ concern, ingredient: displayIngredientName(helper.name), why: rule.reason.split(" - ")[0].trim() }] : [];
  });
  return (
    <ListCard title="For your concerns">
      {rows.length === 0 ? (
        <Text style={{ fontSize: 15, color: MUTED }}>Nothing here works on your concerns in particular.</Text>
      ) : (
        rows.map((row, i) => (
          <View key={row.concern} style={{ flexDirection: "row", gap: 12, paddingTop: i === 0 ? 0 : 12 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: VERDICT.high.solid }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: TYPE.body, fontWeight: "500", color: INK }}>{CONCERN_TITLE[row.concern]}</Text>
              <Text style={{ fontSize: 14, lineHeight: 20, color: MUTED }}>
                <Text style={{ fontWeight: "500", color: INK }}>{row.ingredient}</Text> {row.why}
              </Text>
            </View>
          </View>
        ))
      )}
    </ListCard>
  );
}

/** What this person's skin is warned about here: the same set as "flagged for your skin". */
function FlaggedCard({ ingredients, match }: { ingredients: Ingredient[]; match: MatchResult }) {
  const warned = irritationWarnings(match.warnings);
  const seen = new Set(warned.map((w) => w.ingredient.name));
  const rows = [
    ...warned.map((w) => ({ name: w.ingredient.name, why: w.reason, avoid: w.severity === "hazard" })),
    ...match.irritants
      .filter((name) => !seen.has(name))
      .map((name) => {
        const ingredient = ingredients.find((i) => i.name === name);
        const rule = ingredient ? ruleFor(ingredient) : undefined;
        seen.add(name);
        return { name, why: rule ? rule.reason.split(" - ")[0].trim() : "Can irritate your skin", avoid: false };
      }),
    ...match.cloggersCharged.filter((name) => !seen.has(name)).map((name) => ({ name, why: "Can clog pores", avoid: false })),
  ];
  return (
    <ListCard title="Flagged for your skin">
      {rows.length === 0 ? (
        <Text style={{ fontSize: 15, color: MUTED }}>Nothing flagged for your skin.</Text>
      ) : (
        rows.map((row, i) => {
          const tone = row.avoid ? VERDICT.low : VERDICT.medium;
          return (
            <View key={row.name} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: i === 0 ? 0 : 12 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tone.solid }} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: TYPE.body, fontWeight: "500", color: INK }}>{displayIngredientName(row.name)}</Text>
                <Text style={{ fontSize: 13, lineHeight: 17, color: MUTED }}>{row.why}</Text>
              </View>
              <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: tone.tint }}>
                <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: tone.deep }}>{row.avoid ? "Avoid" : "Watch"}</Text>
              </View>
            </View>
          );
        })
      )}
    </ListCard>
  );
}

function ListCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 14, borderRadius: 24, backgroundColor: SURFACE, paddingVertical: 18, paddingHorizontal: 20, ...CARD_SHADOW }}>
      <Text accessibilityRole="header" style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 21, color: INK }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** "It's a good match", and why: what helps, what counts against, and how much we could read. */
function WhySheet({
  visible,
  onClose,
  ingredients,
  match,
  tone,
}: {
  visible: boolean;
  onClose: () => void;
  ingredients: Ingredient[];
  match: MatchResult;
  tone: Tone;
}) {
  const helps = match.reasons.filter((r) => r.effect > 0).slice(0, 3);
  const against = match.reasons.filter((r) => r.effect < 0).slice(0, 3);
  const identified = ingredients.filter(isVerified).length;
  const confidence = confidenceLabel(match.confidence);
  const summary =
    helps.length > 0
      ? `${listNames(helps.slice(0, 2).map((r) => displayIngredientName(r.ingredient)))} ${helps.length === 1 ? "suits" : "suit"} your skin${
          against.length > 0 ? `; ${displayIngredientName(against[0].ingredient)} counts against it` : ""
        }.`
      : verdictHeadline(match);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      floating
      corner={
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: SURFACE, ...FLOATING_SHADOW }}
          className="active:opacity-70"
        >
          <Ionicons name="close" size={20} color={INK} />
        </Pressable>
      }
    >
      <View style={{ alignItems: "center", gap: 14, paddingTop: 12 }}>
        <View style={{ width: 96, height: 88, alignItems: "center", justifyContent: "center" }}>
          <View style={{ position: "absolute", width: 96, height: 84, borderTopLeftRadius: 50, borderTopRightRadius: 40, borderBottomRightRadius: 46, borderBottomLeftRadius: 38, backgroundColor: tone.tint }} />
          <View style={{ width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center", backgroundColor: tone.solid }}>
            <HeartIcon size={32} filled color={BUTTON.primary.label} />
          </View>
        </View>
        <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 28, lineHeight: 34, color: INK }}>
          {WHY_TITLE[match.verdict]}
        </Text>
        <Text style={{ maxWidth: 300, textAlign: "center", fontSize: TYPE.body, lineHeight: 24, color: INK }}>{summary}</Text>
        {helps.length + against.length > 0 ? (
          <View style={{ alignSelf: "stretch", gap: 12, borderRadius: 24, backgroundColor: CANVAS, padding: 18 }}>
            {[...helps, ...against].map((reason) => {
              const up = reason.effect > 0;
              const lineTone = up ? VERDICT.high : VERDICT.medium;
              return (
                <View key={`${up ? "+" : "-"}${reason.ingredient}`} style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: lineTone.tint }}>
                    <Ionicons name={up ? "add" : "remove"} size={16} color={lineTone.solid} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: 15, lineHeight: 21, color: INK }}>
                      <Text style={{ fontWeight: "600" }}>{displayIngredientName(reason.ingredient)}: </Text>
                      {reason.reason}
                    </Text>
                    {/* Every claim traces to what it was checked against (#326). */}
                    {reason.source ? <SourceLink source={reason.source} /> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
        <Text style={{ textAlign: "center", fontSize: 13, color: MUTED }}>
          From {identified} of {ingredients.length} ingredients we could identify{confidence === "high" ? "" : ` — ${confidence} confidence`}.
        </Text>
        <Pressable
          onPress={() => {
            onClose();
            router.push("/scoring");
          }}
          accessibilityRole="link"
          accessibilityLabel="How scoring works"
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 }}
          className="active:opacity-70"
        >
          <Ionicons name="information-circle-outline" size={18} color={CHOSEN.accent} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: CHOSEN.accent }}>How scoring works</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const WHY_TITLE: Record<MatchResult["verdict"], string> = {
  excellent: "It's an excellent match",
  good: "It's a good match",
  fair: "It's a fair match",
  poor: "It's a poor match",
  unknown: "Your skin match",
};

/** No skin profile yet: what the tab would show, and the way to it. */
function NoProfile() {
  return (
    <View style={{ alignItems: "center", gap: 12, borderRadius: 24, backgroundColor: SURFACE, paddingTop: 28, paddingHorizontal: 24, paddingBottom: 24, ...CARD_SHADOW }}>
      <View style={{ width: 200, height: 170, alignItems: "center", justifyContent: "center" }}>
        <View style={{ position: "absolute", left: 14, top: 10, width: 170, height: 150, borderTopLeftRadius: 90, borderTopRightRadius: 70, borderBottomRightRadius: 86, borderBottomLeftRadius: 74, backgroundColor: CHOSEN.fill }} />
        <View style={{ position: "absolute", right: 6, bottom: 8, width: 110, height: 96, borderTopLeftRadius: 60, borderTopRightRadius: 46, borderBottomRightRadius: 56, borderBottomLeftRadius: 44, backgroundColor: VERDICT.high.tint, opacity: 0.7 }} />
        <Image source={MATCH_ART} contentFit="contain" accessibilityLabel="" style={{ width: 150, height: 150 }} />
      </View>
      <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 26, lineHeight: 31, color: INK }}>
        See your skin match
      </Text>
      <Text style={{ maxWidth: 280, textAlign: "center", fontSize: TYPE.body, lineHeight: 22, color: MUTED }}>
        Answer 4 quick questions to see how this fits your skin
      </Text>
      <PrimaryButton label="Find my match" onPress={openQuiz} style={{ alignSelf: "stretch", marginTop: SPACE.text }} />
      <Text style={{ textAlign: "center", fontSize: 13, color: MUTED }}>Takes about a minute. Safety results stay the same.</Text>
    </View>
  );
}

function toneOf(match: MatchResult): Tone {
  const tone = toneForVerdict(match.verdict);
  return tone ? VERDICT[tone] : RISK_TONES.neutral;
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
