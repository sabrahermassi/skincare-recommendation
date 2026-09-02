import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { fetchProduct } from "@/data/api";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { comedogenicLabel } from "@/lib/format";
import { ingredientTone, matchProduct, positionWeightLabel, ruleFor } from "@/lib/matching";
import { targetApplies } from "@/lib/rules";
import { isVerified } from "@/lib/safety";
import { useAppStore } from "@/store/useAppStore";

/**
 * Ingredient detail — screen 5 of the Skintel Screens design.
 *
 * The design fills this screen with encyclopaedia copy: a written definition,
 * a personalised verdict, and a list of things to know. We hold none of that
 * as prose. What we do hold is the curated rule, the ingredient's own note,
 * the CosIng function list, the EU regulatory status, the pore rating and the
 * position in the formula — so the sections keep the design's shape and are
 * filled from those.
 *
 * Every section renders every time. An earlier pass gated all three on a
 * curated rule existing, which is true for a few dozen ingredients out of
 * ~31k — so for almost everything real the screen was a name and a pill above
 * a blank page. Where a fact is genuinely missing, the section says so in a
 * sentence rather than disappearing.
 *
 * The design's closing "See studies and evidence" card is still not drawn:
 * there is no evidence source behind it, and a card that goes nowhere is worse
 * than one less section.
 */

type Rung = "good" | "watch" | "avoid" | "neutral";

const RUNG: Record<
  Rung,
  {
    pill: string;
    ink: string;
    dot: string;
    label: string;
    panel: string;
    /** The solid fill of the qualifier pill inside the verdict panel. */
    chip: string;
    hero: string;
  }
> = {
  good: {
    pill: "bg-level-good-tint",
    ink: "text-level-good-ink",
    dot: "bg-level-good",
    label: "Good for you",
    panel: "bg-panel-success border-panel-success-line",
    chip: "bg-[#D9EADE]",
    hero: COLORS.levelGood,
  },
  watch: {
    pill: "bg-level-watch-tint",
    ink: "text-level-watch-ink",
    dot: "bg-level-watch",
    label: "Worth knowing",
    panel: "bg-tint-peach border-tint-peach",
    chip: "bg-level-watch-tint",
    hero: COLORS.levelWatch,
  },
  avoid: {
    pill: "bg-level-avoid-tint",
    ink: "text-level-avoid-ink",
    dot: "bg-level-avoid",
    label: "Flagged for you",
    panel: "bg-tint-pink border-tint-pink",
    chip: "bg-level-avoid-tint",
    hero: COLORS.levelAvoid,
  },
  neutral: {
    pill: "bg-level-neutral-tint",
    ink: "text-level-neutral-ink",
    dot: "bg-level-neutral",
    label: "Not recognised",
    panel: "bg-hairline border-hairline",
    chip: "bg-level-neutral-tint",
    hero: COLORS.levelNeutral,
  },
};

