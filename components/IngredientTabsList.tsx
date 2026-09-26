import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowIcon } from "@/components/icons/ArrowIcon";

// One selected-outline color app-wide — see profile.tsx's own note on why
// this FOR.ME shell token is reused outside its original scope.
import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import type { Ingredient } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { isVerified } from "@/lib/safety";
import { ingredientLabel, LABEL_META, sortForGlance, type IngredientLabel } from "@/lib/ingredient-labels";
import { ruleFor, type Contraindication, type MatchResult } from "@/lib/matching";
import { isPersonalized } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";
import { isPoreClogging, isWarnedPoreClogging, poreCloggingHits } from "@/lib/pore-clogging";
import { BORDER_INACTIVE, CANVAS, CHIP_SHADOW, CLOG_BADGE_INK, CLOG_BADGE_TINT, INK, MUTED, MUTED_FAINT, RADIUS_SELECTOR, SELECTED, TOUCH_TARGET, TYPE } from "@/lib/tokens";

// The design system (design/DESIGN_SYSTEM.md). RUNG_META's good/watch/avoid
// colors are semantic (the per-ingredient verdict, the whole point of this
// screen) and stay untouched — only the tab pills, dividers and body text
// move to this system.

/**
 * The tabbed ingredient list for a scanned product's ingredient screen
 * (`app/ingredients/[id].tsx`): All / Actives / Watch-outs / Pore clogging,
 * each row labelled against `match` (`lib/ingredient-labels.ts`, #324).
 *
 * "All" reads at a glance: the labelled rows first (Avoid, Watch, Good,
 * Unknown), and the rest folded under one line until tapped. "As printed"
 * shows the pack's own order instead — position is concentration.
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
  const [asPrinted, setAsPrinted] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  const personalized = isPersonalized(useAppStore((s) => s.profile));
  const labelOf = (i: Ingredient) => ingredientLabel(i, match, personalized);

  const filtered = ingredients.filter((i) => {
    if (tab === "Actives") return ruleFor(i) !== undefined;
    if (tab === "Watch-outs") {
      const label = labelOf(i);
      return label === "avoid" || label === "watch" || label === "unknown";
    }
    if (tab === "Pore clogging") return isPoreClogging(i);
    return true;
  });
  // Only "All" is sorted and folded: the other tabs are already the short list.
  const glance = tab === "All" && !asPrinted ? sortForGlance(filtered, match, personalized) : null;
  const rows = glance
    ? [...glance.labelled, ...(unfolded ? glance.unlabelled : [])]
    : filtered.map((ingredient) => ({ ingredient, label: labelOf(ingredient) }));
  const folded = glance && !unfolded ? glance.unlabelled.length : 0;

  const cloggerCount = poreCloggingHits(ingredients).length;

  return (
    <ScrollView contentContainerClassName="pb-4">
      {/* Scrolls rather than dividing the width four ways: at flex-1 the
          fourth pill squeezed the labels below legibility. Pills keep their
          44pt height and the app's own option-label size. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // Room under the pills for their shade: a scroll view clips what falls outside it.
        contentContainerStyle={{ gap: 10, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 10 }}
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
                height: TOUCH_TARGET,
                paddingHorizontal: 18,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: RADIUS_SELECTOR,
                borderWidth: active ? 1.5 : 1,
                borderColor: active ? TERRACOTTA : BORDER_INACTIVE,
                backgroundColor: active ? SELECTED : CANVAS,
                ...CHIP_SHADOW,
              }}
              className="active:opacity-70"
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
      <Text style={{ paddingBottom: 4, paddingTop: 4, textAlign: "center", fontSize: TYPE.caption, color: MUTED }}>
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

      {/* Without a profile nothing can be good or risky *for you* (#324). */}
      {!personalized ? (
        <Text style={{ paddingHorizontal: 24, paddingTop: 12, fontSize: TYPE.caption, color: MUTED }}>
          Set up your skin profile to see what&apos;s good or worth watching for you.
        </Text>
      ) : null}

      {tab === "All" ? (
        <Pressable
          onPress={() => setAsPrinted((printed) => !printed)}
          accessibilityRole="button"
          accessibilityState={{ selected: asPrinted }}
          style={{ minHeight: TOUCH_TARGET, alignSelf: "flex-end", justifyContent: "center", paddingHorizontal: 24 }}
          className="active:opacity-70"
        >
          <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
            {asPrinted ? "What matters first" : "As printed"}
          </Text>
        </Pressable>
      ) : null}

      {filtered.length === 0 ? (
        <Text style={{ backgroundColor: CANVAS, paddingVertical: 40, textAlign: "center", fontSize: 14, color: MUTED }}>
          Nothing in this group - which is good news.
        </Text>
      ) : (
        rows.map(({ ingredient, label }) => (
          <IngredientListRow
            key={ingredient.id}
            ingredient={ingredient}
            label={label}
            // The one thing that outranks not knowing — see `ingredientLabel`
            // and the subtitle logic below, which both read this the same way.
            warning={match.warnings.find((w) => w.ingredient.id === ingredient.id)}
            onPress={() => onIngredientPress(ingredient)}
          />
        ))
      )}

      {folded > 0 ? (
        <Pressable
          onPress={() => setUnfolded(true)}
          accessibilityRole="button"
          style={{ minHeight: TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 12 }}
          className="active:opacity-70"
        >
          <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK }}>
            {folded === 1 ? "1 more ingredient with no known concerns" : `${folded} more ingredients with no known concerns`}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

