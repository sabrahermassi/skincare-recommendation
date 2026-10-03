import { Image } from "expo-image";
import type { ReactNode } from "react";
import { Linking, Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { DottedLine } from "@/components/DottedLine";
import { Hand, SwapIcon, Tick } from "@/components/skin-needs/bits";
import { Text } from "@/components/Text";
import type { Sensitivity } from "@/data/types";
import { DAY_LETTERS, evidenceFor, familyOf, inSentence, sensitivityNote, sensitivityOf, startLine, startNights, weekRows, type NeedAnswers, type StoryActive } from "@/lib/skin-needs";
import { FAMILIES, LOOK_FOR_ART, PAIR_AVOID_ART, PAIR_LOVE_ART, SENSITIVITY_ART, SIGNS } from "@/lib/skin-needs-data";
import { BUTTON, DISPLAY_FONT, DIVIDER, INK, LINK, MUTED, MUTED_FAINT, ROUTINE_SWITCH, SKIN_NEEDS, STONE, SURFACE, WHITE, TYPE } from "@/lib/tokens";

/**
 * The cards of an active's story (design_handoff "october 3d", 2–7): one idea
 * each, mostly picture. Every word comes from the active's record
 * (`lib/skin-needs-data.ts`) and the answers on the questions screen.
 */

/** A card's title and the line under it (hand-off: PT Serif 34/40, then 17/24). */
function Heading({ title, line, top = 32, children }: { title: string; line?: string; top?: number; children?: ReactNode }) {
  return (
    <View style={{ paddingTop: top, paddingHorizontal: 24, gap: 8 }}>
      <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.display, lineHeight: 40, letterSpacing: -0.6, color: INK }}>
        {title}
      </Text>
      {line ? <Text style={{ fontSize: TYPE.card, lineHeight: 24, color: MUTED }}>{line}</Text> : null}
      {children}
    </View>
  );
}

// ── 2 · Why this one? ───────────────────────────────────────────────────────

export function WhyCard({ active, goal }: { active: StoryActive; goal: string }) {
  const { why, alsoHelps } = active.story;
  const evidence = evidenceFor(active);
  return (
    <View style={{ flex: 1 }}>
      <Heading title={`Why ${inSentence(active.name)}?`} line={why.line}>
        {evidence ? (
          <Pressable
            onPress={() => void Linking.openURL(evidence.url).catch(() => undefined)}
            accessibilityRole="link"
            accessibilityLabel={`See the evidence: ${evidence.label}`}
            accessibilityHint="Opens in your browser"
            hitSlop={6}
            style={{ alignSelf: "flex-start", height: 32, flexDirection: "row", alignItems: "center", gap: 4 }}
            className="active:opacity-70"
          >
            <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: BUTTON.primary.fill }}>See the evidence</Text>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke={BUTTON.primary.fill} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </Pressable>
        ) : null}
      </Heading>
      <View style={{ height: 330 }}>
        <Image source={familyOf(active).why} contentFit="contain" accessibilityLabel="" style={{ position: "absolute", left: 16, right: 16, top: 40, height: 256 }} />
        <Hand tilt={3} style={{ position: "absolute", right: 16, top: 6, width: 170, textAlign: "right" }}>
          {why.notes[0]}
        </Hand>
        <Hand tilt={-3} style={{ position: "absolute", left: 16, top: 290 }}>
          {why.notes[1]}
        </Hand>
      </View>
      <View style={{ marginTop: "auto", marginHorizontal: 16, backgroundColor: SURFACE, borderRadius: 28, padding: 20, gap: 12 }}>
        <Hand color={LINK} says>
          for your goal
        </Hand>
        <View style={{ alignSelf: "flex-start", minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: SKIN_NEEDS.sage, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Tick size={15} color={BUTTON.primary.fill} />
          <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: SKIN_NEEDS.chosenInk }}>{goal}</Text>
        </View>
        <Text style={{ fontSize: TYPE.body, lineHeight: 21, color: MUTED }}>Also helps with {alsoHelps}.</Text>
      </View>
    </View>
  );
}

// ── 3 · How often do I use it? (the hand-off's "Start easy", renamed by the owner) ──────────────────────────────────────────────────────────

