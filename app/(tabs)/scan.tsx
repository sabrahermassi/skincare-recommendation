import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";

import { ProductIllustration } from "@/components/ProductIllustration";
import { Text } from "@/components/Text";
import { fetchProductByBarcode, fetchProductsByIds, searchProducts } from "@/data/api";
import type { ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { matchProduct } from "@/lib/matching";
import { profileSummary } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

/**
 * The front door — screen 2a of the Skin Match Scanner design.
 *
 * The app opens here rather than on a product list. The quiz still exists, but
 * it lives behind a chip instead of in front of the scanner, and the chip
 * doubles as proof the quiz registered: you can see what you are being matched
 * against before you scan anything.
 *
 * The camera is a card, not the whole screen. That leaves room for the profile
 * and for what you already scanned in this shop, and it means the permission
 * prompt is not the first thing that happens after five quiz questions.
 */

/**
 * SDK 54's expo-camera decodes only QR codes on web (it uses jsQR). Native
 * iOS/Android handle the full list, including the EAN-13 / UPC-A printed on
 * packaging — which is why Search exists as a mode rather than a nicety.
 */
const IS_WEB = Platform.OS === "web";
const BARCODE_TYPES = IS_WEB
  ? (["qr"] as const)
  : (["ean13", "ean8", "upc_a", "upc_e", "qr", "code128"] as const);

type Mode = "Barcode" | "Label photo" | "Search";
type Status = { kind: "idle" } | { kind: "looking"; code: string } | { kind: "missed"; code: string };

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>(IS_WEB ? "Search" : "Barcode");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const profile = useAppStore((s) => s.profile);
  const history = useAppStore((s) => s.history);
  const recordView = useAppStore((s) => s.recordView);

  const busy = useRef(false);

  useFocusEffect(
    useCallback(() => {
      return () => {
        setStatus({ kind: "idle" });
        busy.current = false;
      };
    }, [])
  );

  const handleBarcode = useCallback(
    async (data: string) => {
      if (busy.current) return;
      busy.current = true;
      setStatus({ kind: "looking", code: data });

      // A miss reads as "not in our catalogue" whether the cascade genuinely
      // found nothing or the lookup itself failed (bad rate limit, a scanned
      // code that isn't actually a product barcode, a transient network
      // error) — the recovery is identical either way: try again, search, or
      // photograph the label. Letting the request throw here would crash the
      // scan screen instead of just showing that state.
      let product: ProductWithIngredients | null = null;
      try {
        product = await fetchProductByBarcode(data);
      } catch (err) {
        console.warn("fetchProductByBarcode failed:", err);
      }

      if (product) {
        const { score, warnings } =
          product.ingredients.length > 0
            ? matchProduct(product, profile)
            : { score: null, warnings: [] };
        recordView({ id: product.id, known: true, score, warnings: warnings.length });
        router.push({ pathname: "/result/[id]", params: { id: product.id } });
        return; // `busy` clears on blur
      }

      recordView({ id: data, known: false, score: null, warnings: 0 });
      setStatus({ kind: "missed", code: data });
      busy.current = false;
    },
    [profile, recordView]
  );

  const summary = profileSummary(profile);
  const live = mode === "Barcode" && status.kind === "idle" && permission?.granted;

  return (
    <View className="flex-1 bg-canvas">
      <ScrollView contentContainerClassName="pb-10">
        <View className="flex-row items-start justify-between px-5 pb-2.5 pt-3">
          <View className="gap-0.5">
            <Text className="font-display text-2xl leading-7 text-ink">Point at a barcode</Text>
            <Text className="text-xs text-ink-muted">
              {status.kind === "looking" ? "Looking it up…" : "Any product, any brand"}
            </Text>
          </View>
        </View>

        {/* The profile chip: the quiz behind a chip, never a gate. */}
        <View className="flex-row items-center gap-2 px-5 pb-3">
          <View className="rounded-full bg-tint-lilac px-3 py-1.5">
            <Text className="text-[11.5px] font-sans-semibold text-ink">
              {summary || "No profile yet"}
            </Text>
          </View>
          <Pressable onPress={() => router.push("/onboarding")} hitSlop={8}>
            <Text className="text-[11.5px] text-ink-faint underline">Retake quiz</Text>
          </Pressable>
        </View>

        <View className="mx-5 h-[392px] overflow-hidden rounded-[28px] bg-ink">
          {live ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
              onBarcodeScanned={({ data }) => {
                void handleBarcode(data);
              }}
            />
          ) : null}

          {mode === "Barcode" && !permission?.granted && (
            <View className="flex-1 items-center justify-center gap-4 px-8">
              <Text className="text-center text-sm leading-5 text-canvas/80">
                We need the camera to read barcodes. Nothing leaves your phone
                except the barcode number.
              </Text>
              <Pressable
                onPress={requestPermission}
                className="rounded-full bg-canvas px-6 py-3 active:opacity-80"
              >
                <Text className="text-sm font-sans-semibold text-ink">Enable camera</Text>
              </Pressable>
            </View>
          )}

          {mode === "Barcode" && permission?.granted && status.kind === "idle" && (
            <View className="flex-1 items-center justify-center" pointerEvents="none">
              <Viewfinder />
            </View>
          )}

          {mode === "Search" && <SearchPane />}

          {mode === "Label photo" && (
            <View className="flex-1 items-center justify-center gap-4 px-8">
              <Text className="text-center text-sm leading-5 text-canvas/80">
                Photograph the ingredient list on the back and we&apos;ll read it.
                Works on anything, even products we&apos;ve never seen.
              </Text>
              <Pressable
                onPress={() => router.push("/scan-label")}
                className="rounded-full bg-canvas px-6 py-3 active:opacity-80"
              >
                <Text className="text-sm font-sans-semibold text-ink">Open the camera</Text>
              </Pressable>
            </View>
          )}

          {/* Status card over the viewfinder, as in the design. */}
          {status.kind !== "idle" && (
            <View className="absolute inset-x-5 bottom-[66px] flex-row items-center gap-3 rounded-[18px] bg-canvas/95 px-4 py-3">
              <View
                className={`h-8 w-8 items-center justify-center rounded-full ${
                  status.kind === "looking" ? "bg-tint-mint" : "bg-tint-pink"
                }`}
              >
                {status.kind === "looking" ? (
                  <ActivityIndicator size="small" color={COLORS.ink} />
                ) : (
                  <Text className="text-sm font-sans-bold text-ink">!</Text>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[12.5px] font-sans-bold text-ink">
                  {status.kind === "looking"
                    ? `Barcode found · ${status.code}`
                    : "Not in our catalogue yet"}
                </Text>
                <Text className="text-[11px] text-ink-muted">
                  {status.kind === "looking"
                    ? "Reading the ingredients…"
                    : "Photograph the label and we'll add it"}
                </Text>
              </View>
            </View>
          )}

          {status.kind === "missed" && (
            <View className="absolute inset-x-5 bottom-[20px] flex-row gap-2">
              <Pressable
                onPress={() => router.push(`/scan-label?barcode=${status.code}`)}
                className="flex-1 items-center rounded-full bg-canvas py-2.5 active:opacity-80"
              >
                <Text className="text-[11.5px] font-sans-semibold text-ink">
                  Photograph the label
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setStatus({ kind: "idle" });
                  busy.current = false;
                }}
                className="flex-1 items-center rounded-full bg-canvas/20 py-2.5"
              >
                <Text className="text-[11.5px] font-sans-semibold text-canvas">Try another</Text>
              </Pressable>
            </View>
          )}

          {status.kind === "idle" && (
            <View className="absolute inset-x-5 bottom-5 flex-row gap-2">
              {(["Barcode", "Label photo", "Search"] as const).map((label) => {
                const on = mode === label;
                return (
                  <Pressable
                    key={label}
                    onPress={() => setMode(label)}
                    className={`flex-1 items-center rounded-full py-2.5 ${
                      on ? "bg-canvas" : "bg-canvas/[0.16]"
                    }`}
                  >
                    <Text
                      className={`text-[11.5px] font-sans-semibold ${on ? "text-ink" : "text-canvas/85"}`}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        <Recents history={history} />

        <Pressable onPress={() => router.push("/scan-label")} className="items-center px-5 pt-4">
          <Text className="text-xs text-ink-muted">
            No barcode?{" "}
            <Text className="font-sans-semibold text-ink underline">
              Photograph the label instead
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/** Corner brackets and a scan line — the design's framing affordance. */
function Viewfinder() {
  const corner = "absolute h-8 w-8 border-canvas";
  return (
    <View style={{ width: 236, height: 150 }}>
      <View className={`${corner} left-0 top-0 rounded-tl-[14px] border-l-2 border-t-2`} />
      <View className={`${corner} right-0 top-0 rounded-tr-[14px] border-r-2 border-t-2`} />
      <View className={`${corner} bottom-0 left-0 rounded-bl-[14px] border-b-2 border-l-2`} />
      <View className={`${corner} bottom-0 right-0 rounded-br-[14px] border-b-2 border-r-2`} />
      <View className="absolute inset-x-3 top-[73px] h-0.5 rounded-full bg-tone-good" />
    </View>
  );
}

/** Search by name — the fallback when there's no barcode or no camera. */
function SearchPane() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductWithIngredients[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    // Debounced: a query per keystroke would hammer the backend for nothing.
    const timer = setTimeout(() => {
      searchProducts(query)
        .then((found) => {
          if (!cancelled) setResults(found);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <View className="flex-1 px-4 pb-[70px] pt-5">
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Product or brand name"
        placeholderTextColor="rgba(253,251,249,0.45)"
        autoCorrect={false}
        className="rounded-full bg-canvas/[0.14] px-4 py-3 text-canvas"
        style={{ fontFamily: "PlusJakartaSans_500Medium", fontSize: 14 }}
      />
      <ScrollView className="mt-3" keyboardShouldPersistTaps="handled">
        {searching && <ActivityIndicator color={COLORS.canvas} className="mt-4" />}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <Text className="mt-4 text-center text-xs text-canvas/60">
            Nothing matched. Try the barcode, or photograph the label.
          </Text>
        )}
        {results.map((product) => (
          <Pressable
            key={product.id}
            onPress={() => router.push({ pathname: "/result/[id]", params: { id: product.id } })}
            className="flex-row items-center gap-3 border-b border-canvas/10 py-3"
          >
            <View className="flex-1">
              <Text className="text-[13px] font-sans-semibold text-canvas" numberOfLines={1}>
                {product.name}
              </Text>
              <Text className="text-[11px] text-canvas/60">{product.brand}</Text>
            </View>
            <Text className="text-canvas/40">›</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * "Scanned in this store" — the shopping-trip memory. Reads the history log
 * the store already keeps, so it costs nothing and answers the most common
 * in-aisle question: have I already looked at this?
 */
function Recents({ history }: { history: { id: string; known: boolean; scoreAtView: number | null }[] }) {
  const ids = useMemo(
    () => history.filter((h) => h.known).slice(0, 3).map((h) => h.id),
    [history]
  );
  const [products, setProducts] = useState<ProductWithIngredients[]>([]);

  useEffect(() => {
    if (ids.length === 0) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    fetchProductsByIds(ids).then((found) => {
      if (!cancelled) setProducts(found);
    });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (products.length === 0) return null;

  const scoreFor = (id: string) => history.find((h) => h.id === id)?.scoreAtView ?? null;

  return (
    <View className="gap-2.5 px-5 pt-5">
      <Text className="text-[11px] font-sans-bold uppercase tracking-[1.1px] text-ink-faint">
        Scanned in this store
      </Text>
      {ids.map((id) => {
        const product = products.find((p) => p.id === id);
        if (!product) return null;
        const score = scoreFor(id);
        return (
          <Pressable
            key={id}
            onPress={() => router.push({ pathname: "/result/[id]", params: { id } })}
            className="flex-row items-center gap-3 rounded-[18px] bg-surface px-3.5 py-2.5 shadow-sm active:opacity-80"
          >
            <ProductIllustration type={product.type} size={38} />
            <View className="flex-1">
              <Text className="text-[13px] font-sans-semibold text-ink" numberOfLines={1}>
                {product.name}
              </Text>
              <Text className="text-[11px] text-ink-muted" numberOfLines={1}>
                {product.brand}
              </Text>
            </View>
            <Text className="text-[15px] font-sans-bold tabular-nums text-ink">
              {score ?? "—"}
            </Text>
            <Text className="text-[15px] text-ink-faint">›</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
