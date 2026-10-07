import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { FilterDropdown } from "@/components/FilterDropdown";
import { Text } from "@/components/Text";
import { StarIcon } from "@/components/icons/StarIcon";
import { VerdictDot, verdictTone } from "@/components/VerdictMarker";
import type { Ingredient } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { useSafetyNoticeEnabled } from "@/lib/features";
import { ingredientLabel, LABEL_META, rowWord, type IngredientLabel } from "@/lib/ingredient-labels";
import { ingredientSubtitle } from "@/lib/ingredient-subtitle";
import { ruleFor, type MatchResult } from "@/lib/matching";
import { cloggerConfidence, isPoreClogging } from "@/lib/pore-clogging";
import { isActiveRule } from "@/lib/rules";
import { isOriginDependent, isVerified } from "@/lib/safety";
import { BUTTON, INK, MUTED, MUTED_FAINT, SPACE, TYPE, WHITE, RADIUS, LEADING, TRACKING } from "@/lib/tokens";
import { BUTTON_HEIGHT } from "@/components/PrimaryButton";
import { useAppStore } from "@/store/useAppStore";

const DISPUTED_CLOGGER = "Disputed: sources disagree on whether it clogs pores";

export type IngredientFilter = "all" | "watch" | "actives" | "pore" | "unknown";

// v9 (read off the hand-off): the first five rows, then "N more ingredients".
const FIRST_ROWS = 5;
const ROW_MIN_HEIGHT = 64;
const BOX_RADIUS = RADIUS.panel;

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
  return rule !== undefined && isActiveRule(rule);
}

/** Worst first (v9): avoid, watch, not recognised, then everything fine. */
const SEVERITY: Record<IngredientLabel | "none", number> = { avoid: 0, watch: 1, unknown: 2, good: 3, none: 3 };

/**
 * Whether a row has something worth opening (v9): a verdict other than Good,
 * a curated rule (an active, a named humectant), or a place on the
 * pore-clogging lists, or an EU status that depends on how it is made
 * (cannabidiol, whose page says so). Only those rows carry a chevron and open
 * the ingredient; plain filler like water just sits in the list.
 */
function hasDetails(ingredient: Ingredient, label: IngredientLabel | null): boolean {
  return (label !== null && label !== "good") || ruleFor(ingredient) !== undefined || isPoreClogging(ingredient) || isOriginDependent(ingredient);
}

/**
 * The rows under each filter, worst first. Its own function so a test can
 * hold it against the two risk rows that open a filter: a row that counts
 * ingredients must open a list that shows them
 * (`__tests__/risk-rows-match-lists.test.ts`).
 */
