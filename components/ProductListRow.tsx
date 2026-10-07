import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { ProductThumbnail } from "@/components/ProductThumbnail";
import { SaveHeart } from "@/components/SaveHeart";
import { ScorePill } from "@/components/ScorePill";
import { Text } from "@/components/Text";
import type { ProductType } from "@/data/types";
import { SAFETY_NOTICE_COPY } from "@/lib/safety";
import { CARD_RADIUS, INK, MUTED, SPACE, SURFACE, TYPE, LEADING } from "@/lib/tokens";

/** v9 measurements (read off the hand-off). */
const ROW_MIN_HEIGHT = 76;
const BOTTLE = 52;

/**
 * One product in a list (v9) — Saved, History: a stone card with the bottle
 * on it, the name (one line) over the brand or a line of its own, then the
 * heart and the small score ring, in that order. No arrow at the end
 * (owner): the whole card opens the product, and an arrow read as the only
 * place to tap. The card leads to
 * the product; the heart sits outside the link so a tap on it never opens the
 * product, and the ring is a second, silent way into the same
 * link so the whole card still answers a tap. Lists put 12pt between cards.
 */
export function ProductListRow({
  product,
  score,
  href,
  detail,
  heart = true,
  notice = false,
  onUnsave,
  children,
}: {
  product: { id: string; name: string; brand: string; type: ProductType; imageUrl?: string | null; fetchedAt?: string };
  score: number | null;
  /** Where the card leads; the product page by default. */
  href?: Parameters<typeof Link>[0]["href"];
  /** The second line, in place of the brand. */
  detail?: string;
  heart?: boolean;
  /** The EU safety notice applies to this product (#405): a shield beside the score. */
  notice?: boolean;
  /** Replaces the heart's own unsave (Saved: unsave with an Undo). */
  onUnsave?: () => void;
  /** Anything under the second line (a saved product's note). */
  children?: ReactNode;
}) {
  const link = href ?? `/product/${product.id}`;
  return (
    <View style={{ minHeight: ROW_MIN_HEIGHT, flexDirection: "row", alignItems: "center", borderRadius: CARD_RADIUS, backgroundColor: SURFACE }}>
      <Link href={link} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${product.name}, ${detail ?? product.brand}${score !== null ? `, ${score} out of 100` : ""}${notice ? `. ${SAFETY_NOTICE_COPY.shieldLabel}` : ""}`}
          className="active:opacity-70"
          style={{ flex: 1, alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingVertical: SPACE.block, paddingLeft: SPACE.gutter, paddingRight: 4 }}
        >
          <ProductThumbnail product={product} size={BOTTLE} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={2} style={{ fontSize: TYPE.label, fontWeight: "600", lineHeight: LEADING.label, color: INK }}>
              {product.name}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: TYPE.caption, color: MUTED }}>
              {detail ?? product.brand}
            </Text>
            {children}
          </View>
        </Pressable>
      </Link>
      {heart ? (
        // The heart's 44pt target, drawn 36 wide in the row (v9).
        <View style={{ marginHorizontal: -4 }}>
          <SaveHeart productId={product.id} fetchedAt={product.fetchedAt} onUnsave={onUnsave} />
        </View>
      ) : null}
      <Link href={link} asChild>
        <Pressable
          // The card's own link already speaks for it; this is only more of it to tap.
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          className="active:opacity-70"
          style={{ alignSelf: "stretch", flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingLeft: 4, paddingRight: SPACE.gutter }}
        >
          <ScorePill score={score} notice={notice} />
        </Pressable>
      </Link>
    </View>
  );
}
