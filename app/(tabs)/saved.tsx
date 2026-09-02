import { Image } from "expo-image";
import { Link } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";

import { MatchBadge } from "@/components/MatchBadge";
import { ProductIllustration } from "@/components/ProductIllustration";
import { Text } from "@/components/Text";
import { fetchProductsByIds } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { relativeTime } from "@/lib/format";
import { matchProduct } from "@/lib/matching";
import { useAppStore, type HistoryEntry } from "@/store/useAppStore";

type Tab = "saved" | "history";

/**
 * The shelf and the log, on one screen.
 *
 * They look similar but obey different rules, and the difference is the point:
 * saved rows are re-scored live against the current profile, because a shelf
 * should say what you think today. History rows show the score as it stood
 * when you looked — a log that rewrites its own past entries is worse than no
 * log — so their verdict is rendered quietly, never as a live badge.
 */
export default function Saved() {
  const [tab, setTab] = useState<Tab>("saved");

  const profile = useAppStore((s) => s.profile);
  const savedProducts = useAppStore((s) => s.savedProducts);
  const history = useAppStore((s) => s.history);
  const toggleSaved = useAppStore((s) => s.toggleSaved);
  const clearHistory = useAppStore((s) => s.clearHistory);

  // Newest first in both lists. `history` is already ordered by the store.
  const savedIds = useMemo(
    () => [...savedProducts].sort((a, b) => b.savedAt - a.savedAt).map((p) => p.id),
    [savedProducts]
  );
  const knownHistoryIds = useMemo(
    () => history.filter((h) => h.known).map((h) => h.id),
    [history]
  );

  const idsToResolve = useMemo(
    () => [...new Set([...savedIds, ...knownHistoryIds])],
    [savedIds, knownHistoryIds]
  );

  const [byId, setById] = useState<Record<string, ProductWithIngredients> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (idsToResolve.length === 0) {
      setById({});
      return;
    }
    setById(null);
    fetchProductsByIds(idsToResolve)
      .then((products) => {
        if (cancelled) return;
        setById(Object.fromEntries(products.map((p) => [p.id, p])));
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("fetchProductsByIds failed:", err);
        setById({});
      });
    return () => {
      cancelled = true;
    };
  }, [idsToResolve]);

  return (
    <View className="flex-1 bg-canvas">
      <View className="flex-row gap-2 border-b border-hairline bg-surface px-4 pb-3 pt-3">
        <SegmentButton
          label={savedProducts.length ? `Saved (${savedProducts.length})` : "Saved"}
          active={tab === "saved"}
          onPress={() => setTab("saved")}
        />
        <SegmentButton
          label={history.length ? `History (${history.length})` : "History"}
          active={tab === "history"}
          onPress={() => setTab("history")}
        />
      </View>

      {byId === null ? (
        <View className="items-center justify-center py-24">
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : tab === "saved" ? (
        savedIds.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            body="Tap Save on any product and it will wait for you here — including next time you open the app."
          />
        ) : (
          <ScrollView contentContainerClassName="gap-3 p-4 pb-8">
            {savedIds.map((id) => {
              const product = byId[id];
              if (!product) return null;
              const { score } = matchProduct(product, profile);
              return (
                <Row key={id} product={product}>
                  <View className="mt-1.5 flex-row items-center justify-between gap-2">
                    <MatchBadge score={score} />
                    <Pressable onPress={() => toggleSaved(id)} hitSlop={8}>
                      <Text className="text-xs font-sans-semibold text-accent-text">
                        Remove
                      </Text>
                    </Pressable>
                  </View>
                </Row>
              );
            })}
          </ScrollView>
        )
      ) : history.length === 0 ? (
        <EmptyState
          title="No history yet"
          body="Every product you open or scan is logged here automatically, so you can tell at a glance whether you have already checked something."
        />
      ) : (
        <ScrollView contentContainerClassName="gap-3 p-4 pb-8">
          {history.map((entry) => {
            const product = entry.known ? byId[entry.id] : undefined;
            return product ? (
              <Row key={entry.id} product={product}>
                <HistoryMeta entry={entry} />
              </Row>
            ) : (
              <UnknownRow key={entry.id} entry={entry} />
            );
          })}

          <Pressable onPress={clearHistory} className="items-center py-3">
            <Text className="text-sm font-sans-medium text-accent-text underline">
              Clear history
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      className={`flex-1 items-center rounded-control border-2 py-2.5 ${
        active ? "border-accent bg-tint-lilac" : "border-hairline bg-surface"
      }`}
    >
      <Text
        className={`text-sm font-sans-semibold ${active ? "text-accent-text" : "text-ink-muted"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Row({
  product,
  children,
}: {
  product: ProductWithIngredients;
  children: ReactNode;
}) {
  return (
    <Link href={`/product/${product.id}`} asChild>
      <Pressable className="flex-row items-start gap-3 rounded-card bg-surface p-3 shadow-sm active:opacity-80">
        {product.imageUrl ? (
          <Image
            source={{ uri: product.imageUrl }}
            style={{ width: 56, height: 56, borderRadius: 14 }}
            contentFit="contain"
            transition={150}
            accessibilityLabel={`${product.brand} ${product.name}`}
          />
        ) : (
          <ProductIllustration type={product.type} size={56} />
        )}
        <View className="flex-1">
          <Text className="text-[11px] font-sans-semibold uppercase tracking-wide text-ink-faint">
            {product.brand}
          </Text>
          <Text className="font-display text-base leading-5 text-ink" numberOfLines={2}>
            {product.name}
          </Text>
          {children}
        </View>
      </Pressable>
    </Link>
  );
}

/**
 * The snapshot verdict, set deliberately quieter than `MatchBadge` so it never
 * reads as the product's current score.
 */
function HistoryMeta({ entry }: { entry: HistoryEntry }) {
  return (
    <View className="mt-1.5 flex-row flex-wrap items-center gap-x-2 gap-y-1">
      <Text className="text-xs text-ink-muted">{relativeTime(entry.lastSeenAt)}</Text>
      {entry.seenCount > 1 && (
        <Text className="text-xs tabular-nums text-ink-faint">
          · checked {entry.seenCount} times
        </Text>
      )}
      {entry.scoreAtView !== null && (
        <Text className="text-xs tabular-nums text-ink-faint">
          · {entry.scoreAtView}% then
        </Text>
      )}
      {entry.warningsAtView > 0 && (
        <Text className="text-xs font-sans-semibold text-status-watch">
          · {entry.warningsAtView} flagged
        </Text>
      )}
    </View>
  );
}

/** A barcode that resolved to nothing — still worth logging as "already checked". */
function UnknownRow({ entry }: { entry: HistoryEntry }) {
  return (
    <View className="rounded-card border border-hairline bg-surface p-3">
      <Text className="text-[11px] font-sans-semibold uppercase tracking-wide text-ink-faint">
        Scanned · not in our catalogue
      </Text>
      <Text className="mt-0.5 text-sm tabular-nums text-ink">{entry.id}</Text>
      <HistoryMeta entry={entry} />
    </View>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View className="items-center gap-2 px-10 pt-24">
      <Text className="font-display text-xl text-ink">{title}</Text>
      <Text className="text-center text-sm leading-5 text-ink-muted">{body}</Text>
    </View>
  );
}