export function StartCard({ active, answers }: { active: StoryActive; answers: Pick<NeedAnswers, "sensitivity"> }) {
  const sensitivity: Sensitivity = sensitivityOf(answers);
  const nights = startNights(active, sensitivity);
  const rows = weekRows(active, sensitivity);
  return (
    <View style={{ flex: 1 }}>
      <Heading title="How often do I use it?" line={startLine(nights)} />
      <View style={{ marginTop: 32, marginHorizontal: 16, backgroundColor: SURFACE, borderRadius: 28, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", paddingBottom: 8 }}>
          <View style={{ width: 84 }} />
          {DAY_LETTERS.map((letter, day) => (
            <Text key={day} style={{ flex: 1, textAlign: "center", fontSize: 12, fontWeight: "600", color: MUTED_FAINT }}>
              {letter}
            </Text>
          ))}
        </View>
        {rows.map((row) => (
          <View key={row.label} accessibilityLabel={`${row.label}: ${row.days.length === 7 ? "every day" : `${row.days.length} days a week`}${row.later ? ", only if your skin is happy" : ""}`} style={{ flexDirection: "row", alignItems: "center", height: 56, borderTopWidth: 0.5, borderTopColor: DIVIDER }}>
            <Text style={{ width: 84, fontSize: TYPE.caption, fontWeight: "600", color: row.later ? MUTED_FAINT : INK }}>{row.label}</Text>
            {DAY_LETTERS.map((_, day) => (
              <View key={day} style={{ flex: 1, alignItems: "center" }}>
                {row.days.includes(day) ? (
                  <View style={row.later ? { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderStyle: "dashed", borderColor: SKIN_NEEDS.later } : { width: 22, height: 22, borderRadius: 11, backgroundColor: BUTTON.primary.fill }} />
                ) : (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: SKIN_NEEDS.line }} />
                )}
              </View>
            ))}
          </View>
        ))}
      </View>
      {nights < 7 ? (
        <View style={{ height: 56, flexDirection: "row", justifyContent: "flex-end", alignItems: "flex-start", paddingRight: 28 }}>
          {/* The arrow curls up from the note to the "Later" row (hand-off). */}
          <Svg width={30} height={30} viewBox="0 0 40 40" fill="none" style={{ marginTop: -8, marginRight: 4 }}>
            <Path d="M34 30C24 28 12 20 8 6" stroke={MUTED_FAINT} strokeWidth={1.6} strokeLinecap="round" />
            <Path d="m3 12 5-7 6 5" stroke={MUTED_FAINT} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <Hand tilt={-3} style={{ marginTop: 6 }}>
            only if your skin is happy
          </Hand>
        </View>
      ) : null}
      <View style={{ marginTop: "auto", marginHorizontal: 16, backgroundColor: SKIN_NEEDS.note, borderRadius: 28, paddingVertical: 16, paddingLeft: 12, paddingRight: 20, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Image source={SENSITIVITY_ART[sensitivity]} contentFit="contain" accessibilityLabel="" style={{ width: 64, height: 62 }} />
        <Text style={{ flex: 1, fontSize: TYPE.card, lineHeight: 23, fontWeight: "600", color: INK }}>{sensitivityNote(answers, nights)}</Text>
      </View>
    </View>
  );
}

// ── 4 · When do I use it? ───────────────────────────────────────────────────

export function WhenCard({ active }: { active: StoryActive }) {
  const { time, amount } = active.story;
  const morningBest = time.best === "morning";
  return (
    <View style={{ flex: 1 }}>
      <Heading title="When do I use it?" />
      <View style={{ paddingTop: 24, paddingHorizontal: 16, flexDirection: "row", gap: 12 }}>
        <View accessibilityLabel={`Morning: ${time.morning.note}${morningBest ? ". Start here." : ""}`} style={{ flex: 1, height: 112, borderRadius: 28, backgroundColor: SKIN_NEEDS.morning.fill, alignItems: "center", justifyContent: "center", gap: 2, opacity: time.morning.ok ? 1 : 0.45 }}>
          <Svg width={34} height={34} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={4.5} fill={SKIN_NEEDS.morning.sunFill} />
            <Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke={SKIN_NEEDS.morning.sun} strokeWidth={2} strokeLinecap="round" />
          </Svg>
          <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: SKIN_NEEDS.morning.ink }}>Morning</Text>
          <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>{time.morning.note}</Text>
        </View>
        <View accessibilityLabel={`Evening: ${time.evening.note}${morningBest ? "" : ". Start here."}`} style={{ flex: 1, height: 112, borderRadius: 28, backgroundColor: SKIN_NEEDS.evening.fill, alignItems: "center", justifyContent: "center", gap: 2, opacity: time.evening.ok ? 1 : 0.45 }}>
          <Svg width={30} height={30} viewBox="0 0 24 24">
            <Path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" fill={WHITE} />
          </Svg>
          <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: WHITE }}>Evening</Text>
          <Text style={{ fontSize: TYPE.caption, color: SKIN_NEEDS.evening.line }}>{time.evening.note}</Text>
        </View>
      </View>
      {/* "start here", under the tile to start with, its arrow curling up to it. */}
      <View style={{ height: 96, flexDirection: morningBest ? "row-reverse" : "row", justifyContent: "flex-end", alignItems: "flex-start", paddingHorizontal: 42 }}>
        {/* The same hand, colour and thin arrow as "only if your skin is happy" (owner). */}
        <Hand tilt={-3} style={{ marginTop: 22 }}>
          start here
        </Hand>
        <Svg width={56} height={46} viewBox="0 0 60 50" fill="none" style={morningBest ? { transform: [{ scaleX: -1 }] } : undefined}>
          <Path d="M52 44C40 40 26 30 20 8" stroke={MUTED_FAINT} strokeWidth={1.6} strokeLinecap="round" />
          <Path d="m12 16 8-10 8 9" stroke={MUTED_FAINT} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <View style={{ paddingHorizontal: 24, paddingTop: 8 }}>
        <RailStep number={1} name="Cleanse" />
        <RailStep number={2} name={active.name} active={active} amount={amount} />
        <RailStep number={3} name="Moisturise" last />
      </View>
    </View>
  );
}

