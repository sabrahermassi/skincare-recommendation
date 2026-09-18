import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState, type ReactElement } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Rect } from "react-native-svg";

import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { Text } from "@/components/Text";
import { canPhotographLabelFor, failureMessage, fetchProductByBarcode, type FetchFailure } from "@/data/api";
import { COLORS } from "@/lib/colors";
import { useAppStore } from "@/store/useAppStore";
import { CAMERA_STAGE, CANVAS, CTA, INK, MUTED, SCANNER_FRAME, TOUCH_TARGET, TYPE, withAlpha } from "@/lib/tokens";

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

type Mode = "Barcode" | "Label photo";
/**
 * `missed` and `unreachable` are deliberately separate.
 *
 * They used to be one state: every non-404 outcome — a timeout, a dead
 * connection, a rate limit — landed in `missed` and the panel said "Not in our
 * catalogue yet". So in a shop with one bar of signal the app stated that a
 * product did not exist, logged that to history, and offered "Photograph the
 * label" as the way out — which needs the same network that had just failed.
 * Two failures in a row, on the one interaction this app exists for.
 */
type Status =
  | { kind: "idle" }
  | { kind: "looking"; code: string }
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
 * Icons for the mode switcher, paths copied from the Scanner mockup. The row
 * is icon-only now — no label under Barcode/Label photo — so these are drawn
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

const MODES: {
  label: Mode;
  Icon: (props: { color: string; size?: number }) => ReactElement;
}[] = [
  { label: "Barcode", Icon: BarcodeIcon },
  { label: "Label photo", Icon: PhotoIcon },
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

  const busy = useRef(false);

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
    async (data: string) => {
      if (busy.current) return;
      busy.current = true;
      setStatus({ kind: "looking", code: data });

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
        preserveMode();
        router.push({ pathname: "/result/[id]", params: { id: product.id } });
        return; // `busy` clears on blur
      }

      recordView({ id: data, known: false, score: null, warnings: 0 });
      setStatus({ kind: "missed", code: data });
      busy.current = false;
    },
    [recordView, preserveMode]
  );

  // Most devices only let one CameraView hold the camera at a time. This
  // screen is a tab root, so pushing /scan-label on top of it (after a missed
  // barcode, or from Label photo mode) does not unmount it — without this
  // check `live` stayed true underneath, and the new screen's camera lost the
  // contest and rendered black, looking like a broken camera rather than a
  // second one that never got the hardware.
  const live = isFocused && mode === "Barcode" && status.kind === "idle" && permission?.granted;

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
        onBarcode={handleBarcode}
        onDismissStatus={() => {
          setStatus({ kind: "idle" });
          busy.current = false;
        }}
        preserveMode={preserveMode}
        modeSwitcher={<ModeSwitcher mode={mode} setMode={setMode} floating />}
      />
    );
  }

  // Label photo shares the same full-screen dark stage Barcode uses — a
  // fixed-height card here used to shrink the whole screen down every time
  // you switched away from Barcode, which read as the app losing its own
  // layout rather than a deliberate choice.
  return (
    <FullScreenPane modeSwitcher={<ModeSwitcher mode={mode} setMode={setMode} floating />}>
      <LabelPhotoPane preserveMode={preserveMode} />
    </FullScreenPane>
  );
}

/**
 * The mode switcher, in both of its homes.
 *
 * `floating` draws it over the live camera — translucent dark pills, because
 * white cards over a viewfinder hide the thing you are aiming. Otherwise it is
 * the light row under the card, as the Scanner mockup draws it.
 *
 * Icon-only: each mode is named once by the surface it opens (a viewfinder or
 * a camera), and a text label beside an icon that already says the same thing
 * just crowded a small row.
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
        const color = floating ? (on ? INK : CANVAS) : on ? COLORS.accentText : COLORS.ink;
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
                    backgroundColor: on ? withAlpha(CANVAS, 0.95) : withAlpha(CAMERA_STAGE, 0.55),
                    borderWidth: 1,
                    borderColor: on ? "transparent" : withAlpha(CANVAS, 0.3),
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
            {floating ? (
              // A visible label under the glyph, not just accessibilityLabel
              // below — this is the screen the app opens on, and the photo
              // frame icon has no fixed meaning the way barcode bars do.
              <View style={{ alignItems: "center", gap: 2 }}>
                <Icon color={color} />
                <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color }} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            ) : (
              <Icon color={color} />
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Barcode mode, full screen — the MVP's scanner: live camera edge to edge,
 * automatic detection, no shutter button, no confirmation step.
 */
