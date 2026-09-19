import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect } from "react-native-svg";

import { LabelCamera } from "@/components/LabelCamera";
import { ScanIntro } from "@/components/ScanIntro";
import { barcodeBox, SCAN_SIDE_INSET, ScanViewfinder, type Box } from "@/components/ScanViewfinder";
import { ScreenReaderAnnouncer } from "@/components/ScreenReaderAnnouncer";
import { TERRACOTTA } from "@/components/shell/shared";
import { Text } from "@/components/Text";
import { canPhotographLabelFor, failureMessage, fetchProductByBarcode, type FetchFailure } from "@/data/api";
import { profileSummary } from "@/lib/profile";
import { SCAN_BUTTON_LIFT } from "@/lib/tab-bar";
import { useAppStore } from "@/store/useAppStore";
import { CAMERA_STAGE, CANVAS, CTA, INK, MUTED, SELECTED, TOUCH_TARGET, TYPE, withAlpha } from "@/lib/tokens";

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

type Mode = "Barcode" | "Photo";
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
  | { kind: "looking"; code: string; target?: Box }
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
  return <Ionicons name="camera-outline" size={size} color={color} />;
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
  const justFinishedQuiz = useAppStore((s) => s.justFinishedQuiz);
  const dismissQuizAcknowledgement = useAppStore((s) => s.dismissQuizAcknowledgement);
  const profile = useAppStore((s) => s.profile);

  // `profileSummary`'s capitalized-noun-phrase shape reads oddly mid-sentence
  // — browse.tsx's "Ranked for …" line has the same issue and lowercases it
  // for the same reason. A quiz finished with every question left unanswered
  // still has something to acknowledge, just not a summary.
  const profileSummaryText = profileSummary(profile);
  const quizAcknowledgementText = profileSummaryText
    ? `Set for ${profileSummaryText.toLowerCase()}. Scan anything to see how it fits.`
    : "Profile set. Scan anything to see how it fits.";

  const busy = useRef(false);

  // Tapping Barcode again after a miss or a failed lookup is how you scan
  // another: it clears the message and the camera comes back. That replaces the
  // "Try another" button the panel used to carry.
  const selectMode = useCallback(
    (next: Mode) => {
      if (next === "Barcode" && (status.kind === "missed" || status.kind === "unreachable")) {
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
        preserveMode();
        router.push({ pathname: "/result/[id]", params: { id: product.id } });
        return; // `busy` clears on blur
      }

      recordView({ id: data, known: false, score: null, warnings: 0 });
      setStatus({ kind: "missed", code: data });
      busy.current = false;
    },
    [recordView, preserveMode, dismissQuizAcknowledgement]
  );

  // Most devices only let one CameraView hold the camera at a time. This
  // screen is a tab root, so pushing /scan-label on top of it (after a missed
  // barcode, or from Ingredients mode) does not unmount it — without this
  // check `live` stayed true underneath, and the new screen's camera lost the
  // contest and rendered black, looking like a broken camera rather than a
  // second one that never got the hardware.
  const live =
    isFocused && mode === "Barcode" && (status.kind === "idle" || status.kind === "looking") && permission?.granted;

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
        preserveMode={preserveMode}
        modeSwitcher={
          <ModeSwitcher mode={mode} setMode={selectMode} light={permission !== null && !permission.granted} />
        }
        justFinishedQuiz={justFinishedQuiz}
        quizAcknowledgementText={quizAcknowledgementText}
        onDismissQuizAcknowledgement={dismissQuizAcknowledgement}
      />
    );
  }

  // Ingredients is the same full-screen stage as Barcode: the camera is live the
  // moment you switch to it, with a shutter — no step in between.
  return (
    <IngredientsStage
      permission={permission}
      requestPermission={requestPermission}
      active={isFocused}
      barcode={status.kind === "missed" ? status.code : undefined}
      preserveMode={preserveMode}
      modeSwitcher={
        <ModeSwitcher mode={mode} setMode={selectMode} light={permission !== null && !permission.granted} />
      }
    />
  );
}

