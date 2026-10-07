import { Image } from "expo-image";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Animated, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { FitScrollView } from "@/components/FitScrollView";
import { GlassHeader } from "@/components/GlassHeader";
import { BackChevron, IconCircle } from "@/components/IconCircle";
import { BUTTON_HEIGHT } from "@/components/PrimaryButton";
import { Hand, StarIcon, Tick } from "@/components/skin-needs/bits";
import { Text } from "@/components/Text";
import type { Pregnancy, Sensitivity, SkinProfile } from "@/data/types";
import { goBackOrHome } from "@/lib/go-back";
import { haptic } from "@/lib/haptics";
import { GOALS, type GoalKey } from "@/lib/journey";
import { reduceMotionNow } from "@/lib/reduce-motion";
import { encodeAnswers, familyOf, hiddenLine, holdsActive, optionsFor, safeOnly, storyLength, storyLengthLine, type NeedAnswers, type StoryActive } from "@/lib/skin-needs";
import { useOwnProducts } from "@/lib/use-own-products";
import { ACTIVES_IN_USE, GOAL_OPTIONS, type ActiveKey } from "@/lib/skin-needs-data";
import { BUTTON, CANVAS, CANVAS_GLASS, CHOSEN, DISPLAY_FONT, ICON_SHADOW, INK, LINK, MUTED, MUTED_FAINT, SKIN_NEEDS, SPACE, STAR_ON, SURFACE, TOUCH_TARGET, WHITE, TYPE, RADIUS, LEADING, TRACKING } from "@/lib/tokens";
import { useAppStore } from "@/store/useAppStore";
import { noOrphan } from "@/lib/text";

// The carousel (hand-off): 292 × 470 cards, 24pt in from the left, 12pt apart.
const CARD_WIDTH = 292;
const CARD_HEIGHT = 470;
const CARD_GAP = 12;
const CARD_SIDE = 24;
/** The goals shown before "more". */
const FIRST_GOALS = 6;

const SENSITIVITY_OPTIONS: readonly { value: Sensitivity; label: string; chip: string }[] = [
  { value: "none", label: "Not sensitive", chip: "Not sensitive" },
  { value: "some", label: "Somewhat", chip: "Somewhat sensitive" },
  { value: "high", label: "Very", chip: "Very sensitive" },
];
const PREGNANCY_OPTIONS: readonly { value: NonNullable<NeedAnswers["pregnancy"]>; label: string; chip: string }[] = [
  { value: "yes", label: "Yes", chip: "Pregnant or breastfeeding" },
  { value: "no", label: "No", chip: "Not pregnant or breastfeeding" },
  { value: "unsaid", label: "Prefer not to say", chip: "Pregnancy: not said" },
];

/**
 * The answers so far. "Actives you already use" is kept as the chips tapped:
 * "Glycolic acid" and "AHA acids" are one active to the clash check, but two
 * chips, each lit only when it was the one tapped.
 */
type Draft = Omit<NeedAnswers, "goal" | "uses"> & { goal: GoalKey | null; used: string[] };

/** The profile's pregnancy answer in this screen's three words. */
const PREGNANCY_FROM_PROFILE: Record<Pregnancy, NonNullable<NeedAnswers["pregnancy"]>> = {
  pregnant: "yes",
  breastfeeding: "yes",
  neither: "no",
  "prefer-not-to-say": "unsaid",
};

/** What the skin profile already says about sensitivity and pregnancy; null where it says nothing. */
function fromProfile(profile: SkinProfile): Pick<NeedAnswers, "sensitivity" | "pregnancy"> {
  return {
    sensitivity: profile.sensitivity,
    pregnancy: profile.pregnancyStatus ? PREGNANCY_FROM_PROFILE[profile.pregnancyStatus] : null,
  };
}

function usesOf(used: readonly string[]): ActiveKey[] {
  return [...new Set(ACTIVES_IN_USE.filter(({ label }) => used.includes(label)).map(({ active }) => active))];
}