function BarcodeStage({
  permission,
  requestPermission,
  live,
  status,
  onBarcode,
  onDismissStatus,
  preserveMode,
  modeSwitcher,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  live: boolean;
  status: Status;
  onBarcode: (data: string) => void;
  onDismissStatus: () => void;
  /** Call before any navigation away from this stage that isn't a tab
   *  switch — see `Scan`'s own `preserveMode` doc comment for why. */
  preserveMode: () => void;
  modeSwitcher: ReactElement;
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
      : status.kind === "missed"
        ? "Not in our catalogue yet. Photograph the label and we'll add it."
        : status.kind === "unreachable"
          ? `${failureMessage(status.failure)} Try again, or find it in Browse.`
          : "";

  return (
    <View style={{ flex: 1, backgroundColor: CAMERA_STAGE }}>
      <ScreenReaderAnnouncer message={announcement} />
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
          <Viewfinder insets={insets} />
        </View>
      )}

      {/*
        Two reasons the frame can be dark, and it has to say which: permission
        not asked for yet, or permission refused. A silent black rectangle
        reads as "the scanner is gone".
      */}
      {!permission?.granted && (
        <View className="flex-1 items-center justify-center gap-4 px-10">
          <Text
            style={{ color: withAlpha(CANVAS, 0.8) }}
            className="text-center text-sm leading-5"
          >
            {permission?.canAskAgain === false
              ? "Camera access is blocked. Turn it back on for this app in your device settings, then come back."
              : "We need the camera to read barcodes. Nothing leaves your phone except the barcode number."}
          </Text>
          {permission?.canAskAgain === false ? null : (
            <Pressable
              onPress={requestPermission}
              style={{
                height: TOUCH_TARGET,
                paddingHorizontal: 24,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: CTA,
              }}
              className="active:opacity-90"
            >
              <Text style={{ fontSize: 14, fontWeight: "600", color: INK }}>Enable camera</Text>
            </Pressable>
          )}
          {/* This fires at the worst moment — camera access just failed — so
              the one sentence offering a way forward has to actually be the
              way forward. It was a plain Text: it named Browse and could not
              take you there, leaving the user to work out that "Browse" meant
              the second tab icon. Underlined and given the standard target
              height so it reads as the action it always claimed to be. */}
          <Pressable
            onPress={() => router.push("/browse")}
            accessibilityRole="link"
            style={{
              minHeight: TOUCH_TARGET,
              justifyContent: "center",
              paddingHorizontal: 12,
            }}
            className="active:opacity-70"
          >
            <Text
              style={{ color: withAlpha(CANVAS, 0.75), textDecorationLine: "underline" }}
              className="text-center text-xs leading-4"
            >
              Or find the product in Browse instead.
            </Text>
          </Pressable>
        </View>
      )}

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
                    : "Not in our catalogue yet"}
              </Text>
              <Text style={{ fontSize: TYPE.caption, color: MUTED }}>
                {status.kind === "looking"
                  ? "Reading the ingredients…"
                  : status.kind === "unreachable"
                    ? failureMessage(status.failure)
                    : "Photograph the label and we'll add it"}
              </Text>
            </View>
          </View>
        )}

        {status.kind === "missed" && (
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => {
                preserveMode();
                router.push({ pathname: "/scan-label", params: { barcode: status.code } });
              }}
              style={{
                flex: 1,
                height: TOUCH_TARGET,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                backgroundColor: CTA,
              }}
              className="active:opacity-90"
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>
                Photograph the label
              </Text>
            </Pressable>
            <Pressable
              onPress={onDismissStatus}
              style={{
                flex: 1,
                height: TOUCH_TARGET,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                backgroundColor: withAlpha(CANVAS, 0.2),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: CANVAS }}>Try another</Text>
            </Pressable>
          </View>
        )}

        {/* Deliberately not "Photograph the label": that needs the same
            network that just failed, so offering it here would be the second
            of two failures on one interaction. The only honest primary action
            when we could not reach the catalogue is to ask it again. */}
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
                backgroundColor: CTA,
              }}
              className="active:opacity-90"
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>Try again</Text>
            </Pressable>
            <Pressable
              onPress={onDismissStatus}
              style={{
                flex: 1,
                height: TOUCH_TARGET,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: 999,
                backgroundColor: withAlpha(CANVAS, 0.2),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: CANVAS }}>Try another</Text>
            </Pressable>
          </View>
        )}

        {/* A miss is the common case here, not the exception — the catalogue
            covers a fraction of what's on shelves — so the recovery options
            above (photograph it, try again) need a third: check whether it's
            already in the library under a different lookup path. Same
            pattern as the permission-denied panel's own Browse link above.
            Offered after an unreachable lookup too, and it is the one
            suggestion on this panel that still works with no connection:
            Browse renders from the cached catalogue. */}
        {(status.kind === "missed" || status.kind === "unreachable") && (
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

        {modeSwitcher}
      </View>
    </View>
  );
}

/**
 * Label photo's stage — full screen and dark, exactly like Barcode's, so
 * switching modes never changes the size of the scanner. It used to be a
 * 293pt card in a scrollable light page, which shrank the whole screen down
 * the moment you left Barcode mode and read as the app losing its own layout
 * rather than a deliberate choice.
 */
function FullScreenPane({
  modeSwitcher,
  children,
}: {
  modeSwitcher: ReactElement;
  children: ReactElement;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: CAMERA_STAGE }}>
      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 24,
          paddingBottom: Math.max(20, insets.bottom + 12) + 64,
        }}
      >
        {children}
      </View>

      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: Math.max(20, insets.bottom + 12),
        }}
      >
        {modeSwitcher}
      </View>
    </View>
  );
}

