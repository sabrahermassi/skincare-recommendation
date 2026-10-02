import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { BackChevron, IconCircle } from "@/components/IconCircle";
import { BUTTON_HEIGHT } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import type { Sensitivity } from "@/data/types";
import { cardSource, encodeNeed, goalLabel, GOALS, needDeck, ROLE_LABEL, type DeckCard, type GoalKey, type Need, type Role } from "@/lib/journey";
import { goBackOrHome } from "@/lib/go-back";
import { haptic } from "@/lib/haptics";
import { openScanner } from "@/lib/open-scanner";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { BUTTON, CANVAS, CHOSEN, DISPLAY_FONT, DIVIDER, INK, JOURNEY, MUTED, MUTED_FAINT, OPTION_LINE, SPACE, SURFACE, TOUCH_TARGET, TYPE, VERDICT, WHITE, withAlpha } from "@/lib/tokens";
import { FitScrollView } from "@/components/FitScrollView";

// v9 (read off ConcernDeckSoft in the hand-off).
const EASE = Easing.bezier(0.3, 0.7, 0.2, 1);
// The carousel: the room each side of the card showing, and between cards. The next card shows 16pt at the edge.
const CAROUSEL_SIDE = 32;
const CAROUSEL_GAP = 16;
const FLIP_MS = 300;

const ROLE_INK: Record<Role, string> = {
  best: BUTTON.primary.fill,
  support: VERDICT.high.solid,
  foundation: BUTTON.primary.fill,
  strong: VERDICT.medium.deep,
  helpful: MUTED_FAINT,
};

type Step = "needs" | "finding" | "deck";

// How long the "finding" screen shows between the question and the cards (v9).
const FINDING_MS = 1800;
const FINDING_ART = require("@/assets/illustrations/loading-skin-needs.webp");

const SENSITIVITY_OPTIONS: readonly { value: Sensitivity; label: string }[] = [
  { value: "none", label: "Not sensitive" },
  { value: "some", label: "Somewhat" },
  { value: "high", label: "Very" },
];
const PREGNANT_OPTIONS: readonly { value: boolean; label: string }[] = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];

/**
 * "Skin needs": one thing to work on today, then the ingredient categories
 * worth looking for, one card each (a card flips to show how to use it), and
 * a scan to see how a product fits. Full screen: no nav bar, no tab bar; it
 * draws its own back.
 *
 * It stands apart from the skin profile (owner, 2 October 2026): it asks
 * fresh every time, reads nothing from the profile and writes nothing to it.
 * What was picked travels with the scan to the result (`lib/journey.ts`).
 */
export default function Journey() {
  const [step, setStep] = useState<Step>("needs");
  const [goal, setGoal] = useState<GoalKey | null>(null);
  const [sensitivity, setSensitivity] = useState<Sensitivity | null>(null);
  const [pregnant, setPregnant] = useState<boolean | null>(null);
  const insets = useSafeAreaInsets();
  const back = () => (step !== "needs" ? setStep("needs") : goBackOrHome());

  useEffect(() => {
    if (step !== "finding") return;
    const timer = setTimeout(() => setStep("deck"), reduceMotionNow() ? 0 : FINDING_MS);
    return () => clearTimeout(timer);
  }, [step]);

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top + 6 }}>
      <Header onBack={back} />
      {step === "needs" || goal === null ? (
        <Needs
          goal={goal}
          onGoal={setGoal}
          sensitivity={sensitivity}
          onSensitivity={setSensitivity}
          pregnant={pregnant}
          onPregnant={setPregnant}
          onNext={() => setStep("finding")}
          bottom={insets.bottom}
        />
      ) : step === "finding" ? (
        <Finding />
      ) : (
        <Deck need={{ goal, sensitivity, pregnant }} bottom={insets.bottom} />
      )}
    </View>
  );
}

/**
 * Back, and nothing else (owner): the journey is one question and its cards,
 * so there is no step count and no progress line.
 */
