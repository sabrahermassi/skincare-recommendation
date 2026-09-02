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

import { ProductRow } from "@/components/ProductRow";
import { AppHeader, HEADER_GUTTER, ProfilePill } from "@/components/AppHeader";
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
        <AppHeader right={<ProfilePill summary={summary} />} />

        {/* Height inline: an absolutely-positioned CameraView contributes no
            height of its own, so if this card's height is ever dropped the
            whole scanner collapses to nothing and reads as "the barcode reader
            is gone". */}
        <View
          style={{ height: 293, marginHorizontal: 26 }}
          className="overflow-hidden rounded-control bg-[#17161B]"
        >
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

          {/*
            Three reasons the frame can be dark, and it has to say which:
            permission not asked for yet, permission refused, or the browser
            (where SDK 54's expo-camera is QR-only — issue #11). A silent black
            rectangle reads as "the scanner is gone".
          */}
          {mode === "Barcode" && !permission?.granted && (
            <View className="flex-1 items-center justify-center gap-4 px-8">
              <Text
                style={{ color: "rgba(250,247,243,0.8)" }}
                className="text-center text-sm leading-5"
              >
                {permission?.canAskAgain === false
                  ? "Camera access is blocked. Turn it back on for this app in your device settings, then come back."
                  : "We need the camera to read barcodes. Nothing leaves your phone except the barcode number."}
              </Text>
              {permission?.canAskAgain === false ? null : (
                <Pressable
                  onPress={requestPermission}
                  style={{ height: 44 }}
                  className="items-center justify-center rounded-full bg-canvas px-6 active:opacity-80"
                >
                  <Text className="text-sm font-semibold text-ink">Enable camera</Text>
                </Pressable>
              )}
              <Text
                style={{ color: "rgba(250,247,243,0.5)" }}
                className="text-center text-xs leading-4"
              >
                {IS_WEB
                  ? "In a browser only QR codes can be read. Scan a barcode from the phone app, or use Search."
                  : "Or switch to Label photo or Search above."}
              </Text>
            </View>
          )}

          {mode === "Barcode" && permission?.granted && status.kind === "idle" && (
            <View className="absolute inset-0" pointerEvents="none">
              <Viewfinder />
            </View>
          )}

          {mode === "Search" && <SearchPane />}

          {mode === "Label photo" && (
            <View
              style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 30 }}
            >
              {/* A drawn label with an ingredient list on it — the mode was a
                  paragraph and a button in an otherwise empty black box, which
                  reads as a screen that failed to load rather than a choice. */}
              <Svg width={78} height={92} viewBox="0 0 78 92" fill="none">
                <Rect
                  x={9}
                  y={5}
                  width={60}
                  height={82}
                  rx={9}
                  stroke="#FDFCFA"
                  strokeOpacity={0.55}
                  strokeWidth={2}
                />
                <Path
                  d="M21 24h36M21 36h36M21 48h26M21 60h32M21 72h20"
                  stroke="#FDFCFA"
                  strokeOpacity={0.35}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                <Circle cx={58} cy={70} r={15} fill="#17161B" />
                <Circle cx={56} cy={68} r={9.5} stroke={COLORS.toneGood} strokeWidth={2.6} />
                <Path
                  d="m63 75 6.5 6.5"
                  stroke={COLORS.toneGood}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                />
              </Svg>

              <Text
                style={{ color: "rgba(250,247,243,0.8)" }}
                className="text-center text-sm leading-5"
              >
                Photograph the ingredient list on the back and we&apos;ll read it.
                Works on anything, even products we&apos;ve never seen.
              </Text>
              <Pressable
                onPress={() => router.push("/scan-label")}
                style={{ height: 44 }}
                className="items-center justify-center rounded-full bg-canvas px-6 active:opacity-80"
              >
                <Text className="text-sm font-semibold text-ink">Open the camera</Text>
              </Pressable>
            </View>
          )}

          {/* Status card over the viewfinder, as in the design. */}
          {status.kind !== "idle" && (
            <View
              style={{
                position: "absolute",
                left: 20,
                right: 20,
                bottom: 66,
                gap: 12,
                borderRadius: 18,
                backgroundColor: "rgba(250,247,243,0.95)",
              }}
              className="flex-row items-center px-4 py-3"
            >
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
            <View style={{ position: "absolute", left: 20, right: 20, bottom: 20, gap: 8 }} className="flex-row">
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
                style={{ backgroundColor: "rgba(250,247,243,0.2)" }}
                className="flex-1 items-center rounded-full py-2.5"
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
        <View style={{ marginHorizontal: 26, marginTop: 18, gap: 12 }} className="flex-row">
          {MODES.map(({ label, Icon }) => {
            const on = mode === label;
            return (
              <Pressable
                key={label}
                onPress={() => setMode(label)}
                style={{ height: 44 }}
                className={`flex-1 flex-row items-center justify-center gap-[7px] rounded-full border ${
                  on ? "border-accent bg-accent" : "border-hairline bg-surface"
                }`}
              >
                <Icon color={on ? COLORS.canvas : COLORS.ink} />
                <Text
                  className={`text-[14.5px] font-semibold ${on ? "text-canvas" : "text-ink"}`}
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

/**
 * Corner brackets and a scan line — the design's framing affordance, at its
 * own measurements: 32pt brackets in 3pt of #FDFCFA, inset 33 from each side,
 * 29 from the top and 71 from the bottom of the 293pt card. It used to be a
 * fixed 236×150 box floated in the middle, which put the frame in a different
 * place on every screen width.
 */
function Viewfinder() {
  const corner = "absolute h-8 w-8 border-[#FDFCFA]";
  return (
    <View style={{ position: "absolute", top: 29, bottom: 71, left: 33, right: 33 }}>
      <View className={`${corner} left-0 top-0 rounded-tl-lg border-l-[3px] border-t-[3px]`} />
      <View className={`${corner} right-0 top-0 rounded-tr-lg border-r-[3px] border-t-[3px]`} />
      <View className={`${corner} bottom-0 left-0 rounded-bl-lg border-b-[3px] border-l-[3px]`} />
      <View className={`${corner} bottom-0 right-0 rounded-br-lg border-b-[3px] border-r-[3px]`} />
      <View className="absolute inset-x-3 top-1/2 h-0.5 rounded-full bg-tone-good" />

      {/* The instruction the design sets inside the frame. Without it the
          viewfinder is four brackets over a black rectangle and says nothing
          about what to point it at. */}
      <View style={{ position: "absolute", left: 0, right: 0, top: 67 }} className="items-center">
        <Text style={{ maxWidth: 200, fontSize: 14, lineHeight: 21 }}
          className="text-center text-[#FDFCFA]/90">
          Position barcode or ingredient list in the frame
        </Text>
      </View>
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
        className="rounded-full px-4 py-3 text-canvas"
        style={{ fontWeight: "500", fontSize: 14, backgroundColor: "rgba(250,247,243,0.14)" }}
      />
      <ScrollView className="mt-3" keyboardShouldPersistTaps="handled">
        {searching && <ActivityIndicator color={COLORS.canvas} className="mt-4" />}

        {/* An empty search pane looked broken. It now says what it searches
            and when it will start, so the blankness is expected rather than a
            failure. */}
        {!searching && query.trim().length < 2 && (
          <View style={{ alignItems: "center", gap: 8, paddingTop: 26, paddingHorizontal: 12 }}>
            <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
              <Circle
                cx={10.6}
                cy={10.6}
                r={6.9}
                stroke={COLORS.canvas}
                strokeOpacity={0.4}
                strokeWidth={1.9}
              />
              <Path
                d="m15.6 15.6 4.4 4.4"
                stroke={COLORS.canvas}
                strokeOpacity={0.4}
                strokeWidth={1.9}
                strokeLinecap="round"
              />
            </Svg>
            <Text
              style={{ color: "rgba(250,247,243,0.6)", lineHeight: 17 }}
              className="text-center text-xs"
            >
              Search the catalogue by product or brand — type two letters to
              start. Use this when a barcode won&apos;t scan.
            </Text>
          </View>
        )}

        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <Text style={{ color: "rgba(250,247,243,0.6)" }} className="mt-4 text-center text-xs">
            Nothing matched. Try the barcode, or photograph the label.
          </Text>
        )}
        {results.map((product) => (
          <Pressable
            key={product.id}
            onPress={() => router.push({ pathname: "/result/[id]", params: { id: product.id } })}
            style={{ borderBottomColor: "rgba(250,247,243,0.1)" }}
            className="flex-row items-center gap-3 border-b py-3"
          >
            <View className="flex-1">
              <Text className="text-[13px] font-semibold text-canvas" numberOfLines={1}>
                {product.name}
              </Text>
              <Text style={{ color: "rgba(250,247,243,0.6)", fontSize: 11 }}>{product.brand}</Text>
            </View>
            <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
              <Path
                d="m9 5 7 7-7 7"
                stroke={COLORS.canvas}
                strokeOpacity={0.4}
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
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
function Recents({ history }: { history: { id: string; known: boolean }[] }) {
  const profile = useAppStore((s) => s.profile);
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

  // Nothing scanned yet in this session — the space below the mode switcher
  // used to sit empty until the first scan, which read as an unfinished
  // screen. A short explainer fills it instead, and this is the only branch
  // where it shows: the moment `ids` is non-empty it's replaced by the real
  // rows below, never both at once.
  if (ids.length === 0) return <FirstScanTip />;
  if (products.length === 0) return null;

  return (
    <View style={{ gap: 10, paddingHorizontal: HEADER_GUTTER, paddingTop: 26 }}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-[9px] font-semibold uppercase tracking-[1.53px] text-[#565060]">
          Scanned in this store
        </Text>
        <Pressable onPress={() => router.push("/saved")} hitSlop={8}>
          <Text className="text-xs text-accent-text">View all</Text>
        </Pressable>
      </View>

      {/*
        The same row the browse list uses, scored the same way and opening the
        same screen. It was a bespoke row here — its own tile, its own type
        scale, its own badge treatment — so the products you had just scanned
        looked like a different kind of thing from the products you browsed.

        Live scores rather than the scan-time snapshot: these are things on the
        shelf in front of you. The snapshot rule still holds where it means
        something, on the History tab, which is a log of what you saw and when.
      */}
      <View className="overflow-hidden rounded-control border border-hairline bg-surface">
        {ids.map((id, index) => {
          const product = products.find((p) => p.id === id);
          if (!product) return null;
          return (
            <ProductRow
              key={id}
              product={product}
              match={matchProduct(product, profile)}
              last={index === ids.length - 1}
            />
          );
        })}
      </View>
    </View>
  );
}

/**
 * First-run filler for the "Scanned in this store" slot, shown until there's
 * a real scan to put there. Same eyebrow label position as `Recents` so the
 * swap between the two doesn't shift anything else on the screen.
 */
const FIRST_SCAN_STEPS = [
  { n: "1", text: "Point the camera at a barcode, or photograph the ingredient list." },
  { n: "2", text: "We read the formula and check it against your skin profile." },
  { n: "3", text: "See your match score and anything flagged, right here as you shop." },
];

function FirstScanTip() {
  return (
    <View style={{ gap: 14, paddingHorizontal: HEADER_GUTTER, paddingTop: 26 }}>
      <Text className="text-[9px] font-semibold uppercase tracking-[1.53px] text-[#565060]">
        How scanning works
      </Text>
      <View style={{ gap: 12 }}>
        {FIRST_SCAN_STEPS.map((step) => (
          <View key={step.n} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
            <View
              style={{ width: 22, height: 22, borderRadius: 11 }}
              className="items-center justify-center bg-tint-lilac"
            >
              <Text className="text-[11px] font-bold text-accent-text">{step.n}</Text>
            </View>
            <Text className="flex-1 text-[12.5px] leading-[18px] text-ink-muted">
              {step.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
