import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { BottomSheet } from "@/components/BottomSheet";
import { CloseCross, IconCircle } from "@/components/IconCircle";
import { BUTTON_WIDTH, PrimaryButton } from "@/components/PrimaryButton";
import { Text } from "@/components/Text";
import type { Ingredient } from "@/data/types";
import type { Need } from "@/lib/journey";
import { phoneRegion } from "@/lib/region";
import { activeOf, encodeAnswers, familyOf, prescriptionIn } from "@/lib/skin-needs";
import { BUTTON, DISPLAY_FONT, INK, MUTED, MUTED_FAINT, STONE, VERDICT, TYPE, RADIUS, SPACE, LEADING, TRACKING } from "@/lib/tokens";

/**
 * "Talk to a doctor first" (design_handoff "october 3d", D and Dp): a product
 * scanned from Skin needs that holds a prescription-only active (tretinoin,
 * hydroquinone, adapalene outside the US). Skin needs covers over-the-counter
 * actives only, so it says so once, on opening, and offers the
 * over-the-counter one in its place; pregnant or breastfeeding, or not said,
 * it offers nothing in its place and asks them to see their doctor.
 *
 * Drawn over the result rather than in a window of its own, so "Learn about
 * retinol" opens the story at once. The result must place it last in a
 * full-screen view.
 */
export function DoctorSheet({ ingredients, need }: { ingredients: readonly Pick<Ingredient, "name">[]; need: Need }) {
  const found = useMemo(() => prescriptionIn(ingredients, phoneRegion()), [ingredients]);
  const [open, setOpen] = useState(true);
  if (!found) return null;
  // Skipped counts as yes on Skin needs (hand-off): nothing is offered in its place.
  const pregnant = need.pregnant !== false;
  const alternative = activeOf(found.alternative);
  const close = () => setOpen(false);
  const learn = () => {
    setOpen(false);
    router.push({
      pathname: "/journey-story",
      params: {
        active: alternative.key,
        answers: encodeAnswers({ goal: need.goal, sensitivity: need.sensitivity, pregnancy: need.pregnant === null ? null : need.pregnant ? "yes" : "no", uses: [...(need.uses ?? [])] }),
      },
    });
  };
  const altName = `${alternative.name.charAt(0).toLowerCase()}${alternative.name.slice(1)}`;
  return (
    <BottomSheet
      visible={open}
      onClose={close}
      floating
      inline
      corner={
        <IconCircle onPress={close} accessibilityLabel="Close">
          <CloseCross />
        </IconCircle>
      }
    >
      <View style={{ alignItems: "center", gap: SPACE.block, paddingTop: SPACE.text, paddingHorizontal: SPACE.text }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: VERDICT.medium.tint, alignItems: "center", justifyContent: "center" }}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
            <Path d="M5 3v6a5 5 0 0 0 10 0V3M10 14v2a5 5 0 0 0 10 0v-3" stroke={VERDICT.medium.deep} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            <Circle cx={20} cy={11} r={2} stroke={VERDICT.medium.deep} strokeWidth={2.2} />
          </Svg>
        </View>
        <Text accessibilityRole="header" style={{ textAlign: "center", fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: LEADING.heading, letterSpacing: TRACKING.heading, color: INK }}>
          Talk to a doctor first
        </Text>
        <Text style={{ textAlign: "center", fontSize: TYPE.body, lineHeight: LEADING.body, color: MUTED }}>
          {pregnant
            ? `This has ${found.name}, ${found.what}. It's usually avoided while pregnant or breastfeeding. Ask your doctor before using it.`
            : `This has ${found.name}, ${found.what}. A doctor should guide how you use it.`}
        </Text>
        {pregnant ? (
          <PrimaryButton label="Close" onPress={close} style={{ marginTop: SPACE.text, width: BUTTON_WIDTH.secondary }} />
        ) : (
          <>
            <Pressable
              onPress={learn}
              accessibilityRole="button"
              accessibilityLabel={`Over-the-counter option: ${alternative.name}`}
              style={{ alignSelf: "stretch", backgroundColor: STONE, borderRadius: RADIUS.card, paddingVertical: SPACE.block, paddingHorizontal: SPACE.gutter, flexDirection: "row", alignItems: "center", gap: SPACE.block }}
              className="active:opacity-80"
            >
              <Image source={familyOf(alternative).picture} contentFit="contain" accessibilityLabel="" style={{ width: 44, height: 44 }} />
              <View style={{ flex: 1, gap: SPACE.hair }}>
                <Text style={{ fontSize: TYPE.caption, color: MUTED_FAINT }}>Over-the-counter option</Text>
                <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: INK }}>{alternative.key === "retinoids" ? "Retinol" : alternative.name}</Text>
              </View>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Path d="m9 18 6-6-6-6" stroke={BUTTON.primary.fill} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
            <PrimaryButton label={`Learn about ${alternative.key === "retinoids" ? "retinol" : altName}`} onPress={learn} style={{ marginTop: SPACE.text, width: BUTTON_WIDTH.secondary }} />
          </>
        )}
      </View>
    </BottomSheet>
  );
}
