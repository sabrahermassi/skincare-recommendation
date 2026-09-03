import { Link } from "expo-router";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";

import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { matchTone, type MatchResult } from "@/lib/matching";
import { flaggedIngredients } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";
import { BottleIcon } from "./BottleIcon";
import { CompareIcon } from "./icons";

/**
 * One product in the browse list.
 *
 * The design turned the two-column grid into a list and took the price out
 * with it — "a match ranking, not a shop". What replaces the price is the one
 * fact that actually decides whether to keep reading: how many ingredients we
 * read, and how many of them are a problem for you. That line turns amber the
 * moment there is something flagged, so a bad row is visible before the score
 * is.
 */
const TONE_BG = {
  high: "bg-status-safe",
  medium: "bg-status-caution",
  low: "bg-status-watch",
} as const;

const TONE_LABEL = {
  high: "Great match",
  medium: "Fair match",
  low: "Poor match",
} as const;

export function ProductRow({
  product,
  match,
  last = false,
}: {
  product: ProductWithIngredients;
  match: MatchResult;
  /** Drops the divider — the scanner's shelf card draws its own border. */
  last?: boolean;
}) {
  const compareIds = useAppStore((s) => s.compareIds);
  const toggleCompare = useAppStore((s) => s.toggleCompare);
  const inCompare = compareIds.includes(product.id);

  const total = product.ingredients.length;
  const flagged = flaggedIngredients(product.ingredients).length;
  const tone = match.score === null ? null : matchTone(match.score);

  const meta =
    total === 0
      ? "Formula not read yet"
      : `${total} ingredient${total === 1 ? "" : "s"} · ${
          flagged === 0 ? "none flagged" : `${flagged} flagged`
        }`;

  return (
    <Link href={`/product/${product.id}`} asChild>
      <Pressable style={{ gap: 13, paddingVertical: 17 }}
        className={`flex-row items-center bg-surface px-5 active:bg-canvas ${
          last ? "" : "border-b border-hairline-soft"
        }`}>
        <BottleIcon type={product.productType} size={46} radius="rounded-tile" />

        <View className="flex-1">
          <Text className="text-[9.5px] font-semibold uppercase tracking-[0.7px] text-ink-faint">
            {product.brand}
          </Text>
          <Text className="mt-0.5 text-[13.5px] font-medium leading-[18px] text-ink">
            {product.name}
          </Text>
          <Text
            className={`mt-0.5 text-[10.5px] ${
              flagged > 0 ? "text-status-watch" : "text-ink-muted"
            }`}
          >
            {meta}
          </Text>
        </View>

        {/* No score means no profile to score against — the row still lists,
            it just doesn't pretend to rank. Badge over score, both centred on
            the same axis: the score used to hang off the left edge of a badge
            it belonged to, and the badge itself was too tight for its own
            label. */}
        {tone && match.score !== null ? (
          <View style={{ alignItems: "center", gap: 6, width: 92 }}>
            <View
              style={{ paddingHorizontal: 10, paddingVertical: 5 }}
              className={`rounded-full ${TONE_BG[tone]}`}
            >
              <Text
                className="font-semibold text-white"
                style={{ fontSize: 11 }}
                numberOfLines={1}
              >
                {TONE_LABEL[tone]}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 1 }}>
              <Text className="text-[16px] font-semibold tabular-nums text-ink">
                {match.score}
              </Text>
              <Text className="text-[10.5px] font-medium text-ink-faint">/100</Text>
            </View>
          </View>
        ) : null}

        {/* Compare used to be reachable only from inside a product's own
            page, one at a time — you couldn't pick a second product to
            compare against without leaving the list to go find it. Nested
            inside the row's own Link the same way Saved's "Remove" button
            is: the touch that lands on this circle is consumed here, not
            passed up to the row's navigation. */}
        <Pressable
          onPress={() => toggleCompare(product.id)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityLabel={inCompare ? "Remove from comparison" : "Add to comparison"}
          accessibilityState={{ checked: inCompare }}
          style={{ width: 30, height: 30 }}
          className={`items-center justify-center rounded-full border ${
            inCompare ? "border-accent bg-tint-lilac" : "border-hairline bg-canvas"
          }`}
        >
          <CompareIcon size={14} color={inCompare ? COLORS.accentText : COLORS.inkMuted} />
        </Pressable>
      </Pressable>
    </Link>
  );
}
