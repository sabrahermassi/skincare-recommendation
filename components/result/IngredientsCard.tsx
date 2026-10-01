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
import { ruleFor, type MatchResult } from "@/lib/matching";
import { isWarnedPoreClogging } from "@/lib/pore-clogging";
import { nameMatches } from "@/lib/rules";
import { isVerified } from "@/lib/safety";
import { CARD_RADIUS, INK, LINK, MUTED, SPACE, TYPE, WHITE } from "@/lib/tokens";

export type IngredientFilter = "all" | "watch" | "actives" | "pore" | "unknown";

// v9 (read off the hand-off): the first five rows, then "N more ingredients".
const FIRST_ROWS = 5;
const ROW_MIN_HEIGHT = 60;

// What a filter with nothing in it says (v7).
const EMPTY: Record<Exclude<IngredientFilter, "all">, string> = {
  watch: "Nothing to watch out for.",
  actives: "No actives in this one.",
  pore: "Nothing here clogs pores.",
  unknown: "We recognised every ingredient.",
};

/**
 * An active (v9's "Actives" filter): an ingredient with a curated rule for a
 * treatment — the "actives" category (acids, retinoids, vitamin C, azelaic
 * acid), salicylic acid (filed under pore clogging, which it clears), and
 * niacinamide (filed under barrier support).
 */
function isActive(ingredient: Ingredient): boolean {
  const rule = ruleFor(ingredient);
  if (!rule) return false;
  return rule.category === "actives" || (rule.category === "pore-clogging" && !!rule.helps) || nameMatches(["niacinamide", "nicotinamide"], ingredient.name);
}

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
    // Watch-outs: avoid first, then watch (v9).
    watch: [...ordered.filter((i) => labelOf(i) === "avoid"), ...ordered.filter((i) => labelOf(i) === "watch")],
    actives: ordered.filter(isActive),
    pore: ordered.filter(isWarnedPoreClogging),
    unknown: ordered.filter((i) => labelOf(i) === "unknown" || !isVerified(i)),
  };
  const list = groups[filter];
  const truncated = filter === "all" && !showAll && list.length > FIRST_ROWS;
  const rows = truncated ? list.slice(0, FIRST_ROWS) : list;

  return (
    <>
      <View style={{ borderRadius: CARD_RADIUS, backgroundColor: WHITE, paddingVertical: 8, paddingHorizontal: SPACE.gutter }}>
        <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text accessibilityRole="header" style={{ fontSize: TYPE.title, fontWeight: "600", letterSpacing: -0.2, color: INK }}>
            Ingredients
          </Text>
          <FilterDropdown
            align="end"
            options={[
              { value: "all", label: "All" },
              { value: "watch", label: "Watch-outs" },
              { value: "actives", label: "Actives" },
              { value: "pore", label: "Pore-clogging" },
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
            style={{ alignSelf: "center", marginTop: 4, minHeight: 44, paddingHorizontal: 8, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}
            className="active:opacity-70"
          >
            {/* A text link, not a filled button (v9): the one filled button here is Report a mistake. */}
            <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: LINK }}>{list.length - FIRST_ROWS} more ingredients</Text>
            <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
              <Path d="m6 9 6 6 6-6" stroke={LINK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
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
