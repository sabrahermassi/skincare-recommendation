import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

// One selected-outline color app-wide — see profile.tsx's own note on why
// this FOR.ME shell token is reused outside its original scope.
import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import type { Ingredient } from "@/data/types";
import { isVerified } from "@/lib/safety";
import { ruleFor, RUNG_META, rungFor, type Contraindication, type MatchResult, type Rung } from "@/lib/matching";
import { isPoreClogging, isWarnedPoreClogging, poreCloggingHits } from "@/lib/pore-clogging";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, MUTED_SOFT, RADIUS_SELECTOR, SELECTED, TYPE } from "@/lib/tokens";

// The design system (design/DESIGN_SYSTEM.md). RUNG_META's good/watch/avoid
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
                borderColor: active ? TERRACOTTA : BORDER_INACTIVE,
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
      <Text style={{ paddingBottom: 4, paddingTop: 14, textAlign: "center", fontSize: TYPE.caption, color: MUTED }}>
        {metaLine}
      </Text>
      {subMetaLine ? (
        <Text style={{ paddingBottom: 14, textAlign: "center", fontSize: TYPE.caption, color: MUTED_FAINT }}>
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
            // The one thing that outranks not knowing — see `rungFor` and the
            // subtitle logic below, which both read this the same way.
            warning={match.warnings.find((w) => w.ingredient.id === ingredient.id)}
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
  warning,
  onPress,
}: {
  ingredient: Ingredient;
  rung: Rung;
  warning?: Contraindication;
  onPress: () => void;
}) {
  const meta = RUNG_META[rung];
  const rule = ruleFor(ingredient);
  const clogs = isWarnedPoreClogging(ingredient);

  // A warning outranks not knowing, the same precedence `rungFor` itself
  // uses: pregnancy matching fires on an exact name even when OCR left the
  // row unverified, so the badge can already read "Avoid" here while this
  // subtitle used to still say "we can't assess this one" underneath it —
  // the row contradicting its own rung. `warning` can still be absent on an
  // unverified "avoid" row — `rungFor` also flags a negative match reason
  // with no `Contraindication` behind it — which is what the fallback covers.
  //
  // The verified branch is untouched: the most specific thing we hold there,
  // in order, is pore-clogging (the reason someone opened this screen), a
  // curated rule, the row's own note, then the regulator's declared function
  // list.
  const subtitle = !isVerified(ingredient)
    ? rung === "avoid" && warning
      ? warning.reason
      : "Not recognised - we can't assess this one"
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
              <Text style={{ color: "#A4526A", fontSize: TYPE.caption }} className="font-bold uppercase">
                Clogging
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={{ fontSize: TYPE.caption, lineHeight: 16, color: MUTED }}>{subtitle}</Text>
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