function Header({ onBack }: { onBack: () => void }) {
  return (
    <View style={{ height: 44, paddingHorizontal: 16, flexDirection: "row", alignItems: "center" }}>
      <IconCircle onPress={onBack} accessibilityLabel="Back">
        <BackChevron />
      </IconCircle>
    </View>
  );
}

/**
 * The one question, and the two that are optional (owner): what to work on
 * is a must and takes one answer; sensitive skin and pregnancy can be left
 * alone, and the cards still come.
 */
function Needs({
  goal,
  onGoal,
  sensitivity,
  onSensitivity,
  pregnant,
  onPregnant,
  onNext,
  bottom,
}: {
  goal: GoalKey | null;
  onGoal: (goal: GoalKey) => void;
  sensitivity: Sensitivity | null;
  onSensitivity: (next: Sensitivity | null) => void;
  pregnant: boolean | null;
  onPregnant: (next: boolean | null) => void;
  onNext: () => void;
  bottom: number;
}) {
  const ready = goal !== null;
  return (
    <View style={{ flex: 1 }}>
      <FitScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingTop: 24, paddingHorizontal: 24, gap: 8, alignItems: "center" }}>
          <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
            What do you want to work on?
          </Text>
          <Text style={{ maxWidth: 320, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>Pick one. We&apos;ll show the ingredients that help.</Text>
        </View>
        {/* Pills, like the two optional questions under them (owner). */}
        <View accessibilityRole="radiogroup" style={{ paddingTop: 24, paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap", gap: SPACE.text }}>
          {GOALS.map(({ key, label }) => (
            <Pill key={key} label={label} on={goal === key} onPress={() => onGoal(key)} />
          ))}
        </View>
        <View style={{ paddingTop: SPACE.section, paddingHorizontal: 16, gap: SPACE.gutter }}>
          <Text style={{ paddingHorizontal: 4, fontSize: 12, fontWeight: "500", letterSpacing: 1.44, textTransform: "uppercase", color: MUTED_FAINT }}>Optional</Text>
          <Pills title="Is your skin sensitive?" options={SENSITIVITY_OPTIONS} selected={sensitivity} onSelect={onSensitivity} />
          <Pills
            title="Pregnant or breastfeeding?"
            note="We ask so we can leave out ingredients commonly advised against while pregnant or breastfeeding."
            options={PREGNANT_OPTIONS}
            selected={pregnant}
            onSelect={onPregnant}
          />
        </View>
      </FitScrollView>
      <View style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: Math.max(32, bottom + 8) }}>
        <Pressable
          onPress={ready ? onNext : undefined}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel="Show what helps"
          accessibilityState={{ disabled: !ready }}
          style={{ height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: ready ? BUTTON.primary.fill : BUTTON.disabled.fill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
          className="active:opacity-90"
        >
          <Text style={{ fontSize: 16, fontWeight: "600", letterSpacing: -0.16, color: WHITE }}>Show what helps</Text>
          <Ionicons name="arrow-forward" size={18} color={WHITE} />
        </Pressable>
      </View>
    </View>
  );
}

/** An optional question: its answers as a row of pills, and why we ask where that needs saying. Tapping the chosen one takes the answer back. */
function Pills<T extends string | boolean>({ title, note, options, selected, onSelect }: { title: string; note?: string; options: readonly { value: T; label: string }[]; selected: T | null; onSelect: (next: T | null) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={title} style={{ gap: SPACE.text }}>
      <Text style={{ paddingHorizontal: 4, fontSize: TYPE.card, fontWeight: "600", color: INK }}>{title}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACE.text }}>
        {options.map(({ value, label }) => (
          <Pill key={label} label={label} accessibilityLabel={`${title} ${label}`} on={selected === value} onPress={() => onSelect(selected === value ? null : value)} />
        ))}
      </View>
      {note ? <Text style={{ paddingHorizontal: 4, fontSize: TYPE.caption, lineHeight: 17.5, color: MUTED }}>{note}</Text> : null}
    </View>
  );
}