/**
 * The mode switcher. Barcode sits flush with the scanner window's left edge and
 * Photo with its right edge; the space goes between them.
 *
 * Unselected, each is just its icon and name — no fill, no edge, as if it were
 * not in a button at all. Selected takes the quiz's selected look: a terracotta
 * outline round a peach fill, left see-through over the camera so the picture
 * still shows.
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
      {MODES.map(({ label, Icon }) => {
        const on = mode === label;
        const color = on ? (light ? INK : CANVAS) : light ? MUTED : withAlpha(CANVAS, 0.75);
        return (
          <Pressable
            key={label}
            onPress={() => setMode(label)}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            style={{
              width: MODE_PILL_WIDTH,
              height: SWITCHER_HEIGHT,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              borderRadius: SWITCHER_HEIGHT / 2,
              backgroundColor: on ? (light ? SELECTED : withAlpha(SELECTED, 0.22)) : "transparent",
              // Always drawn, transparent when unselected, so selecting does not move anything.
              borderWidth: 1.5,
              borderColor: on ? TERRACOTTA : "transparent",
            }}
          >
            <Icon color={color} size={20} />
            <Text style={{ fontSize: 13.5, fontWeight: "600", color }} numberOfLines={1}>
              {label}
            </Text>
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
  preserveMode,
  modeSwitcher,
  justFinishedQuiz,
  quizAcknowledgementText,
  onDismissQuizAcknowledgement,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  live: boolean;
  status: Status;
  onBarcode: (data: string, target?: Box) => void;
  /** Call before any navigation away from this stage that isn't a tab
   *  switch — see `Scan`'s own `preserveMode` doc comment for why. */
  preserveMode: () => void;
  modeSwitcher: ReactElement;
  /** See `justFinishedQuiz` on the store — issue #95. */
  justFinishedQuiz: boolean;
  quizAcknowledgementText: string;
  onDismissQuizAcknowledgement: () => void;
}) {
  const insets = useSafeAreaInsets();

  // Measured rather than guessed: `quizAcknowledgementText` is a variable
  // length sentence and can wrap to 2-3 lines depending on the profile, so a
  // fixed height would either clip short text with dead space or, worse,
  // undershoot long text and let the banner run into `Viewfinder`'s top
  // brackets underneath it. Found in review on #126 — the banner painted
  // directly over the frame's corners with no offset at all. Zero until the
  // first layout pass lands, same one-frame gap this file's camera-crop
  // measurement already accepts elsewhere.
  const [bannerHeight, setBannerHeight] = useState(0);
  const showQuizBanner = justFinishedQuiz && status.kind === "idle";

  // `ScreenReaderAnnouncer`'s own doc comment: react-native-web's `aria-live`
  // only fires on a change to content a screen reader is already watching —
  // text present the moment the live region mounts is never announced. On
  // web that is exactly the first-run path: `(tabs)/_layout.tsx` gates this
  // whole screen behind `hasSeenOnboarding` and returns a bare `<Redirect>`
  // until it flips, so `BarcodeStage` — and this announcer — mounts for the
  // first time already carrying `justFinishedQuiz=true`, with nothing to
  // transition from. Deferred a tick so the announcer mounts empty and the
  // real text lands as a genuine update; imperceptible on iOS/Android, where
  // `ScreenReaderAnnouncer` fires off `message` changing either way, not off
  // mount timing. Found by Codex in review on #126.
  const [announceQuizBannerReady, setAnnounceQuizBannerReady] = useState(false);
  useEffect(() => {
    if (!showQuizBanner) return;
    const id = setTimeout(() => setAnnounceQuizBannerReady(true), 0);
    return () => {
      clearTimeout(id);
      setAnnounceQuizBannerReady(false);
    };
  }, [showQuizBanner]);
  const announceQuizBanner = showQuizBanner && announceQuizBannerReady;

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
        ? "Not in our catalogue yet. Tap Photo below to photograph its ingredient list and add it."
        : status.kind === "unreachable"
          ? `${failureMessage(status.failure)} Try again, or find it in Browse.`
          : announceQuizBanner
            ? quizAcknowledgementText
            : "";

  // `null` is still asking the OS, which is not the same as refused — showing
  // the permission screen for that first moment flashed it at people who had
  // already said yes.
  const needsPermission = permission !== null && !permission.granted;
  const switcherClearance =
    Math.max(STAGE_BOTTOM, insets.bottom + 12) + SWITCHER_HEIGHT + FRAME_MARGIN_ABOVE_SWITCHER;

  return (
    <View style={{ flex: 1, backgroundColor: needsPermission ? CANVAS : CAMERA_STAGE, paddingTop: needsPermission ? insets.top : 0 }}>
      <ScreenReaderAnnouncer message={announcement} />
      {live ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] }}
          onBarcodeScanned={({ data, bounds, cornerPoints }) => onBarcode(data, barcodeBox({ bounds, cornerPoints }))}
        />
      ) : null}

      {permission?.granted && (status.kind === "idle" || status.kind === "looking") && (
        <ScanViewfinder
          topInset={insets.top + (showQuizBanner ? bannerHeight + 12 : 0)}
          bottomInset={switcherClearance}
          locked={status.kind === "looking"}
          target={status.kind === "looking" ? status.target : undefined}
        />
      )}

      {needsPermission && (
        <CameraPermissionIntro
          permission={permission}
          requestPermission={requestPermission}
          title="Scan a product"
          body="Point your camera at a barcode and we'll read the ingredients for you. Nothing leaves your phone except the barcode number."
          bottomInset={switcherClearance}
        />
      )}

      {/* Named acknowledgement of finishing the quiz — see issue #95. Only
          for the real 4-step finish (`justFinishedQuiz`), not a skip, and
          only while nothing else is on screen: a scan starting clears it
          (see `handleBarcode`), so it can never sit behind or fight a status
          panel for the same space. */}
      {showQuizBanner && (
        <View
          onLayout={(e) => setBannerHeight(e.nativeEvent.layout.height)}
          style={{
            position: "absolute",
            left: 20,
            right: 20,
            top: insets.top + 12,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderRadius: 14,
            backgroundColor: withAlpha(CANVAS, 0.95),
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text style={{ flex: 1, fontSize: 13, fontWeight: "600", color: INK }}>
            {quizAcknowledgementText}
          </Text>
          {/* `TOUCH_TARGET`, not hitSlop around the bare glyph — that left an
              effective ~30px target, under design/DESIGN_SYSTEM.md's
              documented 44px minimum "on every interactive element,
              everywhere in this system." Found by Codex in review on #126. */}
          <Pressable
            onPress={onDismissQuizAcknowledgement}
            style={{ width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: "center", justifyContent: "center" }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: MUTED }}>✕</Text>
          </Pressable>
        </View>
      )}

      {/* Status, then the switcher, stacked off the bottom edge. */}
      <View
        style={{
          position: "absolute",
          left: STAGE_INSET,
          right: STAGE_INSET,
          bottom: Math.max(STAGE_BOTTOM, insets.bottom + 12),
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
                    : "Tap Photo below and photograph its ingredient list to add it"}
              </Text>
            </View>
          </View>
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
                backgroundColor: CTA,
              }}
              className="active:opacity-90"
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: INK }}>Try again</Text>
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

        {modeSwitcher}
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
 * Ingredients mode, full screen like Barcode: the live camera and a shutter, so
 * the photo can be taken the moment the mode opens. `barcode` is the one from
 * a miss, so what gets photographed is saved under it.
 */
