import { Link } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProductThumbnail } from "@/components/ProductThumbnail";
import { Text } from "@/components/Text";
import { fetchProductsByIds } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { relativeTime } from "@/lib/format";
import { matchProduct, matchTone } from "@/lib/matching";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_FAINT, RADIUS_SELECTOR, SELECTED, SURFACE, VERDICT, VERDICT_NEUTRAL, WARN } from "@/lib/tokens";
import { useAppStore, type HistoryEntry } from "@/store/useAppStore";

type Tab = "saved" | "history";

/**
 * The shelf and the log, on one screen.
 *
 * They look similar but obey different rules, and the difference is the point:
 * saved rows are re-scored live against the current profile, because a shelf
 * should say what you think today. History rows show the score as it stood
 * when you looked - a log that rewrites its own past entries is worse than no
 * log.
 *
 * That distinction survives the verdict colours: a saved row carries both the
 * leading bar and the badge, a history row carries only the bar, tinted by the
 * score it had at the time. The bar is a colour, not a claim about now.
 */
export default function Saved() {
  const insets = useSafeAreaInsets();
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
  const [error, setError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(false);
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
        setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [idsToResolve, retryKey]);

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <View style={{ backgroundColor: CANVAS, paddingHorizontal: 20, paddingTop: insets.top + 10, paddingBottom: 10 }}>
        <Text style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: INK }}>
          Saved
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 14 }}>
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

      {error ? (
        <View style={{ alignItems: "center", gap: 12, paddingHorizontal: 40, paddingTop: 96 }}>
          <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>
            Couldn&apos;t load your saved products. Check your connection and try again.
          </Text>
          <Pressable onPress={() => setRetryKey((k) => k + 1)}>
            <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
              Try again
            </Text>
          </Pressable>
        </View>
      ) : byId === null ? (
        <View style={{ alignItems: "center", justifyContent: "center", paddingVertical: 96 }}>
          <ActivityIndicator color={INK} />
        </View>
      ) : tab === "saved" ? (
        savedIds.length === 0 ? (
          <EmptyState
            title="Nothing saved yet"
            body="Tap Save on any product and it will wait for you here - including next time you open the app."
          />
        ) : (
          <ScrollView contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32 }}>
            {savedIds.map((id) => {
              const product = byId[id];
              if (!product) return null;
              const { score } = matchProduct(product, profile);
              const tone = score === null ? null : matchTone(score);
              const verdict = tone ? VERDICT[tone] : VERDICT_NEUTRAL;
              return (
                <Row key={id} product={product} bar={verdict.solid}>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, paddingTop: 7 }}>
                    {tone && score !== null ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 5,
                          borderRadius: 999,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          backgroundColor: verdict.tint,
                        }}
                      >
                        <Text style={{ fontSize: 11.5, fontWeight: "700", color: verdict.deep }}>
                          {score}%
                        </Text>
                        <Text style={{ fontSize: 11, fontWeight: "600", color: verdict.deep }}>
                          · {verdict.label}
                        </Text>
                      </View>
                    ) : (
                      <View />
                    )}
                    <Pressable onPress={() => toggleSaved(id)} hitSlop={8}>
                      <Text style={{ fontSize: 11.5, fontWeight: "600", color: INK }}>Remove</Text>
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
        <ScrollView contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 32 }}>
          {history.map((entry) => {
            const product = entry.known ? byId[entry.id] : undefined;
            // The bar reflects the score this entry carried when it was
            // logged, not a fresh one - re-scoring the log is exactly what
            // this screen refuses to do.
            const snapshotTone = entry.scoreAtView === null ? null : matchTone(entry.scoreAtView);
            const bar = snapshotTone ? VERDICT[snapshotTone].solid : VERDICT_NEUTRAL.solid;
            return product ? (
              <Row key={entry.id} product={product} bar={bar}>
                <HistoryMeta entry={entry} action />
              </Row>
            ) : (
              <UnknownRow key={entry.id} entry={entry} bar={bar} />
            );
          })}

          <Pressable onPress={clearHistory} style={{ alignItems: "center", paddingVertical: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: INK, textDecorationLine: "underline" }}>
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
      // 48pt inline. It was padding-derived, which put it at roughly 34 -
      // shorter than everything else on the screen and the first thing you
      // touch on it.
      style={{
        flex: 1,
        height: 48,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: RADIUS_SELECTOR,
        borderWidth: active ? 1.5 : 1,
        borderColor: active ? INK : BORDER_INACTIVE,
        backgroundColor: active ? SELECTED : CANVAS,
      }}
    >
      <Text style={{ fontSize: 13.5, fontWeight: "600", color: active ? INK : MUTED }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A white card with the verdict down its leading edge — same object as a
 *  browse row (`components/ProductRow.tsx`), laid out for a taller shelf card. */
function Row({
  product,
  bar,
  children,
}: {
  product: ProductWithIngredients;
  bar: string;
  children: ReactNode;
}) {
  return (
    <Link href={`/product/${product.id}`} asChild>
      <Pressable
        style={{
          flexDirection: "row",
          borderRadius: 16,
          borderWidth: 1,
          borderColor: BORDER_INACTIVE,
          backgroundColor: SURFACE,
          overflow: "hidden",
        }}
        className="active:opacity-70"
      >
        <View style={{ width: 4, alignSelf: "stretch", backgroundColor: bar }} />
        <View style={{ flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 13, padding: 13 }}>
          <ProductThumbnail product={product} size={56} radius={14} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 9.5, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.7, color: MUTED_FAINT }}>
              {product.brand}
            </Text>
            <Text
              style={{ marginTop: 2, fontFamily: "PlayfairDisplay_500Medium", fontSize: 15, lineHeight: 19, color: INK }}
              numberOfLines={2}
            >
              {product.name}
            </Text>
            {children}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

/**
 * The snapshot verdict, set deliberately quieter than the saved badge so it
 * never reads as the product's current score.
 */
function HistoryMeta({ entry, action = false }: { entry: HistoryEntry; action?: boolean }) {
  return (
    <View style={{ marginTop: 6, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
      <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
        <Text style={{ fontSize: 11.5, color: MUTED }}>{relativeTime(entry.lastSeenAt)}</Text>
        {entry.seenCount > 1 && (
          <Text style={{ fontSize: 11.5, color: MUTED_FAINT }}>
            · checked {entry.seenCount} times
          </Text>
        )}
        {entry.scoreAtView !== null && (
          <Text style={{ fontSize: 11.5, color: MUTED_FAINT }}>
            · {entry.scoreAtView}% then
          </Text>
        )}
        {entry.warningsAtView > 0 && (
          <Text style={{ fontSize: 11.5, fontWeight: "600", color: WARN }}>
            · {entry.warningsAtView} flagged
          </Text>
        )}
      </View>
      {/* The row is already a link; this is the affordance that says so, and
          the design puts one on every history row. */}
      {action ? (
        <Text style={{ fontSize: 11.5, fontWeight: "600", color: INK }}>View</Text>
      ) : null}
    </View>
  );
}

/** A barcode that resolved to nothing - still worth logging as "already checked". */
function UnknownRow({ entry, bar }: { entry: HistoryEntry; bar: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        borderRadius: 16,
        borderWidth: 1,
        borderColor: BORDER_INACTIVE,
        backgroundColor: SURFACE,
        overflow: "hidden",
      }}
    >
      <View style={{ width: 4, alignSelf: "stretch", backgroundColor: bar }} />
      <View style={{ flex: 1, padding: 13 }}>
        <Text style={{ fontSize: 9.5, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.7, color: MUTED_FAINT }}>
          Scanned · not in our catalogue
        </Text>
        <Text style={{ marginTop: 2, fontSize: 14, color: INK }}>{entry.id}</Text>
        <HistoryMeta entry={entry} />
      </View>
    </View>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 40, paddingTop: 96 }}>
      <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: 20, color: INK }}>{title}</Text>
      <Text style={{ textAlign: "center", fontSize: 13, lineHeight: 19, color: MUTED }}>{body}</Text>
    </View>
  );
}
