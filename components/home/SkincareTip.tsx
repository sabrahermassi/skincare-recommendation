import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";

import { BounceCard } from "@/components/BounceCard";
import { CloseCross } from "@/components/IconCircle";
import { TimeIcon } from "@/components/home/TimeIcon";
import { WateryWash } from "@/components/home/WateryWash";
import { Text } from "@/components/Text";
import type { HomeTip } from "@/lib/home-today";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { BUTTON, DISPLAY_FONT, HAND_FONT, HOME_TODAY, ICON_SHADOW, INK, MUTED, SCRIM, SHEET_SHADOW, SPACE, TYPE, WHITE, RADIUS } from "@/lib/tokens";

const ENVELOPE = require("@/assets/illustrations/tip-envelope.webp");

// Read off the hand-off (handoff_home_and_tip), and its animation's timings.
const ENVELOPE_SIZE = 176;
const ROW_HEIGHT = 160;
const BLUR = 4;
const CLOSE_SIZE = 40;
const OPEN_EASING = Easing.bezier(0.3, 0.7, 0.2, 1);
// A tip this long steps down from 34 to 26 in the hand face, so the note stays a note.
const LONG_TIP = 45;

/**
 * The skincare tip on Home (hand-off): an envelope at the bottom of the page,
 * "Skincare tip" and a line on what it is about; once read, "Tip read ✓" and
 * when the next one comes, with "Read again".
 */
export function TipEnvelope({ tip, read, onOpen }: { tip: HomeTip; read: boolean; onOpen: () => void }) {
  const head = read ? "Tip read ✓" : "Skincare tip";
  const line = read ? tip.next : tip.line;
  const action = read ? "Read again ›" : "Tap to open ›";
  return (
    <BounceCard
      onPress={onOpen}
      pressedScale={0.97}
      accessibilityLabel={read ? `Tip read. ${tip.next}. Read again` : `Open skincare tip. ${tip.line}`}
      style={{ marginTop: SPACE.gutter, minHeight: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: 4 }}
    >
      <Image
        source={ENVELOPE}
        contentFit="contain"
        accessibilityLabel=""
        style={{ width: ENVELOPE_SIZE, height: ENVELOPE_SIZE, marginTop: -8, marginBottom: -8, marginLeft: -12, marginRight: -8, transform: [{ rotate: "-6deg" }] }}
      />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.title, lineHeight: 24, color: INK }}>{head}</Text>
        <Text style={{ fontSize: TYPE.body, lineHeight: 20, color: MUTED }}>{line}</Text>
        <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: BUTTON.primary.fill }}>{action}</Text>
      </View>
    </BounceCard>
  );
}

/**
 * The opened tip (hand-off): the page dims, the envelope rises, and the note
 * slides out of it and grows; its words fade in last (about 1.5 s; with
 * Reduce Motion it is simply there). The tip and one reason, nothing to tap
 * but ✕. Coloured like the card: light blue tonight, butter this morning,
 * white for a general tip.
 */
export function TipNote({ tip, visible, onClose }: { tip: HomeTip; visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {visible ? <OpenNote tip={tip} onClose={onClose} /> : null}
    </Modal>
  );
}

function OpenNote({ tip, onClose }: { tip: HomeTip; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const [still] = useState(() => reduceMotionNow());
  const [dim] = useState(() => new Animated.Value(still ? 1 : 0));
  const [envelope] = useState(() => new Animated.Value(still ? 1 : 0));
  const [note] = useState(() => new Animated.Value(still ? 1 : 0));
  const [words] = useState(() => [0, 1, 2].map(() => new Animated.Value(still ? 1 : 0)));
  useEffect(() => {
    if (still) return;
    const timing = (value: Animated.Value, duration: number, delay: number, easing = OPEN_EASING) => Animated.timing(value, { toValue: 1, duration, delay, easing, useNativeDriver: true });
    const run = Animated.parallel([
      timing(dim, 300, 0, Easing.out(Easing.quad)),
      timing(envelope, 1400, 0, Easing.linear),
      timing(note, 1100, 250),
      ...words.map((value, i) => timing(value, 420, 1100 + i * 80)),
    ]);
    run.start();
    return () => run.stop();
  }, [still, dim, envelope, note, words]);

  const theme = tip.kind === "general" ? null : HOME_TODAY[tip.kind];
  const fade = (value: Animated.Value) => ({ opacity: value, transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] });
  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: dim }]}>
        <BlurView intensity={BLUR} tint="default" style={StyleSheet.absoluteFill} />
        {/* Tapping outside closes it for a sighted person; a screen reader has the ✕ button, so this is not a second "Close". */}
        <Pressable onPress={onClose} accessible={false} style={{ flex: 1, backgroundColor: SCRIM }} />
      </Animated.View>

      {/* The envelope rises, tips, and falls away as the note leaves it. */}
      {still ? null : (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: (width - 340) / 2,
            bottom: 150,
            width: 340,
            height: 240,
            opacity: envelope.interpolate({ inputRange: [0, 0.25, 0.7, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateY: envelope.interpolate({ inputRange: [0, 0.25, 0.7, 1], outputRange: [60, 0, 0, 40] }) },
              { rotate: envelope.interpolate({ inputRange: [0, 0.25, 1], outputRange: ["-6deg", "-3deg", "-3deg"] }) },
            ],
          }}
        >
          <Image source={ENVELOPE} contentFit="contain" accessibilityLabel="" style={{ flex: 1 }} />
        </Animated.View>
      )}

      <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: "center", paddingHorizontal: 20 }]}>
        <Animated.View
          accessibilityRole="summary"
          style={{
            borderRadius: RADIUS.panel,
            overflow: "hidden",
            backgroundColor: WHITE,
            ...SHEET_SHADOW,
            opacity: note.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
            transform: [
              { translateY: note.interpolate({ inputRange: [0, 0.3, 1], outputRange: [420, 300, 0] }) },
              { scale: note.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.55, 0.55, 1] }) },
            ],
          }}
        >
          {theme ? <WateryWash {...theme.wash} /> : null}
          <View style={{ paddingTop: 22, paddingHorizontal: 22, paddingBottom: 20, gap: SPACE.block }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: SPACE.text }}>
              <Animated.View style={[{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }, fade(words[0])]}>
                {tip.kind === "general" ? null : <TimeIcon time={tip.kind} />}
                <Text style={{ flexShrink: 1, fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: theme?.ink ?? MUTED }}>{tip.label}</Text>
              </Animated.View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={4}
                style={{ width: CLOSE_SIZE, height: CLOSE_SIZE, borderRadius: CLOSE_SIZE / 2, backgroundColor: WHITE, alignItems: "center", justifyContent: "center", ...ICON_SHADOW }}
                className="active:opacity-80"
              >
                <CloseCross />
              </Pressable>
            </View>
            <Animated.View style={fade(words[1])}>
              <Text style={{ marginTop: SPACE.block, fontFamily: HAND_FONT, fontSize: tip.tip.tip.length > LONG_TIP ? 26 : TYPE.display, lineHeight: tip.tip.tip.length > LONG_TIP ? 34 : 42, color: INK }}>{tip.tip.tip}</Text>
            </Animated.View>
            <Animated.View style={fade(words[2])}>
              <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: theme?.ink ?? MUTED }}>{tip.tip.why}</Text>
            </Animated.View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}
