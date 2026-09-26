import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";

import { ChoosePhotoInstead } from "@/components/ChoosePhotoInstead";
import { ScanCamera } from "@/components/ScanCamera";
import { LabelCamera } from "@/components/LabelCamera";
import { CameraPermissionScreen } from "@/components/CameraPermissionScreen";
import { barcodeBox, SCAN_SIDE_INSET, ScanViewfinder, type Box } from "@/components/ScanViewfinder";
import { SHEET_INSET, SHEET_OUTLINE, SHEET_RADIUS } from "@/components/IngredientsSheet";
import { ProductThumbnail } from "@/components/ProductThumbnail";
import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { GlassButton } from "@/components/GlassButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { canPhotographLabelFor, fetchProductByBarcode, type FetchFailure } from "@/data/api";
import { PRODUCT_TYPE_LABEL, type ProductWithIngredients } from "@/data/types";
import type { Size } from "@/lib/crop-to-guide";
import { createScanDismissGuard } from "@/lib/scan-dismiss-guard";
import { barcodeParam } from "@/lib/route-params";
import { lookupFailureState, scanStateCopy, scanStateSpeech, type ScanState } from "@/lib/scan-copy";
import { rememberScanMode, rememberedScanMode, type ScanMode } from "@/lib/scan-mode";
import { createStaleGuard } from "@/lib/stale-guard";
import { haptic } from "@/lib/haptics";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { matchProduct } from "@/lib/matching";
import { track } from "@/lib/analytics";
import { useAppStore } from "@/store/useAppStore";
import { CAMERA_STAGE, CANVAS, FLOATING_SHADOW, INK, MUTED, SELECTED, SURFACE, TOUCH_TARGET, TYPE, VERDICT_LABEL, withAlpha } from "@/lib/tokens";

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


