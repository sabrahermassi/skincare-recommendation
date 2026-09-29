import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { FilterDropdown } from "@/components/FilterDropdown";
import { ingredientSubtitle } from "@/components/IngredientTabsList";
import { Text } from "@/components/Text";
import { VerdictMarker } from "@/components/VerdictMarker";
import type { Ingredient } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { ingredientLabel, LABEL_META, sortForGlance, type IngredientLabel } from "@/lib/ingredient-labels";
import type { MatchResult } from "@/lib/matching";
import { isVerified } from "@/lib/safety";
import { BUTTON, INK, LINK, MUTED, SURFACE, TYPE } from "@/lib/tokens";

export type IngredientFilter = "all" | "watch" | "avoid" | "unknown";

// v7 (read off the hand-off): the first five rows, then "N more ingredients".
const FIRST_ROWS = 5;
const BOX_RADIUS = 28;
const ROW_MIN_HEIGHT = 60;

// What a filter with nothing in it says (v7).
const EMPTY: Record<Exclude<IngredientFilter, "all">, string> = {
  watch: "Nothing to watch out for.",
  avoid: "Nothing to avoid.",
  unknown: "We recognised every ingredient.",
};

/**
 * The ingredient box on the result's Ingredients tab (v7): a white card with
 * a terracotta outline, "Ingredients" and a Filter (All / Watch-outs / Avoid /
 * Not recognised) in its header, then the rows — name, the verdict marker
 * under it, a terracotta chevron. All puts what matters first and shows five,
 * then a full-width "N more ingredients" button closes the box; once every
 * row is showing, `afterAll` (Report a mistake) goes under it. The filter is
 * the parent's, so a risk card can set it.
 */
export function IngredientsCard({
  ingredients,
  match,
  personalized,
  filter,
  onFilter,
  onIngredientPress,
  afterAll,
}: {
  ingredients: Ingredient[];
  match: MatchResult;
  personalized: boolean;
  filter: IngredientFilter;
  onFilter: (filter: IngredientFilter) => void;
  onIngredientPress: (ingredient: Ingredient) => void;
  afterAll?: ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const labelOf = (i: Ingredient) => ingredientLabel(i, match, personalized);

  const ordered = (() => {
    const glance = sortForGlance(ingredients, match, personalized);
    return [...glance.labelled, ...glance.unlabelled].map((row) => row.ingredient);
  })();
  const groups: Record<IngredientFilter, Ingredient[]> = {
    all: ordered,
    watch: ordered.filter((i) => labelOf(i) === "watch"),
    avoid: ordered.filter((i) => labelOf(i) === "avoid"),
    unknown: ordered.filter((i) => labelOf(i) === "unknown" || !isVerified(i)),
  };
  const list = groups[filter];
  const truncated = filter === "all" && !showAll && list.length > FIRST_ROWS;
  const rows = truncated ? list.slice(0, FIRST_ROWS) : list;

  return (
    <>
      <View style={{ borderRadius: BOX_RADIUS, borderWidth: 1.5, borderColor: BUTTON.primary.fill, backgroundColor: SURFACE, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
        <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text accessibilityRole="header" style={{ fontSize: TYPE.title, fontWeight: "600", letterSpacing: -0.2, color: INK }}>
            Ingredients
          </Text>
          <FilterDropdown
            align="end"
            options={[
              { value: "all", label: "All" },
              { value: "watch", label: "Watch-outs" },
              { value: "avoid", label: "Avoid" },
              { value: "unknown", label: "Not recognised" },
            ]}
            selected={filter}
            onSelect={(next) => {
              onFilter(next);
              setShowAll(false);
            }}
          />
        </View>

        {rows.length === 0 && filter !== "all" ? (
          <Text style={{ paddingTop: 12, paddingBottom: 4, fontSize: TYPE.body, color: MUTED }}>{EMPTY[filter]}</Text>
        ) : (
          rows.map((ingredient) => (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              label={labelOf(ingredient)}
              subtitle={ingredientSubtitle(ingredient, labelOf(ingredient), match.warnings.find((w) => w.ingredient.id === ingredient.id))}
              onPress={() => onIngredientPress(ingredient)}
            />
          ))
        )}

        {truncated ? (
          <Pressable
            onPress={() => setShowAll(true)}
            accessibilityRole="button"
            accessibilityLabel={`${list.length - FIRST_ROWS} more ingredients`}
            style={{ marginTop: 12, height: 48, borderRadius: 24, backgroundColor: BUTTON.primary.fill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
            className="active:opacity-90"
          >
            <Text style={{ fontSize: 16, fontWeight: "600", letterSpacing: -0.16, color: BUTTON.primary.label }}>{list.length - FIRST_ROWS} more ingredients</Text>
            <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
              <Path d="M12 5v14M6 13l6 6 6-6" stroke={BUTTON.primary.label} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        ) : null}
      </View>
      {truncated ? null : afterAll}
    </>
  );
}

/** One ingredient: its name, the verdict marker under it (or what it does, with no verdict), and a terracotta chevron. */
function IngredientRow({
  ingredient,
  label,
  subtitle,
  onPress,
}: {
  ingredient: Ingredient;
  label: IngredientLabel | null;
  subtitle: string;
  onPress: () => void;
}) {
  const name = displayIngredientName(ingredient.name);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${label ? LABEL_META[label].label : subtitle}`}
      style={{ minHeight: ROW_MIN_HEIGHT, flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 }}
      className="active:opacity-70"
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: TYPE.card, fontWeight: "600", lineHeight: 21, color: INK }}>{name}</Text>
        {label ? (
          <VerdictMarker label={label} />
        ) : (
          <Text numberOfLines={2} style={{ fontSize: TYPE.caption, lineHeight: 17, color: MUTED }}>
            {subtitle}
          </Text>
        )}
      </View>
      <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
        <Path d="m1 1 6 6-6 6" stroke={LINK} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Pressable>
  );
}