export function ingredientGroups(ingredients: Ingredient[], match: MatchResult, personalized: boolean): Record<IngredientFilter, Ingredient[]> {
  const labelOf = (i: Ingredient) => ingredientLabel(i, match, personalized);
  // A stable sort: within a verdict the label's own order (most to least) stands.
  const ordered = ingredients
    .map((ingredient, index) => ({ ingredient, index, rank: SEVERITY[labelOf(ingredient) ?? "none"] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((row) => row.ingredient);
  return {
    all: ordered,
    // Watch-outs: avoid first, then watch (v9).
    watch: [...ordered.filter((i) => labelOf(i) === "avoid"), ...ordered.filter((i) => labelOf(i) === "watch")],
    actives: ordered.filter(isActive),
    // Every name on the pore-clogging lists, the disputed ones too: the risk
    // row that opens this filter counts them ("5 ingredients, mixed
    // evidence"), so leaving them out showed an empty list under that count.
    pore: ordered.filter(isPoreClogging),
    unknown: ordered.filter((i) => labelOf(i) === "unknown" || !isVerified(i)),
  };
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
  const noticeEnabled = useSafetyNoticeEnabled();
  const labelOf = (i: Ingredient) => ingredientLabel(i, match, personalized);
  const groups = ingredientGroups(ingredients, match, personalized);
  const list = groups[filter];
  const truncated = filter === "all" && !showAll && list.length > FIRST_ROWS;
  const rows = truncated ? list.slice(0, FIRST_ROWS) : list;
  const rest = list.slice(FIRST_ROWS);
  // An ingredient whose EU status depends on how it is made is not "fine": the fold must not say so.
  const restIsFine = rest.every((i) => SEVERITY[labelOf(i) ?? "none"] === SEVERITY.good && !isOriginDependent(i));
  const moreLabel = `${rest.length} more${restIsFine ? ", no concerns" : rest.length === 1 ? " ingredient" : " ingredients"}`;

  return (
    <View style={{ marginTop: SPACE.block, borderRadius: BOX_RADIUS, borderWidth: 1.5, borderColor: BUTTON.primary.fill, backgroundColor: WHITE, paddingTop: SPACE.block, paddingHorizontal: 20, paddingBottom: 20 }}>
      <View style={{ minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.title, fontWeight: "600", letterSpacing: TRACKING.title, color: INK }}>
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
        <Text style={{ paddingTop: SPACE.block, paddingBottom: 4, fontSize: TYPE.body, color: MUTED }}>{EMPTY[filter]}</Text>
      ) : (
        rows.map((ingredient) => {
          const label = labelOf(ingredient);
          const words = label ? rowWord(ingredient, label, match.warnings.filter((w) => w.ingredient.id === ingredient.id), noticeEnabled) : null;
          return (
            <IngredientRow
              key={ingredient.id}
              ingredient={ingredient}
              label={label}
              word={words?.word}
              wordLine={words?.line}
              // A disputed pore-clogger carries no warning anywhere else, so under this filter the row says why it is listed.
              subtitle={filter === "pore" && cloggerConfidence(ingredient) === "contested" ? DISPUTED_CLOGGER : ingredientSubtitle(ingredient, label, match.warnings.find((w) => w.ingredient.id === ingredient.id))}
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
          style={{ marginTop: SPACE.block, height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: BUTTON.primary.fill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACE.text }}
          className="active:opacity-90"
        >
          <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: BUTTON.primary.label }}>{moreLabel}</Text>
          <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
            <Path d="M12 5v14M6 13l6 6 6-6" stroke={BUTTON.primary.label} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
        </Pressable>
      ) : (
        <>
          <Text style={{ marginTop: SPACE.block, fontSize: TYPE.caption, lineHeight: LEADING.caption, color: MUTED_FAINT }}>* Scores for the same product can change, as brands sometimes update their formulas.</Text>
          {afterAll ? <View style={{ marginTop: SPACE.gutter }}>{afterAll}</View> : null}
        </>
      )}
    </View>
  );
}

/** One ingredient: its name, the verdict marker under it (or what it does, with no verdict), and a chevron when it opens. */
function IngredientRow({
  ingredient,
  label,
  word,
  wordLine,
  subtitle,
  onPress,
}: {
  ingredient: Ingredient;
  label: IngredientLabel | null;
  /** The label's word on screen: its own, or what the EU safety notice says instead (#404). */
  word?: string;
  /** A line under the word, for the notice. */
  wordLine?: string;
  subtitle: string;
  onPress?: () => void;
}) {
  const name = displayIngredientName(ingredient.name);
  const tone = verdictTone(label);
  const starred = useAppStore((state) => state.savedIngredients.includes(ingredient.name));
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${name}, ${label ? (word ?? LABEL_META[label].label) : subtitle}${wordLine ? `. ${wordLine}` : ""}`}
      style={{ minHeight: ROW_MIN_HEIGHT, flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingVertical: SPACE.text }}
      className={onPress ? "active:opacity-70" : undefined}
    >
      {/* The verdict's dot in front of every row (owner): green, orange, red,
          or grey for a row the list gives no word. */}
      <VerdictDot colour={tone.solid} halo={tone.halo} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: TYPE.card, fontWeight: "500", lineHeight: LEADING.card, color: INK }}>{name}</Text>
        {label ? (
          <>
            <Text style={{ fontSize: TYPE.label, color: tone.word }}>{word ?? LABEL_META[label].label}</Text>
            {wordLine ? (
              <Text numberOfLines={2} style={{ fontSize: TYPE.caption, lineHeight: LEADING.caption, color: MUTED }}>
                {wordLine}
              </Text>
            ) : null}
          </>
        ) : (
          <Text numberOfLines={2} style={{ fontSize: TYPE.caption, lineHeight: LEADING.caption, color: MUTED }}>
            {subtitle}
          </Text>
        )}
      </View>
      {/* Starred on the ingredient's own sheet: it shows here too (owner). */}
      {starred ? (
        <View accessible accessibilityLabel="Starred">
          <StarIcon filled size={18} />
        </View>
      ) : null}
      {onPress ? (
        <Svg width={8} height={14} viewBox="0 0 8 14" fill="none">
          <Path d="m1 1 6 6-6 6" stroke={BUTTON.primary.fill} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      ) : null}
    </Pressable>
  );
}
