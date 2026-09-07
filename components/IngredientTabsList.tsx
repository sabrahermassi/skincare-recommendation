import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { Text } from "@/components/Text";
import type { Ingredient } from "@/data/types";
import { isVerified } from "@/lib/safety";
import { ruleFor, RUNG_META, rungFor, type MatchResult, type Rung } from "@/lib/matching";
import { isPoreClogging, isWarnedPoreClogging, poreCloggingHits } from "@/lib/pore-clogging";

/**
 * The tabbed ingredient list — shared by a scanned product's ingredient
 * screen (`app/ingredients/[id].tsx`) and a pasted list's
 * (`app/ingredients/pasted.tsx`), so both read exactly the same way: All /
 * Actives / Watch-outs / Pore clogging, each row judged against `match`.
 *
 * `metaLine`/`subMetaLine` are the two lines above the divider — a real
 * product shows an ingredient count and when the label was last read; a
 * pasted list has no fetch date, so `subMetaLine` is simply omitted there.
 */

const TABS = ["All", "Actives", "Watch-outs", "Pore clogging"] as const;
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
              style={{ height: 44, paddingHorizontal: 18 }}
              className={`items-center justify-center rounded-full border ${
                active ? "border-accent bg-tint-lilac" : "border-hairline bg-surface"
              }`}
            >
              <Text
                className={`text-[14.5px] font-semibold ${
                  active ? "text-accent-text" : "text-ink-muted"
                }`}
              >
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
      <Text className="pb-1 pt-3.5 text-center text-[10.5px] text-ink-muted">{metaLine}</Text>
      {subMetaLine ? (
        <Text className="pb-3.5 text-center text-[10.5px] text-ink-faint">{subMetaLine}</Text>
      ) : (
        <View className="pb-3.5" />
      )}
      <View className="h-px bg-hairline" />

      {visible.length === 0 ? (
        <Text className="bg-surface py-10 text-center text-sm text-ink-muted">
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
      style={{ gap: 11 }}
      className="flex-row items-start border-b border-hairline-soft bg-surface px-6 py-3.5 active:bg-canvas"
    >
      <View style={{ width: 9, height: 9, marginTop: 6 }} className={`rounded-full ${meta.dot}`} />

      <View className="flex-1 gap-0.5">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            className="text-[13.5px] font-medium capitalize leading-[18px] text-ink"
            style={{ flexShrink: 1 }}
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
        <Text className="text-[11px] leading-[16px] text-ink-muted">{subtitle}</Text>
      </View>

      <View className={`mt-px rounded-full px-3 py-1 ${meta.pill}`}>
        <Text className={`text-[11px] font-medium ${meta.ink}`}>{meta.label}</Text>
      </View>

      <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" style={{ marginTop: 5 }}>
        <Path
          d="m9 5 7 7-7 7"
          stroke="#BDB6C2"
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
