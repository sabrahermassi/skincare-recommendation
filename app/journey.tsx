import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Animated, Easing, Linking, PanResponder, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import { BackChevron, IconCircle } from "@/components/IconCircle";
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
import { openScanner } from "@/lib/open-scanner";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { BUTTON, CANVAS, DISPLAY_FONT, INK, JOURNEY, LINK, MUTED_FAINT, SURFACE, VERDICT, WHITE, withAlpha } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";

// v9 (read off ConcernDeckSoft in the hand-off).
const EASE = Easing.bezier(0.3, 0.7, 0.2, 1);
const SWIPE_AWAY = 70;
const FLIP_MS = 300;
const STACK_MS = 400;

const ROLE_INK: Record<Role, string> = {
  best: BUTTON.primary.fill,
  support: VERDICT.high.solid,
  foundation: BUTTON.primary.fill,
  strong: VERDICT.medium.deep,
};

type Step = "concerns" | "deck";

/**
 * "What my skin needs" (v9): pick up to three concerns, then swipe through
 * the ingredient categories worth looking for — each card flips to show how
 * to use it — and scan a product to see how it fits. Full screen: no nav bar,
 * no tab bar; it draws its own back and progress.
 *
 * The concerns start from the skin profile's and stay the journey's own: they
 * travel with the scan to the result (`lib/journey.ts`), and never rewrite
 * the profile the score is made from.
 */
export default function Journey() {
  const profile = useAppStore((s) => s.profile);
  const [step, setStep] = useState<Step>("concerns");
  const [picked, setPicked] = useState<Concern[]>(() =>
    profile.concerns.filter((c) => JOURNEY_CONCERNS.some((j) => j.concern === c)).slice(0, JOURNEY_MAX),
  );
  const insets = useSafeAreaInsets();
  const back = () => (step === "deck" ? setStep("concerns") : router.back());

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top + 6 }}>
      <Header step={step} onBack={back} />
      {step === "concerns" ? (
        <Concerns picked={picked} onPick={setPicked} onNext={() => setStep("deck")} bottom={insets.bottom} />
      ) : (
        <Deck concerns={JOURNEY_CONCERNS.map((j) => j.concern).filter((c) => picked.includes(c))} bottom={insets.bottom} />
      )}
    </View>
  );
}

