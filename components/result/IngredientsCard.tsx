import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { FilterDropdown } from "@/components/FilterDropdown";
import { Text } from "@/components/Text";
import { VerdictMarker } from "@/components/VerdictMarker";
import type { Ingredient } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { ingredientLabel, LABEL_META, type IngredientLabel } from "@/lib/ingredient-labels";
import { ingredientSubtitle } from "@/lib/ingredient-subtitle";
import { ruleFor, type MatchResult } from "@/lib/matching";
import { isWarnedPoreClogging } from "@/lib/pore-clogging";
import { nameMatches } from "@/lib/rules";
import { isVerified } from "@/lib/safety";
import { BUTTON, INK, MUTED, MUTED_FAINT, SPACE, TYPE, WHITE } from "@/lib/tokens";

export type IngredientFilter = "all" | "watch" | "actives" | "pore" | "unknown";

// v9 (read off the hand-off): the first five rows, then "N more ingredients".
const FIRST_ROWS = 5;
const ROW_MIN_HEIGHT = 64;
const BOX_RADIUS = 28;

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

/** Worst first (v9): avoid, watch, not recognised, then everything fine. */
const SEVERITY: Record<IngredientLabel | "none", number> = { avoid: 0, watch: 1, unknown: 2, good: 3, none: 3 };

/**
 * Whether a row has something worth opening (v9): a verdict other than Good,
 * a curated rule (an active, a named humectant), or a place on the
 * pore-clogging lists. Only those rows carry a chevron and open the
 * ingredient; plain filler like water just sits in the list.
 */
function hasDetails(ingredient: Ingredient, label: IngredientLabel | null): boolean {
  return (label !== null && label !== "good") || ruleFor(ingredient) !== undefined || isWarnedPoreClogging(ingredient);
}

/**
 * The ingredient box on the result's Ingredients tab (v9): a white box with a
 * sage outline. "Ingredients" and a Filter (All / Watch-outs / Actives /
 * Pore-clogging / Not recognised) in its header, then the rows, worst first —
 * the name, the verdict marker under it, and a chevron on the rows that open.
 * All shows five, then a full-width button for the rest ("4 more, no
 * concerns" when nothing left is flagged). Once every row is showing, the box
 * ends with the formula footnote and `afterAll` (Report a mistake). The
 * filter is the parent's, so a risk row can set it.
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

  // A stable sort: within a verdict the label's own order (most to least) stands.
  const ordered = ingredients
    .map((ingredient, index) => ({ ingredient, index, rank: SEVERITY[labelOf(ingredient) ?? "none"] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.ingredient);
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
  const rest = list.slice(FIRST_ROWS);
  const restIsFine = rest.every((i) => SEVERITY[labelOf(i) ?? "none"] === SEVERITY.good);
  const moreLabel = `${rest.length} more${restIsFine ? ", no concerns" : rest.length === 1 ? " ingredient" : " ingredients"}`;

  return (
    <View style={{ marginTop: SPACE.block, borderRadius: BOX_RADIUS, borderWidth: 1.5, borderColor: BUTTON.primary.fill, backgroundColor: WHITE, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 20 }}>
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
        rows.map((ingredient) => {
          const label = labelOf(ingredient);
          return (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              label={label}
              subtitle={ingredientSubtitle(ingredient, label, match.warnings.find((w) => w.ingredient.id === ingredient.id))}
              onPress={hasDetails(ingredient, label) ? () => onIngredientPress(ingredient) : undefined}
            />
          );
        })
      )}

      {truncated ? (
        <Pressable
          onPress={() => setShowAll(true)}
          accessibilityRole="button"
          accessibilityLabel={moreLabel}
          style={{ marginTop: 12, height: 44, borderRadius: 22, backgroundColor: BUTTON.primary.fill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
          className="active:opacity-90"
        >
          <Text style={{ fontSize: 16, fontWeight: "600", color: BUTTON.primary.label }}>{moreLabel}</Text>
          <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
            <Path d="M12 5v14M6 13l6 6 6-6" stroke={BUTTON.primary.label} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
      ) : (
        <>
          <Text style={{ marginTop: 12, fontSize: TYPE.caption, lineHeight: 19, color: MUTED_FAINT }}>* Scores for the same product can change, as brands sometimes update their formulas.</Text>
          {afterAll ? <View style={{ marginTop: 16 }}>{afterAll}</View> : null}
        </>
      )}
    </View>
  );
}

/** One ingredient: its name, the verdict marker under it (or what it does, with no verdict), and a chevron when it opens. */
function IngredientRow({
  ingredient,
  label,
  subtitle,
  onPress,
}: {
  ingredient: Ingredient;
  label: IngredientLabel | null;
  subtitle: string;
  onPress?: () => void;
}) {
  const name = displayIngredientName(ingredient.name);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${name}, ${label ? LABEL_META[label].label : subtitle}`}
      style={{ minHeight: ROW_MIN_HEIGHT, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}
      className={onPress ? "active:opacity-70" : undefined}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: TYPE.card, fontWeight: "500", lineHeight: 21, color: INK }}>{name}</Text>
        {label ? (
          <VerdictMarker label={label} />
        ) : (
          <Text numberOfLines={2} style={{ fontSize: TYPE.caption, lineHeight: 17, color: MUTED }}>
            {subtitle}
          </Text>
        )}
      </View>
      {onPress ? (
        <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
          <Path d="m1 1 6 6-6 6" stroke={BUTTON.primary.fill} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </Pressable>
  );
}
