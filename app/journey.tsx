import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Linking, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { BackChevron, IconCircle } from "@/components/IconCircle";
import { BUTTON_HEIGHT } from "@/components/PrimaryButton";
import { QuizOptionCard, QUIZ_OPTION_GRID } from "@/components/QuizOptionCard";
import { Text } from "@/components/Text";
import type { Concern } from "@/data/types";
import {
  cardHelps,
  cardSource,
  deckFor,
  encodeConcerns,
  JOURNEY_CONCERNS,
  JOURNEY_MAX,
  ROLE_LABEL,
  shortLabel,
  type DeckCard,
  type Role,
} from "@/lib/journey";
import { goBackOrHome } from "@/lib/go-back";
import { openScanner } from "@/lib/open-scanner";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { BUTTON, CANVAS, DISPLAY_FONT, DIVIDER, INK, JOURNEY, MUTED, MUTED_FAINT, SURFACE, TYPE, VERDICT, WHITE, withAlpha } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";
import { FitScrollView } from "@/components/FitScrollView";

// v9 (read off ConcernDeckSoft in the hand-off).
const EASE = Easing.bezier(0.3, 0.7, 0.2, 1);
// The carousel: the room each side of the card showing, and between cards. The next card shows 16pt at the edge.
const CAROUSEL_SIDE = 28;
const CAROUSEL_GAP = 12;
const FLIP_MS = 300;

const ROLE_INK: Record<Role, string> = {
  best: BUTTON.primary.fill,
  support: VERDICT.high.solid,
  foundation: BUTTON.primary.fill,
  strong: VERDICT.medium.deep,
};

type Step = "concerns" | "finding" | "deck";

// How long the "finding" screen shows between the concerns and the cards (v9).
const FINDING_MS = 1800;
const FINDING_ART = require("@/assets/illustrations/loading-skin-needs.webp");

/** The journey's own concerns among the skin profile's, at most three. */
function profileConcerns(concerns: readonly Concern[]): Concern[] {
  return concerns.filter((c) => JOURNEY_CONCERNS.some((j) => j.concern === c)).slice(0, JOURNEY_MAX);
}

/**
 * "Skin needs" (v9): the ingredient categories worth looking for, one card
 * each — a card flips to show how to use it — and a scan to see how a product
 * fits. Full screen: no nav bar, no tab bar; it draws its own back.
 *
 * Someone whose skin profile already names concerns lands on the cards at
 * once. Anyone else picks up to three concerns first, which
 * stay the journey's own: they travel with the scan to the result
 * (`lib/journey.ts`), and never rewrite the profile the score is made from.
 */
export default function Journey() {
  const profile = useAppStore((s) => s.profile);
  const fromProfile = useMemo(() => profileConcerns(profile.concerns), [profile.concerns]);
  // Decided once, on opening: whether this visit has the concerns step at all.
  const [asks, setAsks] = useState(() => fromProfile.length === 0);
  const [step, setStep] = useState<Step>(asks ? "concerns" : "deck");
  const [picked, setPicked] = useState<Concern[]>(fromProfile);
  // Home draws this screen ahead of the tap, so "on opening" can come before
  // the profile's last change (the quiz taken in between). Until someone has
  // actually seen it, it follows the profile.
  const seen = useRef(false);
  useFocusEffect(
    useCallback(() => {
      seen.current = true;
    }, []),
  );
  useEffect(() => {
    if (seen.current) return;
    setAsks(fromProfile.length === 0);
    setStep(fromProfile.length === 0 ? "concerns" : "deck");
    setPicked(fromProfile);
  }, [fromProfile]);
  const insets = useSafeAreaInsets();
  const back = () => (asks && step !== "concerns" ? setStep("concerns") : goBackOrHome());

  useEffect(() => {
    if (step !== "finding") return;
    const timer = setTimeout(() => setStep("deck"), reduceMotionNow() ? 0 : FINDING_MS);
    return () => clearTimeout(timer);
  }, [step]);

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top + 6 }}>
      <Header onBack={back} />
      {step === "concerns" ? (
        <Concerns picked={picked} onPick={setPicked} onNext={() => setStep("finding")} bottom={insets.bottom} />
      ) : step === "finding" ? (
        <Finding />
      ) : (
        <Deck concerns={JOURNEY_CONCERNS.map((j) => j.concern).filter((c) => picked.includes(c))} bottom={insets.bottom} />
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

function Concerns({ picked, onPick, onNext, bottom }: { picked: Concern[]; onPick: (next: Concern[]) => void; onNext: () => void; bottom: number }) {
  const full = picked.length >= JOURNEY_MAX;
  const toggle = (concern: Concern) => {
    if (picked.includes(concern)) onPick(picked.filter((c) => c !== concern));
    else if (!full) onPick([...picked, concern]);
  };
  const ready = picked.length > 0;
  return (
    <View style={{ flex: 1 }}>
      <FitScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingTop: 24, paddingHorizontal: 24, gap: 8, alignItems: "center" }}>
          <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
            What do you want to work on?
          </Text>
          <Text style={{ maxWidth: 320, textAlign: "center", fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>Pick up to 3. We&apos;ll show the ingredients that help.</Text>
        </View>
        <View style={[QUIZ_OPTION_GRID, { paddingTop: 24, paddingHorizontal: 16 }]}>
          {JOURNEY_CONCERNS.map(({ concern, label }) => {
            const on = picked.includes(concern);
            return <QuizOptionCard key={concern} multiple label={label} selected={on} disabled={!on && full} onPress={() => toggle(concern)} />;
          })}
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

/** The short wait between the concerns and the cards (v9): a picture, a line, and a bar that fills. */
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
      <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: 22, color: MUTED }}>Picking the ingredients that work for your concerns.</Text>
      <View style={{ marginTop: 24, alignSelf: "stretch", height: 6, borderRadius: 3, backgroundColor: JOURNEY.track, overflow: "hidden" }}>
        <Animated.View style={{ height: 6, borderRadius: 3, backgroundColor: BUTTON.primary.fill, width: fill.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }} />
      </View>
    </View>
  );
}

