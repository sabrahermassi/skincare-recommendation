import { Ionicons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip } from "@/components/Chip";
import { LogoMark } from "@/components/LogoMark";
import { ProductRow } from "@/components/ProductRow";
import { Text } from "@/components/Text";
import { fetchProducts } from "@/data/api";
import type { ProductType, ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { matchProduct } from "@/lib/matching";
import { isPersonalized, profileSummary } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

const FACE_TYPE_FILTERS: (ProductType | "all")[] = [
  "all",
  "serum",
  "ampoule",
  "moisturizer",
  "sunscreen",
  "cleanser",
];

const BODY_TYPE_FILTERS: (ProductType | "all")[] = [
  "all",
  "body-wash",
  "body-lotion",
  "hand-cream",
];

// Tiles use three of the four product tints. The label and icon are always
// ink — the tint distinguishes the tiles, it doesn't have to carry the text.
const QUICK_ACTIONS = [
  { href: "/scan" as const, label: "Scan", icon: "camera" as const, bg: "bg-tint-pink" },
  { href: "/saved" as const, label: "Saved", icon: "heart" as const, bg: "bg-tint-mint" },
  { href: "/profile" as const, label: "My profile", icon: "person" as const, bg: "bg-tint-peach" },
];

export default function Browse() {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<ProductWithIngredients[] | null>(null);
  const [typeFilter, setTypeFilter] = useState<ProductType | "all">("all");
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const profile = useAppStore((s) => s.profile);
  const compareIds = useAppStore((s) => s.compareIds);

  const area = profile.area ?? undefined;
  const typeFilters = profile.area === "body" ? BODY_TYPE_FILTERS : FACE_TYPE_FILTERS;
  const personalized = isPersonalized(profile);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    fetchProducts({ type: typeFilter, area })
      .then((result) => {
        if (!cancelled) setProducts(result);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("fetchProducts failed:", err);
        setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [typeFilter, area]);

  // The type-filter chip bar is area-specific (face vs body types), so a
  // stale face filter must not linger over the body list after an edit.
  useEffect(() => {
    setTypeFilter("all");
  }, [profile.area]);

  const scored = useMemo(() => {
    if (!products) return null;
    const withScores = products.map((product) => ({
      product,
      match: matchProduct(product, profile),
    }));
    // Sorting by score only makes sense once there's a score to sort by —
    // otherwise it silently reorders the catalogue for no reason.
    if (!personalized) return withScores;
    return [...withScores].sort((a, b) => (b.match.score ?? 0) - (a.match.score ?? 0));
  }, [products, profile, personalized]);

  return (
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerClassName="pb-28" stickyHeaderIndices={[1]}>
        <View className="gap-[18px] px-5 pb-2 pt-3">
          <View className="flex-row items-start justify-between gap-3.5">
            <View className="gap-1">
              <View className="flex-row items-center gap-2.5">
                <LogoMark size={28} />
                <Text className="font-display text-2xl leading-none text-ink">
                  <Text className="text-[28px]">S</Text>kin<Text className="text-[28px]">T</Text>
                  el
                </Text>
              </View>
              <Text className="text-[11.5px] text-ink-muted">
                {personalized
                  ? `Ranked for ${profileSummary(profile).toLowerCase()}`
                  : "No profile yet — showing unsorted results"}
              </Text>
            </View>
            <Pressable onPress={() => router.push("/profile")} hitSlop={8} className="pt-1.5">
              <Text className="text-[11.5px] font-semibold text-accent-text">Edit</Text>
            </Pressable>
          </View>

          <View className="flex-row gap-3">
            {QUICK_ACTIONS.map((action) => (
              <Link key={action.href} href={action.href} asChild>
                <Pressable
                  className={`flex-1 items-center gap-2 rounded-card py-[22px] ${action.bg} active:opacity-80`}
                >
                  <Ionicons name={action.icon} size={22} color={COLORS.ink} />
                  <Text className="text-[11.5px] font-semibold text-ink">{action.label}</Text>
                </Pressable>
              </Link>
            ))}
          </View>
        </View>

        <View className="border-b border-hairline bg-canvas pb-3.5">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 px-5 pt-2"
          >
            {typeFilters.map((type) => (
              <Chip
                key={type}
                label={type === "all" ? "All" : type}
                selected={typeFilter === type}
                onPress={() => setTypeFilter(type)}
              />
            ))}
          </ScrollView>
        </View>

        {!personalized && !bannerDismissed && (
          <View className="mx-5 mt-3 flex-row items-center gap-2 rounded-card bg-tint-lilac px-4 py-3">
            <Pressable onPress={() => router.push("/profile")} className="flex-1">
              <Text className="text-sm font-semibold text-accent-text">
                Answer five quick questions to see how each product suits your skin →
              </Text>
            </Pressable>
            <Pressable onPress={() => setBannerDismissed(true)} hitSlop={8}>
              <Text className="text-sm font-semibold text-accent-text">✕</Text>
            </Pressable>
          </View>
        )}

        {scored === null ? (
          <View className="items-center justify-center py-24">
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : scored.length === 0 ? (
          <Text className="mt-12 text-center text-ink-faint">No products of this type yet.</Text>
        ) : (
          /*
            A list, not a grid. The grid could show a thumbnail and a price;
            this can show why a product ranks where it does, which is the
            question the app exists to answer.
          */
          <View>
            {scored.map(({ product, match }) => (
              <ProductRow key={product.id} product={product} match={match} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Compare tray — only appears once something is selected. */}
      {compareIds.length > 0 && (
        <View className="absolute inset-x-0 bottom-0 border-t border-hairline bg-surface p-4">
          <Link href="/compare" asChild>
            <Pressable className="rounded-control bg-accent py-3.5 active:bg-accent-deep">
              <Text className="text-center text-base font-semibold text-white">
                Compare {compareIds.length} selected
                {compareIds.length === 1 ? " — pick one more" : ""}
              </Text>
            </Pressable>
          </Link>
        </View>
      )}
    </View>
  );
}
