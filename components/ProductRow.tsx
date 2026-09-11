import { Link } from "expo-router";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";

import type { ProductWithIngredients } from "@/data/types";
import { matchTone, type MatchResult } from "@/lib/matching";
import { flaggedIngredients } from "@/lib/safety";
import { INK, LINE, MUTED, MUTED_FAINT, SURFACE, VERDICT, VERDICT_NEUTRAL, WARN } from "@/lib/tokens";
import { ProductThumbnail } from "./ProductThumbnail";

/**
 * One product in the browse list.
 *
 * The design turned the two-column grid into a list and took the price out
 * with it — "a match ranking, not a shop". What replaces the price is the one
 * fact that actually decides whether to keep reading: how many ingredients we
 * read, and how many of them are a problem for you. That line turns amber the
 * moment there is something flagged, so a bad row is visible before the score
 * is.
 *
 * The verdict is carried twice, deliberately, at two reading speeds: a 4px bar
 * down the leading edge, legible while thumbing past without reading anything,
 * and a badge that spells it out once you stop on a row. Both come from
 * `VERDICT` in lib/tokens — neither is written here.
 */
export function ProductRow({
  product,
  match,
  last = false,
}: {
  product: ProductWithIngredients;
  match: MatchResult;
  /** Drops the trailing gap — for the final card in a list. */
  last?: boolean;
}) {
  const total = product.ingredients.length;
  const flagged = flaggedIngredients(product.ingredients).length;
  const tone = match.score === null ? null : matchTone(match.score);
  const verdict = tone ? VERDICT[tone] : VERDICT_NEUTRAL;

  const meta =
    total === 0
      ? "Formula not read yet"
      : `${total} ingredient${total === 1 ? "" : "s"} · ${
          flagged === 0 ? "none flagged" : `${flagged} flagged`
        }`;

  return (
    <Link href={`/product/${product.id}`} asChild>
      <Pressable
        style={{
          flexDirection: "row",
          marginHorizontal: 16,
          marginBottom: last ? 0 : 10,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: LINE,
          backgroundColor: SURFACE,
          // Clips the leading bar to the card's corners, so the colour ends
          // where the card does rather than squaring off against it.
          overflow: "hidden",
        }}
        className="active:opacity-70"
      >
        {/* The verdict at a glance. Full-bleed down the leading edge — the one
            element allowed to touch the card's edges. */}
        <View style={{ width: 4, alignSelf: "stretch", backgroundColor: verdict.solid }} />

        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 13,
            paddingVertical: 14,
            paddingLeft: 13,
            paddingRight: 14,
          }}
        >
          <ProductThumbnail product={product} size={46} radius={12} />

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "600",
                textTransform: "uppercase",
                letterSpacing: 0.7,
                color: MUTED_FAINT,
              }}
            >
              {product.brand}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 13.5, fontWeight: "500", lineHeight: 18, color: INK }}>
              {product.name}
            </Text>
            <Text style={{ marginTop: 2, fontSize: 10.5, color: flagged > 0 ? WARN : MUTED }}>
              {meta}
            </Text>
          </View>

          {/* No score means no profile to score against — the row still lists,
              it just doesn't pretend to rank. */}
          {tone && match.score !== null ? (
            <View style={{ alignItems: "center", gap: 6, width: 92 }}>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: verdict.tint,
                }}
              >
                <Text
                  style={{ fontSize: 11, fontWeight: "600", color: verdict.deep }}
                  numberOfLines={1}
                >
                  {verdict.label}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "600", color: INK }}>{match.score}</Text>
                <Text style={{ fontSize: 10.5, fontWeight: "500", color: MUTED_FAINT }}>/100</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}
