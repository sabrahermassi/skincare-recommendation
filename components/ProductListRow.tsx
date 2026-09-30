import { Link } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";

import { RowChevron } from "@/components/MenuRows";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { SaveHeart } from "@/components/SaveHeart";
import { ScorePill } from "@/components/ScorePill";
import { Text } from "@/components/Text";
import type { ProductType } from "@/data/types";
import { CARD_RADIUS, INK, MUTED_FAINT, SURFACE, TYPE } from "@/lib/tokens";

/** v7 measurements (read off the hand-off). */
const ROW_MIN_HEIGHT = 76;
const BOTTLE = 52;

/**
 * One product in a list (v7) — Search, Saved, History, the finder's results:
 * its own white card, the bottle on it, the name over the brand (or a line
 * of its own), the small score ring, and the plain heart. The card is a link
 * to the product; the heart sits beside it so a tap on it never opens the
 * product. Lists put 12pt between cards.
 */
export function ProductListRow({
  product,
  score,
  href,
  detail,
  chevron = false,
  heart = true,
  onUnsave,
  children,
}: {
  product: { id: string; name: string; brand: string; type: ProductType; imageUrl?: string | null; fetchedAt?: string };
  score: number | null;
  /** Where the card leads; the product page by default. */
  href?: Parameters<typeof Link>[0]["href"];
  /** The second line, in place of the brand. */
  detail?: string;
  /** A grey chevron at the end (the finder's results). */
  chevron?: boolean;
  heart?: boolean;
  /** Asks before the heart unsaves it (Saved, for a product with a note). */
  onUnsave?: () => void;
  /** Anything under the second line (History's "checked 3 times"). */
  children?: ReactNode;
}) {
  return (
    <View style={{ minHeight: ROW_MIN_HEIGHT, flexDirection: "row", alignItems: "center", borderRadius: CARD_RADIUS, backgroundColor: SURFACE }}>
      <Link href={href ?? `/product/${product.id}`} asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${product.name}, ${detail ?? product.brand}${score !== null ? `, ${score} out of 100` : ""}`}
          className="active:opacity-70"
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 16, paddingRight: heart ? 4 : 16 }}
        >
          <ProductThumbnail product={product} size={BOTTLE} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={2} style={{ fontSize: TYPE.label, fontWeight: "600", lineHeight: 19, color: INK }}>
              {product.name}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>
              {detail ?? product.brand}
            </Text>
            {children}
          </View>
          <ScorePill score={score} />
          {chevron && !heart ? <RowChevron /> : null}
        </Pressable>
      </Link>
      {heart ? (
        <View style={{ paddingRight: 8, flexDirection: "row", alignItems: "center" }}>
          <SaveHeart productId={product.id} fetchedAt={product.fetchedAt} onUnsave={onUnsave} />
          {chevron ? <RowChevron /> : null}
        </View>
      ) : null}
    </View>
  );
}
