import { ScrollView, View } from "react-native";

import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { scoreBandLines, scoringSections } from "@/lib/scoring-explainer";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, TYPE } from "@/lib/tokens";

/**
 * How scoring works (#325) — where the number comes from, in plain English:
 * people trust a score they can follow. Reached from "Why this score" on a
 * result and from Support. Every number on it comes from the scoring code
 * (`lib/scoring-explainer.ts`), so the page can't say one thing while the
 * maths does another.
 */
export default function HowScoringWorks() {
  const [personal, ...rest] = scoringSections();
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="How scoring works" />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 22, paddingBottom: 60 }}>
        <Section title={personal.title} body={personal.body} />

        <View style={{ gap: 8 }}>
          <Text accessibilityRole="header" style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>
            What the numbers mean
          </Text>
          <View style={{ borderRadius: 14, borderWidth: 1, borderColor: BORDER_INACTIVE }}>
            {scoreBandLines().map((band, index) => (
              <View
                key={band.label}
                accessible
                accessibilityLabel={`${band.range}: ${band.label}`}
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  gap: 8,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderTopWidth: index === 0 ? 0 : 1,
                  borderTopColor: BORDER_INACTIVE,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: INK }}>{band.range}</Text>
                <Text style={{ fontSize: 14, color: MUTED }}>{band.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {rest.map((section) => (
          <Section key={section.title} title={section.title} body={section.body} />
        ))}
      </ScrollView>
    </View>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Text accessibilityRole="header" style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>
        {title}
      </Text>
      <Text style={{ fontSize: 13.5, lineHeight: 20, color: MUTED }}>{body}</Text>
    </View>
  );
}