/**
 * Skin needs (design_handoff "october 3d"): one scrolling screen of questions,
 * then "What can help?", a carousel of up to three actives for the goal. A card
 * opens its story (`app/journey-story.tsx`), which can add the active to the
 * routine. It replaced the flip-card deck.
 *
 * Sensitivity and pregnancy start from the skin profile when it holds them
 * (owner, 7 October 2026: a person should not be asked twice), still tappable;
 * nothing is saved back to the profile. The goal and the actives in use are
 * always asked fresh.
 */
export default function Journey() {
  const profile = useAppStore((state) => state.profile);
  const [draft, setDraft] = useState<Draft>(() => ({ goal: null, ...fromProfile(profile), used: [] }));
  // Which of the profile's two answers were changed here: one that was says so no longer, even if picked again.
  const [edited, setEdited] = useState({ sensitivity: false, pregnancy: false });
  const change = (next: Draft) => {
    setEdited((was) => ({ sensitivity: was.sensitivity || next.sensitivity !== draft.sensitivity, pregnancy: was.pregnancy || next.pregnancy !== draft.pregnancy }));
    setDraft(next);
  };
  const [showing, setShowing] = useState(false);
  const goal = draft.goal;
  if (showing && goal) {
    return (
      <Options
        answers={{ goal, sensitivity: draft.sensitivity, pregnancy: draft.pregnancy, uses: usesOf(draft.used) }}
        onBack={() => setShowing(false)}
        // "Not pregnant? Change": the answer becomes no, and the hidden ones come back.
        onNotPregnant={() => change({ ...draft, pregnancy: "no" })}
      />
    );
  }
  return <Questions draft={draft} edited={edited} onChange={change} onShow={() => setShowing(true)} />;
}

// ── Q1 ──────────────────────────────────────────────────────────────────────

