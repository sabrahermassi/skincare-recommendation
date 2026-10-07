import { Ionicons } from "@expo/vector-icons";
import { ScrollView, View } from "react-native";

import { CloseCross, IconCircle } from "@/components/IconCircle";
import { SheetScreen } from "@/components/SheetScreen";
import { Text } from "@/components/Text";
import { goBackOrHome } from "@/lib/go-back";
import {
  LABEL_ORDER,
  SCORING_DISCLAIMER,
  SCORING_INTRO,
  SCORING_SOURCES,
  scoreBandLines,
  scoreFactors,
  scoreNotes,
  type ScoreFactor,
  type ScoreNote,
} from "@/lib/scoring-explainer";
import { CARD_RADIUS, CHOSEN, DISPLAY_FONT, HAIRLINE, INK, MUTED, MUTED_FAINT, scoreColours, SPACE, STONE, TYPE, VERDICT, VERDICT_NEUTRAL, WHITE, RADIUS, LEADING, TRACKING } from "@/lib/tokens";

/**
 * How scoring works (#325) — where the number comes from, in plain English:
 * people trust a score they can follow. v9 makes it a floating sheet over the
 * result, opened from the verdict pill (and from Support): a line saying what
 * the score is, the four bands as filled pills on a stone card, then how the
 * score is made. Every number on it comes from the scoring code
 * (`lib/scoring-explainer.ts`), so the sheet can't say one thing while the
 * maths does another.
 */
export default function HowScoringWorks() {
  return (
    <SheetScreen
      header={
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.block, paddingTop: SPACE.section, paddingHorizontal: SPACE.gutter }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: LEADING.heading, letterSpacing: TRACKING.heading, color: INK }}>
            How scoring works
          </Text>
          <IconCircle onPress={goBackOrHome} accessibilityLabel="Close">
            <CloseCross />
          </IconCircle>
        </View>
      }
    >
      <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={{ paddingHorizontal: SPACE.gutter, paddingTop: SPACE.gutter, paddingBottom: 32 }} alwaysBounceVertical={false}>
        <Text style={{ paddingHorizontal: 4, paddingBottom: SPACE.section, fontSize: TYPE.card, lineHeight: 25, color: INK }}>{SCORING_INTRO}</Text>

        <View style={{ backgroundColor: STONE, borderRadius: RADIUS.panel, paddingTop: SPACE.inset, paddingHorizontal: SPACE.inset, paddingBottom: SPACE.text }}>
          <Text accessibilityRole="header" style={{ fontSize: TYPE.card, fontWeight: "600", color: INK }}>
            What the numbers mean
          </Text>
          <View style={{ marginTop: SPACE.block }}>
            {scoreBandLines().map((band) => (
              <View key={band.verdict} accessible accessibilityLabel={`${band.range}: ${band.label}. ${band.meaning}`} style={{ alignItems: "flex-start", gap: SPACE.text, paddingBottom: SPACE.gutter }}>
                {/* The band's colour as a filled pill: "Excellent · 90–100". `deep`, not `solid`: white on Fair's solid orange was 2.6:1. */}
                <View style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, justifyContent: "center", backgroundColor: scoreColours(band.verdict).deep }}>
                  <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: WHITE }}>
                    {band.label.replace(/ match$/, "")} · {band.from}–{band.to}
                  </Text>
                </View>
                <Text style={{ fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{band.meaning}</Text>
              </View>
            ))}
          </View>
        </View>

        <Text accessibilityRole="header" style={{ paddingTop: 32, paddingHorizontal: 4, fontSize: TYPE.title, fontWeight: "600", color: INK }}>
          How we score
        </Text>
        {/* All in ink (owner): no grey signs, no sage "your score". */}
        <Text
          accessibilityLabel="Your skin plus its ingredients equals your score"
          style={{ paddingTop: SPACE.text, paddingHorizontal: 4, fontSize: TYPE.card, fontWeight: "600", lineHeight: LEADING.card, color: INK }}
        >
          Your skin + its ingredients = your score
        </Text>
        <View style={{ marginTop: SPACE.block, backgroundColor: STONE, borderRadius: CARD_RADIUS, overflow: "hidden" }}>
          {scoreFactors().map((factor, index) => (
            <FactorRow key={factor.title} factor={factor} divided={index > 0} />
          ))}
        </View>
        <Text style={{ paddingTop: SPACE.block, paddingHorizontal: 4, fontSize: TYPE.card, lineHeight: 25, color: INK }}>{LABEL_ORDER}</Text>

        <Text accessibilityRole="header" style={{ paddingTop: 32, paddingHorizontal: 4, paddingBottom: SPACE.block, fontSize: TYPE.title, fontWeight: "600", color: INK }}>
          Good to know
        </Text>
        <View style={{ backgroundColor: STONE, borderRadius: CARD_RADIUS, overflow: "hidden" }}>
          {scoreNotes().map((note, index) => (
            <NoteRow key={note.kind} note={note} divided={index > 0} />
          ))}
        </View>

        <Text style={{ paddingTop: SPACE.section, paddingHorizontal: 4, fontSize: TYPE.caption, lineHeight: LEADING.caption, color: MUTED_FAINT }}>
          {SCORING_SOURCES} {SCORING_DISCLAIMER}
        </Text>
      </ScrollView>
    </SheetScreen>
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
        <Text style={{ fontSize: TYPE.card, fontWeight: "600", lineHeight: 20, color: WHITE }}>{factor.sign}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", lineHeight: 26, color: INK }}>{factor.title}</Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{factor.body}</Text>
      </View>
    </View>
  );
}

const NOTE_LOOK: Record<ScoreNote["kind"], { icon: keyof typeof Ionicons.glyphMap; fill: string; ink: string }> = {
  pregnancy: { icon: "warning-outline", fill: VERDICT.low.tint, ink: VERDICT.low.word },
  "no-score": { icon: "list-outline", fill: VERDICT_NEUTRAL.tint, ink: VERDICT_NEUTRAL.word },
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
        <Text style={{ fontSize: TYPE.caption, lineHeight: LEADING.caption, color: MUTED }}>{note.body}</Text>
      </View>
    </View>
  );
}
