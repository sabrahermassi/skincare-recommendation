import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Linking,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";

import { GenieShell, type GenieShellHandle } from "@/components/GenieShell";
import { LabelCamera } from "@/components/LabelCamera";
import { ScanIntro } from "@/components/ScanIntro";
import { barcodeBox, SCAN_SIDE_INSET, ScanViewfinder, type Box } from "@/components/ScanViewfinder";
import { SHEET_INSET, SHEET_OUTLINE, SHEET_RADIUS } from "@/components/IngredientsSheet";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { CTA_TEXT, TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { canPhotographLabelFor, failureMessage, fetchProductByBarcode, type FetchFailure } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductWithIngredients } from "@/data/types";
import type { Size } from "@/lib/crop-to-guide";
import { matchProduct } from "@/lib/matching";
import { useAppStore } from "@/store/useAppStore";
import { CAMERA_STAGE, CANVAS, FLOATING_SHADOW, INK, MUTED, SURFACE, TOUCH_TARGET, TYPE, VERDICT_LABEL, withAlpha } from "@/lib/tokens";

// Watercolor art from the onboarding set, reused on the two light screens that
// sit in front of the camera (see components/ScanIntro.tsx).
const ONB2_SCAN = require("@/assets/illustrations/onboarding/onb2-scan.png");

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
 * prompt is not the first thing that happens after three quiz questions.
 */

/**
 * One list on every platform, as of SDK 57 (issue #11).
 *
 * This used to narrow web to `["qr"]`, because expo-camera decoded QR codes
 * only in the browser at SDK 54 — it used jsQR. That is no longer true:
 * `expo-camera@57.0.4` uses the browser's own `BarcodeDetector` where it
 * exists and falls back to the `barcode-detector` ponyfill it now depends on,
 * and both handle the EAN-13 / UPC-A printed on packaging. See
 * `node_modules/expo-camera/build/web/WebBarcodeScanner.js`, whose format map
 * covers ean_13, ean_8, upc_a, upc_e and code_128.
 */
const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "qr", "code128"] as const;

// One object for the life of the app. Built inline it was a new value every
// render, and the camera reads a changed setting as a reason to reconfigure.
const BARCODE_SETTINGS = { barcodeTypes: [...BARCODE_TYPES] };

type Mode = "Barcode" | "Photo";
/**
 * `missed` and `unreachable` are deliberately separate.
 *
 * They used to be one state: every non-404 outcome — a timeout, a dead
 * connection, a rate limit — landed in `missed` and the panel said "We don't
 * have this product". So in a shop with one bar of signal the app stated that a
 * product did not exist, logged that to history, and offered "Photograph the
 * ingredients" as the way out — which needs the same network that had just failed.
 * Two failures in a row, on the one interaction this app exists for.
 */
type Status =
  | { kind: "idle" }
  | { kind: "looking"; code: string; target?: Box }
  | { kind: "found"; product: ProductWithIngredients }
  | { kind: "missed"; code: string }
  | { kind: "unreachable"; code: string; failure: FetchFailure };

// The design system (design/DESIGN_SYSTEM.md) — the dark camera stage itself
// stays (it's deliberate chrome, not part of the light onboarding palette,
// and now owned by lib/tokens' CAMERA_STAGE rather than hand-typed at five
// sites), but every light-surface color drawn on top of it moves to this
// system instead of the app's older canvas/ink tokens. Press feedback on the
// peach buttons below stays this screen's existing opacity-based convention
// (`active:opacity-90`, matching every other button already on this stage)
// rather than the onboarding screens' darken-to-CTA_PRESSED technique - this
// file doesn't otherwise do per-button darken states, and introducing one
// convention for two buttons while every other control on the same screen
// uses opacity would be its own inconsistency.