export function IngredientListRow({
  ingredient,
  label,
  warning,
  onPress,
}: {
  ingredient: Ingredient;
  /** `ingredientLabel`'s word, or null for a row with nothing to say (#324). */
  label: IngredientLabel | null;
  warning?: Contraindication;
  onPress: () => void;
}) {
  const meta = label ? LABEL_META[label] : null;
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
    ? label === "avoid" && warning
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
      accessibilityRole="button"
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
      {/* The word says it; the dot only echoes it, and a row with nothing to
          say keeps a plain one so the names still line up. */}
      <View
        style={{ width: 9, height: 9, marginTop: 6, ...(meta ? null : { backgroundColor: BORDER_INACTIVE }) }}
        className={`rounded-full ${meta?.dot ?? ""}`}
      />

      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={{
              flexShrink: 1,
              fontSize: 13.5,
              fontWeight: "500",
              lineHeight: 18,
              color: INK,
            }}
          >
            {displayIngredientName(ingredient.name)}
          </Text>
          {/* The highlight the external checkers give you, on the row itself. */}
          {clogs ? (
            <View
              style={{ backgroundColor: CLOG_BADGE_TINT, paddingHorizontal: 6, paddingVertical: 2 }}
              className="rounded-full"
            >
              {/* "Clogging", not "Pore clogging": the badge sits inline beside
                  the ingredient name, and the full phrase crowds the row off
                  the screen. The tab it filters to says the whole thing. */}
              <Text style={{ color: CLOG_BADGE_INK, fontSize: TYPE.caption }} className="font-bold uppercase">
                Clogging
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={{ fontSize: TYPE.caption, lineHeight: 16, color: MUTED }}>{subtitle}</Text>
      </View>

      {meta ? (
        <View className={`mt-px rounded-full px-3 py-1 ${meta.pill}`}>
          <Text className={`text-[11px] font-medium ${meta.ink}`}>{meta.label}</Text>
        </View>
      ) : null}

      <ArrowIcon size={16} color={INK} style={{ marginTop: 3 }} />
    </Pressable>
  );
}

/** Falls back to the CosIng function list when no curated rule applies. */
function functionLabel(ingredient: Ingredient): string {
  return ingredient.functions && ingredient.functions.length > 0
    ? ingredient.functions.slice(0, 2).join(" · ")
    : "No concerns for your profile";
}