function Questions({ draft, edited, onChange, onShow }: { draft: Draft; edited: { sensitivity: boolean; pregnancy: boolean }; onChange: (next: Draft) => void; onShow: () => void }) {
  const insets = useSafeAreaInsets();
  const ready = draft.goal !== null;
  // The tag says where an answer came from, until it is changed.
  const sensitivityTag = draft.sensitivity !== null && !edited.sensitivity ? "From your profile" : "Optional";
  const pregnancyTag = draft.pregnancy !== null && !edited.pregnancy ? "From your profile" : "Optional";
  // Thirteen goals at once is a wall: the first few, and the rest a tap away (always open for a goal that is in the rest).
  const [moreGoals, setMoreGoals] = useState(false);
  const shownGoals = moreGoals || (draft.goal !== null && GOALS.findIndex((g) => g.key === draft.goal) >= FIRST_GOALS) ? GOALS : GOALS.slice(0, FIRST_GOALS);
  const [headerHeight, setHeaderHeight] = useState(insets.top + 56);
  const [footer, setFooter] = useState({ width: 0, height: 0 });
  const [scrollY] = useState(() => new Animated.Value(0));
  const [onScroll] = useState(() => Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false }));
  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <FitScrollView
        contentContainerStyle={{ paddingTop: headerHeight + SPACE.text, paddingHorizontal: SPACE.gutter, paddingBottom: 140, gap: SPACE.block }}
        scrollIndicatorInsets={{ top: headerHeight }}
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        <QuestionCard title="What do you want to work on?" tag="Pick one">
          <Chips accessibilityLabel="What do you want to work on?">
            {shownGoals.map(({ key, label }) => (
              <Chip key={key} label={label} on={draft.goal === key} onPress={() => onChange({ ...draft, goal: key })} />
            ))}
            {shownGoals.length < GOALS.length ? (
              <Pressable
                onPress={() => setMoreGoals(true)}
                accessibilityRole="button"
                accessibilityLabel={`Show ${GOALS.length - shownGoals.length} more goals`}
                hitSlop={(TOUCH_TARGET - 40) / 2}
                style={{ height: 40, paddingHorizontal: 14, borderRadius: RADIUS.control, borderWidth: 1, borderColor: SKIN_NEEDS.line, justifyContent: "center" }}
                className="active:opacity-70"
              >
                <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: LINK }}>+ {GOALS.length - shownGoals.length} more</Text>
              </Pressable>
            ) : null}
          </Chips>
        </QuestionCard>
        <QuestionCard title="Is your skin sensitive?" tag={sensitivityTag} note="Very sensitive puts the gentlest options first. Skipped: we treat your skin as somewhat sensitive.">
          <Chips accessibilityLabel="Is your skin sensitive?">
            {SENSITIVITY_OPTIONS.map(({ value, label }) => (
              <Chip
                key={value}
                label={label}
                accessibilityLabel={`Sensitive skin: ${label}`}
                on={draft.sensitivity === value}
                // Tapping the chosen one again takes the answer back: it is optional.
                onPress={() => onChange({ ...draft, sensitivity: draft.sensitivity === value ? null : value })}
              />
            ))}
          </Chips>
        </QuestionCard>
        <QuestionCard
          title="Pregnant or breastfeeding?"
          tag={pregnancyTag}
          note="We leave out ingredients commonly advised against while pregnant or breastfeeding. Skipped: we show only the safe ones."
        >
          <Chips accessibilityLabel="Pregnant or breastfeeding?">
            {PREGNANCY_OPTIONS.map(({ value, label }) => (
              <Chip
                key={value}
                label={label}
                accessibilityLabel={`Pregnant or breastfeeding: ${label}`}
                on={draft.pregnancy === value}
                onPress={() => onChange({ ...draft, pregnancy: draft.pregnancy === value ? null : value })}
              />
            ))}
          </Chips>
        </QuestionCard>
        <QuestionCard title="Actives you already use" tag="Optional" note="So we don't double up or pair things that clash.">
          <Chips accessibilityLabel="Actives you already use" many>
            {ACTIVES_IN_USE.map(({ label }) => {
              const on = draft.used.includes(label);
              return <Chip key={label} label={label} many on={on} onPress={() => onChange({ ...draft, used: on ? draft.used.filter((l) => l !== label) : [...draft.used, label] })} />;
            })}
          </Chips>
        </QuestionCard>
      </FitScrollView>

      {/* The header holds still on glass while the cards pass behind it. */}
      <GlassHeader scrollY={scrollY} solid={CANVAS} glass={CANVAS_GLASS} onHeight={setHeaderHeight}>
        <View style={{ marginTop: insets.top, height: 56, paddingHorizontal: SPACE.gutter, flexDirection: "row", alignItems: "center" }}>
          <IconCircle onPress={goBackOrHome} accessibilityLabel="Back">
            <BackChevron />
          </IconCircle>
          <Text accessibilityRole="header" style={{ flex: 1, textAlign: "center", fontSize: TYPE.card, fontWeight: "600", color: INK }}>
            Find your actives
          </Text>
          <View style={{ width: 40 }} />
        </View>
      </GlassHeader>

      {/* Pinned to the bottom over a fade (hand-off). Disabled until a goal is picked (Q0). */}
      <View
        pointerEvents="box-none"
        onLayout={(event) => setFooter({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: SPACE.section, paddingHorizontal: SPACE.gutter, paddingBottom: Math.max(34, insets.bottom + 8) }}
      >
        <Fade width={footer.width} height={footer.height} />
        <Pressable
          onPress={ready ? onShow : undefined}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityLabel="Show what helps"
          accessibilityState={{ disabled: !ready }}
          style={{ height: BUTTON_HEIGHT, borderRadius: BUTTON_HEIGHT / 2, backgroundColor: ready ? BUTTON.primary.fill : BUTTON.disabled.fill, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACE.text }}
          className="active:opacity-90"
        >
          <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: WHITE }}>Show what helps</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** A white card: the question, "Pick one" or "Optional" on its right, the chips, and a note. */
function QuestionCard({ title, tag, note, children }: { title: string; tag: string; note?: string; children: React.ReactNode }) {
  // The title shares a row with the tag, so at a larger text size a pair kept together ("or breastfeeding?") is too wide for what is left and would overflow or break inside a word. Normal wrapping then.
  const { fontScale } = useWindowDimensions();
  return (
    <View style={{ backgroundColor: SURFACE, borderRadius: RADIUS.panel, padding: SPACE.inset, gap: SPACE.gutter }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: SPACE.text }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: TYPE.title, fontWeight: "600", lineHeight: LEADING.title, color: INK }}>
          {fontScale > 1 ? title : noOrphan(title)}
        </Text>
        <Text style={{ fontSize: TYPE.caption, fontWeight: "500", color: MUTED_FAINT }}>{tag}</Text>
      </View>
      {children}
      {note ? <Text style={{ fontSize: TYPE.caption, lineHeight: LEADING.caption, color: MUTED_FAINT }}>{noOrphan(note)}</Text> : null}
    </View>
  );
}

