import { Image } from "expo-image";
import { useEffect, useRef, useState } from "react";
import { AppState, View } from "react-native";

import { BottomSheet } from "@/components/BottomSheet";
import { BounceCard } from "@/components/BounceCard";
import { CloseCross, IconCircle } from "@/components/IconCircle";
import { Text } from "@/components/Text";
import { hoursUntilNextTip, localDay, tipOfTheDay } from "@/lib/tips";
import { BUTTON, DISPLAY_FONT, INK, MUTED, MUTED_FAINT, SCRIPT_FONT, TYPE } from "@/lib/tokens";

const ENVELOPE = require("@/assets/illustrations/tip-envelope.webp");

// v9 measurements, read off the hand-off.
const ENVELOPE_SIZE = 188;
const ROW_HEIGHT = 196;

/**
 * Today's tip on Home (v9): no card. A watercolour envelope, tilted, sits
 * straight on the page with "Today's tip" and "Tap to read" beside it; a tap
 * opens a floating sheet with the tip in the script face and when the next
 * one arrives. One tip a day: it moves on at local midnight, also when the
 * app comes back to the front on a new day.
 */
export function TipCard() {
  const [tip, setTip] = useState(() => tipOfTheDay());
  const [open, setOpen] = useState(false);
  const day = useRef(localDay());
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active" || localDay() === day.current) return;
      day.current = localDay();
      setTip(tipOfTheDay());
    });
    return () => subscription.remove();
  }, []);

  return (
    <>
      <BounceCard
        onPress={() => setOpen(true)}
        pressedScale={0.97}
        accessibilityLabel="Open today's tip"
        style={{ marginTop: 8, height: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: 4 }}
      >
        <Image
          source={ENVELOPE}
          contentFit="contain"
          accessibilityLabel=""
          style={{ width: ENVELOPE_SIZE, height: ENVELOPE_SIZE, marginLeft: -12, marginRight: -4, transform: [{ rotate: "-6deg" }] }}
        />
        <View style={{ flex: 1, gap: 6 }}>
          <Text style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, color: INK }}>Today&apos;s tip</Text>
          <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: BUTTON.primary.fill }}>Tap to read ›</Text>
        </View>
      </BounceCard>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        floating
        corner={
          <IconCircle onPress={() => setOpen(false)} accessibilityLabel="Close">
            <CloseCross />
          </IconCircle>
        }
      >
        <View style={{ alignItems: "center", paddingTop: 40, paddingHorizontal: 6 }}>
          <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.78, textTransform: "uppercase", color: MUTED }}>
            Tip of the day
          </Text>
          <Text style={{ marginTop: 8, maxWidth: 330, textAlign: "center", fontFamily: SCRIPT_FONT, fontSize: 40, lineHeight: 46, color: INK }}>{tip}</Text>
          <Text style={{ marginTop: 16, fontSize: TYPE.caption, color: MUTED_FAINT }}>Tomorrow&apos;s tip opens in {hoursUntilNextTip()} h</Text>
        </View>
      </BottomSheet>
    </>
  );
}
