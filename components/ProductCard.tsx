import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Text } from "@/components/Text";
import Animated, { FadeInUp } from "react-native-reanimated";

import type { ProductWithIngredients } from "@/data/types";
import { formatKRW } from "@/lib/format";
import type { MatchResult } from "@/lib/matching";
import { useAppStore } from "@/store/useAppStore";
import { MatchBadge } from "./MatchBadge";
import { ProductIllustration } from "./ProductIllustration";

type Props = {
  product: ProductWithIngredients;
  match: MatchResult;
  /** Position in the grid, for a capped stagger on the entrance animation. */
  index?: number;
};

const ENTER_MS = 280;
const STAGGER_MS = 40;
const MAX_STAGGERED_ITEMS = 8;

export function ProductCard({ product, match, index = 0 }: Props) {
  const compareIds = useAppStore((s) => s.compareIds);
  const toggleCompare = useAppStore((s) => s.toggleCompare);
  const inCompare = compareIds.includes(product.id);
  const contraindicated = match.warnings.length > 0;

  // Hover only ever fires on web — RN Pressable's hover handlers are simply
  // never called by a touch, so this needs no Platform.OS branching.
  const [hovered, setHovered] = useState(false);

  return (
    <Animated.View
      entering={FadeInUp.delay(
        Math.min(index, MAX_STAGGERED_ITEMS) * STAGGER_MS,
      ).duration(ENTER_MS)}
    >
      <Link href={`/product/${product.id}`} asChild>
        <Pressable onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)}>
          <View className="relative">
            {product.imageUrl ? (
              <Image
                source={{ uri: product.imageUrl }}
                style={{ width: "100%", aspectRatio: 1, borderRadius: 14 }}
                contentFit="contain"
                transition={150}
                accessibilityLabel={`${product.brand} ${product.name}`}
              />
            ) : (
              <ProductIllustration type={product.type} />
            )}

            <View className="absolute right-2 top-2">
              <MatchBadge score={match.score} />
            </View>

            {contraindicated && (
              <View className="absolute left-2 top-2 h-6 w-6 items-center justify-center rounded-full bg-status-avoid">
                <Text className="text-xs font-bold text-white">!</Text>
              </View>
            )}

            {/*
              Web-only reveal. Guarded on `benefits.length` because real
              sources return a formula and a label, not marketing copy — only
              the curated entries have bullets, and an empty black overlay on
              hover reads as a rendering bug.
            */}
            {hovered && product.benefits.length > 0 && (
              <View className="absolute inset-0 items-center justify-center gap-1.5 rounded-card bg-ink/85 p-4">
                {product.benefits.map((benefit) => (
                  <Text
                    key={benefit}
                    className="text-center text-xs font-medium text-white"
                    numberOfLines={2}
                  >
                    {benefit}
                  </Text>
                ))}
              </View>
            )}
          </View>

          {/* Floats up over the image's bottom edge, like a caption card laid on top of the photo. */}
          <View className="-mt-5 rounded-card bg-surface p-3 shadow-md active:bg-canvas">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {product.brand}
            </Text>
            <Text className="mt-0.5 text-sm font-semibold leading-5 text-ink" numberOfLines={2}>
              {product.name}
            </Text>

            <View className="mt-1.5 flex-row items-center gap-2">
              <Text className="text-sm font-semibold tabular-nums text-ink">
                {formatKRW(product.price)}
              </Text>
              {!product.inStock && (
                <Text className="text-[11px] font-semibold text-status-avoid">
                  Out of stock
                </Text>
              )}
            </View>

            {/* Always-visible on touch — the one-line answer to "what does this do". */}
            <Text
              className={`mt-1.5 text-xs ${
                contraindicated ? "font-semibold text-status-avoid" : "text-ink-muted"
              }`}
              numberOfLines={1}
            >
              {contraindicated
                ? "Not ideal for your profile"
                : (product.benefits[0] ?? product.description ?? "")}
            </Text>
          </View>
        </Pressable>
      </Link>

      <Pressable
        onPress={() => toggleCompare(product.id)}
        className={`mt-2 rounded-control py-2 ${
          inCompare
            ? "bg-accent active:bg-accent-deep"
            : "border border-hairline active:bg-canvas"
        }`}
      >
        <Text
          className={`text-center text-xs font-semibold ${
            inCompare ? "text-white" : "text-accent-text"
          }`}
        >
          {inCompare ? "✓ In compare" : "Add to compare"}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