function Chips({ accessibilityLabel, many = false, children }: { accessibilityLabel: string; many?: boolean; children: React.ReactNode }) {
  return (
    <View accessibilityRole={many ? undefined : "radiogroup"} accessibilityLabel={accessibilityLabel} style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACE.text }}>
      {children}
    </View>
  );
}

/** One answer (hand-off): 40pt, radius 12, a 1pt outline; chosen, pale green with a sage outline and a tick. */
function Chip({ label, accessibilityLabel, on, many = false, onPress }: { label: string; accessibilityLabel?: string; on: boolean; many?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole={many ? "checkbox" : "radio"}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: on }}
      style={{
        minHeight: 40,
        // Chosen, the tick takes room: the padding gives some of it back, so a
        // chip at the end of a row stays on it (owner: "Very" jumped a line).
        paddingHorizontal: on ? 10 : 14,
        borderRadius: RADIUS.control,
        borderWidth: on ? 1.5 : 1,
        borderColor: on ? CHOSEN.border : SKIN_NEEDS.line,
        backgroundColor: on ? CHOSEN.fill : SURFACE,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
      className="active:opacity-80"
    >
      {on ? <Tick size={14} color={CHOSEN.border} /> : null}
      <Text style={{ fontSize: TYPE.card, fontWeight: on ? "600" : "500", color: on ? SKIN_NEEDS.chosenInk : INK }}>{label}</Text>
    </Pressable>
  );
}

// ── 1 · What can help? ──────────────────────────────────────────────────────

