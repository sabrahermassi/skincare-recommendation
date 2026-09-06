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
import { parseIngredientBlock } from "@/lib/inci";
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
 * expo-camera decoded only QR codes on web as of SDK 54 (it used jsQR).
 * Native iOS/Android handle the full list, including the EAN-13 / UPC-A
 * printed on packaging — which is why Search exists as a mode rather than a
 * nicety. Unverified since the SDK 57 upgrade; see CLAUDE.md and issue #11.
 */
const IS_WEB = Platform.OS === "web";
const BARCODE_TYPES = IS_WEB
  ? (["qr"] as const)
  : (["ean13", "ean8", "upc_a", "upc_e", "qr", "code128"] as const);

type Mode = "Barcode" | "Label photo" | "Search" | "Paste list";
type Status = { kind: "idle" } | { kind: "looking"; code: string } | { kind: "missed"; code: string };

/**
 * Icons for the mode switcher, paths copied from the Scanner mockup. The row
 * is icon-only now — no label under Barcode/Label photo/Search — so these
 * are drawn bigger (22pt) than the icon-plus-text version was.
 */
function BarcodeIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x={4} y={5} width={1.9} height={14} rx={0.95} fill={color} />
      <Rect x={8.2} y={5} width={1.3} height={14} rx={0.65} fill={color} />
      <Rect x={11.6} y={5} width={2.4} height={14} rx={1.2} fill={color} />
      <Rect x={16.2} y={5} width={1.3} height={14} rx={0.65} fill={color} />
      <Rect x={19.4} y={5} width={1.9} height={14} rx={0.95} fill={color} />
    </Svg>
  );
}

function PhotoIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
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

function SearchIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={6.4} stroke={color} strokeWidth={1.8} />
      <Path d="m15.8 15.8 4 4" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function PasteIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={5} y={4.5} width={14} height={16} rx={2.6} stroke={color} strokeWidth={1.6} />
      <Rect x={9} y={2.6} width={6} height={3.8} rx={1.3} stroke={color} strokeWidth={1.6} />
      <Path
        d="M8.6 11.5h6.8M8.6 15h4.4"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