type Mode = ScanMode;
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
  // `?mode=photo&barcode=…` opens straight into Photo mode, with the barcode a
  // read there is saved under (#204): Saved's recorded miss, and "Retake the
  // photo" from the label result or add-product. The barcode comes from a
  // route, so a link can set it too, and only a real one is kept (#29).
  const params = useLocalSearchParams<{ mode?: string; barcode?: string }>();
  const photoRequested = params.mode === "photo";
  const requestedBarcode = photoRequested ? barcodeParam(params.barcode) : undefined;
  const [photoBarcode, setPhotoBarcode] = useState<string | undefined>(requestedBarcode);
  // Photo is the default now (issue #214): reading a label works on every
  // product, in any shop, with no catalogue coverage needed — a barcode only
  // resolves for the ~851 products the catalogue already has. Seeded from
  // `lib/scan-mode.ts`, which remembers a mode switch for the session (a
  // cold start always reads Photo); the focus-reset below reads the same
  // module rather than hardcoding either mode.
  const [mode, setMode] = useState<Mode>(() => (photoRequested ? "Photo" : rememberedScanMode()));
  // A retake returns here by `router.dismissTo` with new params, on the same
  // scanner: switch to Photo for that barcode. Adjusted while rendering, as
  // React recommends for state that follows a prop, rather than in an effect.
  const request = photoRequested ? `photo:${requestedBarcode ?? ""}` : "";
  const [appliedRequest, setAppliedRequest] = useState(request);
  if (request !== appliedRequest) {
    setAppliedRequest(request);
    if (photoRequested) {
      setPhotoBarcode(requestedBarcode);
      setMode("Photo");
    }
  }
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  // Off by default, and reset on leaving the scanner (below) rather than left
  // to whatever it was: the camera itself unmounts on blur, so the light goes
  // off, but this state survives and would otherwise switch it back on the
  // moment the scanner regains focus with no one having asked for that — a
  // battery cost and a real annoyance in a shop (#195).
  const [torchOn, setTorchOn] = useState(false);
  // The focus-effect reset below only covers leaving this *screen*; backgrounding
  // or locking the device blurs nothing in React Navigation, so that cleanup
  // never runs. Without this, the OS suspends the camera (and its hardware
  // torch) while `torchOn` stays true, and resuming can relight it with no new
  // tap, or leave the button reading "Turn off the torch" for a light that's
  // already off (#260 review, Codex).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") setTorchOn(false);
    });
    return () => subscription.remove();
  }, []);

  const recordView = useAppStore((s) => s.recordView);
  const dismissQuizAcknowledgement = useAppStore((s) => s.dismissQuizAcknowledgement);

  const busy = useRef(false);
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
  // Suppresses the camera re-reading a code that was just dismissed — see
  // lib/scan-dismiss-guard.ts and issue #190. Consulted only in `onScanned`,
  // the camera-only path; never in `handleBarcode` itself, which the "Try
  // again" button and `BarcodeStage.onBarcode` also call on purpose.
  const dismissGuard = useRef(createScanDismissGuard()).current;
  // Same mechanism as `lookups` below, for a label read in flight:
  // `IngredientsStage`'s mount begins a generation, and its `openVerdict`
  // checks it before navigating. Switching mode away and back remounts
  // `IngredientsStage` (a fresh generation), so a read from the earlier
  // mount is stale either way — one guard covers both "switched away" and
  // "switched away and back" without a mode check bolted on beside it. See
  // issue #191.
  //
  // `useState`, not `useRef().current`: this value is passed down as a prop
  // (to `IngredientsStage`, below), and reading a ref's `.current` at that
  // render-time position is exactly what react-hooks/refs exists to catch —
  // a plain, never-updated piece of state sidesteps the rule without
  // changing the behaviour (it's never set again after this initial value).
  const [reads] = useState(() => createStaleGuard());

  // Tapping Barcode again after a miss or a failed lookup is how you scan
  // another: it clears the message and the camera comes back. That replaces the
  // "Try another" button the panel used to carry.
  const selectMode = useCallback(
    (next: Mode) => {
      // A found product's card belongs to the barcode it read: switching mode
      // (or tapping Barcode again) puts it away rather than leaving it over the
      // other mode's shutter.
      //
      // A missed/unreachable panel no longer clears on a same-pill re-tap
      // (#192): tapping the already-selected Barcode pill used to double as
      // its dismissal, which nothing on screen said it did and a screen
      // reader could not surface. Dismissing those two states is now the
      // explicit "Scan again" / "Scan something else" action below — see
      // `dismissStatus`.
      if (status.kind === "found") {
        setStatus({ kind: "idle" });
        busy.current = false;
      } else if (
        (status.kind === "missed" || status.kind === "unreachable") &&
        mode === "Photo" &&
        next === "Barcode"
      ) {
        // Except when abandoning the one flow that deliberately keeps a
        // missed status alive across a mode switch: "Add via Photo" on a
        // barcode miss calls `selectMode("Photo")` while leaving `status`
        // as `missed`, so `IngredientsStage` can still read the barcode
        // (below). If the user backs out of that by tapping Barcode
        // instead of finishing it, this is a genuine Photo-to-Barcode
        // switch, not a re-tap — without clearing here, the stale miss
        // panel reappears immediately and blocks scanning until "Scan
        // something else" is also pressed (#259 review).
        //
        // The barcode can still be sitting in frame the moment Barcode mode
        // remounts, so this needs the same dismiss-guard note `dismissStatus`
        // uses — without it, the camera reads it again on the very next
        // frame and the same panel pops straight back up (#190).
        dismissGuard.noteDismissal(status.code, Date.now());
        setStatus({ kind: "idle" });
        busy.current = false;
      }
      // A read in flight (from whichever mode this switches away from) is no
      // longer wanted the moment mode changes — including switching straight
      // back to Photo, which remounts `IngredientsStage` with a fresh
      // generation. Guarded on an actual change: `ModePill` has no
      // already-selected guard, so tapping the current pill (e.g. an
      // impatient extra tap on "Photo" while a read is in flight) reaches
      // here with `next === mode`, and `setMode` would then be a no-op —
      // no remount, so no fresh generation ever replaces the one this would
      // have invalidated, permanently dropping every read for the rest of
      // that visit. See issue #191.
      if (next !== mode) reads.invalidate();
      // Leaving Photo leaves the barcode a retake was for behind with it.
      if (next === "Barcode") setPhotoBarcode(undefined);
      rememberScanMode(next);
      setMode(next);
    },
    [status, mode, reads, dismissGuard]
  );

  /**
   * The explicit way to clear a "missed" or "unreachable" panel (#192) —
   * "Scan again" on a non-product code, "Scan something else" on a plain
   * miss. Records the dismissal exactly like the old pill-tap special case
   * did, so the camera does not immediately re-read the same code still
   * sitting in frame (#190's guard) — only how it's reached has changed.
   */
  const dismissStatus = useCallback(() => {
    if (status.kind === "missed" || status.kind === "unreachable") {
      dismissGuard.noteDismissal(status.code, Date.now());
    }
    setStatus({ kind: "idle" });
    busy.current = false;
  }, [status, dismissGuard]);

  // Only two things are allowed to reset this screen back to Barcode: the X
  // button, and switching to another tab and back. Nothing else — not the
  // keyboard closing, not opening a search result and returning, not
  // cancelling out of the label camera — is "leaving the scanner", and this
  // screen should never guess otherwise. The problem is that React
  // Navigation can't tell those apart on its own: pushing a screen from
  // *within* this tab (a search result, the label-photo modal) blurs this
  // tab's focus exactly the same way switching to a sibling
  // tab does, because both put another screen on top of it. `preserveMode`
  // is how every one of those internal pushes tells this effect "this isn't
  // an exit" — it's called right before each one, and consumed the moment
  // this screen is focused again. Anything that does NOT call it first (a
  // genuine tab switch) resets to Barcode, which is the default this effect
  // falls back to when nothing has told it otherwise.
  const skipResetOnNextFocus = useRef(false);
  // A lookup that is still pending when the scanner is left, or when a newer barcode is
  // read, must not put its answer back on screen: see `handleBarcode`.
  const lookups = useRef(createStaleGuard());
  const preserveMode = useCallback(() => {
    skipResetOnNextFocus.current = true;
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (skipResetOnNextFocus.current) {
        skipResetOnNextFocus.current = false;
      } else {
        // Falls back to the remembered mode, not a hardcoded default — see
        // `lib/scan-mode.ts` — unless this scanner was opened for a photo.
        // A genuine exit (this branch) still resets the *screen state*, just
        // not to a fixed mode.
        setMode(photoRequested ? "Photo" : rememberedScanMode());
      }
      return () => {
        lookups.current.invalidate();
        // Not unconditional: this same cleanup also fires on the blur that
        // `openVerdict` itself causes (`preserveMode()` then
        // `router.push`) — a *wanted* navigation, not an exit, and
        // `IngredientsStage` isn't remounted for it (`skipResetOnNextFocus`
        // is what keeps `setMode` from resetting above). Invalidating here
        // regardless would permanently break that surviving instance's
        // `stillWanted()` the moment it regains focus, silently dropping
        // every photo taken for the rest of that visit — a fresher bug than
        // the mode-pill one this same guard already covers. Checked at
        // blur time, before the next focus consumes it: still true only for
        // a `preserveMode`-guarded push, false for a genuine exit. See
        // issue #191's PR review.
        if (!skipResetOnNextFocus.current) reads.invalidate();
        dismissGuard.reset();
        setStatus({ kind: "idle" });
        busy.current = false;
        // Unconditional, unlike the guards above: an internal push
        // (`preserveMode`) still physically leaves this screen, so the torch
        // should still go dark rather than staying "on" in state for a
        // camera that's no longer mounted (#195).
        setTorchOn(false);
      };
      // dismissGuard and reads are both stable values (see their own
      // declarations above); including them in the deps array would just be
      // noise.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  // expo-router owns focus state itself as of SDK 56 - it no longer re-exports
  // react-navigation, so this tracks focus the same way the effect above does
  // rather than importing @react-navigation/native directly (that import now
  // fails the bundler outright: "expo-router is no longer compatible with
  // react-navigation").
  const [isFocused, setIsFocused] = useState(true);
  // The same fact as a ref, for callbacks that outlive a render: a label read can
  // finish after the X was pressed, and must not pull the user back into the scan
  // flow from whatever tab they have moved to.
  const focusedRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setIsFocused(true);
      return () => {
        focusedRef.current = false;
        setIsFocused(false);
      };
    }, [])
  );

  // A quiet nudge toward Photo mode when a barcode just isn't reading — too
  // blurry, too small, or on a dark shelf (#195). Starts only while genuinely
  // idle in Barcode mode on the visible screen with the camera actually
  // granted, so it can never appear over a found sheet, a miss/unreachable
  // panel, or the camera-permission intro — where it rendered invisibly
  // (cream on cream) on top of the intro's Browse link and stole its taps
  // (#260 review). Clears itself the moment any of those stops being true.
  const granted = permission?.granted === true;
  const [showScanHint, setShowScanHint] = useState(false);
  useEffect(() => {
    setShowScanHint(false);
    if (mode !== "Barcode" || status.kind !== "idle" || !isFocused || !granted) return;
    const timer = setTimeout(() => setShowScanHint(true), IDLE_HINT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, status, isFocused, granted]);

  const handleBarcode = useCallback(
    async (data: string, target?: Box) => {
      if (busy.current) return;
      busy.current = true;
      // A scan starting is a stronger signal that the quiz banner was seen
      // than any timer would be, and this is the one place every barcode
      // read passes through. See issue #95.
      dismissQuizAcknowledgement();
      setStatus({ kind: "looking", code: data, target });
      // No haptic yet: it waits for the answer, so a "found" feel never
      // precedes "we don't have this" (#313).

      // `product-lookup` rejects anything outside 8-14 digits with a 400
      // before it consults a source, but this scanner also decodes qr and
      // code128 — a QR payload or a non-numeric Code 128 read would reach
      // classifyFailure as an ordinary server error and offer a "Try again"
      // that fails the same way every time. Treated as a miss without the
      // doomed round trip, which is the answer the network call would give
      // anyway.
      track("scan_started", { path: "barcode" });
      if (!canPhotographLabelFor(data)) {
        // Not written to history (#204): a QR code's payload is a link or
        // any text at all, not a product anyone could find again, and it
        // would sit in Saved as a row with nothing to offer.
        setStatus({ kind: "missed", code: data });
        haptic.warning();
        busy.current = false;
        return;
      }

      const lookup = lookups.current.begin();
      const result = await fetchProductByBarcode(data);
      // Left the scanner (or read a newer barcode) while this was pending: the answer is
      // stale, and putting it up would show an old product, or overwrite a newer scan.
      if (!lookups.current.isCurrent(lookup)) return;

      // Could not ask. Not a miss — and crucially not written to history,
      // because an outage-caused "miss" is a false record the user has no way
      // to tell from a real one, and it outlives the outage.
      if (!result.ok) {
        setStatus({ kind: "unreachable", code: data, failure: result.failure });
        haptic.warning();
        busy.current = false;
        return;
      }

      const product = result.value;

      if (product) {
        // Deliberately not recorded here. `/result/[id]` re-exports the
        // product screen, which logs the view once it has loaded — so doing it
        // here too counted one physical scan as two. One owner, and it is the
        // screen that shows the verdict.
        // The product slides up over the camera; its button opens the full
        // result. `busy` stays set until the sheet is closed or left.
        setStatus({ kind: "found", product });
        haptic.success();
        return;
      }

      recordView({ id: data, known: false, score: null, warnings: 0 });
      setStatus({ kind: "missed", code: data });
      haptic.warning();
      busy.current = false;
    },
    [recordView, dismissQuizAcknowledgement]
  );

  // One camera for both modes. A CameraView per mode meant the camera was torn
  // down and brought up again on every switch — the black flash between Barcode
  // and Photo — so it lives here and the same view just changes what it listens
  // for. Most devices only let one CameraView hold the camera at a time: while
  // another screen is on top (a result, the label result) `isFocused` is false and
  // this lets go of it, so that screen's camera is not left waiting for it.
  // Otherwise it stays mounted — a read, a miss or a mode switch never stops and
  // restarts it, which is what showed as a black flash now and then.
  const onScanned = useCallback(
    ({ data, bounds, cornerPoints }: BarcodeScanningResult) => {
      // Only in Barcode mode, and only while nothing is already showing: the
      // camera stays up behind a "not in our catalogue" panel, so it must not
      // read the same code again the moment the panel appears.
      if (modeRef.current !== "Barcode" || statusRef.current.kind !== "idle") return;
      // The status check above only covers *while* a result is showing. The
      // moment it's dismissed, status is back to `idle` and the barcode is
      // still sitting in frame — this covers the gap between that dismissal
      // and the code actually leaving frame. See lib/scan-dismiss-guard.ts.
      if (dismissGuard.shouldIgnoreScan(data, Date.now())) return;
      void handleBarcode(data, barcodeBox({ bounds, cornerPoints }));
    },
    [handleBarcode, dismissGuard]
  );

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
        onDismiss={dismissStatus}
        showHint={showScanHint}
        onHint={() => selectMode("Photo")}
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
        barcode={status.kind === "missed" && canPhotographLabelFor(status.code) ? status.code : photoBarcode}
        preserveMode={preserveMode}
        focusedRef={focusedRef}
        reads={reads}
      />
    );


  // Full screen, presented the standard iOS way: it slides up from the bottom
  // and back down when closed (`presentation: "fullScreenModal"` in
  // app/_layout.tsx, #313).
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <View
        style={{
          flex: 1,
          backgroundColor: needsPermission ? CANVAS : CAMERA_STAGE,
          paddingTop: needsPermission ? insets.top : 0,
        }}
      >
        {/* The root layout keeps dark icons for the cream screens; the camera stage is
            black, so they are light here — but only while this tab is showing, and not on
            the cream permission screen. */}
        {isFocused && !needsPermission ? <StatusBar style="light" /> : null}
        {cameraLive ? (
          <ScanCamera cameraRef={cameraRef} onScanned={onScanned} onLayout={onCameraLayout} enableTorch={torchOn} />
        ) : null}

        {/* One frame too: it eases between the small barcode window and the tall
            photo one as the mode changes. */}
        {granted && scanning ? (
          <ScanViewfinder
            topInset={insets.top + CLOSE_CLEARANCE}
            bottomInset={switcherClearance}
            frame={mode === "Barcode" ? "corners" : "full"}
            description={mode === "Barcode" ? (scanStateCopy({ kind: "ready", mode: "barcode" }).line ?? null) : null}
            hint={mode === "Barcode" ? (scanStateCopy({ kind: "ready", mode: "barcode" }).line ?? null) : null}
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
              // Same reasoning as the missed/unreachable clear in
              // `selectMode` — the barcode is still in frame. See #190.
              dismissGuard.noteDismissal(status.product.barcode, Date.now());
              setStatus({ kind: "idle" });
              busy.current = false;
            }}
            onOpen={() => {
              preserveMode();
              router.push({ pathname: "/result/[id]", params: { id: status.product.id, from: "barcode" } });
            }}
          />
        ) : null}
      </View>

      {/* Glass buttons across the top, as in the iOS camera: close on the left,
          the torch in the middle, "i" on the right. */}
      <GlassButton
        symbol="xmark"
        icon="close"
        accessibilityLabel="Close scanner"
        onDark={!needsPermission}
        // Opened from a deep link there is nothing underneath to go back to.
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
        style={{ position: "absolute", left: 16, top: insets.top + 8 }}
      />

      {/* Visible in both modes, not just Barcode (#195): the camera is one
          shared instance (see ScannerCamera's own comment), so a torch
          turned on here stays on across a mode switch — and someone
          photographing a label on the same dark shelf needs the light too.
          Centred across the full width; box-none so the row itself never
          takes a tap meant for the buttons at either end. */}
      {cameraLive ? (
        <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, top: insets.top + 8, alignItems: "center" }}>
          <GlassButton
            symbol={torchOn ? "bolt.fill" : "bolt"}
            icon={torchOn ? "flash" : "flash-outline"}
            accessibilityLabel={torchOn ? "Turn off the torch" : "Turn on the torch"}
            onDark
            onPress={() => setTorchOn((on) => !on)}
          />
        </View>
      ) : null}

      {/* How we score products. Not linked yet: the owner adds where it goes. */}
      <GlassButton
        symbol="info.circle"
        icon="information-circle-outline"
        accessibilityLabel="How we score products"
        onDark={!needsPermission}
        style={{ position: "absolute", right: 16, top: insets.top + 8 }}
      />
    </View>
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
    // With Reduce Motion on, the sheet is just there (#313).
    if (reduceMotionNow()) {
      rise.setValue(1);
      return;
    }
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
        <GlassButton
          symbol="xmark"
          icon="close"
          accessibilityLabel="Close"
          onPress={onClose}
          small
          style={{ position: "absolute", top: 14, right: 14 }}
        />

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

        <PrimaryButton
          label="See full result"
          accessibilityLabel="See the full result"
          onPress={onOpen}
          size={48}
          style={{ alignSelf: "stretch", marginTop: 8 }}
        />
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
 * The mode switcher: both modes in one glass pill, and a thumb that slides
 * between them when the mode changes, like an iOS segmented control or
 * Instagram's camera modes (owner, after OnSkin's scanner). The pill spans
 * the scanner window's width; each mode takes half of it.
 *
 * The selected mode's thumb is tinted, not filled with the call-to-action
 * colour (#313): the screen's one filled button is the one below it.
 *
 * `light` draws it for the cream screens (asking for camera access) instead
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
  const index = MODES.findIndex((m) => m.label === mode);
  const [width, setWidth] = useState(0);
  const [slide] = useState(() => new Animated.Value(index));
  useEffect(() => {
    if (reduceMotionNow()) {
      slide.setValue(index);
      return;
    }
    Animated.spring(slide, {
      toValue: index,
      ...IOS_SPRING,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [index, slide]);

  const segment = width > 0 ? (width - 2 * SWITCHER_PADDING) / MODES.length : 0;
  const track: ViewStyle = { height: SWITCHER_HEIGHT, borderRadius: SWITCHER_HEIGHT / 2, padding: SWITCHER_PADDING, flexDirection: "row" };
  const glass = isLiquidGlassAvailable();
  const Track = glass ? GlassView : View;

  return (
    <View
      accessibilityRole="tablist"
      style={{ marginHorizontal: SCAN_SIDE_INSET - STAGE_INSET }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Track
        {...(glass ? { glassEffectStyle: "regular" as const, colorScheme: light ? ("light" as const) : ("dark" as const) } : {})}
        style={[track, glass ? null : { backgroundColor: light ? withAlpha(INK, 0.06) : withAlpha(INK, 0.55) }]}
      >
        {segment > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: SWITCHER_PADDING,
              bottom: SWITCHER_PADDING,
              left: SWITCHER_PADDING,
              width: segment,
              borderRadius: (SWITCHER_HEIGHT - 2 * SWITCHER_PADDING) / 2,
              backgroundColor: SELECTED,
              transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, segment] }) }],
            }}
          />
        ) : null}
        {MODES.map(({ label, Icon }) => (
          <ModePill key={label} label={label} Icon={Icon} selected={mode === label} light={light} onPress={() => setMode(label)} />
        ))}
      </Track>
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
  const color = selected ? INK : light ? MUTED : withAlpha(CANVAS, 0.85);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
      className="active:opacity-70"
    >
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
  onDismiss,
  showHint,
  onHint,
  preserveMode,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  status: Status;
  /** Looks a barcode up again ("Try again" after a failed lookup). */
  onBarcode: (data: string) => void;
  /** Starts adding the product we don't have: the ingredient photo. */
  onAdd: () => void;
  /** Clears a "missed" or "unreachable" panel and returns the scanner to
   *  Ready — "Scan again" / "Scan something else" below (#192). */
  onDismiss: () => void;
  /** True once `IDLE_HINT_DELAY_MS` has passed with nothing read (#195). */
  showHint: boolean;
  /** Switches to Photo mode — the scan hint's own action. */
  onHint: () => void;
  /** Call before any navigation away from this stage that isn't a tab
   *  switch — see `Scan`'s own `preserveMode` doc comment for why. */
  preserveMode: () => void;
}) {
  const insets = useSafeAreaInsets();

  // One sentence per state, shared by the spoken announcement and the visible
  // panel's own label so the two can never drift apart. The words are
  // `scanStateCopy`'s (#204). A QR code or a non-retail barcode reads as a
  // miss too, but there is no product to add under it.
  const notProduct = status.kind === "missed" && !canPhotographLabelFor(status.code);
  const panelState: ScanState | null =
    status.kind === "looking"
      ? { kind: "working", step: "lookup" }
      : status.kind === "missed"
        ? notProduct
          ? { kind: "couldnt-read", why: "not-a-product-code" }
          : { kind: "not-ours-yet" }
        : status.kind === "unreachable"
          ? lookupFailureState(status.failure)
          : null;
  const copy = panelState ? scanStateCopy(panelState) : null;

  const announcement =
    status.kind === "found"
      ? `Found ${status.product.name}. See full result is below.`
      : copy
        ? scanStateSpeech(copy)
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
        <CameraPermissionScreen
          permission={permission}
          requestPermission={requestPermission}
          mode="barcode"
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
        {status.kind !== "idle" && status.kind !== "found" && (
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
              <Text style={{ fontSize: 12.5, fontWeight: "bold", color: INK }}>{copy?.title}</Text>
              <Text style={{ fontSize: TYPE.caption, color: MUTED }}>{copy?.line}</Text>
              {copy?.note ? (
                <Text style={{ fontSize: TYPE.caption, color: MUTED, marginTop: 2 }}>{copy.note}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* After a plain miss: the primary way forward, plus a secondary
            escape to a different barcode without switching to Photo and
            back (#192). */}
        {status.kind === "missed" && !notProduct && (
          <>
            <PrimaryButton label={copy?.action ?? ""} onPress={onAdd} size={48} />
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel={copy?.link}
              style={{ minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
              className="active:opacity-70"
            >
              <Text style={{ fontSize: 12.5, color: withAlpha(CANVAS, 0.75), textDecorationLine: "underline" }}>
                {copy?.link}
              </Text>
            </Pressable>
          </>
        )}

        {/* The non-product state (a QR code, a non-retail barcode) has no
            ingredient photo to offer, and the camera will not read another
            code while this panel is up — so without this, the state was a
            dead end reachable only by the hidden, unannounced effect of
            re-tapping the already-selected Barcode pill (#192). */}
        {notProduct && (
          <PrimaryButton label={copy?.action ?? ""} onPress={onDismiss} size={48} />
        )}

        {/* Deliberately not the ingredient photo: that needs the same network
            that just failed, so offering it here would be the second of two
            failures on one interaction. The only honest primary action when we
            could not reach the catalogue is to ask it again. Starting over is
            "Scan something else" below — the only way out now that re-tapping
            the Barcode pill no longer clears this panel (#192, #259 review:
            without it this state trapped the scanner until you left it). */}
        {status.kind === "unreachable" && (
          <PrimaryButton label={copy?.action ?? ""} onPress={() => onBarcode(status.code)} size={48} />
        )}
        {status.kind === "unreachable" && (
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={SCAN_SOMETHING_ELSE}
            style={{ minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: 12.5, color: withAlpha(CANVAS, 0.75), textDecorationLine: "underline" }}>
              {SCAN_SOMETHING_ELSE}
            </Text>
          </Pressable>
        )}

        {/* Only when the lookup could not be made. It is the one suggestion here
            that still works with no connection: Browse renders from the cached
            catalogue. After a plain miss it is left out — a barcode scan is the
            direct lookup, so Browse would not have the product either. */}
        {status.kind === "unreachable" && (
          <Pressable
            onPress={() => {
              preserveMode();
              // Closes the scanner onto Search. The scanner is a
              // modal (#313): a push would open the tabs inside it.
              router.dismissTo("/browse");
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
              {copy?.link}
            </Text>
          </Pressable>
        )}

        {/* The name is on the pack even when the barcode leads nowhere
            (#323): after a miss or a code that isn't a product, look it up
            by name. Closes the scanner onto Search with the box empty and
            focused; `byName` is a one-time request, so each tap is new. */}
        {copy?.byName ? (
          <Pressable
            onPress={() => {
              preserveMode();
              router.dismissTo({ pathname: "/browse", params: { byName: String(Date.now()) } });
            }}
            accessibilityRole="link"
            accessibilityLabel={copy.byName}
            style={{ minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: 12.5, color: withAlpha(CANVAS, 0.75), textDecorationLine: "underline" }}>
              {copy.byName}
            </Text>
          </Pressable>
        ) : null}

      </View>

      {/* A quiet way out when nothing has read for a while (#195) — its own
          wrapper, clear of the switcher via `switcherClearance` rather than
          the tighter spacing the panel above uses, per the fixed-inset
          lesson at `SWITCHER_HEIGHT`'s own comment. Only ever shown while
          genuinely idle, so it can never sit over the panel or a found
          sheet. */}
      {showHint && status.kind === "idle" && (
        <View
          style={{
            position: "absolute",
            left: STAGE_INSET,
            right: STAGE_INSET,
            bottom: switcherClearance,
            alignItems: "center",
          }}
        >
          <Pressable
            onPress={onHint}
            accessibilityRole="button"
            accessibilityLabel={READY_BARCODE.link}
            style={{ minHeight: TOUCH_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: 12.5, color: withAlpha(CANVAS, 0.85), textDecorationLine: "underline" }}>
              {READY_BARCODE.link}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
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
  focusedRef,
  reads,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  cameraRef: React.RefObject<CameraView | null>;
  cameraSize: Size | null;
  windowBox: Box | null;
  barcode?: string;
  /** Call before any navigation away from this stage that isn't a tab switch. */
  preserveMode: () => void;
  /** True while the scanner is the focused screen; a read that finishes after it is left is dropped. */
  focusedRef: React.RefObject<boolean>;
  /**
   * Shared with the parent screen, so switching mode away (`selectMode`) or
   * leaving the scanner entirely (the focus-effect cleanup) can invalidate a
   * read this exact mount started. See issue #191.
   */
  reads: ReturnType<typeof createStaleGuard>;
}) {
  const insets = useSafeAreaInsets();
  const needsPermission = permission !== null && !permission.granted;
  const clearance = Math.max(STAGE_BOTTOM, insets.bottom + 12) + SWITCHER_HEIGHT + FRAME_MARGIN_ABOVE_SWITCHER;
  // One generation per mount — switching to Barcode and back to Photo
  // remounts this stage, so a read from the earlier mount is stale even if
  // it lands while `mode` reads "Photo" again by the time it resolves. Read
  // once via useState's lazy initializer, not useRef's initial-value
  // argument: that argument is still evaluated on every render even though
  // only the first one is kept, which would advance the generation counter
  // on every re-render of this stage.
  const [myGeneration] = useState(() => reads.begin());
  const stillWanted = useCallback(
    () => focusedRef.current && reads.isCurrent(myGeneration),
    [focusedRef, reads, myGeneration]
  );
  // Where a finished read goes, whether it came from the camera or a chosen
  // photo: straight to the verdict, no name or barcode required first
  // (issue #214) — naming and adding the product is a follow-up offered from
  // that screen, not a gate in front of it.
  const openVerdict = () => {
    // The X (or a tab switch), or a mode switch away and back, can land
    // while a read is still pending.
    if (!stillWanted()) return;
    preserveMode();
    router.push({ pathname: "/label-result", params: barcode ? { barcode } : {} });
  };

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
          onRead={openVerdict}
          isStillWanted={stillWanted}
        />
      ) : null}

      {needsPermission ? (
        <CameraPermissionScreen
          permission={permission}
          requestPermission={requestPermission}
          mode="photo"
          bottomInset={clearance}
          extra={<ChoosePhotoInstead barcode={barcode} onRead={openVerdict} isStillWanted={stillWanted} />}
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
// The gap between the mode switcher's glass pill and the thumb that slides in it.
const SWITCHER_PADDING = 4;
// Apple's own spring for a control like this: SwiftUI's default `.spring`
// shape (damping fraction 0.85) at a segmented control's pace (response
// 0.35 s), converted to stiffness and damping for a mass of 1:
// stiffness = (2π / response)², damping = 4π × fraction / response.
const IOS_SPRING = { mass: 1, stiffness: 322, damping: 30.5 };
// How far in the bottom wrapper (mode pills, status panel) sits from each edge.
const STAGE_INSET = 20;
// The glass buttons across the top (a whole touch target, 8 below the safe
// area); the frame starts clear of them.
const CLOSE_CLEARANCE = 44;
// Clear of the bottom edge and the home indicator.
const STAGE_BOTTOM = 20;
const FRAME_MARGIN_ABOVE_SWITCHER = 24;
// How long a barcode can sit unread in frame before offering Photo mode as
// the way out (#195) — long enough that a normal read (under a second)
// never brushes it, short enough that someone stuck on a blurry or
// dark-shelf barcode isn't left guessing.
const IDLE_HINT_DELAY_MS = 8_000;

const READY_BARCODE = scanStateCopy({ kind: "ready", mode: "barcode" });
const SCAN_SOMETHING_ELSE = scanStateCopy({ kind: "not-ours-yet" }).link;