function Options({ answers, onBack, onNotPregnant }: { answers: NeedAnswers; onBack: () => void; onNotPregnant: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { actives, hidden } = optionsFor(answers);
  const routineActives = useAppStore((s) => s.routineActives);
  const routinePicks = useAppStore((s) => s.routinePicks);
  const own = useOwnProducts(Object.values(routinePicks));
  // Added from a story, or held by a product of their own in the routine: the same test as the story's last card (7f).
  const inRoutine = (active: StoryActive) => routineActives.some((entry) => entry.active === active.key) || [...own.found.values()].some((product) => holdsActive(product.ingredients, active));
  const [current, setCurrent] = useState(0);
  const scroller = useRef<ScrollView>(null);
  const stride = Math.min(CARD_WIDTH, width - 2 * CARD_SIDE - 40) + CARD_GAP;
  const cardWidth = stride - CARD_GAP;

  const goal = GOALS.find((g) => g.key === answers.goal)!;
  const safe = safeOnly(answers) && hidden.length > 0;
  const count = actives.length;
  const sensitivity = SENSITIVITY_OPTIONS.find((o) => o.value === answers.sensitivity)?.chip ?? "Sensitivity: skipped";
  const pregnancy = PREGNANCY_OPTIONS.find((o) => o.value === answers.pregnancy)?.chip ?? "Pregnancy: skipped";
  const left = count - current - 1;
  const open = (active: StoryActive) => router.push({ pathname: "/journey-story", params: { active: active.key, answers: encodeAnswers(answers) } });

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS, paddingTop: insets.top }}>
      <View style={{ height: 48, paddingHorizontal: SPACE.gutter, flexDirection: "row", alignItems: "center" }}>
        <IconCircle onPress={onBack} accessibilityLabel="Back to the questions">
          <ArrowLeft />
        </IconCircle>
      </View>
      <FitScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.section }}>
        <View style={{ paddingTop: SPACE.gutter, paddingHorizontal: SPACE.section, gap: SPACE.block }}>
          <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.large, lineHeight: LEADING.large, letterSpacing: TRACKING.large, color: INK }}>
            What can help with {GOAL_OPTIONS[answers.goal].about}?
          </Text>
          <Text style={{ fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>
            {count === 1
              ? `Based on your answers, here is 1 ${safe ? "safe option" : "option worth knowing"}.`
              : `Based on your answers, here are ${count} ${safe ? "safe options" : "options worth knowing"}.`}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: SPACE.text }}>
            {[goal.label, sensitivity, pregnancy].map((label) => (
              <View key={label} style={{ height: 28, paddingHorizontal: SPACE.block, borderRadius: RADIUS.control, backgroundColor: SURFACE, justifyContent: "center" }}>
                <Text style={{ fontSize: TYPE.caption, fontWeight: "500", color: MUTED }}>{label}</Text>
              </View>
            ))}
          </View>
          {safe ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: SPACE.text }}>
              <InfoIcon />
              {answers.pregnancy === "yes" ? (
                <Text style={{ flex: 1, fontSize: TYPE.caption, lineHeight: LEADING.caption, color: MUTED }}>{hiddenLine(hidden)}</Text>
              ) : (
                <Text style={{ flex: 1, fontSize: TYPE.caption, lineHeight: LEADING.caption, color: MUTED }}>
                  Showing pregnancy-safe options. Not pregnant?{" "}
                  <Text onPress={onNotPregnant} accessibilityRole="button" accessibilityLabel="Not pregnant: show every option" style={{ fontWeight: "600", color: BUTTON.primary.fill }}>
                    Change
                  </Text>
                </Text>
              )}
            </View>
          ) : null}
        </View>

        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={stride}
          decelerationRate="fast"
          disableIntervalMomentum
          // Room for the card's shade, which a scroll view would otherwise cut.
          style={{ marginTop: 14 }}
          contentContainerStyle={{ paddingLeft: CARD_SIDE, paddingRight: CARD_SIDE, paddingVertical: 10, gap: CARD_GAP }}
          scrollEventThrottle={16}
          onScroll={(event) => setCurrent(Math.max(0, Math.min(count - 1, Math.round(event.nativeEvent.contentOffset.x / stride))))}
        >
          {actives.map((active, index) => (
            <FamilyCard key={active.key} active={active} width={cardWidth} best={index === 0} safe={safeOnly(answers)} inRoutine={inRoutine(active)} onOpen={() => open(active)} />
          ))}
        </ScrollView>

        <View style={{ paddingTop: 14, paddingHorizontal: SPACE.section, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
            {actives.map((active, index) => (
              <Pressable
                key={active.key}
                onPress={() => scroller.current?.scrollTo({ x: index * stride, animated: !reduceMotionNow() })}
                accessibilityRole="button"
                accessibilityLabel={`Option ${index + 1}: ${active.name}`}
                accessibilityState={{ selected: index === current }}
                hitSlop={{ top: 19, bottom: 19, left: 4, right: 4 }}
              >
                <View style={{ width: index === current ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: index === current ? INK : SKIN_NEEDS.dotOff }} />
              </Pressable>
            ))}
          </View>
          {actives.some(inRoutine) ? (
            <Hand size={18} color={MUTED_FAINT} says>
              add another?
            </Hand>
          ) : left > 0 ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Hand size={18} color={MUTED_FAINT} says>{`swipe for ${left} more`}</Hand>
              <Svg width={36} height={14} viewBox="0 0 40 16" fill="none">
                <Path d="M2 9c10-6 22-6 34-1" stroke={MUTED_FAINT} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                <Path d="m30 3 6 5-7 3" stroke={MUTED_FAINT} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </View>
          ) : null}
        </View>
      </FitScrollView>
    </View>
  );
}

/**
 * One option (hand-off): the family's tint and picture, "Best first pick" on
 * the first (or "In your routine" once added), a star that saves the
 * ingredient to Saved › Ingredients, the name, the line, and how long its
 * story is. Tapping it opens the story.
 */