function IngredientsStage({
  permission,
  requestPermission,
  active,
  barcode,
  preserveMode,
  modeSwitcher,
}: {
  permission: ReturnType<typeof useCameraPermissions>[0];
  requestPermission: () => void;
  active: boolean;
  barcode?: string;
  /** Call before any navigation away from this stage that isn't a tab switch. */
  preserveMode: () => void;
  modeSwitcher: ReactElement;
}) {
  const insets = useSafeAreaInsets();
  const needsPermission = permission !== null && !permission.granted;
  const clearance = Math.max(STAGE_BOTTOM, insets.bottom + 12) + SWITCHER_HEIGHT + FRAME_MARGIN_ABOVE_SWITCHER;

  return (
    <View style={{ flex: 1, backgroundColor: needsPermission ? CANVAS : CAMERA_STAGE, paddingTop: needsPermission ? insets.top : 0 }}>
      {permission?.granted ? (
        <LabelCamera
          barcode={barcode}
          active={active}
          bottomInset={clearance}
          onResult={(params) => {
            preserveMode();
            router.push({ pathname: "/result/[id]", params });
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

      <View
        style={{
          position: "absolute",
          left: STAGE_INSET,
          right: STAGE_INSET,
          bottom: Math.max(STAGE_BOTTOM, insets.bottom + 12),
        }}
      >
        {modeSwitcher}
      </View>
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
// Clear of the tab bar's raised scan button, which rises into the stage.
const STAGE_BOTTOM = SCAN_BUTTON_LIFT + 12;
const FRAME_MARGIN_ABOVE_SWITCHER = 24;