/** One step of the three-step rail: a numbered disc on a dotted line, and a card; the active's own step in its family's tint. */
function RailStep({ number, name, active, amount, last = false }: { number: number; name: string; active?: StoryActive; amount?: string; last?: boolean }) {
  const tint = active ? SKIN_NEEDS.family[active.family] : SURFACE;
  return (
    <View style={{ flexDirection: "row", gap: 12 }}>
      <View style={{ width: 28, alignItems: "center" }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: active ? BUTTON.primary.fill : ROUTINE_SWITCH.stepFill, alignItems: "center", justifyContent: "center" }}>
          <Text maxFontSizeMultiplier={1} style={{ fontSize: TYPE.caption, fontWeight: "700", color: active ? WHITE : LINK }}>
            {number}
          </Text>
        </View>
        {last ? null : <DottedLine color={ROUTINE_SWITCH.stepLine} style={{ flex: 1, marginVertical: 4 }} />}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 20 }}>
        <View style={{ minHeight: 56, borderRadius: 20, backgroundColor: tint, paddingVertical: active ? 14 : 0, paddingHorizontal: 16, justifyContent: "center", gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: TYPE.card, fontWeight: "600", color: INK }}>{name}</Text>
            <Text style={{ fontSize: TYPE.caption, fontWeight: active ? "600" : "400", color: active ? SKIN_NEEDS.stepInk : MUTED_FAINT }}>Step {number}</Text>
          </View>
          {active && amount ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ height: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: SURFACE, justifyContent: "center" }}>
                <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: SKIN_NEEDS.stepInk }}>{amount}</Text>
              </View>
              <Hand color={SKIN_NEEDS.stepInk} tilt={-4}>
                fits here
              </Hand>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// ── 5 · Best paired with ────────────────────────────────────────────────────

