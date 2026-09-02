import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { MatchBadge } from "@/components/MatchBadge";
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

/** Icons for the mode switcher, paths copied from the Scanner mockup. */
function BarcodeIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24">
      <Rect x={4} y={5} width={1.9} height={14} rx={0.95} fill={color} />
      <Rect x={8.2} y={5} width={1.3} height={14} rx={0.65} fill={color} />
      <Rect x={11.6} y={5} width={2.4} height={14} rx={1.2} fill={color} />
      <Rect x={16.2} y={5} width={1.3} height={14} rx={0.65} fill={color} />
      <Rect x={19.4} y={5} width={1.9} height={14} rx={0.95} fill={color} />
    </Svg>
  );
}

function PhotoIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Rect x={3.8} y={3.8} width={16.4} height={16.4} rx={3} stroke={color} strokeWidth={1.6} />
      <Circle cx={9} cy={9.4} r={1.5} fill={color} />
      <Path
        d="m5 18.4 4.4-4.6 3.2 3.2 2.7-2.1 4 3.5"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function SearchIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.4} stroke={color} strokeWidth={1.8} />
      <Path d="m15.8 15.8 4 4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

const MODES: { label: Mode; Icon: (props: { color: string }) => ReactElement }[] = [
  { label: "Barcode", Icon: BarcodeIcon },
  { label: "Label photo", Icon: PhotoIcon },
  { label: "Search", Icon: SearchIcon },
];

export default function Scan() {
  const insets = useSafeAreaInsets();
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
    // The tab group hides the native header, so this screen pads for the
    // status bar itself.
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerClassName="pb-10">
        {/* Wordmark + eyebrow on the left, the profile chip on the right —
            per the Scanner mockup, replacing the previous two-row layout
            ("Point at a barcode" headline, then a separate small chip row
            below it). The chip's dynamic "Looking it up…" status is dropped
            here since the status card overlaid on the camera below already
            says the same thing while a lookup is in flight — keeping both
            would just repeat it. No avatar image: the mockup's chip has one,
            but this app has no user-photo feature backing it, and adding a
            stock design-tool image would be decoration with nothing real
            behind it. */}
        <View className="flex-row items-start justify-between gap-3.5 px-6 pb-3 pt-3">
          <View className="gap-1.5 pt-0.5">
            <Text className="font-display text-[26px] leading-7 text-ink">Skintel</Text>
            <Text className="text-[8px] font-bold tracking-[2px] text-ink-faint">
              SCAN · ANALYZE · KNOW
            </Text>
          </View>
          <Pressable
            onPress={() => router.push("/onboarding")}
            className="flex-shrink flex-row items-center gap-2 rounded-full bg-tint-lilac py-2 pl-3 pr-2.5"
          >
            <View className="flex-shrink gap-0.5">
              <Text className="text-[7.5px] font-bold tracking-[1.5px] text-ink-muted">
                YOUR SKIN PROFILE
              </Text>
              <Text className="text-[10.5px] leading-[13px] text-ink" numberOfLines={2}>
                {summary || "No profile yet — tap to start"}
              </Text>
            </View>
            <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
              <Path
                d="m9 5 7 7-7 7"
                stroke={COLORS.inkMuted}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>
        </View>

        <View className="mx-6 h-[293px] overflow-hidden rounded-[11px] bg-ink">
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
                <Text className="text-sm font-semibold text-ink">Enable camera</Text>
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
                <Text className="text-sm font-semibold text-ink">Open the camera</Text>
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
                  <Text className="text-sm font-bold text-ink">!</Text>
                )}
              </View>
              <View className="flex-1">
                <Text className="text-[12.5px] font-bold text-ink">
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
                <Text className="text-[11.5px] font-semibold text-ink">
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
                <Text className="text-[11.5px] font-semibold text-canvas">Try another</Text>
              </Pressable>
            </View>
          )}

        </View>

        {/* Mode switcher — moved below the camera card, per the Scanner
            mockup (previously overlaid on the camera itself, white-on-dark).
            Icons are hand-rolled inline SVGs copied from the mockup's own
            paths, the same convention `Viewfinder` above already uses in
            this file — not an icon-library adoption, which stays a Phase 2
            decision. */}
        <View className="mx-6 mt-[18px] flex-row gap-3">
          {MODES.map(({ label, Icon }) => {
            const on = mode === label;
            return (
              <Pressable
                key={label}
                onPress={() => setMode(label)}
                className={`h-[35px] flex-1 flex-row items-center justify-center gap-[7px] rounded-full border ${
                  on ? "border-accent bg-accent" : "border-hairline bg-surface"
                }`}
              >
                <Icon color={on ? COLORS.canvas : COLORS.ink} />
                <Text
                  className={`text-xs font-medium ${on ? "text-canvas" : "text-ink"}`}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Recents history={history} />

        <Pressable onPress={() => router.push("/scan-label")} className="items-center px-5 pt-4">
          <Text className="text-xs text-ink-muted">
            No barcode?{" "}
            <Text className="font-semibold text-ink underline">
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
        style={{ fontWeight: "500", fontSize: 14 }}
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
              <Text className="text-[13px] font-semibold text-canvas" numberOfLines={1}>
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
    fetchProductsByIds(ids)
      .then((found) => {
        if (!cancelled) setProducts(found);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("fetchProductsByIds failed:", err);
        setProducts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [ids]);

  if (products.length === 0) return null;

  const scoreFor = (id: string) => history.find((h) => h.id === id)?.scoreAtView ?? null;

  return (
    <View className="gap-2.5 px-6 pt-6">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[9px] font-semibold uppercase tracking-[1.5px] text-ink-muted">
          Scanned in this store
        </Text>
        <Pressable onPress={() => router.push("/saved")} hitSlop={8}>
          <Text className="text-xs text-accent-text">View all</Text>
        </Pressable>
      </View>
      {/* One bordered card holding every row, with a divider between them —
          per the Scanner mockup's shelf list. Previously each row was its
          own shadowed card in a gapped stack. */}
      <View className="overflow-hidden rounded-card border border-hairline bg-surface">
        {ids.map((id, index) => {
          const product = products.find((p) => p.id === id);
          if (!product) return null;
          const score = scoreFor(id);
          const meta = [product.volume, `${product.ingredients.length} ingredients`]
            .filter(Boolean)
            .join(" · ");
          return (
            <Pressable
              key={id}
              onPress={() => router.push({ pathname: "/result/[id]", params: { id } })}
              className={`flex-row items-center gap-3 px-3.5 py-3 active:opacity-70 ${
                index < ids.length - 1 ? "border-b border-hairline" : ""
              }`}
            >
              <ProductIllustration type={product.type} size={44} />
              <View className="flex-1 gap-0.5">
                <Text
                  className="text-[9px] font-bold uppercase tracking-[1px] text-ink-muted"
                  numberOfLines={1}
                >
                  {product.brand}
                </Text>
                <Text className="text-[13px] font-semibold text-ink" numberOfLines={1}>
                  {product.name}
                </Text>
                {meta ? (
                  <Text className="text-[10.5px] text-ink-faint" numberOfLines={1}>
                    {meta}
                  </Text>
                ) : null}
              </View>
              <MatchBadge score={score} />
              <Text className="text-[13px] text-ink-faint">›</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