function FamilyCard({ active, width, best, safe, inRoutine, onOpen }: { active: StoryActive; width: number; best: boolean; /** Only the safe ones are showing: each says so (hand-off 1p). */ safe: boolean; inRoutine: boolean; onOpen: () => void }) {
  const line = safe ? `${active.story.line} Safe while pregnant or breastfeeding.` : active.story.line;
  const family = familyOf(active);
  const saved = useAppStore((s) => s.savedIngredients.includes(active.save));
  const toggleSaved = useAppStore((s) => s.toggleSavedIngredient);
  const cards = storyLength(active);
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${active.name}, ${active.sub}. ${line} ${storyLengthLine(active)}.`}
      accessibilityHint="Opens its story"
      style={{ width, height: CARD_HEIGHT, borderRadius: RADIUS.panel, backgroundColor: SKIN_NEEDS.family[active.family], ...SKIN_NEEDS.cardShadow }}
      className="active:opacity-95"
    >
      <View style={{ height: 236 }}>
        <Image source={family.picture} contentFit="contain" accessibilityLabel="" style={{ position: "absolute", top: 14, alignSelf: "center", width: 230, height: 222 }} />
        {inRoutine ? (
          <View style={{ position: "absolute", top: 16, left: 16, height: 28, paddingHorizontal: SPACE.block, borderRadius: RADIUS.control, backgroundColor: BUTTON.primary.fill, flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Tick size={12} color={WHITE} />
            <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: WHITE }}>In your routine</Text>
          </View>
        ) : best ? (
          <View style={{ position: "absolute", top: 16, left: 16, height: 28, paddingHorizontal: SPACE.block, borderRadius: RADIUS.control, backgroundColor: SURFACE, justifyContent: "center" }}>
            <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: LINK }}>Best first pick</Text>
          </View>
        ) : null}
        <Pressable
          onPress={() => {
            haptic.select();
            toggleSaved(active.save);
          }}
          accessibilityRole="button"
          accessibilityLabel={saved ? `Remove ${active.name} from saved ingredients` : `Save ${active.name} to your ingredients`}
          accessibilityState={{ selected: saved }}
          hitSlop={4}
          style={{ position: "absolute", top: 16, right: 16, width: 40, height: 40, borderRadius: RADIUS.card, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center", ...ICON_SHADOW }}
          className="active:opacity-80"
        >
          <StarIcon filled={saved} color={saved ? STAR_ON : INK} />
        </Pressable>
      </View>
      <View style={{ flex: 1, paddingTop: SPACE.gutter, paddingHorizontal: SPACE.section, paddingBottom: SPACE.section, gap: 4 }}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.large, lineHeight: LEADING.large, letterSpacing: TRACKING.large, color: INK }}>
          {active.name}
        </Text>
        <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>{active.sub}</Text>
        <Text style={{ marginTop: SPACE.text, fontSize: TYPE.card, lineHeight: LEADING.card, color: INK }}>{line}</Text>
        <View style={{ marginTop: "auto", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: TYPE.caption, fontWeight: "500", color: MUTED_FAINT }}>{storyLengthLine(active)}</Text>
            <View style={{ flexDirection: "row", gap: 3 }}>
              {Array.from({ length: cards }, (_, index) => (
                <View key={index} style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: SKIN_NEEDS.dash }} />
              ))}
            </View>
          </View>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: BUTTON.primary.fill, alignItems: "center", justifyContent: "center" }}>
            <ArrowRight color={WHITE} size={22} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/** The page colour fading in from clear, behind the pinned button: clear at the top, solid from 40% down. */
function Fade({ width, height }: { width: number; height: number }) {
  if (width === 0) return null;
  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: "absolute", top: 0, left: 0 }}>
      <Defs>
        <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={CANVAS} stopOpacity={0} />
          <Stop offset="0.4" stopColor={CANVAS} stopOpacity={1} />
          <Stop offset="1" stopColor={CANVAS} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#fade)" />
    </Svg>
  );
}

function ArrowLeft() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M19 12H5" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="m12 19-7-7 7-7" stroke={INK} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ArrowRight({ color, size }: { color: string; size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      <Path d="m13 6 6 6-6 6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function InfoIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={BUTTON.primary.fill} strokeWidth={2.2} />
      <Path d="M12 8v5M12 16v.01" stroke={BUTTON.primary.fill} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}