/** One answer as a pill: outlined, and pale sage with a sage outline once chosen. */
function Pill({ label, accessibilityLabel, on, onPress }: { label: string; accessibilityLabel?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: on }}
      style={{ minHeight: TOUCH_TARGET, paddingHorizontal: SPACE.gutter, borderRadius: TOUCH_TARGET / 2, borderWidth: 1.5, borderColor: on ? BUTTON.primary.fill : OPTION_LINE, backgroundColor: on ? CHOSEN.fill : SURFACE, justifyContent: "center" }}
      className="active:opacity-80"
    >
      <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>{label}</Text>
    </Pressable>
  );
}

/** The short wait between the question and the cards (v9): a picture, a line, and a bar that fills. */
function Finding() {
  const [fill] = useState(() => new Animated.Value(0.08));
  useEffect(() => {
    Animated.timing(fill, { toValue: 0.62, duration: reduceMotionNow() ? 0 : 1600, easing: EASE, useNativeDriver: false }).start();
  }, [fill]);
  return (
    <View accessibilityLiveRegion="polite" style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 40 }}>
      <Image source={FINDING_ART} contentFit="contain" accessibilityLabel="" style={{ width: 280, height: 280 }} />
      <Text accessibilityRole="header" style={{ marginTop: 16, textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
        Finding what your skin needs…
      </Text>
      <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: 22, color: MUTED }}>Picking the ingredients that work on it.</Text>
      <View style={{ marginTop: 24, alignSelf: "stretch", height: 6, borderRadius: 3, backgroundColor: JOURNEY.track, overflow: "hidden" }}>
        <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: BUTTON.primary.fill, width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
      </View>
    </View>
  );
}

