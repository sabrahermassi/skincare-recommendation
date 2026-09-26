import { useScrollToTop } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ArrowIcon } from "@/components/icons/ArrowIcon";
import { Text } from "@/components/Text";
import { SCHOOL, type SchoolQuestion } from "@/data/school";
import { tabBarClearance } from "@/lib/tab-bar";
import { CANVAS, INK, MUTED, TOUCH_TARGET, TYPE } from "@/lib/tokens";

/**
 * Skincare School (#235) — reference content, a tab of its own in the bar
 * (where Browse was; Browse is now reached from Home's "Find skincare" card).
 * Its address is still `/school`. One screen, categories with
 * expandable questions, rather than a list plus a `school/[id]` detail
 * route: at under twenty items an accordion is the whole job, and a
 * dynamic segment would add a deep-link surface (#29) for nothing.
 */
export default function SkincareSchool() {
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const insets = useSafeAreaInsets();
  // Tapping the tab again scrolls back to the top, as on the other tabs.
  const listRef = useRef<ScrollView>(null);
  useScrollToTop(listRef);

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
      {/* A tab: a centred title, as on Saved, and no back chevron. */}
      <View style={{ paddingHorizontal: 20, paddingTop: insets.top + 10, paddingBottom: 10 }}>
        <Text
          accessibilityRole="header"
          style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: INK }}
        >
          Skincare School
        </Text>
      </View>
      <ScrollView
        ref={listRef}
        contentContainerStyle={{ padding: 24, gap: 28, paddingBottom: tabBarClearance(insets.bottom) }}
      >
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