export function PairsCard({ active }: { active: StoryActive }) {
  const { line, with: pairs } = active.story.pairs;
  return (
    <View style={{ flex: 1 }}>
      <Heading title="Best paired with" line={line} />
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ height: 330, marginTop: 16 }}>
        <Image source={FAMILIES[pairs[0].family].picture} contentFit="contain" style={{ position: "absolute", left: 0, top: 118, width: 150, height: 144 }} />
        <Image source={FAMILIES[pairs[1].family].picture} contentFit="contain" style={{ position: "absolute", right: 0, top: 118, width: 150, height: 144 }} />
        <Image source={familyOf(active).picture} contentFit="contain" style={{ position: "absolute", top: 6, alignSelf: "center", width: 170, height: 162 }} />
        <Image source={PAIR_LOVE_ART} contentFit="contain" style={{ position: "absolute", top: 198, alignSelf: "center", width: 110, height: 88 }} />
        <Hand size={21} fit style={{ position: "absolute", left: 20, top: 272, maxWidth: 150 }}>
          {pairs[0].label}
        </Hand>
        <View style={{ position: "absolute", top: 160, alignSelf: "center", width: 170, alignItems: "center" }}>
          <Hand size={26} color={INK} fit>
            {active.name}
          </Hand>
        </View>
        <Hand size={21} fit style={{ position: "absolute", right: 24, top: 272, maxWidth: 150 }}>
          {pairs[1].label}
        </Hand>
      </View>
      <View style={{ marginTop: "auto", marginHorizontal: 16, backgroundColor: SURFACE, borderRadius: 28, paddingVertical: 4, paddingHorizontal: 20 }}>
        {pairs.map((pair, index) => (
          <View key={pair.name} style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, borderTopWidth: index === 0 ? 0 : 0.5, borderTopColor: DIVIDER }}>
            <Text style={{ width: 132, fontSize: TYPE.card, fontWeight: "600", color: INK }}>{pair.name}</Text>
            <Text style={{ flex: 1, fontSize: TYPE.body, color: MUTED }}>{pair.note}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── 6 · Avoid pairing with ──────────────────────────────────────────────────

export function AvoidCard({ active }: { active: StoryActive }) {
  const avoid = active.story.avoid;
  if (!avoid) return null;
  const [first] = avoid.with;
  const others = avoid.with.map((entry) => entry.label);
  return (
    <View style={{ flex: 1 }}>
      <Heading title="Avoid pairing with" line="You don't need every active at once." />
      <View accessibilityLabel={`${active.name} and ${others.join(" or ")}: too much together.`} style={{ height: 250, marginTop: 16 }}>
        <Image source={familyOf(active).picture} contentFit="contain" accessibilityLabel="" style={{ position: "absolute", left: 8, top: 56, width: 160, height: 152 }} />
        <Image source={FAMILIES[first.family].picture} contentFit="contain" accessibilityLabel="" style={{ position: "absolute", right: 8, top: 56, width: 160, height: 152 }} />
        <Image source={PAIR_AVOID_ART} contentFit="contain" accessibilityLabel="" style={{ position: "absolute", top: 70, alignSelf: "center", width: 96, height: 96 }} />
        <View style={{ position: "absolute", left: 8, width: 160, top: 210, alignItems: "center" }}>
          <Hand size={26} color={INK} fit>
            {active.name}
          </Hand>
        </View>
        <View style={{ position: "absolute", right: 8, width: 160, top: 214, alignItems: "center" }}>
          <Hand size={21} fit>
            {first.label}
          </Hand>
        </View>
        <View style={{ position: "absolute", top: 24, left: 0, right: 0, alignItems: "center" }}>
          <Hand color={SKIN_NEEDS.warn} tilt={-5}>
            too much together
          </Hand>
        </View>
      </View>
      <View style={{ paddingTop: 16, paddingHorizontal: 16, flexDirection: "row", gap: 8 }}>
        {avoid.signs.map((sign) => (
          <View key={sign} style={{ flex: 1, minHeight: 108, borderRadius: 24, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8 }}>
            <Image source={SIGNS[sign].picture} contentFit="contain" accessibilityLabel="" style={{ width: 56, height: 56 }} />
            <Text style={{ fontSize: TYPE.body, fontWeight: "600", textAlign: "center", color: INK }}>{SIGNS[sign].label}</Text>
          </View>
        ))}
      </View>
      <View style={{ alignItems: "center", paddingVertical: 8 }}>
        <Svg width={16} height={28} viewBox="0 0 24 40" fill="none">
          <Path d="M12 2v32M5 27l7 7 7-7" stroke={MUTED_FAINT} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </View>
      <Text style={{ marginHorizontal: 32, fontSize: TYPE.card, lineHeight: 24, fontWeight: "600", textAlign: "center", color: INK }}>See these? Give your skin a few days off.</Text>
      <View style={{ marginTop: 16, marginHorizontal: 16, backgroundColor: SURFACE, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <SwapIcon color={BUTTON.primary.fill} />
        <Text style={{ flex: 1, fontSize: TYPE.body, lineHeight: 21, color: INK }}>
          Not in the same routine. Alternate: <Text style={{ fontWeight: "600" }}>morning and evening</Text>, or <Text style={{ fontWeight: "600" }}>different days</Text>.
        </Text>
      </View>
    </View>
  );
}

// ── 7 · When shopping ───────────────────────────────────────────────────────

export function ShopCard({ active, actions }: { active: StoryActive; /** Add to my routine, or See my routine, and Check a product. */ actions: ReactNode }) {
  const { shopping } = active.story;
  return (
    <View style={{ flex: 1 }}>
      <Heading title="When shopping" top={24} />
      <View style={{ height: 200 }}>
        <Image source={LOOK_FOR_ART} contentFit="contain" accessibilityLabel="" style={{ position: "absolute", top: -4, alignSelf: "center", width: 214, height: 206 }} />
        <Hand size={18} tilt={-6} style={{ position: "absolute", left: 24, top: 132 }}>
          {"turn it\naround"}
        </Hand>
      </View>
      <View style={{ marginTop: 8, marginHorizontal: 16, backgroundColor: SURFACE, borderRadius: 28, paddingTop: 16, paddingHorizontal: 20, paddingBottom: 4 }}>
        <Text accessibilityRole="header" style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.78, textTransform: "uppercase", color: MUTED_FAINT }}>
          Look for
        </Text>
        <LookRow icon={<SearchIcon />} first>
          <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: STONE }}>
            <Text style={{ fontSize: TYPE.body, fontWeight: "600", letterSpacing: 0.3, color: INK }}>{shopping.look}</Text>
          </View>
          <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>on the label</Text>
        </LookRow>
        <LookRow icon={<BottleIcon />}>
          <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>{shopping.forms}</Text>
          {shopping.formsAlt ? <Text style={{ flexShrink: 1, fontSize: TYPE.caption, color: MUTED_FAINT }}>{shopping.formsAlt}</Text> : null}
        </LookRow>
        <LookRow icon={<HeartIcon />}>
          <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>{shopping.extra}</Text>
        </LookRow>
      </View>
      {shopping.strength ? (
        <View style={{ marginTop: 28, marginHorizontal: 16, paddingHorizontal: 4, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
            <Text style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.78, textTransform: "uppercase", color: MUTED_FAINT }}>Product strength</Text>
            <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>{shopping.strength.range}</Text>
          </View>
          <View accessibilityLabel={`Product strength: ${shopping.strength.range}. Higher isn't better.`} style={{ flexDirection: "row", gap: 4, height: 36 }}>
            {shopping.strength.steps.map((step, index) => (
              <View key={step} style={{ flex: 1, backgroundColor: SKIN_NEEDS.sage, alignItems: "center", justifyContent: "center", borderTopLeftRadius: index === 0 ? 18 : 0, borderBottomLeftRadius: index === 0 ? 18 : 0 }}>
                <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: SKIN_NEEDS.chosenInk }}>{step}</Text>
              </View>
            ))}
            <View style={{ flex: 1, backgroundColor: SKIN_NEEDS.over.fill, alignItems: "center", justifyContent: "center", borderTopRightRadius: 18, borderBottomRightRadius: 18 }}>
              <Text style={{ fontSize: TYPE.caption, fontWeight: "600", color: SKIN_NEEDS.over.ink, textDecorationLine: "line-through" }}>more</Text>
            </View>
          </View>
          <Hand says>don&apos;t chase the highest strength</Hand>
        </View>
      ) : null}
      <View style={{ marginTop: "auto", paddingTop: 12, paddingHorizontal: 16, gap: 8 }}>{actions}</View>
    </View>
  );
}

function LookRow({ icon, first = false, children }: { icon: ReactNode; first?: boolean; children: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, borderTopWidth: first ? 0 : 0.5, borderTopColor: DIVIDER }}>
      {icon}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", flexWrap: "wrap", columnGap: 12, rowGap: 2 }}>{children}</View>
    </View>
  );
}

function SearchIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={BUTTON.primary.fill} strokeWidth={2.2} />
      <Path d="m20 20-4-4" stroke={BUTTON.primary.fill} strokeWidth={2.2} strokeLinecap="round" />
    </Svg>
  );
}

function BottleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M10 2h4M12 2v3M8 8a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2z" stroke={BUTTON.primary.fill} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function HeartIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" stroke={BUTTON.primary.fill} strokeWidth={2.2} strokeLinejoin="round" />
    </Svg>
  );
}
