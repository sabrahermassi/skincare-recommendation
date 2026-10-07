import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";

import { BounceCard } from "@/components/BounceCard";
import { CloseCross } from "@/components/IconCircle";
import { TimeIcon } from "@/components/home/TimeIcon";
import { Text } from "@/components/Text";
import type { HomeTip } from "@/lib/home-today";
import { haptic } from "@/lib/haptics";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { BUTTON, DISPLAY_FONT, HAND_FONT, HOME_TODAY, ICON_SHADOW, INK, MUTED, SCRIM, SHEET_SHADOW, SPACE, TYPE, WHITE, LEADING, TRACKING } from "@/lib/tokens";

const ENVELOPE = require("@/assets/illustrations/tip-envelope.webp");
// The same picture in layers (7 October 2026), drawn apart so its own letter can leave: the envelope
// with nothing in it, the letter, and the pocket's front, which the letter comes out from behind.
const ENVELOPE_OPEN = require("@/assets/illustrations/tip-envelope-open.webp");
const ENVELOPE_LETTER = require("@/assets/illustrations/tip-letter.webp");
const ENVELOPE_FRONT = require("@/assets/illustrations/tip-envelope-front.webp");
// The letter again, upright and large: the page the tip is written on (owner, 7 October 2026:
// the letter is the note, not a card drawn for it).
const LETTER_PAGE = require("@/assets/illustrations/tip-letter-open.webp");

// Read off the hand-off (handoff_home_and_tip), and its animation's timings.
const ENVELOPE_SIZE = 176;
const ROW_HEIGHT = 160;
const BLUR = 4;
const CLOSE_SIZE = 40;
const OPEN_EASING = Easing.bezier(0.3, 0.7, 0.2, 1);

// The opening (7 October 2026): the envelope on Home lifts to the middle of the
// page, a sheet is drawn up out of its pocket, and the sheet opens into the note
// as the envelope drops away. One moment, about a second, then the words.
/** The envelope on the stage: a square, this far above the bottom of the screen. */
const STAGE = { size: 280, bottom: 130 } as const;
/**
 * The letter in the picture, as fractions of the picture: how far it rises to
 * clear the pocket and how far it leans as it does (its sides are not quite
 * upright), where its middle is once it is out, its width, and its tilt.
 */
const LETTER = { rise: 170 / 720, lean: -12 / 720, outX: 388 / 720, outY: 157 / 720, width: 289 / 720, tilt: "-8.7deg" } as const;
/** The letter's height for its width. */
const PAGE_SHAPE = 740 / 795;
/** The share of the sheet's path spent leaving the pocket. */
const LIFTED = 0.25;
const CLOSE_MS = 200;
/**
 * Two paces. A tip opened for the first time is a small ritual (owner, 7 October
 * 2026: the quick one had "nothing magical about it"), and it is one movement
 * (owner, same day: no stop on the way): the letter starts out of the pocket
 * while the envelope is still arriving, and goes on into the note without
 * resting, all at one even, unhurried speed (owner: not slow then sudden); then
 * the tip is written across the page. Read again, it opens quickly: a ritual
 * seen once is a delay the second time.
 *
 * Only the envelope's way is set here; the letter's follows from it, so that the
 * envelope is never still on the screen (owner): the letter starts halfway
 * through `travelMs` and is clear of the pocket the moment the envelope arrives,
 * and the envelope starts to go at once.
 */
const PACE = {
  ritual: { travelMs: 900, awayMs: 300, wordsAfterMs: 520, writeMs: 1100 },
  quick: { travelMs: 460, awayMs: 200, wordsAfterMs: 260, writeMs: 0 },
} as const;
/** One easing for the envelope and the letter, so neither is quicker than the other. */
const EVEN = Easing.inOut(Easing.sin);
/** The share of the letter's whole way, in time, gone when the letter is clear of the pocket (`LIFTED` of the way, on `EVEN`). */
const LIFTED_AT = Math.acos(1 - 2 * LIFTED) / Math.PI;

/** Where the envelope sits on Home when it is tapped, in the window. */
export type TipOrigin = { x: number; y: number; width: number; height: number };
// A tip this long steps down from 34 to 26 in the hand face, so the note stays a note.
const LONG_TIP = 45;