/**
 * Icons for the mode switcher; the barcode bars are copied from the Scanner mockup. The row
 * is icon-only now — no label under Barcode/Ingredients — so these are drawn
 * bigger (22pt) than the icon-plus-text version was.
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

function CameraIcon({ color, size = 22 }: { color: string; size?: number }) {
  return <Ionicons name="camera" size={size} color={color} />;
}

const MODES: {
  label: Mode;
  Icon: (props: { color: string; size?: number }) => ReactElement;
}[] = [
  { label: "Barcode", Icon: BarcodeIcon },
  { label: "Photo", Icon: CameraIcon },
];

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  // Barcode everywhere now. Web used to open on Search because the browser
  // could only decode QR codes, which made a barcode viewfinder a dead end
  // there; SDK 57's detector handles retail formats, so the MVP's "barcode is
  // the default mode" holds on every platform.
  const [mode, setMode] = useState<Mode>("Barcode");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const recordView = useAppStore((s) => s.recordView);
  const dismissQuizAcknowledgement = useAppStore((s) => s.dismissQuizAcknowledgement);

  const busy = useRef(false);
  const shell = useRef<GenieShellHandle>(null);
  const insets = useSafeAreaInsets();
  // One camera and one frame for both modes (see below), so their state lives here.
  const cameraRef = useRef<CameraView>(null);
  const [cameraSize, setCameraSize] = useState<Size | null>(null);
  const [windowBox, setWindowBox] = useState<Box | null>(null);
  const onWindow = useCallback((box: Box) => setWindowBox(box), []);
  // The camera's barcode reading is left on in both modes and this ignores what
  // it reads in Photo mode: turning it on and off is a reconfiguration of the
  // running camera, which showed as a flash when switching to Photo.
  const modeRef = useRef<Mode>("Barcode");
  const statusRef = useRef<Status>({ kind: "idle" });
  useEffect(() => {
    modeRef.current = mode;
    statusRef.current = status;
  }, [mode, status]);
  const onCameraLayout = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setCameraSize({ width, height });
  }, []);

  // Tapping Barcode again after a miss or a failed lookup is how you scan
  // another: it clears the message and the camera comes back. That replaces the
  // "Try another" button the panel used to carry.
  const selectMode = useCallback(
    (next: Mode) => {
      // A found product's card belongs to the barcode it read: switching mode
      // (or tapping Barcode again) puts it away rather than leaving it over the
      // other mode's shutter.
      if (status.kind === "found" || (next === "Barcode" && (status.kind === "missed" || status.kind === "unreachable"))) {
        setStatus({ kind: "idle" });
        busy.current = false;
      }
      setMode(next);
    },
    [status.kind]
  );

  // Only two things are allowed to reset this screen back to Barcode: the X
  // button, and switching to another tab and back. Nothing else — not the
  // keyboard closing, not opening a search result and returning, not
  // cancelling out of the label camera — is "leaving the scanner", and this
  // screen should never guess otherwise. The problem is that React
  // Navigation can't tell those apart on its own: pushing a screen from
  // *within* this tab (a search result, the label-photo modal, the pasted
  // list) blurs this tab's focus exactly the same way switching to a sibling
  // tab does, because both put another screen on top of it. `preserveMode`
  // is how every one of those internal pushes tells this effect "this isn't
  // an exit" — it's called right before each one, and consumed the moment
  // this screen is focused again. Anything that does NOT call it first (a
  // genuine tab switch) resets to Barcode, which is the default this effect
  // falls back to when nothing has told it otherwise.
  const skipResetOnNextFocus = useRef(false);
  const preserveMode = useCallback(() => {
    skipResetOnNextFocus.current = true;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (skipResetOnNextFocus.current) {
        skipResetOnNextFocus.current = false;
      } else {
        setMode("Barcode");
      }
      return () => {
        setStatus({ kind: "idle" });
        busy.current = false;
      };
    }, [])
  );

  // expo-router owns focus state itself as of SDK 56 - it no longer re-exports
  // react-navigation, so this tracks focus the same way the effect above does
  // rather than importing @react-navigation/native directly (that import now
  // fails the bundler outright: "expo-router is no longer compatible with
  // react-navigation").
  const [isFocused, setIsFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const handleBarcode = useCallback(
    async (data: string, target?: Box) => {
      if (busy.current) return;
      busy.current = true;
      // A scan starting is a stronger signal that the quiz banner was seen
      // than any timer would be, and this is the one place every barcode
      // read passes through. See issue #95.
      dismissQuizAcknowledgement();
      setStatus({ kind: "looking", code: data, target });
      // A short tap to say the read landed. Not every device or browser has a
      // motor, and a missing one must never affect the scan.
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // `product-lookup` rejects anything outside 8-14 digits with a 400
      // before it consults a source, but this scanner also decodes qr and
      // code128 — a QR payload or a non-numeric Code 128 read would reach
      // classifyFailure as an ordinary server error and offer a "Try again"
      // that fails the same way every time. Treated as a miss without the
      // doomed round trip, which is the answer the network call would give
      // anyway.
      if (!canPhotographLabelFor(data)) {
        recordView({ id: data, known: false, score: null, warnings: 0 });
        setStatus({ kind: "missed", code: data });
        busy.current = false;
        return;
      }

      const result = await fetchProductByBarcode(data);

      // Could not ask. Not a miss — and crucially not written to history,
      // because an outage-caused "miss" is a false record the user has no way
      // to tell from a real one, and it outlives the outage.
      if (!result.ok) {
        setStatus({ kind: "unreachable", code: data, failure: result.failure });
        busy.current = false;
        return;
      }

      const product = result.value;

      if (product) {
        // Deliberately not recorded here. `/result/[id]` re-exports the
        // product screen, which logs the view once it has loaded — so doing it
        // here too counted one physical scan as two, and the two entries were
        // scored from different evidence: the lookup response omits
        // `ingredients.functions`, the direct fetch behind that screen does
        // not. One owner, and it is the screen that shows the verdict.
        // The product slides up over the camera; its button opens the full
        // result. `busy` stays set until the sheet is closed or left.
        setStatus({ kind: "found", product });
        return;
      }

      recordView({ id: data, known: false, score: null, warnings: 0 });
      setStatus({ kind: "missed", code: data });
      busy.current = false;
    },
    [recordView, dismissQuizAcknowledgement]
  );

  // One camera for both modes. A CameraView per mode meant the camera was torn
  // down and brought up again on every switch — the black flash between Barcode
  // and Photo — so it lives here and the same view just changes what it listens
  // for. Most devices only let one CameraView hold the camera at a time: while
  // another screen is on top (a result, /scan-label) `isFocused` is false and
  // this lets go of it, so that screen's camera is not left waiting for it.
  // Otherwise it stays mounted — a read, a miss or a mode switch never stops and
  // restarts it, which is what showed as a black flash now and then.
  const onScanned = useCallback(
    ({ data, bounds, cornerPoints }: BarcodeScanningResult) => {
      // Only in Barcode mode, and only while nothing is already showing: the
      // camera stays up behind a "not in our catalogue" panel, so it must not
      // read the same code again the moment the panel appears.
      if (modeRef.current !== "Barcode" || statusRef.current.kind !== "idle") return;
      void handleBarcode(data, barcodeBox({ bounds, cornerPoints }));
    },
    [handleBarcode]
  );

  const granted = permission?.granted === true;
  const needsPermission = permission !== null && !permission.granted;
  const scanning = mode === "Photo" || status.kind === "idle" || status.kind === "looking";
  const cameraLive = isFocused && granted;
  const switcherClearance = Math.max(STAGE_BOTTOM, insets.bottom + 12) + SWITCHER_HEIGHT + FRAME_MARGIN_ABOVE_SWITCHER;

  const stage =
    mode === "Barcode" ? (
      <BarcodeStage
        permission={permission}
        requestPermission={requestPermission}
        status={status}
        onBarcode={handleBarcode}
        onAdd={() => selectMode("Photo")}
        preserveMode={preserveMode}
      />
    ) : (
      // Photo is the same full-screen stage as Barcode: the camera is live the
      // moment you switch to it, with a shutter — no step in between.
      <IngredientsStage
        permission={permission}
        requestPermission={requestPermission}
        cameraRef={cameraRef}
        cameraSize={cameraSize}
        windowBox={windowBox}
        barcode={status.kind === "missed" ? status.code : undefined}
        preserveMode={preserveMode}
      />
    );


  // The scanner is full screen: it opens out of the tab bar's scan button and
  // folds back into it when the X is pressed.
  return (
    <GenieShell ref={shell}>
      <View
        style={{
          flex: 1,
          backgroundColor: needsPermission ? CANVAS : CAMERA_STAGE,
          paddingTop: needsPermission ? insets.top : 0,
        }}
      >
        {cameraLive ? (
          <ScannerCamera cameraRef={cameraRef} onScanned={onScanned} onLayout={onCameraLayout} />
        ) : null}

        {/* One frame too: it eases between four corners and a full outline, and the
            sweeping line fades, as the mode changes. */}
        {granted && scanning ? (
          <ScanViewfinder
            topInset={insets.top + CLOSE_CLEARANCE}
            bottomInset={switcherClearance}
            frame={mode === "Barcode" ? "corners" : "full"}
            sweep={mode === "Barcode"}
            description={mode === "Barcode" ? "Point the camera at a barcode" : null}
            locked={mode === "Barcode" && status.kind === "looking"}
            target={mode === "Barcode" && status.kind === "looking" ? status.target : undefined}
            onWindow={onWindow}
          />
        ) : null}

        {stage}

        {/* And one switcher, so the pills do not remount and jump on a switch. */}
        <View
          style={{
            position: "absolute",
            left: STAGE_INSET,
            right: STAGE_INSET,
            bottom: Math.max(STAGE_BOTTOM, insets.bottom + 12),
          }}
        >
          <ModeSwitcher mode={mode} setMode={selectMode} light={needsPermission} />
        </View>

        {status.kind === "found" ? (
          <FoundSheet
            key={status.product.id}
            product={status.product}
            bottomInset={insets.bottom}
            onClose={() => {
              setStatus({ kind: "idle" });
              busy.current = false;
            }}
            onOpen={() => {
              preserveMode();
              router.push({ pathname: "/result/[id]", params: { id: status.product.id } });
            }}
          />
        ) : null}
      </View>

      <Pressable
        onPress={() =>
          shell.current?.close(() => {
            if (router.canGoBack()) router.back();
            else router.navigate("/browse");
          })
        }
        accessibilityRole="button"
        accessibilityLabel="Close scanner"
        style={{
          position: "absolute",
          left: 16,
          top: insets.top + 8,
          width: TOUCH_TARGET,
          height: TOUCH_TARGET,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name="close" size={26} color={needsPermission ? INK : CANVAS} />
      </Pressable>
    </GenieShell>
  );
}