function Deck({ concerns, bottom }: { concerns: Concern[]; bottom: number }) {
  const profile = useAppStore((s) => s.profile);
  const deck = useMemo(() => deckFor(concerns, profile), [concerns, profile]);
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
    setCurrent(next);
    scroller.current?.scrollTo({ x: next * stride, animated: !reduceMotionNow() });
  };
  const settledAt = (x: number) => setCurrent(Math.max(0, Math.min(deck.length - 1, Math.round(x / stride))));

  const scan = () => openScanner({ mode: "photo", from: "journey", concerns: encodeConcerns(concerns) });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: 6, paddingHorizontal: 32, gap: 4, alignItems: "center" }}>
        <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, textAlign: "center", color: INK }}>
          Based on your skin
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 21, textAlign: "center", color: MUTED_FAINT }}>
          Here are ingredient categories that may be worth exploring for your concerns.
        </Text>
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
        >
          {deck.map((item, i) => (
            <View key={item.card.key} style={{ width: cardWidth }}>
              <FlipCard
                item={item}
                concerns={concerns}
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
          <Text style={{ fontSize: 13, lineHeight: 17.5, color: MUTED_FAINT }}>I&apos;ll check how it fits your skin and these recommendations.</Text>
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

/** One card: the front says what it is and which of your concerns it helps; tapped, it turns to how to use it. */
function FlipCard({ item, concerns, flipped, interactive, onTap }: { item: DeckCard; concerns: Concern[]; flipped: boolean; interactive: boolean; onTap: () => void }) {
  const [turn] = useState(() => new Animated.Value(flipped ? 1 : 0));
  useEffect(() => {
    Animated.timing(turn, { toValue: flipped ? 1 : 0, duration: reduceMotionNow() ? 0 : FLIP_MS, easing: EASE, useNativeDriver: true }).start();
  }, [flipped, turn]);
  const { card, role } = item;
  const helps = cardHelps(card);
  const source = cardSource(card);
  const face = { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, borderRadius: 22, backfaceVisibility: "hidden", ...JOURNEY.cardShadow } as const;
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
          { backgroundColor: JOURNEY.front[card.key], paddingTop: 28, paddingHorizontal: 24, paddingBottom: 24, alignItems: "center" },
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
        {concerns.length > 0 ? (
          <View style={{ alignSelf: "stretch", paddingTop: 20, borderTopWidth: 1, borderTopColor: withAlpha(INK, 0.08), gap: 14, alignItems: "center" }}>
            <Text style={{ fontSize: 12, fontWeight: "500", letterSpacing: 1.44, textTransform: "uppercase", color: MUTED_FAINT }}>Helps with</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
              {concerns.map((concern) => (
                <Chip key={concern} label={shortLabel(concern)} on={helps.has(concern)} />
              ))}
            </View>
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
          <BackRow warn icon="warning-outline" title="Watch for" text={card.watchFor} />
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

/** A concern chip: ticked when the card's rules help it, dashed when they don't. */
function Chip({ label, on }: { label: string; on: boolean }) {
  return (
    <View
      accessibilityLabel={on ? `Helps with ${label}` : `Not for ${label}`}
      style={{ height: 34, borderRadius: 17, backgroundColor: withAlpha(WHITE, 0.9), flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: on ? 6 : 12, paddingRight: 14 }}
    >
      {on ? (
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: BUTTON.primary.fill, alignItems: "center", justifyContent: "center" }}>
          <Tick size={11} color={WHITE} />
        </View>
      ) : null}
      <Text style={{ fontSize: 14, fontWeight: "500", color: on ? INK : JOURNEY.chipOff }}>{label}</Text>
      {on ? null : <View style={{ width: 10, height: 1, backgroundColor: JOURNEY.chipOff }} />}
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
