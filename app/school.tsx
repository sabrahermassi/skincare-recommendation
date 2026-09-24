import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { SCHOOL, type SchoolQuestion } from "@/data/school";
import { CANVAS, INK, MUTED, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * Skincare School (#235) — reference content, reached from a Profile menu
 * row the same way Support and Privacy are. One screen, categories with
 * expandable questions, rather than a list plus a `school/[id]` detail
 * route: at under twenty items an accordion is the whole job, and a
 * dynamic segment would add a deep-link surface (#29) for nothing.
 */
export default function SkincareSchool() {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader title="Skincare School" />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 28, paddingBottom: 60 }}>
        {SCHOOL.map((category) => (
          <View key={category.title} style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={{ fontSize: TYPE.body, fontWeight: "600", color: INK, marginBottom: 4 }}>
              {category.title}
            </Text>
            {category.questions.map((item) => (
              <Question key={item.id} item={item} expanded={open.has(item.id)} onToggle={() => toggle(item.id)} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * One question: the header is the button, with its expanded state exposed to
 * a screen reader; the answer follows it directly, so reading order carries
 * the association. Nothing has a fixed height — long answers at a large text
 * size just wrap.
 */
function Question({ item, expanded, onToggle }: { item: SchoolQuestion; expanded: boolean; onToggle: () => void }) {
  return (
    <View>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={item.question}
        accessibilityState={{ expanded }}
        style={{ minHeight: TOUCH_TARGET, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}
        className="active:opacity-70"
      >
        <Text style={{ flex: 1, fontSize: 14.5, lineHeight: 20, color: INK }}>{item.question}</Text>
        <ArrowIcon direction={expanded ? "up" : "down"} size={16} color={INK} />
      </Pressable>
      {expanded ? (
        <Text style={{ fontSize: 13.5, lineHeight: 20, color: MUTED, paddingBottom: 10 }}>{item.answer}</Text>
      ) : null}
    </View>
  );
}