/**
 * Label photo mode's content — just the explainer and the one action it
 * needs. There used to be a second, redundant way into the same camera
 * ("No barcode? Photograph the label instead") sitting below the mode
 * switcher; with Open the camera already right here, it named the same
 * action twice.
 */
function LabelPhotoPane({ preserveMode }: { preserveMode: () => void }) {
  return (
    <View
      style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 18, paddingHorizontal: 30 }}
    >
      {/* A drawn label with an ingredient list on it — the mode was a
          paragraph and a button on an otherwise empty dark screen, which
          reads as a screen that failed to load rather than a choice. */}
      <Svg width={78} height={92} viewBox="0 0 78 92" fill="none">
        <Rect
          x={9}
          y={5}
          width={60}
          height={82}
          rx={9}
          stroke={SCANNER_FRAME}
          strokeOpacity={0.55}
          strokeWidth={2}
        />
        <Path
          d="M21 24h36M21 36h36M21 48h26M21 60h32M21 72h20"
          stroke={SCANNER_FRAME}
          strokeOpacity={0.35}
          strokeWidth={3}
          strokeLinecap="round"
        />
        <Circle cx={58} cy={70} r={15} fill={CAMERA_STAGE} />
        <Circle cx={56} cy={68} r={9.5} stroke={COLORS.toneGood} strokeWidth={2.6} />
        <Path
          d="m63 75 6.5 6.5"
          stroke={COLORS.toneGood}
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      </Svg>

      <Text
        style={{ color: withAlpha(CANVAS, 0.8) }}
        className="text-center text-sm leading-5"
      >
        Photograph the ingredient list on the back and we&apos;ll read it.
        Works on anything, even products we&apos;ve never seen.
      </Text>
      <Pressable
        onPress={() => {
          preserveMode();
          router.push("/scan-label");
        }}
        style={{
          height: TOUCH_TARGET,
          paddingHorizontal: 24,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: CTA,
        }}
        className="active:opacity-90"
      >
        <Text style={{ fontSize: 14, fontWeight: "600", color: INK }}>Open the camera</Text>
      </Pressable>
    </View>
  );
}

/**
 * Corner brackets and a scan line — the design's framing affordance, at its
 * own measurements: 32pt brackets in 3pt of SCANNER_FRAME, inset 33 from each
 * side, 29 from the top and 71 from the bottom of the 293pt card. It used to
 * be a fixed 236×150 box floated in the middle, which put the frame in a
 * different place on every screen width.
 */
// The floating mode switcher's own pill height (see ModeSwitcher's
// `floating` style) plus the same bottom offset its wrapping View uses
// (`Math.max(20, insets.bottom + 12)`) and a margin above it — this frame
// used to be measured off a 293pt card that no longer exists (the stage is
// full-bleed now), so a fixed bottom inset put the frame's bottom edge, and
// its instruction text, underneath the switcher rather than clear of it.
const SWITCHER_HEIGHT = 52;
const FRAME_MARGIN_ABOVE_SWITCHER = 24;

function Viewfinder({ insets }: { insets: { top: number; bottom: number } }) {
  // Border-color as inline `style` rather than a `border-[${SCANNER_FRAME}]`
  // className: NativeWind's arbitrary-value classes are picked up by
  // scanning the literal source text, so an interpolated hex here would
  // never be statically found and the border would silently not render —
  // the same class of bug this file's own `fontFamily` note warns about.
  // Border-width stays a className since those arbitrary values are plain
  // numbers, not tied to the dynamic token.
  const corner = "absolute h-8 w-8";
  const bottomInset =
    Math.max(20, insets.bottom + 12) + SWITCHER_HEIGHT + FRAME_MARGIN_ABOVE_SWITCHER;
  return (
    <View style={{ position: "absolute", top: insets.top + 24, bottom: bottomInset, left: 33, right: 33 }}>
      <View style={{ borderColor: SCANNER_FRAME }} className={`${corner} left-0 top-0 rounded-tl-lg border-l-[3px] border-t-[3px]`} />
      <View style={{ borderColor: SCANNER_FRAME }} className={`${corner} right-0 top-0 rounded-tr-lg border-r-[3px] border-t-[3px]`} />
      <View style={{ borderColor: SCANNER_FRAME }} className={`${corner} bottom-0 left-0 rounded-bl-lg border-b-[3px] border-l-[3px]`} />
      <View style={{ borderColor: SCANNER_FRAME }} className={`${corner} bottom-0 right-0 rounded-br-lg border-b-[3px] border-r-[3px]`} />
      <View className="absolute inset-x-3 top-1/2 h-0.5 rounded-full bg-tone-good" />

      {/* The instruction the design sets inside the frame. Without it the
          viewfinder is four brackets over a black rectangle and says nothing
          about what to point it at. */}
      <View style={{ position: "absolute", left: 0, right: 0, top: 67 }} className="items-center">
        <Text
          style={{ maxWidth: 200, fontSize: 14, lineHeight: 21, color: withAlpha(SCANNER_FRAME, 0.9) }}
          className="text-center"
        >
          Position barcode or ingredient list in the frame
        </Text>
      </View>
    </View>
  );
}


