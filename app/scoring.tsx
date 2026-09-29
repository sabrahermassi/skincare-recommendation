import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";

import { ScreenHeader } from "@/components/ScreenHeader";
import { SectionLabel } from "@/components/SectionLabel";
import { Text } from "@/components/Text";
import {
  LABEL_ORDER,
  SCORING_DISCLAIMER,
  scoreBandLines,
  scoreFactors,
  scoreNotes,
  type ScoreFactor,
  type ScoreNote,
} from "@/lib/scoring-explainer";
import {
  CANVAS,
  CARD_RADIUS,
  CHOSEN,
  DISPLAY_FONT,
  HAIRLINE,
  INK,
  LINK,
  MUTED,
  ROW_CHEVRON,
  SPACE,
  SURFACE,
  TYPE,
  VERDICT,
  VERDICT_NEUTRAL,
  scoreColours,
} from "@/lib/tokens";

/**
 * How scoring works (#325) — where the number comes from, in plain English:
 * people trust a score they can follow. Reached from the verdict pill on a
 * result (which passes its score, so the bar can show where it sits) and from
 * Support. Every number on it comes from the scoring code
 * (`lib/scoring-explainer.ts`), so the page can't say one thing while the
 * maths does another.
 */
export default function HowScoringWorks() {
  const { score: raw } = useLocalSearchParams<{ score?: string }>();
  // Only a whole number from 0 to 100 marks the bar; anything else in the
  // address is ignored rather than drawn off the end.
  const score = raw && /^\d{1,3}$/.test(raw) && Number(raw) <= 100 ? Number(raw) : null;

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader />
      <ScrollView contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.text, paddingBottom: 48 }}>
        <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
          How scoring works
        </Text>

        <SectionLabel title="What the numbers mean" first />
        <View style={{ backgroundColor: SURFACE, borderRadius: CARD_RADIUS, paddingHorizontal: SPACE.gutter, paddingTop: SPACE.gutter, paddingBottom: SPACE.text }}>
          <BandBar score={score} />
          <View style={{ marginTop: SPACE.block }}>
            {scoreBandLines().map((band, index) => {
              const colours = scoreColours(band.verdict);
              return (
                <View
                  key={band.verdict}
                  accessible
                  accessibilityLabel={`${band.range}: ${band.label}. ${band.meaning}`}
                  style={{ minHeight: 56, paddingVertical: SPACE.text, flexDirection: "row", alignItems: "center", gap: SPACE.block, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: HAIRLINE }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{band.range}</Text>
                    <Text style={{ fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>{band.meaning}</Text>
                  </View>
                  <View style={{ height: 24, paddingHorizontal: SPACE.block, borderRadius: 12, justifyContent: "center", backgroundColor: colours.tint }}>
                    <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: colours.deep }}>{band.label}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        <SectionLabel title="What goes into it" />
        <Text
          accessibilityLabel="Your skin plus its ingredients equals your score"
          style={{ paddingHorizontal: 4, fontSize: TYPE.card, fontWeight: "600", lineHeight: 22, color: INK }}
        >
          Your skin <Text style={{ fontWeight: "400", color: ROW_CHEVRON }}>+</Text> its ingredients{" "}
          <Text style={{ fontWeight: "400", color: ROW_CHEVRON }}>=</Text> <Text style={{ color: LINK }}>your score</Text>
        </Text>
        <View style={{ marginTop: SPACE.block, backgroundColor: SURFACE, borderRadius: CARD_RADIUS, overflow: "hidden" }}>
          {scoreFactors().map((factor, index) => (
            <FactorRow key={factor.title} factor={factor} divided={index > 0} />
          ))}
        </View>

        <SectionLabel title="Order on the label" />
        <Text style={{ paddingHorizontal: 4, fontSize: TYPE.body, lineHeight: 22, color: INK }}>{LABEL_ORDER}</Text>

        <SectionLabel title="Good to know" />
        <View style={{ backgroundColor: SURFACE, borderRadius: CARD_RADIUS, overflow: "hidden" }}>
          {scoreNotes().map((note, index) => (
            <NoteRow key={note.kind} note={note} divided={index > 0} />
          ))}
        </View>

        <Text style={{ paddingTop: SPACE.gutter, paddingHorizontal: 4, fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>{SCORING_DISCLAIMER}</Text>
      </ScrollView>
    </View>
  );
}

/** Half the score pill's width, so it never runs past the ends of the bar. */
const MARKER_HALF = 22;

/**
 * The four bands side by side, lowest first, each as wide as the scores it
 * covers — and, when the page was opened from a result, a marker at that
 * product's score.
 */
function BandBar({ score }: { score: number | null }) {
  const [width, setWidth] = useState(0);
  const bands = [...scoreBandLines()].reverse();
  const at = score === null ? 0 : (score / 100) * width;
  return (
    <View testID="band-bar" style={{ paddingTop: score === null ? 0 : 32 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {score !== null && width > 0 ? (
        <View accessible accessibilityLabel={`This product scored ${score}`} style={{ position: "absolute", top: 0, left: 0, right: 0, height: 30 }}>
          <View
            style={{
              position: "absolute",
              top: 0,
              left: Math.min(Math.max(at, MARKER_HALF), width - MARKER_HALF) - MARKER_HALF,
              width: MARKER_HALF * 2,
              height: 22,
              borderRadius: 11,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: INK,
            }}
          >
            <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: SURFACE }}>{score}</Text>
          </View>
          <View style={{ position: "absolute", top: 22, left: at - 1, width: 2, height: 6, backgroundColor: INK }} />
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 3, height: 12, borderRadius: 6, overflow: "hidden" }}>
        {bands.map((band) => (
          <View key={band.verdict} style={{ flex: band.to - band.from + 1, backgroundColor: scoreColours(band.verdict).solid }} />
        ))}
      </View>
    </View>
  );
}

const FACTOR_DOT: Record<ScoreFactor["sign"], string> = { "+": VERDICT.high.solid, "−": VERDICT.medium.solid, "?": VERDICT_NEUTRAL.solid };

function FactorRow({ factor, divided }: { factor: ScoreFactor; divided: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel={`${factor.title}: ${factor.body}`}
      style={{ flexDirection: "row", gap: SPACE.block, padding: SPACE.gutter, borderTopWidth: divided ? 0.5 : 0, borderTopColor: HAIRLINE }}
    >
      <View style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: FACTOR_DOT[factor.sign] }}>
        <Text style={{ fontSize: TYPE.card, fontWeight: "600", lineHeight: 20, color: SURFACE }}>{factor.sign}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", lineHeight: 26, color: INK }}>{factor.title}</Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>{factor.body}</Text>
      </View>
    </View>
  );
}

const NOTE_LOOK: Record<ScoreNote["kind"], { icon: keyof typeof Ionicons.glyphMap; fill: string; ink: string }> = {
  pregnancy: { icon: "warning-outline", fill: VERDICT.low.tint, ink: VERDICT.low.deep },
  "no-score": { icon: "list-outline", fill: VERDICT_NEUTRAL.tint, ink: VERDICT_NEUTRAL.deep },
  personal: { icon: "person-outline", fill: CHOSEN.fill, ink: CHOSEN.accent },
};

function NoteRow({ note, divided }: { note: ScoreNote; divided: boolean }) {
  const look = NOTE_LOOK[note.kind];
  return (
    <View accessible accessibilityLabel={`${note.title}. ${note.body}`} style={{ flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingLeft: SPACE.gutter }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: look.fill }}>
        <Ionicons name={look.icon} size={17} color={look.ink} />
      </View>
      <View style={{ flex: 1, gap: 1, paddingVertical: SPACE.block, paddingRight: SPACE.gutter, borderTopWidth: divided ? 0.5 : 0, borderTopColor: HAIRLINE }}>
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{note.title}</Text>
        <Text style={{ fontSize: TYPE.caption, lineHeight: 18, color: MUTED }}>{note.body}</Text>
      </View>
    </View>
  );
}