/**
 * The skincare tip on Home (hand-off): an envelope at the bottom of the page,
 * "Skincare tip" and a line on what it is about; once read, "Tip read ✓" and
 * when the next one comes, with "Read again".
 */
export function TipEnvelope({ tip, read, open = false, onOpen }: { tip: HomeTip; read: boolean; /** The note is open: the envelope has left the page for it. */ open?: boolean; onOpen: (origin: TipOrigin | null) => void }) {
  const picture = useRef<View>(null);
  // The note's envelope starts from where this one is, so it reads as the same envelope lifting.
  const press = () => {
    if (!picture.current?.measureInWindow) return onOpen(null);
    let answered = false;
    picture.current.measureInWindow((x, y, width, height) => {
      answered = true;
      onOpen(width > 0 ? { x, y, width, height } : null);
    });
    // A test renderer never measures: open anyway.
    if (!answered) setTimeout(() => (answered ? undefined : onOpen(null)), 0);
  };
  const head = read ? "Tip read ✓" : "Skincare tip";
  const line = read ? tip.next : tip.line;
  const action = read ? "Read again ›" : "Tap to open ›";
  return (
    <BounceCard
      onPress={press}
      pressedScale={0.97}
      accessibilityLabel={read ? `Tip read. ${tip.next}. Read again` : `Open skincare tip. ${tip.line}`}
      style={{ marginTop: SPACE.gutter, minHeight: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: SPACE.tight }}
    >
      <View ref={picture} collapsable={false} style={{ width: ENVELOPE_SIZE, height: ENVELOPE_SIZE, marginTop: -8, marginBottom: -8, marginLeft: -12, marginRight: -8, opacity: open && !reduceMotionNow() ? 0 : 1 }}>
        {/* Once read, the letter has been taken out of it. */}
        <Image source={ENVELOPE} contentFit="contain" accessibilityLabel="" style={{ flex: 1, transform: [{ rotate: "-6deg" }] }} />
      </View>
      <View style={{ flex: 1, gap: SPACE.text }}>
        <Text style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.title, lineHeight: LEADING.title, color: INK }}>{head}</Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>{line}</Text>
        <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: BUTTON.primary.fill }}>{action}</Text>
      </View>
    </BounceCard>
  );
}

/**
 * The opened tip: the page dims, Home's envelope lifts to the middle, a sheet is
 * drawn up out of its pocket and opens into the note, and the envelope drops
 * away; the note's words come last (about a second in all). Closing, the note
 * folds back and fades. With Reduce Motion on it is simply there, and gone.
 * The tip and one reason, nothing to tap but ✕. Coloured like the card: light
 * blue tonight, butter this morning, white for a general tip.
 */
export function TipNote({ tip, visible, origin = null, first = false, onClose }: { tip: HomeTip; visible: boolean; /** Where Home's envelope was when it was tapped. */ origin?: TipOrigin | null; /** This tip had not been read: it opens slowly, once. */ first?: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {visible ? <OpenNote tip={tip} origin={origin} first={first} onClose={onClose} /> : null}
    </Modal>
  );
}