const MODES: {
  label: Mode;
  Icon: (props: { color: string; size?: number }) => ReactElement;
}[] = [
  { label: "Barcode", Icon: BarcodeIcon },
  { label: "Label photo", Icon: PhotoIcon },
  { label: "Search", Icon: SearchIcon },
  { label: "Paste list", Icon: PasteIcon },
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

  /*
    Barcode mode is the full screen, per the MVP's scanner spec: live camera
    edge to edge, minimal chrome, automatic detection, no shutter button. The
    other three modes keep the card layout, because a search box and a paste
    field are not camera surfaces and full-bleed black behind them would say
    nothing. Every mode is still reachable from the same switcher.
  */
  if (mode === "Barcode") {
    return (
      <BarcodeStage
        permission={permission}
        requestPermission={requestPermission}
        live={!!live}
        status={status}
        summary={summary}
        onBarcode={handleBarcode}
        onDismissStatus={() => {
          setStatus({ kind: "idle" });
          busy.current = false;
        }}
        modeSwitcher={<ModeSwitcher mode={mode} setMode={setMode} floating />}
      />
    );
  }

  return (
    // The tab group hides the native header, so this screen pads for the
    // status bar itself.
    <View className="flex-1 bg-canvas" style={{ paddingTop: insets.top }}>
      <ScrollView contentContainerClassName="pb-10">
        <AppHeader right={<ProfilePill summary={summary} />} />

        {/* Height inline: the panes below are absolutely positioned or flex to
            fill, so if this card's height is ever dropped the whole surface
            collapses to nothing and reads as "the scanner is gone". */}
        <View
          // Background colour inline, not `bg-[#17161B]`: bracketed arbitrary
          // Tailwind classes are the same class of bug that made Label photo
          // and Search read as empty — the class silently failed to compile,
          // the card fell back to transparent over the light canvas, and
          // every off-white label/placeholder text drawn for a *dark* card
          // vanished into a near-white background instead.
          style={{ height: 293, marginHorizontal: 26, backgroundColor: "#17161B" }}
          className="overflow-hidden rounded-control"
        >
          {mode === "Search" && <SearchPane />}

          {mode === "Paste list" && <PastePane />}

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

        </View>

        <ModeSwitcher mode={mode} setMode={setMode} />

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
 * The mode switcher, in both of its homes.
 *
 * `floating` draws it over the live camera — translucent dark pills, because
 * white cards over a viewfinder hide the thing you are aiming. Otherwise it is
 * the light row under the card, as the Scanner mockup draws it.
 *
 * Icon-only: each mode is named once by the surface it opens (a viewfinder, a
 * camera, a search box), and a text label beside an icon that already says the
 * same thing just crowded a small row.
 */
function ModeSwitcher({
  mode,
  setMode,
  floating = false,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  floating?: boolean;
}) {
  return (
    <View
      style={
        floating
          ? { gap: 10, flexDirection: "row" }
          : { marginHorizontal: 26, marginTop: 18, gap: 12, flexDirection: "row" }
      }
    >
      {MODES.map(({ label, Icon }) => {
        const on = mode === label;
        return (
          <Pressable
            key={label}
            onPress={() => setMode(label)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            style={
              floating
                ? {
                    height: 52,
                    flex: 1,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 26,
                    backgroundColor: on ? "rgba(250,247,243,0.95)" : "rgba(23,22,27,0.55)",
                    borderWidth: 1,
                    borderColor: on ? "transparent" : "rgba(250,247,243,0.3)",
                  }
                : { height: 48 }
            }
            className={
              floating
                ? ""
                : `flex-1 items-center justify-center rounded-full border ${
                    on ? "border-accent bg-tint-lilac" : "border-hairline bg-surface"
                  }`
            }
          >
            <Icon
              color={
                floating
                  ? on
                    ? COLORS.ink
                    : COLORS.canvas
                  : on
                    ? COLORS.accentText
                    : COLORS.ink
              }
            />
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Barcode mode, full screen — the MVP's scanner: live camera edge to edge,
 * automatic detection, no shutter button, no confirmation step.
 *
 * The close control top-left is what the MVP asks for and is not redundant
 * with the tab bar: a full-bleed camera reads as a surface you are *inside*,
 * and it needs a visible way out. It goes to Browse rather than popping,
 * because this is a tab root and there is nothing to pop to.
 */
function BarcodeStage({
  permission,
  requestPermission,
  live,
  status,
  summary,
  onBarcode,
  onDismissStatus,
  modeSwitcher,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  live: boolean;
  status: Status;
  summary: string;
  onBarcode: (data: string) => void;
  onDismissStatus: () => void;
  modeSwitcher: ReactElement;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: "#17161B" }}>
      {live ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={({ data }) => onBarcode(data)}
        />
      ) : null}

      {permission?.granted && status.kind === "idle" && (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Viewfinder />
        </View>
      )}

      {/*
        Three reasons the frame can be dark, and it has to say which:
        permission not asked for yet, permission refused, or the browser (where
        expo-camera was QR-only as of SDK 54, unverified since — issue #11). A
        silent black rectangle reads as "the scanner is gone".
      */}
      {!permission?.granted && (
        <View className="flex-1 items-center justify-center gap-4 px-10">
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
              : "Or switch to Label photo or Search below."}
          </Text>
        </View>
      )}

      {/* Top row: the way out on the left, the profile it matches against on
          the right. Both sit above the camera, padded for the notch. */}
      <View
        style={{
          position: "absolute",
          top: insets.top + 8,
          left: 16,
          right: 16,
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Pressable
          onPress={() => router.push("/browse")}
          accessibilityRole="button"
          accessibilityLabel="Close the scanner"
          hitSlop={10}
          style={{
            height: 44,
            width: 44,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 22,
            backgroundColor: "rgba(23,22,27,0.55)",
          }}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M6 6l12 12M18 6L6 18"
              stroke={COLORS.canvas}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          </Svg>
        </Pressable>

        <ProfilePill summary={summary} />
      </View>

      {/* Status, then the switcher, stacked off the bottom edge. */}
      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: Math.max(20, insets.bottom + 12),
          gap: 12,
        }}
      >
        {status.kind !== "idle" && (
          <View
            style={{
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
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => router.push(`/scan-label?barcode=${status.code}`)}
              className="flex-1 items-center rounded-full bg-canvas py-2.5 active:opacity-80"
            >
              <Text className="text-[11.5px] font-semibold text-ink">
                Photograph the label
              </Text>
            </Pressable>
            <Pressable
              onPress={onDismissStatus}
              style={{ backgroundColor: "rgba(250,247,243,0.2)" }}
              className="flex-1 items-center rounded-full py-2.5"
            >
              <Text className="text-[11.5px] font-semibold text-canvas">Try another</Text>
            </Pressable>
          </View>
        )}

        {/* Drawn on a panel rather than straight onto the viewfinder: this is
            the one place on the stage that takes typed input, and its label
            and field were built for the light canvas. */}
        {status.kind === "missed" && (
          <View className="rounded-card bg-canvas py-2">
            <UnknownProductNote barcode={status.code} />
          </View>
        )}

        {modeSwitcher}
      </View>
    </View>
  );
}

/**
 * A tiny way to say "I know what this is" after a barcode comes back empty.
 *
 * Nothing writes to the catalogue from here — every ingredient and product
 * table only accepts writes from the service role
 * (`supabase/migrations/0001_catalogue.sql`), and there is no endpoint yet
 * that takes a name from a stranger and turns it into a trusted row. What
 * this genuinely does is keep the name on the device, the same way
 * `savedIngredients` does, rather than losing it the moment the camera moves
 * on. The copy says exactly that — "saved on your phone" — instead of
 * implying it reached anyone, which would be the fabricated-promise problem
 * this app avoids everywhere else.
 */
function UnknownProductNote({ barcode }: { barcode: string }) {
  const submitted = useAppStore((s) =>
    s.productSuggestions.some((p) => p.barcode === barcode)
  );
  const submit = useAppStore((s) => s.submitProductSuggestion);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

  if (submitted) {
    return (
      <View style={{ paddingHorizontal: 26, paddingTop: 10 }}>
        <Text className="text-center text-xs text-ink-muted">
          Saved on your phone — thanks for helping fill in what we&apos;re missing.
        </Text>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} className="items-center px-5 pt-2">
        <Text className="text-xs text-ink-muted">
          Know what this is?{" "}
          <Text className="font-semibold text-accent-text underline">
            Tell us its name
          </Text>
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={{ paddingHorizontal: 26, paddingTop: 10, gap: 8 }}>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Brand and product name"
        placeholderTextColor={COLORS.inkFaint}
        autoFocus
        className="rounded-control border border-hairline bg-surface px-4 py-3 text-[13px] text-ink"
      />
      <Pressable
        onPress={() => {
          if (name.trim().length === 0) return;
          submit(barcode, name.trim());
        }}
        disabled={name.trim().length === 0}
        style={{ height: 44, opacity: name.trim().length === 0 ? 0.5 : 1 }}
        className="items-center justify-center rounded-control bg-accent px-6 active:bg-accent-deep"
      >
        <Text className="text-[13.5px] font-semibold text-white">Save the name</Text>
      </Pressable>
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
              Search the catalogue by product or brand - type two letters to
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
 * Paste an ingredient list — the mode that replaces the copy-from-INCIDecoder,
 * paste-into-a-website routine.
 *
 * `parseIngredientBlock` with no dictionary argument is exactly the right tool:
 * it strips a leading "Ingredients:" heading, splits on commas while protecting
 * names like 1,2-Hexanediol, cuts off at directions and legal boilerplate,
 * normalises each entry and dedupes. Pure and synchronous, so the parse costs
 * nothing and needs no network — and because pore-clogging is judged against a
 * table on the device, neither does the answer.
 */
function PastePane() {
  const [text, setText] = useState("");
  const setPastedIngredients = useAppStore((s) => s.setPastedIngredients);

  const parsed = useMemo(() => parseIngredientBlock(text), [text]);
  const ready = parsed.length >= 2;

  function check() {
    if (!ready) return;
    setPastedIngredients(parsed.map((p) => p.inci_name));
    setText("");
    router.push("/check");
  }

  return (
    <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, gap: 10 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Paste the ingredient list here - water, glycerin, niacinamide…"
        placeholderTextColor="rgba(253,251,249,0.45)"
        multiline
        textAlignVertical="top"
        autoCorrect={false}
        autoCapitalize="none"
        className="rounded-control px-3 py-3 text-canvas"
        style={{
          flex: 1,
          fontSize: 13,
          lineHeight: 18,
          backgroundColor: "rgba(250,247,243,0.14)",
        }}
      />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text style={{ color: "rgba(250,247,243,0.6)", flex: 1 }} className="text-[11px]">
          {text.trim().length === 0
            ? "Copy it from anywhere - we read it on your phone."
            : `${parsed.length} ingredient${parsed.length === 1 ? "" : "s"} found`}
        </Text>
        <Pressable
          onPress={check}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel="Check this ingredient list"
          style={{ height: 40, opacity: ready ? 1 : 0.4 }}
          className="items-center justify-center rounded-full bg-canvas px-5 active:opacity-80"
        >
          <Text className="text-[13px] font-semibold text-ink">Check</Text>
        </Pressable>
      </View>
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