/** A round flask tile, standing in for the design's raster hero illustration. */
function FlaskHero({ color }: { color: string }) {
  return (
    <View
      className="items-center justify-center rounded-full"
      style={{ height: 86, width: 86, backgroundColor: `${color}26` }}
    >
      <Svg width={40} height={40} viewBox="0 0 24 24" fill="none">
        <Path
          d="M9.5 3h5M10.5 3v6.2L5.8 17.4A2.2 2.2 0 0 0 7.7 20.8h8.6a2.2 2.2 0 0 0 1.9-3.4L13.5 9.2V3"
          stroke={color}
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Path d="M8.2 14.6h7.6" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function HeartIcon({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 20.2s-7.6-4.7-7.6-9.7A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.6 2.8c0 5-7.6 9.7-7.6 9.7Z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function IngredientDetail() {
  const { inci, product: productId } = useLocalSearchParams<{
    inci: string;
    product?: string;
  }>();

  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [loading, setLoading] = useState(Boolean(productId));
  const profile = useAppStore((s) => s.profile);

  useEffect(() => {
    if (!productId) return;
    let cancelled = false;
    setLoading(true);
    fetchProduct(productId)
      .then((result) => {
        if (cancelled) return;
        setProduct(result);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("fetchProduct failed:", err);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const index = product?.ingredients.findIndex((i) => i.name === inci) ?? -1;
  const ingredient: Ingredient =
    index >= 0 && product
      ? product.ingredients[index]
      : { id: inci, name: inci, comedogenic: 0, safety: "safe", verified: false };

  const match = product ? matchProduct(product, profile) : null;
  const verified = isVerified(ingredient);
  const rung: Rung = !verified
    ? "neutral"
    : match
      ? ((t) => (t === "flag" ? "avoid" : t))(ingredientTone(ingredient, match))
      : "watch";
  const meta = RUNG[rung];

  const rule = ruleFor(ingredient);
  const helps = rule ? targetApplies(rule.helps, profile) : false;
  const hurts = rule ? targetApplies(rule.hurts, profile) : false;

  const total = product?.ingredients.length ?? 0;
  const position = index >= 0 ? index + 1 : null;

  // The design sets a common name under the INCI name. We don't hold one, but
  // many INCI names carry it in parentheses ("Panthenol (Vitamin B5)"), and
  // where they don't the declared role is the honest second line.
  const { primary, secondary } = splitName(ingredient);

  // Everything under "Things to know" is sourced, never written.
  const notes = [
    verified ? `EU regulatory status: ${regulatoryStatus(ingredient)}` : null,
    ingredient.functions && ingredient.functions.length > 0
      ? `Declared function: ${ingredient.functions.slice(0, 3).join(", ")}`
      : null,
    verified && ingredient.comedogenic > 0 ? comedogenicLabel(ingredient.comedogenic) : null,
    position !== null
      ? `#${position} of ${total} on the label — ${positionWeightLabel(index)}`
      : null,
    rule?.hurts?.sensitive ? "Our rules flag this as a common irritant for sensitive skin" : null,
  ].filter((n): n is string => n !== null);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader />

      <ScrollView contentContainerClassName="pb-40">
        <View style={{ gap: 18, paddingTop: 30 }} className="flex-row items-start px-6">
          <View style={{ flex: 1, gap: 9 }}>
            <Text className="font-display text-[34px] capitalize leading-[36px] tracking-[-0.61px] text-[#463F57]">
              {primary}
            </Text>
            {secondary ? (
              <Text className="font-display text-[19px] capitalize leading-[19px] text-[#5C5468]">
                {secondary}
              </Text>
            ) : null}
            <View
              className={`mt-1 flex-row items-center gap-2 self-start rounded-full px-3.5 py-2 ${meta.pill}`}
            >
              <View className={`h-2 w-2 rounded-full ${meta.dot}`} />
              <Text className={`text-[12.5px] font-medium ${meta.ink}`}>{meta.label}</Text>
            </View>
          </View>
          <FlaskHero color={meta.hero} />
        </View>

        <Section title="What it does">
          <Text className="text-[13.5px] leading-[21px] text-ink-body">
            {whatItDoes(ingredient, rule?.reason)}
          </Text>
        </Section>

        <Section title="How it fits your skin" gap="gap-3.5" top="pt-9">
          <View className={`gap-[13px] rounded-tile border px-[18px] py-[22px] ${meta.panel}`}>
            <View className="flex-row items-center gap-2.5">
              <HeartIcon color={meta.hero} />
              <Text className="font-display text-lg leading-[20px] text-ink">
                {fitHeadline(rung, helps, hurts, verified)}
              </Text>
            </View>
            <Text className="text-[13px] leading-[19.5px] text-ink-body">
              {fitBody(rung, helps, hurts, verified, Boolean(rule))}
            </Text>
            {/* The small qualifier pill the design puts under the verdict. */}
            <View className={`self-start rounded-full px-3 py-1.5 ${meta.chip}`}>
              <Text className={`text-[11.5px] font-medium ${meta.ink}`}>
                {fitPill(rung, helps, hurts, verified)}
              </Text>
            </View>
          </View>
        </Section>

        <Section title="Things to know" gap="gap-[23px]" top="pt-11">
          {notes.length > 0 ? (
            <View style={{ gap: 23 }}>
              {notes.map((note) => (
                <View key={note} className="flex-row items-center gap-3">
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="m5 12.6 4.6 4.6L19 6.8"
                      stroke={meta.hero}
                      strokeWidth={2.2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                  <Text className="flex-1 text-[13px] leading-[18px] text-ink-body">{note}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text className="text-[13px] leading-[19px] text-ink-body">
              We hold no regulatory record, declared function or pore rating for
              this name — which is itself the thing worth knowing about it.
            </Text>
          )}
        </Section>

        <Text className="px-6 pt-9 text-[11.5px] text-ink-faint">
          Reference data from Open Beauty Facts and EU CosIng.
        </Text>
      </ScrollView>

      <View className="absolute inset-x-0 bottom-0 flex-row gap-3 border-t border-hairline bg-canvas px-6 pb-8 pt-3">
        <PrimaryButton
          className="flex-1"
          label="Next ingredient"
          onPress={() => {
            if (!product || index < 0) return router.back();
            const next = product.ingredients[(index + 1) % product.ingredients.length];
            router.replace({
              pathname: "/ingredient/[inci]",
              params: { inci: next.name, product: product.id },
            });
          }}
        />
        <PrimaryButton variant="outline" label="Back to list" onPress={() => router.back()} />
      </View>
    </View>
  );
}

function Section({
  title,
  gap = "gap-3",
  top = "pt-[38px]",
  children,
}: {
  title: string;
  /** The mockup gives each section its own rhythm; these are its values. */
  gap?: string;
  top?: string;
  children: React.ReactNode;
}) {
  return (
    <View className={`px-6 ${top} ${gap}`}>
      <Text className="text-[15.5px] font-semibold tracking-[-0.12px] text-ink">{title}</Text>
      {children}
    </View>
  );
}

/** "Panthenol (Vitamin B5)" → the two lines the design draws. */
function splitName(ingredient: Ingredient): { primary: string; secondary: string | null } {
  const match = ingredient.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) return { primary: match[1], secondary: `(${match[2]})` };

  const role = ingredient.functions?.[0];
  return { primary: ingredient.name, secondary: role ? role.toLowerCase() : null };
}

/**
 * The written definition, in descending order of how specific we can be:
 * a curated rule, the row's own note, the regulator's function list, and
 * finally an honest admission.
 */
function whatItDoes(ingredient: Ingredient, ruleReason: string | undefined): string {
  if (ruleReason) return ruleReason;
  if (ingredient.note) return ingredient.note;

  const functions = ingredient.functions ?? [];
  if (functions.length > 0) {
    return `Declared in the EU inventory as ${functions
      .slice(0, 3)
      .join(", ")
      .toLowerCase()}. That is the role it plays in a formula, not a claim about results.`;
  }
  if (!isVerified(ingredient)) {
    return "This name didn't match our ingredient dictionary, so we can't say what it does. Label text is often mis-transcribed, and guessing would be worse than saying nothing.";
  }
  return "We hold no declared function for this one yet.";
}

function fitHeadline(rung: Rung, helps: boolean, hurts: boolean, verified: boolean): string {
  if (!verified) return "We can't judge this one";
  if (hurts) return "Works against your profile";
  if (helps) return "Great match";
  if (rung === "avoid") return "Flagged for everyone";
  if (rung === "watch") return "Worth a second look";
  return "Nothing against it";
}

function fitBody(
  rung: Rung,
  helps: boolean,
  hurts: boolean,
  verified: boolean,
  hasRule: boolean
): string {
  if (!verified) {
    return "An unrecognised name supports no claim in either direction, so this one neither counts for nor against the product's score.";
  }
  if (hurts) return "This is one of the things pulling the score down for the skin you described.";
  if (helps) return "This actively helps with what you told us about your skin.";
  if (rung === "avoid") {
    return "The EU inventory restricts or prohibits this one, which applies to everybody rather than to your profile in particular.";
  }
  if (rung === "watch") {
    return "Carries a restriction or a pore rating worth knowing about, though nothing in your profile makes it a specific problem.";
  }
  if (!hasRule) {
    return "No rule in our table applies to this ingredient, and nothing in your profile flags it — so it neither helps nor hurts your score.";
  }
  return "Neither helps nor hurts, given the answers you gave.";
}

function fitPill(rung: Rung, helps: boolean, hurts: boolean, verified: boolean): string {
  if (!verified) return "Unassessed";
  if (hurts) return "Counts against your goals";
  if (helps) return "Good for your goals";
  if (rung === "avoid") return "Best avoided generally";
  if (rung === "watch") return "Worth knowing";
  return "Neutral for your goals";
}

/**
 * The honest replacement for the design's EWG hazard score. This comes from the
 * EU Annex lists via CosIng, which is a regulator rather than an advocacy
 * group's rating, and is one of the few genuinely authoritative facts we hold.
 */
function regulatoryStatus(ingredient: Ingredient): string {
  if (!isVerified(ingredient)) return "Unmatched";
  if (ingredient.safety === "avoid") return "Prohibited";
  if (ingredient.safety === "caution") return "Restricted";
  return "No restriction";
}