function OpenNote({ tip, origin, first, onClose }: { tip: HomeTip; origin: TipOrigin | null; first: boolean; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [still] = useState(() => reduceMotionNow());
  const [dim] = useState(() => new Animated.Value(still ? 1 : 0));
  // The envelope's way from Home to the stage, then its falling away.
  const [travel] = useState(() => new Animated.Value(still ? 1 : 0));
  const [away] = useState(() => new Animated.Value(0));
  // The sheet: 0 in the pocket, `LIFTED` clear of it, 1 open as the note.
  const [note] = useState(() => new Animated.Value(still ? 1 : 0));
  const [words] = useState(() => [0, 1, 2].map(() => new Animated.Value(still ? 1 : 0)));
  const [leaving] = useState(() => new Animated.Value(0));
  // The tip being written across the page (first time only).
  const [writing] = useState(() => new Animated.Value(still || !first ? 1 : 0));
  const [pace] = useState(() => (first ? PACE.ritual : PACE.quick));
  const closing = useRef(false);
  useEffect(() => {
    if (still) return;
    const timing = (value: Animated.Value, toValue: number, duration: number, delay = 0, easing = OPEN_EASING) => Animated.timing(value, { toValue, duration, delay, easing, useNativeDriver: true });
    const liftAt = pace.travelMs / 2;
    const noteMs = (pace.travelMs - liftAt) / LIFTED_AT;
    const opened = pace.travelMs;
    const settled = liftAt + noteMs;
    const run = Animated.parallel([
      timing(dim, 1, 300, 0, Easing.out(Easing.quad)),
      timing(travel, 1, pace.travelMs, 0, EVEN),
      timing(note, 1, noteMs, liftAt, EVEN),
      timing(away, 1, pace.awayMs, opened, Easing.out(Easing.quad)),
      ...words.map((value, i) => timing(value, 1, 420, opened + pace.wordsAfterMs + i * 80)),
      ...(pace.writeMs ? [timing(writing, 1, pace.writeMs, opened + pace.wordsAfterMs + 80, Easing.inOut(Easing.quad))] : []),
    ]);
    run.start();
    // One touch in the hand, first time only: the note coming to rest.
    const touches = pace.writeMs ? [setTimeout(haptic.select, settled)] : [];
    return () => {
      run.stop();
      touches.forEach(clearTimeout);
    };
  }, [still, dim, travel, away, note, words, writing, pace]);

  // Closing: the note folds back a little and fades with the page's dimming, then it is gone.
  const close = () => {
    if (still) return onClose();
    if (closing.current) return;
    closing.current = true;
    Animated.timing(leaving, { toValue: 1, duration: CLOSE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => onClose());
  };

  const theme = tip.kind === "general" ? null : HOME_TODAY[tip.kind];
  const fade = (value: Animated.Value) => ({ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] });

  // The stage, and where things are on it.
  const stage = { left: (width - STAGE.size) / 2, top: height - STAGE.bottom - STAGE.size };
  const noteWidth = width - 2 * SPACE.inset;
  const sheet = (STAGE.size * LETTER.width) / noteWidth;
  // Where the letter is once it is out of the pocket, measured from the middle of the screen, where the note ends.
  const from = { x: stage.left + STAGE.size * LETTER.outX - width / 2, y: stage.top + STAGE.size * LETTER.outY - height / 2 };
  // The envelope starts where Home's is (or just below the stage, when that is not known).
  const start = origin
    ? { x: origin.x + origin.width / 2 - (stage.left + STAGE.size / 2), y: origin.y + origin.height / 2 - (stage.top + STAGE.size / 2), scale: origin.width / STAGE.size, opacity: 1 }
    : { x: 0, y: 60, scale: 1, opacity: 0 };
  const lifted = LIFTED;
  const envelopeMoves = {
    opacity: Animated.multiply(travel.interpolate({ inputRange: [0, 0.4, 1], outputRange: [start.opacity, 1, 1] }), away.interpolate({ inputRange: [0, 1], outputRange: [1, 0] })),
    transform: [
      { translateX: travel.interpolate({ inputRange: [0, 1], outputRange: [start.x, 0] }) },
      { translateY: Animated.add(travel.interpolate({ inputRange: [0, 1], outputRange: [start.y, 0] }), away.interpolate({ inputRange: [0, 1], outputRange: [0, 56] })) },
      { scale: travel.interpolate({ inputRange: [0, 1], outputRange: [start.scale, 1] }) },
      { rotate: travel.interpolate({ inputRange: [0, 1], outputRange: ["-6deg", "0deg"] }) },
    ],
  };
  const out = leaving.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: Animated.multiply(dim, out) }]}>
        <BlurView intensity={BLUR} tint="default" style={StyleSheet.absoluteFill} />
        {/* Tapping outside closes it for a sighted person; a screen reader has the ✕ button, so this is not a second "Close". */}
        <Pressable onPress={close} accessible={false} style={{ flex: 1, backgroundColor: SCRIM }} />
      </Animated.View>

      {/* The envelope, lifted from Home to the stage; it drops away once the sheet has left it. */}
      {still ? null : (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", left: stage.left, top: stage.top, width: STAGE.size, height: STAGE.size }, envelopeMoves]}>
          <Image source={ENVELOPE_OPEN} contentFit="contain" accessibilityLabel="" style={StyleSheet.absoluteFill} />
          {/* The picture's own letter, rising out of the pocket; it gives way to the note once it is out. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              {
                opacity: note.interpolate({ inputRange: [0, lifted + 0.04, lifted + 0.05], outputRange: [1, 1, 0], extrapolate: "clamp" }),
                transform: [
                  { translateX: note.interpolate({ inputRange: [0, lifted], outputRange: [0, STAGE.size * LETTER.lean], extrapolate: "clamp" }) },
                  { translateY: note.interpolate({ inputRange: [0, lifted], outputRange: [0, -STAGE.size * LETTER.rise], extrapolate: "clamp" }) },
                ],
              },
            ]}
          >
            <Image source={ENVELOPE_LETTER} contentFit="contain" accessibilityLabel="" style={{ flex: 1 }} />
          </Animated.View>
          <Image source={ENVELOPE_FRONT} contentFit="contain" accessibilityLabel="" style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}

      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: "center", paddingHorizontal: SPACE.inset }]}>
        <Animated.View
          accessibilityRole="summary"
          style={{
            minHeight: noteWidth * PAGE_SHAPE,
            justifyContent: "center",
            ...SHEET_SHADOW,
            // Not there until the letter is out of the pocket; then it takes the letter's place (it is the same sheet) and grows.
            opacity: Animated.multiply(note.interpolate({ inputRange: [0, lifted, lifted + 0.04, 1], outputRange: [0, 0, 1, 1] }), out),
            transform: [
              { translateX: note.interpolate({ inputRange: [0, lifted, 1], outputRange: [from.x, from.x, 0] }) },
              { translateY: Animated.add(note.interpolate({ inputRange: [0, lifted, 1], outputRange: [from.y, from.y, 0] }), leaving.interpolate({ inputRange: [0, 1], outputRange: [0, 16] })) },
              { rotate: note.interpolate({ inputRange: [0, lifted, 1], outputRange: [LETTER.tilt, LETTER.tilt, "0deg"] }) },
              { scale: Animated.multiply(note.interpolate({ inputRange: [0, lifted, 1], outputRange: [sheet, sheet, 1] }), leaving.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] })) },
            ],
          }}
        >
          <Image source={LETTER_PAGE} contentFit="fill" accessibilityLabel="" style={StyleSheet.absoluteFill} />
          <View style={{ padding: SPACE.large, gap: SPACE.block }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.text }}>
              <Animated.View style={[{ flex: 1, flexDirection: "row", alignItems: "center", gap: SPACE.text }, fade(words[0])]}>
                {tip.kind === "general" ? null : <TimeIcon time={tip.kind} />}
                <Text style={{ flexShrink: 1, fontSize: TYPE.caption, fontWeight: "600", letterSpacing: TRACKING.caption, textTransform: "uppercase", color: theme?.ink ?? MUTED }}>{tip.label}</Text>
              </Animated.View>
              {/* A blank sheet until it has opened: the ✕ comes with the words. */}
              <Animated.View style={{ opacity: words[0] }}>
                <Pressable
                  onPress={close}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  hitSlop={4}
                  style={{ width: CLOSE_SIZE, height: CLOSE_SIZE, borderRadius: CLOSE_SIZE / 2, backgroundColor: WHITE, alignItems: "center", justifyContent: "center", ...ICON_SHADOW }}
                  className="active:opacity-80"
                >
                  <CloseCross />
                </Pressable>
              </Animated.View>
            </View>
            <Animated.View style={fade(words[1])}>
              {/* Written across the page: the line is uncovered from the left, by a window that slides off it. */}
              <Animated.View style={{ overflow: "hidden", transform: [{ translateX: writing.interpolate({ inputRange: [0, 1], outputRange: [-noteWidth, 0] }) }] }}>
                <Animated.View style={{ transform: [{ translateX: writing.interpolate({ inputRange: [0, 1], outputRange: [noteWidth, 0] }) }] }}>
                  <Text style={{ marginTop: SPACE.block, fontFamily: HAND_FONT, fontSize: tip.tip.tip.length > LONG_TIP ? 26 : TYPE.display, lineHeight: tip.tip.tip.length > LONG_TIP ? 34 : 42, color: INK }}>{tip.tip.tip}</Text>
                </Animated.View>
              </Animated.View>
            </Animated.View>
            <Animated.View style={fade(words[2])}>
              <Text style={{ fontSize: TYPE.body, lineHeight: LEADING.body, color: theme?.ink ?? MUTED }}>{tip.tip.why}</Text>
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}
