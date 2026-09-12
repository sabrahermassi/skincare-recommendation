import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";
import type { Ingredient } from "@/data/types";
import { isVerified } from "@/lib/safety";
import { ruleFor, RUNG_META, rungFor, type MatchResult, type Rung } from "@/lib/matching";
import { isPoreClogging, isWarnedPoreClogging, poreCloggingHits } from "@/lib/pore-clogging";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, MUTED_SOFT, RADIUS_SELECTOR, SELECTED } from "@/lib/tokens";

// Manassa system (design/DESIGN_SYSTEM.md). RUNG_META's good/watch/avoid
// colors are semantic (the per-ingredient verdict, the whole point of this
// screen) and stay untouched — only the tab pills, dividers and body text
// move to this system.

/**
 * The tabbed ingredient list for a scanned product's ingredient screen
 * (`app/ingredients/[id].tsx`): All / Actives / Watch-outs / Pore clogging,
 * each row judged against `match`.
 *
 * `metaLine`/`subMetaLine` are the two lines above the divider — an
 * ingredient count and when the label was last read.
 */

export const TABS = ["All", "Actives", "Watch-outs", "Pore clogging"] as const;
export type Tab = (typeof TABS)[number];

export function IngredientTabsList({
  ingredients,
  match,
  metaLine,
  subMetaLine,
  initialTab = "All",
  onIngredientPress,
}: {
  ingredients: Ingredient[];
  match: MatchResult;
  metaLine: string;
  subMetaLine?: string;
  initialTab?: Tab;
  onIngredientPress: (ingredient: Ingredient) => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  const visible = ingredients.filter((i) => {
    if (tab === "Actives") return ruleFor(i) !== undefined;
    if (tab === "Watch-outs") return rungFor(i, match) !== "good";
    if (tab === "Pore clogging") return isPoreClogging(i);
    return true;
  });

  const cloggerCount = poreCloggingHits(ingredients).length;

  return (
    <ScrollView contentContainerClassName="pb-4">
      {/* Scrolls rather than dividing the width four ways: at flex-1 the
          fourth pill squeezed the labels below legibility. Pills keep their
          44pt height and the app's own option-label size. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 24, paddingTop: 20 }}
      >
        {TABS.map((label) => {
          const active = tab === label;
          // The count earns the tab its place: "Pore clogging 3" answers the
          // question before you have tapped anything.
          const suffix = label === "Pore clogging" && cloggerCount > 0 ? ` ${cloggerCount}` : "";
          return (
            <Pressable
              key={label}
              onPress={() => setTab(label)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={{
                height: 44,
                paddingHorizontal: 18,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: RADIUS_SELECTOR,
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? INK : BORDER_INACTIVE,
                backgroundColor: active ? SELECTED : CANVAS,
              }}
            >
              <Text style={{ fontSize: 14.5, fontWeight: "600", color: active ? INK : MUTED }}>
                {label}
                {suffix}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Formulas change. Saying when we last read the label is the
          difference between data and a claim — it was on this screen before
          the redesign and is worth more than the design's info icon. */}
      <Text style={{ paddingBottom: 4, paddingTop: 14, textAlign: "center", fontSize: 10.5, color: MUTED }}>
        {metaLine}
      </Text>
      {subMetaLine ? (
        <Text style={{ paddingBottom: 14, textAlign: "center", fontSize: 10.5, color: MUTED_FAINT }}>
          {subMetaLine}
        </Text>
      ) : (
        <View className="pb-3.5" />
      )}
      <View style={{ height: 1, backgroundColor: BORDER_INACTIVE }} />

      {visible.length === 0 ? (
        <Text style={{ backgroundColor: CANVAS, paddingVertical: 40, textAlign: "center", fontSize: 14, color: MUTED }}>
          Nothing in this group - which is good news.
        </Text>
      ) : (
        visible.map((ingredient) => (
          <IngredientListRow
            key={ingredient.id}
            ingredient={ingredient}
            rung={rungFor(ingredient, match)}
            onPress={() => onIngredientPress(ingredient)}
          />
        ))
      )}
    </ScrollView>
  );
}

function IngredientListRow({
  ingredient,
  rung,
  onPress,
}: {
  ingredient: Ingredient;
  rung: Rung;
  onPress: () => void;
}) {
  const meta = RUNG_META[rung];
  const rule = ruleFor(ingredient);
  const clogs = isWarnedPoreClogging(ingredient);

  // The most specific thing we hold, in order: pore-clogging (the reason
  // someone opened this screen), a curated rule, the row's own note, then the
  // regulator's declared function list.
  const subtitle = !isVerified(ingredient)
    ? "Not recognised - we can't assess this one"
    : clogs
      ? "On the published pore-clogging lists"
      : rule
        ? rule.reason.split(" - ")[0].trim()
        : (ingredient.note ?? functionLabel(ingredient));

  return (
    <Pressable
      onPress={onPress}
      style={{
        gap: 11,
        flexDirection: "row",
        alignItems: "flex-start",
        borderBottomWidth: 1,
        borderBottomColor: BORDER_INACTIVE,
        backgroundColor: CANVAS,
        paddingHorizontal: 24,
        paddingVertical: 14,
      }}
      className="active:opacity-70"
    >
      <View style={{ width: 9, height: 9, marginTop: 6 }} className={`rounded-full ${meta.dot}`} />

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={{
              flexShrink: 1,
              fontSize: 13.5,
              fontWeight: "500",
              textTransform: "capitalize",
              lineHeight: 18,
              color: INK,
            }}
          >
            {ingredient.name}
          </Text>
          {/* The highlight the external checkers give you, on the row itself. */}
          {clogs ? (
            <View
              style={{ backgroundColor: "#FBE2E7", paddingHorizontal: 6, paddingVertical: 2 }}
              className="rounded-full"
            >
              {/* "Clogging", not "Pore clogging": the badge sits inline beside
                  the ingredient name, and the full phrase crowds the row off
                  the screen. The tab it filters to says the whole thing. */}
              <Text style={{ color: "#A4526A", fontSize: 9.5 }} className="font-bold uppercase">
                Clogging
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={{ fontSize: 11, lineHeight: 16, color: MUTED }}>{subtitle}</Text>
      </View>

      <View className={`mt-px rounded-full px-3 py-1 ${meta.pill}`}>
        <Text className={`text-[11px] font-medium ${meta.ink}`}>{meta.label}</Text>
      </View>

      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" style={{ marginTop: 5 }}>
        <Path
          d="m9 5 7 7-7 7"
          stroke={MUTED_SOFT}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

/** Falls back to the CosIng function list when no curated rule applies. */
function functionLabel(ingredient: Ingredient): string {
  return ingredient.functions && ingredient.functions.length > 0
    ? ingredient.functions.slice(0, 2).join(" · ")
    : "No concerns for your profile";
}