/** Back on the left, the journey's progress in the middle, "1/4" on the first step. */
function Header({ step, onBack }: { step: Step; onBack: () => void }) {
  return (
    <View style={{ height: 44, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <IconCircle onPress={onBack} accessibilityLabel="Back">
        <BackChevron />
      </IconCircle>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={step === "concerns" ? "Step 1 of 4" : "Step 2 of 4"}
        style={{ width: 120, height: 2, borderRadius: 1, backgroundColor: JOURNEY.track }}
      >
        <View style={{ position: "absolute", left: step === "concerns" ? 0 : 30, width: 30, height: 2, borderRadius: 1, backgroundColor: BUTTON.primary.fill }} />
      </View>
      <View style={{ width: 40, alignItems: "flex-end" }}>
        {step === "concerns" ? <Text style={{ fontSize: 13, fontWeight: "500", color: MUTED_FAINT }}>1/4</Text> : null}
      </View>
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
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <View style={{ paddingTop: 12, paddingLeft: 58, paddingRight: 24, gap: 12 }}>
          <Text accessibilityRole="header" style={{ maxWidth: 262, fontFamily: DISPLAY_FONT, fontSize: 36, lineHeight: 38, letterSpacing: -0.36, color: INK }}>
            What do you want to work on?
          </Text>
          <Text style={{ fontSize: 15, color: MUTED_FAINT }}>Pick up to 3.</Text>
        </View>
        <View style={{ paddingTop: 16, paddingHorizontal: 26, flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          {JOURNEY_CONCERNS.map(({ concern, label }) => {
            const on = picked.includes(concern);
            return (
              <Pressable
                key={concern}
                onPress={() => toggle(concern)}
                disabled={!on && full}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on, disabled: !on && full }}
                accessibilityLabel={label}
                style={{ width: "48.5%", flexGrow: 1, flexBasis: "45%", height: 64, borderRadius: 12, backgroundColor: WHITE, borderWidth: 1, borderColor: on ? INK : JOURNEY.tileLine, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 }}
                className="active:opacity-80"
              >
                <Text style={{ fontSize: 15, lineHeight: 18, textAlign: "center", color: INK }}>{label}</Text>
                {on ? (
                  <View style={{ position: "absolute", top: 8, right: 8, width: 16, height: 16, borderRadius: 8, backgroundColor: INK, alignItems: "center", justifyContent: "center" }}>
                    <Tick size={11} color={WHITE} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
      <View style={{ paddingTop: 14, paddingHorizontal: 26, paddingBottom: Math.max(24, bottom + 8) }}>
        <Pressable
          onPress={ready ? onNext : undefined}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          style={{ height: 44, borderRadius: 22, backgroundColor: ready ? BUTTON.primary.fill : BUTTON.disabled.fill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
          className="active:opacity-90"
        >
          <Text style={{ fontSize: 15, fontWeight: "500", letterSpacing: -0.15, color: WHITE }}>Show what helps</Text>
          <Ionicons name="arrow-forward" size={18} color={WHITE} />
        </Pressable>
      </View>
    </View>
  );
}

function Deck({ concerns, bottom }: { concerns: Concern[]; bottom: number }) {
  const profile = useAppStore((s) => s.profile);
  const deck = useMemo(() => deckFor(concerns, profile), [concerns, profile]);
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const [position] = useState(() => new Animated.Value(0));
  const [drag] = useState(() => new Animated.Value(0));
  const { width } = useWindowDimensions();

  const goTo = (index: number) => {
    const next = Math.max(0, Math.min(deck.length - 1, index));
    setCurrent(next);
    Animated.timing(position, { toValue: next, duration: reduceMotionNow() ? 0 : STACK_MS, easing: EASE, useNativeDriver: true }).start();
    Animated.timing(drag, { toValue: 0, duration: reduceMotionNow() ? 0 : STACK_MS, easing: EASE, useNativeDriver: true }).start();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderMove: (_e, g) => drag.setValue(g.dx),
        onPanResponderRelease: (_e, g) => {
          if (g.dx < -SWIPE_AWAY && current < deck.length - 1) goTo(current + 1);
          else if (g.dx > SWIPE_AWAY && current > 0) goTo(current - 1);
          else Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start();
        },
        onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start(),
      }),
    // goTo reads `current`; the responder is rebuilt when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [current, deck.length],
  );

  const scan = () => openScanner({ mode: "photo", from: "journey", concerns: encodeConcerns(concerns) });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: 6, paddingHorizontal: 32, gap: 4, alignItems: "center" }}>
        <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: 28, lineHeight: 31, letterSpacing: -0.42, textAlign: "center", color: INK }}>
          Based on your skin
        </Text>
        <Text style={{ fontSize: 15, lineHeight: 21, textAlign: "center", color: MUTED_FAINT }}>
          Here are ingredient categories that may be worth exploring for your concerns.
        </Text>
      </View>

      <View style={{ flex: 1, minHeight: 360, maxHeight: 430, marginTop: 20, marginHorizontal: 28, marginBottom: 16 }}>
        {deck.map((item, i) => {
          const rel = Animated.subtract(i, position);
          const isActive = i === current;
          const x = Animated.add(
            rel.interpolate({ inputRange: [-1, 0, 1, 2, 3], outputRange: [-width * 1.25, 0, -12, 12, 12], extrapolate: "clamp" }),
            isActive ? drag : 0,
          );
          return (
            <Animated.View
              key={item.card.key}
              {...(isActive ? responder.panHandlers : {})}
              pointerEvents={i < current ? "none" : "auto"}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: deck.length - Math.abs(i - current),
                opacity: rel.interpolate({ inputRange: [-1, 0, 2, 3], outputRange: [0, 1, 1, 0], extrapolate: "clamp" }),
                transform: [
                  { translateX: x },
                  { translateY: rel.interpolate({ inputRange: [0, 1], outputRange: [0, 4], extrapolate: "clamp" }) },
                  { scale: rel.interpolate({ inputRange: [0, 1], outputRange: [1, 0.985], extrapolate: "clamp" }) },
                  {
                    rotate: isActive
                      ? drag.interpolate({ inputRange: [-280, 280], outputRange: ["-10deg", "10deg"], extrapolate: "clamp" })
                      : rel.interpolate({ inputRange: [-1, 0], outputRange: ["-8deg", "0deg"], extrapolate: "clamp" }),
                  },
                ],
              }}
            >
              <FlipCard
                item={item}
                concerns={concerns}
                flipped={!!flipped[item.card.key]}
                interactive={isActive}
                onTap={() => (isActive ? setFlipped((f) => ({ ...f, [item.card.key]: !f[item.card.key] })) : goTo(i))}
              />
            </Animated.View>
          );
        })}
      </View>

      {/* Pager: one dot per card, the current one stretched. */}
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 2 }}>
        {deck.map((item, i) => (
          <Pressable key={item.card.key} onPress={() => goTo(i)} accessibilityRole="button" accessibilityLabel={`Card ${i + 1}: ${item.card.name}`} accessibilityState={{ selected: i === current }} hitSlop={12} style={{ width: 20, height: 20, alignItems: "center", justifyContent: "center" }}>
            <View style={{ width: i === current ? 18 : 4, height: 4, borderRadius: 2, backgroundColor: i === current ? BUTTON.primary.fill : JOURNEY.dotOff }} />
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
          style={{ height: 42, borderRadius: 21, backgroundColor: BUTTON.primary.fill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 }}
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
          <Text adjustsFontSizeToFit numberOfLines={1} style={{ fontFamily: DISPLAY_FONT, fontSize: 48, lineHeight: 50, letterSpacing: -0.48, textAlign: "center", color: INK }}>
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

      {/* Back */}
      <Animated.View
        style={[
          face,
          { backgroundColor: JOURNEY.back, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 18 },
          { transform: [{ perspective: 1400 }, { rotateY: turn.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] }) }] },
        ]}
      >
        <Text style={{ fontFamily: DISPLAY_FONT, fontSize: 28, lineHeight: 31, textAlign: "center", color: INK }}>{card.name}</Text>
        <View style={{ flex: 1, marginTop: 8, justifyContent: "space-evenly" }}>
          <BackRow first icon={<Ionicons name="locate-outline" size={15} color={BUTTON.primary.fill} />} title="Why you" text={card.whyYou} />
          <BackRow icon={<Ionicons name="leaf-outline" size={15} color={BUTTON.primary.fill} />} title="How to start" text={card.howToStart} />
          <BackRow warn icon={<Text style={{ fontSize: 14, fontWeight: "700", color: WHITE }}>!</Text>} title="Watch for" text={card.watchFor} />
          <BackRow icon={<Ionicons name="bag-handle-outline" size={15} color={BUTTON.primary.fill} />} title="When shopping" text={card.whenShopping} />
        </View>
        {source ? (
          <Pressable
            onPress={() => void Linking.openURL(source.url).catch(() => undefined)}
            accessibilityRole="link"
            accessibilityLabel={`See the evidence: ${source.label}`}
            style={{ marginTop: 8, paddingTop: 10, minHeight: 44, borderTopWidth: 1, borderTopColor: JOURNEY.backLine, alignItems: "center", justifyContent: "center" }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: LINK }}>See the evidence →</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function BackRow({ icon, title, text, first, warn }: { icon: ReactNode; title: string; text: string; first?: boolean; warn?: boolean }) {
  return (
    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 6, borderTopWidth: first ? 0 : 1, borderTopColor: JOURNEY.backLine }}>
      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: warn ? VERDICT.medium.solid : SURFACE, alignItems: "center", justifyContent: "center" }}>{icon}</View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "600", color: INK }}>{title}</Text>
        <Text style={{ fontSize: 13, lineHeight: 18, color: MUTED_FAINT }}>{text}</Text>
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
