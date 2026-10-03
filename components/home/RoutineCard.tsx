import { Image } from "expo-image";
import { Fragment } from "react";
import { View } from "react-native";

import { BounceCard } from "@/components/BounceCard";
import { TimeIcon } from "@/components/home/TimeIcon";
import { WateryWash } from "@/components/home/WateryWash";
import { Text } from "@/components/Text";
import { cardKicker, cardPills, cardTitle, type Today } from "@/lib/home-today";
import { BUTTON, DISPLAY_FONT, HOME_TILE, HOME_TODAY, INK, MUTED, MUTED_FAINT, SPACE, TYPE, WHITE } from "@/lib/tokens";

const ROUTINE_ART = require("@/assets/illustrations/home-routine-v2.webp");

// Read off the hand-off (handoff_home_and_tip). The height is the least: with large text the card grows.
const CARD_HEIGHT = 212;
const CARD_RADIUS = 24;
const PILL_HEIGHT = 36;
// The words on a card stop growing a little sooner than elsewhere, so it stays a card.
const CARD_TEXT_SCALE = 1.2;
// A title longer than this steps down from 20 to 17 (hand-off: "Vitamin C + Niacinamide").
const LONG_TITLE = 17;

/** Home's top card with no routine yet (hand-off): flat butter, one line, and "Build my routine". Opens the routine. */
export function StartRoutineCard({ onPress }: { onPress: () => void }) {
  return (
    <BounceCard
      onPress={onPress}
      pressedScale={0.97}
      accessibilityLabel="Start your routine. Build my routine"
      style={{ minHeight: CARD_HEIGHT, borderRadius: CARD_RADIUS, backgroundColor: HOME_TILE.start, paddingVertical: 11, paddingLeft: 20, paddingRight: 8, flexDirection: "row", alignItems: "center", gap: 8, overflow: "hidden" }}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Text maxFontSizeMultiplier={CARD_TEXT_SCALE} style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, color: INK }}>
          Start your routine
        </Text>
        <Text maxFontSizeMultiplier={CARD_TEXT_SCALE} style={{ fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>
          Morning and evening steps for your skin. Takes a minute.
        </Text>
        <Text maxFontSizeMultiplier={CARD_TEXT_SCALE} style={{ marginTop: 6, fontSize: TYPE.body, fontWeight: "600", color: BUTTON.primary.fill }}>
          Build my routine ›
        </Text>
      </View>
      <Image source={ROUTINE_ART} contentFit="contain" accessibilityLabel="" style={{ width: 170, height: 190 }} />
    </BounceCard>
  );
}

/**
 * Home's top card with a routine (hand-off): today's routine on a watery
 * wash, light blue from 3 pm and butter before; the time and step count, the
 * active in bold, and the steps as pills along the bottom. Opens the routine.
 */
export function TodayRoutineCard({ today, onPress }: { today: Today; onPress: () => void }) {
  const theme = HOME_TODAY[today.time];
  const title = cardTitle(today);
  const kicker = cardKicker(today);
  return (
    <BounceCard
      onPress={onPress}
      pressedScale={0.97}
      accessibilityLabel={`Your skincare routine. ${kicker}. ${title}`}
      style={{ minHeight: CARD_HEIGHT, borderRadius: CARD_RADIUS, padding: 20, gap: SPACE.gutter, justifyContent: "space-between", overflow: "hidden" }}
    >
      <WateryWash {...theme.wash} />
      <Image source={ROUTINE_ART} contentFit="contain" accessibilityLabel="" style={{ position: "absolute", top: 4, right: 4, width: 164, height: 146 }} />
      <View style={{ gap: 2, paddingRight: 144 }}>
        <Text maxFontSizeMultiplier={CARD_TEXT_SCALE} style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, color: INK }}>
          Your skincare routine
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <TimeIcon time={today.time} />
          <Text maxFontSizeMultiplier={CARD_TEXT_SCALE} style={{ fontSize: TYPE.body, lineHeight: 20, color: MUTED }}>
            {kicker}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={CARD_TEXT_SCALE} numberOfLines={2} style={{ marginTop: 4, fontSize: title.length > LONG_TITLE ? TYPE.card : TYPE.title, lineHeight: 22, fontWeight: "600", color: INK }}>
          {title}
        </Text>
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, overflow: "hidden" }}>
        {cardPills(today).map((pill, i) => (
          <Fragment key={`${pill.label}-${i}`}>
            {pill.arrow ? <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>→</Text> : null}
            <View
              style={{
                // Equal shares when the pills fill the row: a long name doesn't take a bigger one.
                // Folded, the names shrink before the "+N" does, so it always shows.
                flexGrow: pill.grow ? 1 : 0,
                flexShrink: pill.fold ? 0 : 1,
                flexBasis: pill.grow ? 0 : "auto",
                minWidth: 0,
                height: PILL_HEIGHT,
                paddingHorizontal: pill.grow ? 6 : 11,
                borderRadius: PILL_HEIGHT / 2,
                backgroundColor: pill.active ? theme.active : HOME_TODAY.pill,
                borderWidth: pill.active ? 0 : 1,
                borderColor: HOME_TODAY.pillRing,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text maxFontSizeMultiplier={CARD_TEXT_SCALE} numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: pill.grow ? 14 : TYPE.caption, fontWeight: pill.active ? "700" : "600", color: pill.active ? WHITE : INK }}>
                {pill.label}
              </Text>
            </View>
          </Fragment>
        ))}
      </View>
    </BounceCard>
  );
}