function Deck({ need, bottom }: { need: Need; bottom: number }) {
  const { goal, sensitivity, pregnant } = need;
  const deck = useMemo(() => needDeck({ goal, sensitivity, pregnant }), [goal, sensitivity, pregnant]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const { width } = useWindowDimensions();
  // A sideways carousel (owner, 2 October 2026): the cards sit side by side
  // and slide, one at a time, with the next one showing at the edge. Nothing
  // is thrown away, so going back is sliding the other way.
  const cardWidth = width - 2 * CAROUSEL_SIDE;
  const stride = cardWidth + CAROUSEL_GAP;
  const scroller = useRef<ScrollView>(null);
  const goTo = (index: number) => {
    const next = Math.max(0, Math.min(deck.length - 1, index));
    // The dot lights at once and stays lit: while the cards slide there, the
    // scroll's own positions are not read, or the lit dot ran back to where
    // the slide started and across again (owner).
    jumping.current = true;
    setCurrent(next);
    scroller.current?.scrollTo({ x: next * stride, animated: !reduceMotionNow() });
  };
  const jumping = useRef(false);
  const settledAt = (x: number) => {
    if (jumping.current) return;
    setCurrent(Math.max(0, Math.min(deck.length - 1, Math.round(x / stride))));
  };

  const scan = () => openScanner({ mode: "photo", from: "journey", need: encodeNeed(need) });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: 6, paddingHorizontal: 32, gap: 4, alignItems: "center" }}>
        <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, textAlign: "center", color: INK }}>
          {goalLabel(need)}
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 21, textAlign: "center", color: MUTED_FAINT }}>Ingredients worth looking for, best match first.</Text>
      </View>

      <View style={{ flex: 1, minHeight: 360, maxHeight: 430, marginTop: 20, marginBottom: 16 }}>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={stride}
          decelerationRate="fast"
          disableIntervalMomentum
          contentContainerStyle={{ paddingHorizontal: CAROUSEL_SIDE, gap: CAROUSEL_GAP }}
          scrollEventThrottle={16}
          onScroll={(event) => settledAt(event.nativeEvent.contentOffset.x)}
          // A finger on the cards, or the slide coming to rest, hands the dots back to the scroll.
          onScrollBeginDrag={() => {
            jumping.current = false;
          }}
          onMomentumScrollEnd={(event) => {
            jumping.current = false;
            settledAt(event.nativeEvent.contentOffset.x);
          }}
        >
          {deck.map((item, i) => (
            <View key={item.card.key} style={{ width: cardWidth }}>
              <FlipCard
                item={item}
                flipped={!!flipped[item.card.key]}
                interactive={i === current}
                // The card showing turns over; one at the edge slides in.
                onTap={() => (i === current ? setFlipped((f) => ({ ...f, [item.card.key]: !f[item.card.key] })) : goTo(i))}
              />
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Pager: one dot per card, the current one stretched. Each is a full
          44pt target (owner: the dots were easy to miss). */}
      <View style={{ flexDirection: "row", justifyContent: "center" }}>
        {deck.map((item, i) => (
          <Pressable key={item.card.key} onPress={() => goTo(i)} accessibilityRole="button" accessibilityLabel={`Card ${i + 1}: ${item.card.name}`} accessibilityState={{ selected: i === current }} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: i === current ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === current ? BUTTON.primary.fill : JOURNEY.dotOff }} />
          </Pressable>
        ))}
      </View>

      {/* Pinned to the bottom: check a product against all this. */}
      <View style={{ marginTop: "auto", marginHorizontal: 19, marginBottom: Math.max(34, bottom + 8), backgroundColor: SURFACE, borderRadius: 18, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12, gap: 10 }}>
        <View style={{ paddingHorizontal: 4, gap: 2 }}>
          <Text style={{ fontSize: 15, fontWeight: "600", color: INK }}>Have a product in mind?</Text>
          <Text style={{ fontSize: 13, lineHeight: 17.5, color: MUTED_FAINT }}>I&apos;ll check whether it has these actives.</Text>
        </View>
        <Pressable
          onPress={scan}
          accessibilityRole="button"
          accessibilityLabel="Scan a product"
          style={{ height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: BUTTON.primary.fill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
          className="active:opacity-90"
        >
          <Ionicons name="camera-outline" size={19} color={WHITE} />
          <Text style={{ fontSize: 15, fontWeight: "500", letterSpacing: -0.15, color: WHITE }}>Scan a product</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** One card: the front says what it is and what it is here for; tapped, it turns to how to use it. */
function FlipCard({ item, flipped, interactive, onTap }: { item: DeckCard; flipped: boolean; interactive: boolean; onTap: () => void }) {
  const [turn] = useState(() => new Animated.Value(flipped ? 1 : 0));
  useEffect(() => {
    Animated.timing(turn, { toValue: flipped ? 1 : 0, duration: reduceMotionNow() ? 0 : FLIP_MS, easing: EASE, useNativeDriver: true }).start();
  }, [flipped, turn]);
  const { card, role, helps, caution } = item;
  const source = cardSource(card);
  // Flat, like Home's tiles: no shade. In the carousel the scroll view cut a
  // shade off above and below, which drew a grey box round the card (owner).
  const face = { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderRadius: 22, backfaceVisibility: "hidden" } as const;
  return (
    <Pressable
      onPress={onTap}
      accessibilityRole="button"
      accessibilityLabel={flipped ? `${card.name}, how to use it` : `${card.name}. ${card.line}`}
      accessibilityHint={interactive ? (flipped ? "Turns the card back" : "Turns the card to show how to use it") : "Brings this card to the front"}
      style={{ flex: 1 }}
    >
      {/* Front */}
      <Animated.View
        style={[
          face,
          { backgroundColor: JOURNEY.front[card.tint], paddingTop: 28, paddingHorizontal: 24, paddingBottom: 24, alignItems: "center" },
          { transform: [{ perspective: 1400 }, { rotateY: turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] }) }] },
        ]}
      >
        <View style={{ height: 28, paddingHorizontal: 14, borderRadius: 14, backgroundColor: WHITE, justifyContent: "center" }}>
          <Text style={{ fontSize: 13, fontWeight: "500", color: ROLE_INK[role] }}>{ROLE_LABEL[role]}</Text>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20, padding: 12 }}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.display, lineHeight: 40, letterSpacing: -0.5, textAlign: "center", color: INK }}>
            {card.name}
          </Text>
          <Text style={{ maxWidth: 290, fontSize: 17, lineHeight: 26, textAlign: "center", color: INK }}>{card.line}</Text>
          <View style={{ marginTop: 4, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: withAlpha(WHITE, 0.8), flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="refresh" size={14} color={BUTTON.primary.fill} />
            <Text style={{ fontSize: 13, fontWeight: "500", color: BUTTON.primary.fill }}>Tap to see how to use it</Text>
          </View>
        </View>
        {helps ? (
          <View style={{ alignSelf: "stretch", paddingTop: 20, borderTopWidth: 1, borderTopColor: withAlpha(INK, 0.08), gap: 14, alignItems: "center" }}>
            <Text style={{ fontSize: 12, fontWeight: "500", letterSpacing: 1.44, textTransform: "uppercase", color: MUTED_FAINT }}>Helps with</Text>
            <Chip label={helps} />
          </View>
        ) : null}
      </Animated.View>

      {/* Back. Hidden is not untouchable: until the card is turned, its link must not take the tap. */}
      <Animated.View
        pointerEvents={flipped && interactive ? "auto" : "none"}
        style={[
          face,
          { backgroundColor: JOURNEY.back, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 18 },
          { transform: [{ perspective: 1400 }, { rotateY: turn.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] }) }] },
        ]}
      >
        <Text style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, textAlign: "center", color: INK }}>{card.name}</Text>
        <View style={{ flex: 1, marginTop: 8, justifyContent: "space-evenly" }}>
          <BackRow first icon="locate-outline" title="Why you" text={card.whyYou} />
          <BackRow icon="leaf-outline" title="How to start" text={card.howToStart} />
          <BackRow warn icon="warning-outline" title="Watch for" text={caution ? `${card.watchFor} ${caution}` : card.watchFor} />
          <BackRow icon="pricetag-outline" title="When shopping" text={card.whenShopping} />
        </View>
        {source ? (
          <Pressable
            onPress={() => void Linking.openURL(source.url).catch(() => undefined)}
            accessibilityRole="link"
            accessibilityLabel={`See the evidence: ${source.label}`}
            accessibilityHint="Opens in your browser"
            style={{ marginTop: 8, paddingTop: 10, minHeight: 44, borderTopWidth: 1, borderTopColor: DIVIDER, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: BUTTON.primary.fill }}>See the evidence</Text>
            {/* The "opens a website" arrow (owner), as on an ingredient's sources. */}
            <Ionicons name="open-outline" size={16} color={BUTTON.primary.fill} />
          </Pressable>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function BackRow({ icon, title, text, first, warn }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; first?: boolean; warn?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 6, borderTopWidth: first ? 0 : 1, borderTopColor: JOURNEY.backLine }}>
      {/* A 32pt disc (v9): pale sage, or pale amber for the one caution. */}
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: warn ? VERDICT.medium.tint : JOURNEY.iconFill, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name={icon} size={17} color={warn ? VERDICT.medium.deep : JOURNEY.iconInk} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: INK }}>{title}</Text>
        <Text style={{ fontSize: 14, lineHeight: 19, color: MUTED }}>{text}</Text>
      </View>
    </View>
  );
}

/** What a card is on the deck for, ticked. */
function Chip({ label }: { label: string }) {
  return (
    <View accessibilityLabel={`Helps with ${label}`} style={{ height: 34, borderRadius: 17, backgroundColor: withAlpha(WHITE, 0.9), flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 6, paddingRight: 14 }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: BUTTON.primary.fill, alignItems: "center", justifyContent: "center" }}>
        <Tick size={11} color={WHITE} />
      </View>
      <Text style={{ fontSize: 14, fontWeight: "500", color: INK }}>{label}</Text>
    </View>
  );
}

function Tick({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6 9 17l-5-5" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
