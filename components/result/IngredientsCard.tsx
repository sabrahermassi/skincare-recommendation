import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { FilterDropdown } from "@/components/FilterDropdown";
import { ingredientSubtitle } from "@/components/IngredientTabsList";
import { Text } from "@/components/Text";
import type { Ingredient } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { ingredientLabel, LABEL_META, sortForGlance, type IngredientLabel } from "@/lib/ingredient-labels";
import { ruleFor, type MatchResult } from "@/lib/matching";
import { isPoreClogging } from "@/lib/pore-clogging";
import { isVerified } from "@/lib/safety";
import { CANVAS, CARD_SHADOW, INK, LINE, MUTED, ROW_CHEVRON, ROW_DIVIDER, SURFACE, TOUCH_TARGET, TYPE } from "@/lib/tokens";

export type IngredientFilter = "all" | "actives" | "watch" | "pore";

// With the "All" filter the card shows this many rows, then "Show all".
const FIRST_ROWS = 8;
// A row's dot, and where the divider starts: under the words, not the dot.
const DOT = 10;
const ROW_LEFT = 20;
const ROW_GAP = 12;

/** A label's colours: the verdict ramp (dot, pill fill, pill words). */
function labelColours(label: IngredientLabel | null) {
  return label ? LABEL_META[label] : null;
}

/**
 * The ingredient list as a card on the result's Safety tab (handoff): its
 * title, how many were read and how many we didn't recognise, a Filter, and
 * the rows. "All" puts what matters first and shows the first eight, then
 * "Show all N ingredients". The filter is the parent's, so a risk card can
 * set it.
 */
export function IngredientsCard({
  ingredients,
  match,
  personalized,
  filter,
  onFilter,
  onIngredientPress,
}: {
  ingredients: Ingredient[];
  match: MatchResult;
  personalized: boolean;
  filter: IngredientFilter;
  onFilter: (filter: IngredientFilter) => void;
  onIngredientPress: (ingredient: Ingredient) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const labelOf = (i: Ingredient) => ingredientLabel(i, match, personalized);
  const unrecognised = ingredients.filter((i) => !isVerified(i)).length;

  const watch = ingredients
    .filter((i) => {
      const l = labelOf(i);
      return l === "avoid" || l === "watch";
    })
    .sort((a, b) => (labelOf(a) === "avoid" ? 0 : 1) - (labelOf(b) === "avoid" ? 0 : 1));
  const groups: Record<IngredientFilter, Ingredient[]> = {
    all: (() => {
      const glance = sortForGlance(ingredients, match, personalized);
      return [...glance.labelled, ...glance.unlabelled].map((row) => row.ingredient);
    })(),
    actives: ingredients.filter((i) => ruleFor(i) !== undefined),
    watch,
    pore: ingredients.filter(isPoreClogging),
  };
  const list = groups[filter];
  const truncated = filter === "all" && !showAll && list.length > FIRST_ROWS;
  const rows = truncated ? list.slice(0, FIRST_ROWS) : list;

  return (
    <View style={{ borderRadius: 24, backgroundColor: SURFACE, ...CARD_SHADOW }}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingTop: 14, paddingRight: 12, paddingBottom: 10, paddingLeft: 20, zIndex: 10 }}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text accessibilityRole="header" style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 22, color: INK }}>
            Ingredients
          </Text>
          <Text style={{ fontSize: TYPE.label, color: MUTED }}>
            {ingredients.length} ingredients{unrecognised > 0 ? ` · ${unrecognised} not recognised` : ""}
          </Text>
        </View>
        <FilterDropdown
          align="end"
          options={[
            { value: "all", label: "All", count: groups.all.length },
            { value: "actives", label: "Actives", count: groups.actives.length },
            { value: "watch", label: "Watch-outs", count: groups.watch.length },
            { value: "pore", label: "Pore clogging", count: groups.pore.length },
          ]}
          selected={filter}
          onSelect={onFilter}
        />
      </View>

      {rows.length === 0 ? (
        <Text style={{ paddingHorizontal: ROW_LEFT, paddingTop: 8, paddingBottom: 22, fontSize: TYPE.body, color: MUTED }}>
          Nothing in this group - which is good news.
        </Text>
      ) : (
        rows.map((ingredient, i) => (
          <IngredientRow
            key={ingredient.id}
            ingredient={ingredient}
            label={labelOf(ingredient)}
            subtitle={ingredientSubtitle(ingredient, labelOf(ingredient), match.warnings.find((w) => w.ingredient.id === ingredient.id))}
            divider={i > 0}
            onPress={() => onIngredientPress(ingredient)}
          />
        ))
      )}

      {truncated ? (
        <View style={{ paddingHorizontal: ROW_LEFT, paddingTop: 6, paddingBottom: 18 }}>
          <Pressable
            onPress={() => setShowAll(true)}
            accessibilityRole="button"
            style={{ height: TOUCH_TARGET, alignItems: "center", justifyContent: "center", borderRadius: 999, borderWidth: 1.5, borderColor: LINE, backgroundColor: CANVAS }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>Show all {list.length} ingredients</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ height: 8 }} />
      )}
    </View>
  );
}

/** One ingredient: its dot, name and what it does, its label, and a chevron. */
function IngredientRow({
  ingredient,
  label,
  subtitle,
  divider,
  onPress,
}: {
  ingredient: Ingredient;
  label: IngredientLabel | null;
  subtitle: string;
  divider: boolean;
  onPress: () => void;
}) {
  const meta = labelColours(label);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${displayIngredientName(ingredient.name)}, ${subtitle}${meta ? `, ${meta.label}` : ""}`}
      style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: ROW_GAP, paddingLeft: ROW_LEFT, paddingRight: 14 }}
      className="active:opacity-70"
    >
      {divider ? (
        <View style={{ position: "absolute", top: 0, left: ROW_LEFT + DOT + ROW_GAP, right: 14, height: 1, backgroundColor: ROW_DIVIDER }} />
      ) : null}
      <View style={{ width: DOT, height: DOT, borderRadius: DOT / 2, ...(meta ? null : { backgroundColor: LINE }) }} className={meta?.dot ?? ""} />
      <View style={{ flex: 1, gap: 2, paddingVertical: 10 }}>
        <Text style={{ fontSize: TYPE.body, fontWeight: "500", lineHeight: 20, color: INK }}>{displayIngredientName(ingredient.name)}</Text>
        <Text numberOfLines={2} style={{ fontSize: 13, lineHeight: 17, color: MUTED }}>
          {subtitle}
        </Text>
      </View>
      {meta ? (
        <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }} className={meta.pill}>
          <Text style={{ fontSize: TYPE.caption, fontWeight: "600" }} className={meta.ink}>
            {meta.label}
          </Text>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={ROW_CHEVRON} />
    </Pressable>
  );
}