/**
 * The product a barcode found, sliding up over the camera: its picture rides on
 * the card's top edge, then brand, name, the score, and the button that opens
 * the full result. The X puts the camera back to scanning.
 */
function FoundSheet({
  product,
  bottomInset,
  onClose,
  onOpen,
}: {
  product: ProductWithIngredients;
  bottomInset: number;
  onClose: () => void;
  onOpen: () => void;
}) {
  const profile = useAppStore((s) => s.profile);
  const match = matchProduct(product, profile);
  const [rise] = useState(() => new Animated.Value(0));
  const [lift] = useState(() => rise.interpolate({ inputRange: [0, 1], outputRange: [FOUND_SHEET_TRAVEL, 0] }));
  useEffect(() => {
    Animated.spring(rise, {
      toValue: 1,
      friction: 9,
      tension: 60,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [rise]);

  const line = match.score === null ? VERDICT_LABEL[match.verdict] : `${match.score}/100 · ${VERDICT_LABEL[match.verdict]}`;
  const meta = [product.type === "unknown" ? null : PRODUCT_TYPE_LABEL[product.type], product.volume].filter(Boolean).join("  ·  ");

  return (
    <Animated.View
      style={{
        // Rises from the bottom edge, outlined and inset like the ingredients sheet.
        position: "absolute",
        left: SHEET_INSET,
        right: SHEET_INSET,
        bottom: 0,
        opacity: rise,
        transform: [{ translateY: lift }],
      }}
    >
      <View
        style={{
          backgroundColor: SURFACE,
          borderTopLeftRadius: SHEET_RADIUS,
          borderTopRightRadius: SHEET_RADIUS,
          borderWidth: SHEET_OUTLINE,
          borderBottomWidth: 0,
          borderColor: TERRACOTTA,
          paddingTop: FOUND_PICTURE / 2 + 14,
          paddingHorizontal: 22,
          paddingBottom: Math.max(20, bottomInset + 12),
          alignItems: "center",
          gap: 8,
          ...FLOATING_SHADOW,
        }}
      >
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={8}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: withAlpha(INK, 0.08),
          }}
        >
          <Ionicons name="close" size={18} color={MUTED} />
        </Pressable>

        <Text style={{ fontSize: TYPE.caption, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.9, color: MUTED }}>
          {product.brand}
        </Text>
        <Text
          numberOfLines={2}
          style={{ textAlign: "center", fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.heading, lineHeight: 28, color: INK }}
        >
          {product.name}
        </Text>
        {meta ? <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{meta}</Text> : null}
        <Text style={{ fontSize: TYPE.label, fontWeight: "600", color: INK }}>{line}</Text>

        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel="See the full result"
          style={{
            alignSelf: "stretch",
            minHeight: 48,
            marginTop: 8,
            borderRadius: 24,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: TERRACOTTA,
          }}
          className="active:opacity-90"
        >
          <Text style={{ fontSize: 16, fontWeight: "500", color: CTA_TEXT }}>See full result</Text>
        </Pressable>
      </View>

      {/* The picture rides the card's top edge. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: -FOUND_PICTURE / 2,
          alignSelf: "center",
          ...FLOATING_SHADOW,
        }}
      >
        <ProductThumbnail product={product} size={FOUND_PICTURE} radius={20} />
      </View>
    </Animated.View>
  );
}

/** The picture on the found-product card, and how far the card travels up from below. */
const FOUND_PICTURE = 96;
const FOUND_SHEET_TRAVEL = 420;

/**
 * The camera, with its start-up kept out of sight. A camera that has just
 * started spends a moment finding its exposure, and in front of a plain wall
 * that shows as a burst of white before the picture settles. A dark veil holds
 * the stage until the camera reports ready (or a moment has passed, in case it
 * never says so), then fades. It is mounted fresh each time the camera is, so
 * every start-up gets one.
 */
function ScannerCamera({
  cameraRef,
  onScanned,
  onLayout,
}: {
  cameraRef: React.RefObject<CameraView | null>;
  onScanned: (result: BarcodeScanningResult) => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const [ready, setReady] = useState(false);
  const [veil] = useState(() => new Animated.Value(1));

  useEffect(() => {
    // Not waiting on a "ready" that may never come.
    const fallback = setTimeout(() => setReady(true), 1600);
    return () => clearTimeout(fallback);
  }, []);

  useEffect(() => {
    if (!ready) return;
    // A beat after ready, so the exposure has settled, then fade the veil away.
    const t = setTimeout(() => {
      Animated.timing(veil, {
        toValue: 0,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: Platform.OS !== "web",
      }).start();
    }, 350);
    return () => clearTimeout(t);
  }, [ready, veil]);

  return (
    <>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={BARCODE_SETTINGS}
        onBarcodeScanned={onScanned}
        onLayout={onLayout}
        onCameraReady={() => setReady(true)}
      />
      <Animated.View
        pointerEvents="none"
        style={{ ...StyleSheet.absoluteFill, backgroundColor: CAMERA_STAGE, opacity: veil }}
      />
    </>
  );
}

/**
 * The mode switcher. Barcode sits flush with the scanner window's left edge and
 * Photo with its right edge; the space goes between them.
 *
 * Unselected, each is just its icon and name — no fill, no edge, as if it were
 * not in a button at all. Selected is filled with the app's own button colour,
 * and the fill eases from one to the other rather than jumping.
 *
 * `light` draws them for the cream screens (asking for camera access) instead
 * of over the dark camera.
 */
function ModeSwitcher({
  mode,
  setMode,
  light = false,
}: {
  mode: Mode;
  setMode: (m: Mode) => void;
  light?: boolean;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        marginHorizontal: SCAN_SIDE_INSET - STAGE_INSET,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      {MODES.map(({ label, Icon }) => (
        <ModePill key={label} label={label} Icon={Icon} selected={mode === label} light={light} onPress={() => setMode(label)} />
      ))}
    </View>
  );
}

function ModePill({
  label,
  Icon,
  selected,
  light,
  onPress,
}: {
  label: Mode;
  Icon: (props: { color: string; size?: number }) => ReactElement;
  selected: boolean;
  light: boolean;
  onPress: () => void;
}) {
  const [fill] = useState(() => new Animated.Value(selected ? 1 : 0));
  useEffect(() => {
    Animated.timing(fill, {
      toValue: selected ? 1 : 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [selected, fill]);
  // The selected pill is the onboarding Continue button's terracotta, with white
  // text and icon on it.
  const color = selected ? CTA_TEXT : light ? MUTED : withAlpha(CANVAS, 0.75);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{
        width: MODE_PILL_WIDTH,
        height: SWITCHER_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: SWITCHER_HEIGHT / 2,
      }}
    >
      <Animated.View
        pointerEvents="none"
        style={{ ...StyleSheet.absoluteFill, borderRadius: SWITCHER_HEIGHT / 2, backgroundColor: TERRACOTTA, opacity: fill }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Icon color={color} size={20} />
        <Text style={{ fontSize: 13.5, fontWeight: "600", color }} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Barcode mode's own overlays: what a read finds, and the way forward from it.
 * The camera, the frame and the mode switcher are Scan's, shared with Photo.
 */
function BarcodeStage({
  permission,
  requestPermission,
  status,
  onBarcode,
  onAdd,
  preserveMode,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  status: Status;
  /** Looks a barcode up again ("Try again" after a failed lookup). */
  onBarcode: (data: string) => void;
  /** Starts adding the product we don't have: the ingredient photo. */
  onAdd: () => void;
  /** Call before any navigation away from this stage that isn't a tab
   *  switch — see `Scan`'s own `preserveMode` doc comment for why. */
  preserveMode: () => void;
}) {
  const insets = useSafeAreaInsets();

  // One sentence per state, shared by the spoken announcement and the visible
  // panel's own label so the two can never drift apart.
  //
  // The "looking" line deliberately drops the 13 digits the panel prints.
  // Those are there so a sighted user can confirm the scan landed on the right
  // item; read aloud during a state that resolves in a second or two, they are
  // noise in front of the part that matters.
  const announcement =
    status.kind === "looking"
      ? "Barcode found. Reading the ingredients."
      : status.kind === "found"
        ? `Found ${status.product.name}. See full result is below.`
      : status.kind === "missed"
        ? "We don't have this product. Photograph its ingredient list to add it."
        : status.kind === "unreachable"
          ? `${failureMessage(status.failure)} Try again, or find it in Browse.`
          : "";

  // `null` is still asking the OS, which is not the same as refused — showing
  // the permission screen for that first moment flashed it at people who had
  // already said yes.
  const needsPermission = permission !== null && !permission.granted;
  const switcherClearance =
    Math.max(STAGE_BOTTOM, insets.bottom + 12) + SWITCHER_HEIGHT + FRAME_MARGIN_ABOVE_SWITCHER;

  return (
    <View style={{ flex: 1 }}>
      <ScreenReaderAnnouncer message={announcement} />

      {needsPermission && (
        <CameraPermissionIntro
          permission={permission}
          requestPermission={requestPermission}
          title="Scan a product"
          body="Point your camera at a barcode and we'll read the ingredients for you. Nothing leaves your phone except the barcode number."
          bottomInset={switcherClearance}
        />
      )}

      {/* Status, stacked just above the mode switcher. */}
      <View
        style={{
          position: "absolute",
          left: STAGE_INSET,
          right: STAGE_INSET,
          bottom: Math.max(STAGE_BOTTOM, insets.bottom + 12) + SWITCHER_HEIGHT + 12,
          gap: 12,
        }}
      >
        {status.kind !== "idle" && (
          <View
            // Grouped into one node so a screen reader reaching this panel
            // reads one sentence rather than the icon, a headline and a
            // subhead as three fragments — and so the bare "!" glyph below
            // stays out of it.
            //
            // The *announcement* is not made here; see `ScanAnnouncer`. A
            // live region declared on a conditionally-rendered element is
            // announced by roughly one platform of the three.
            accessible
            accessibilityLabel={announcement}
            style={{
              gap: 12,
              borderRadius: 18,
              backgroundColor: withAlpha(CANVAS, 0.95),
            }}
            className="flex-row items-center px-4 py-3"
          >
            {/* Three states, three tints. `unreachable` used to share
                `missed`'s pink, which made a network failure and a genuine
                miss identical at a glance on a panel people see repeatedly in
                a shop. Neutral rather than another verdict colour, because
                that is what it is: pink says something about the product,
                and this says nothing about the product at all. */}
            <View
              className={`h-8 w-8 items-center justify-center rounded-full ${
                status.kind === "looking"
                  ? "bg-tint-mint"
                  : status.kind === "unreachable"
                    ? "bg-level-neutral-tint"
                    : "bg-tint-pink"
              }`}
            >
              {status.kind === "looking" ? (
                <ActivityIndicator size="small" color={INK} />
              ) : (
                <Text style={{ fontSize: 14, fontWeight: "bold", color: INK }}>!</Text>
              )}
            </View>
            <View className="flex-1">
              <Text style={{ fontSize: 12.5, fontWeight: "bold", color: INK }}>
                {status.kind === "looking"
                  ? `Barcode found · ${status.code}`
                  : status.kind === "unreachable"
                    ? "Couldn't check this barcode"
                    : "We don't have this product"}
              </Text>
              <Text style={{ fontSize: TYPE.caption, color: MUTED }}>
                {status.kind === "looking"
                  ? "Reading the ingredients…"
                  : status.kind === "unreachable"
                    ? failureMessage(status.failure)
                    : "Photograph its ingredient list and we'll add it"}
              </Text>
            </View>
          </View>
        )}

        {/* After a plain miss: the one way forward. */}
        {status.kind === "missed" && (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            style={{
              height: TOUCH_TARGET,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 999,
              backgroundColor: TERRACOTTA,
            }}
            className="active:opacity-90"
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: CTA_TEXT }}>Photograph the ingredients</Text>
          </Pressable>
        )}

        {/* Deliberately not the ingredient photo: that needs the same network
            that just failed, so offering it here would be the second of two
            failures on one interaction. The only honest primary action when we
            could not reach the catalogue is to ask it again. Starting over is
            tapping Barcode. */}
        {status.kind === "unreachable" && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => onBarcode(status.code)}
              style={{
                flex: 1,
                height: TOUCH_TARGET,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                backgroundColor: TERRACOTTA,
              }}
              className="active:opacity-90"
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: CTA_TEXT }}>Try again</Text>
            </Pressable>
          </View>
        )}

        {/* Only when the lookup could not be made. It is the one suggestion here
            that still works with no connection: Browse renders from the cached
            catalogue. After a plain miss it is left out — a barcode scan is the
            direct lookup, so Browse would not have the product either. */}
        {status.kind === "unreachable" && (
          <Pressable
            onPress={() => {
              preserveMode();
              router.push("/browse");
            }}
            accessibilityRole="link"
            style={{
              minHeight: TOUCH_TARGET,
              alignItems: "center",
              justifyContent: "center",
            }}
            className="active:opacity-70"
          >
            <Text
              style={{ fontSize: 12.5, color: withAlpha(CANVAS, 0.75), textDecorationLine: "underline" }}
            >
              Or find it in Browse instead.
            </Text>
          </Pressable>
        )}

      </View>
    </View>
  );
}

/**
 * The screen asking for camera access, shared by both modes: cream, the
 * watercolor, a serif title, one sentence, one button. Two reasons there is no
 * camera, and it has to say which: access not asked for yet, or refused. A
 * silent black rectangle reads as "the scanner is gone". Refused has no prompt
 * left to show, so its button goes to the system settings instead.
 */
function CameraPermissionIntro({
  permission,
  requestPermission,
  title,
  body,
  bottomInset,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  title: string;
  body: string;
  bottomInset: number;
}) {
  const blocked = permission?.canAskAgain === false;
  return (
    <ScanIntro
      illustration={ONB2_SCAN}
      title={blocked ? "Camera access is off" : title}
      body={
        blocked
          ? "Turn the camera back on for this app in your device settings, then come back."
          : body
      }
      actionLabel={blocked ? "Open settings" : "Open camera"}
      onAction={blocked ? () => void Linking.openSettings() : requestPermission}
      bottomInset={bottomInset}
    >
      {/* This fires at the worst moment — camera access just failed — so the one
          sentence offering a way forward has to actually be the way forward:
          underlined, standard target height, and it goes to Browse rather than
          only naming it. */}
      <Pressable
        onPress={() => router.push("/browse")}
        accessibilityRole="link"
        style={{ minHeight: TOUCH_TARGET, justifyContent: "center", paddingHorizontal: 12 }}
        className="active:opacity-70"
      >
        <Text style={{ fontSize: 12.5, color: MUTED, textDecorationLine: "underline" }}>
          Or find the product in Browse instead.
        </Text>
      </Pressable>
    </ScanIntro>
  );
}

/**
 * Photo mode's own overlays: the instruction, the shutter and the reading of
 * what was photographed. The camera, the frame and the mode switcher are Scan's,
 * shared with Barcode, so the picture is live the moment the mode opens.
 * `barcode` is the one from a miss, so what gets photographed is saved under it.
 */
function IngredientsStage({
  permission,
  requestPermission,
  cameraRef,
  cameraSize,
  windowBox,
  barcode,
  preserveMode,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  cameraRef: React.RefObject<CameraView | null>;
  cameraSize: Size | null;
  windowBox: Box | null;
  barcode?: string;
  /** Call before any navigation away from this stage that isn't a tab switch. */
  preserveMode: () => void;
}) {
  const insets = useSafeAreaInsets();
  const needsPermission = permission !== null && !permission.granted;
  const clearance = Math.max(STAGE_BOTTOM, insets.bottom + 12) + SWITCHER_HEIGHT + FRAME_MARGIN_ABOVE_SWITCHER;

  return (
    <View style={{ flex: 1 }}>
      {permission?.granted ? (
        <LabelCamera
          camera={cameraRef}
          cameraSize={cameraSize}
          window={windowBox}
          barcode={barcode}
          frameTopOffset={CLOSE_CLEARANCE}
          bottomInset={clearance}
          onRead={() => {
            preserveMode();
            router.push({ pathname: "/add-product", params: barcode ? { barcode } : {} });
          }}
        />
      ) : null}

      {needsPermission ? (
        <CameraPermissionIntro
          permission={permission}
          requestPermission={requestPermission}
          title="Photograph the ingredient list"
          body="Take a photo of the list on the back and we'll read it. We crop to the frame, send it to Google to read the text, and never store the image."
          bottomInset={clearance}
        />
      ) : null}
    </View>
  );
}

// The mode switcher's own height plus the same bottom offset its wrapping View uses
// (`Math.max(STAGE_BOTTOM, insets.bottom + 12)`) and a margin above it — this frame
// used to be measured off a 293pt card that no longer exists (the stage is
// full-bleed now), so a fixed bottom inset put the frame's bottom edge, and
// its instruction text, underneath the switcher rather than clear of it.
const SWITCHER_HEIGHT = 53;
// The mode pills: 20% narrower and 10% taller than the segments they replace.
const MODE_PILL_WIDTH = 126;
// How far in the bottom wrapper (mode pills, status panel) sits from each edge.
const STAGE_INSET = 20;
// The scanner's close button sits across the top-left; the frame starts below it.
const CLOSE_CLEARANCE = 32;
// Clear of the bottom edge and the home indicator.
const STAGE_BOTTOM = 20;
const FRAME_MARGIN_ABOVE_SWITCHER = 24;

