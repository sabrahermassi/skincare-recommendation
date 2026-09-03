import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import Svg, { Path } from "react-native-svg";

import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Text } from "@/components/Text";
import { fetchProduct, resolveIngredientNames } from "@/data/api";
import type { Ingredient, ProductWithIngredients } from "@/data/types";
import { COLORS } from "@/lib/colors";
import { comedogenicLabel } from "@/lib/format";
import { matchProduct, positionWeightLabel, ruleFor, rungFor, type Rung } from "@/lib/matching";
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
 * The design's closing "See studies and evidence" card links out to PubChem's
 * search for this exact name — a real, working source rather than the
 * plausible-but-fake citation the mockup implies. Same reasoning for the
 * header's star: it toggles `savedIngredients` in the store rather than
 * sitting there as a tappable no-op.
 */

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
    chip: "#E7F1E9", // tailwind.config.js level.good.tint
    hero: COLORS.levelGood,
  },
  watch: {
    pill: "bg-level-watch-tint",
    ink: "text-level-watch-ink",
    dot: "bg-level-watch",
    label: "Worth knowing",
    panel: "bg-tint-peach border-tint-peach",
    chip: "#FBEBD5", // tailwind.config.js level.watch.tint
    hero: COLORS.levelWatch,
  },
  avoid: {
    pill: "bg-level-avoid-tint",
    ink: "text-level-avoid-ink",
    dot: "bg-level-avoid",
    label: "Flagged for you",
    panel: "bg-tint-pink border-tint-pink",
    chip: "#FBE2E7", // tailwind.config.js level.avoid.tint
    hero: COLORS.levelAvoid,
  },
  neutral: {
    pill: "bg-level-neutral-tint",
    ink: "text-level-neutral-ink",
    dot: "bg-level-neutral",
    label: "Not recognised",
    panel: "bg-hairline border-hairline",
    chip: "#EFEBE6", // tailwind.config.js level.neutral.tint
    hero: COLORS.levelNeutral,
  },
};


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

function StarIcon({ filled }: { filled: boolean }) {
  const d =
    "M12 3.4l2.53 5.4 5.87.72-4.34 4.06 1.16 5.83L12 16.4l-5.22 2.99 1.16-5.83-4.34-4.06 5.87-.72Z";
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path
        d={d}
        fill={filled ? "#332E3A" : "none"}
        stroke="#332E3A"
        strokeWidth={1.6}
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
  const [resolvedIngredient, setResolvedIngredient] = useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(true);
  const profile = useAppStore((s) => s.profile);
  const savedIngredients = useAppStore((s) => s.savedIngredients);
  const toggleSavedIngredient = useAppStore((s) => s.toggleSavedIngredient);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (productId) {
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
    } else {
      // No product context — opened from a pasted-list check, for example.
      // Resolve against the dictionary directly rather than assuming
      // "not recognised" for an ingredient that may well be verified.
      resolveIngredientNames([inci])
        .then((resolved) => {
          if (!cancelled) setResolvedIngredient(resolved[0] ?? null);
        })
        .catch((err) => console.warn("resolveIngredientNames failed:", err))
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [productId, inci]);

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
      : (resolvedIngredient ?? {
          id: inci,
          name: inci,
          comedogenic: 0,
          safety: "safe",
          verified: false,
        });

  const match = product ? matchProduct(product, profile) : null;
  const verified = isVerified(ingredient);
  // `match` is null when this screen is opened without a product context
  // (e.g. from search) — there's nothing to score against yet, so an
  // otherwise-recognised ingredient reads as "worth knowing" rather than a
  // verdict `rungFor` has no way to give it.
  const rung: Rung = match ? rungFor(ingredient, match) : verified ? "watch" : "neutral";
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
  const starred = savedIngredients.includes(ingredient.name);

  // Everything under "Things to know" is sourced, never written.
  const notes = [
    verified ? `EU regulatory status: ${regulatoryStatus(ingredient)}` : null,
    ingredient.functions && ingredient.functions.length > 0
      ? `Declared function: ${ingredient.functions.slice(0, 3).join(", ")}`
      : null,
    verified && ingredient.comedogenic > 0 ? comedogenicLabel(ingredient.comedogenic) : null,
    position !== null
      ? `#${position} of ${total} on the label - ${positionWeightLabel(index)}`
      : null,
    rule?.hurts?.sensitive ? "Our rules flag this as a common irritant for sensitive skin" : null,
  ].filter((n): n is string => n !== null);

  return (
    <View className="flex-1 bg-canvas">
      <ScreenHeader
        right={
          <Pressable
            onPress={() => toggleSavedIngredient(ingredient.name)}
            hitSlop={12}
            accessibilityLabel={starred ? "Remove from starred ingredients" : "Star this ingredient"}
            accessibilityState={{ selected: starred }}
          >
            <StarIcon filled={starred} />
          </Pressable>
        }
      />

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
          {/* The design project's own hero illustration
              (assets/icon-flask-round.png), not a redraw of it. */}
          <Image
            source={require("@/assets/images/icon-flask-round.png")}
            style={{ width: 86, height: 86, borderRadius: 43 }}
            contentFit="cover"
            transition={120}
            accessibilityLabel=""
          />
        </View>

        <Section title="What it does">
          <Text className="text-[13.5px] leading-[21px] text-ink-body">
            {whatItDoes(ingredient, rule?.reason)}
          </Text>
        </Section>

        <Section title="How it fits your skin" gap={14} top={36}>
          <View
            style={{ gap: 13, paddingHorizontal: 18, paddingVertical: 22 }}
            className={`rounded-tile border ${meta.panel}`}
          >
            <View className="flex-row items-center gap-2.5">
              <HeartIcon color={meta.hero} />
              <Text className={`font-display text-[18px] leading-[21px] ${meta.ink}`}>
                {fitHeadline(rung, helps, hurts, verified)}
              </Text>
            </View>
            <Text className="text-[13px] leading-[19.5px] text-ink-body">
              {fitBody(rung, helps, hurts, verified, Boolean(rule))}
            </Text>
            {/* The small qualifier pill the design puts under the verdict. */}
            <View
              style={{ backgroundColor: meta.chip }}
              className="self-start rounded-full px-3 py-1.5"
            >
              <Text className={`text-[11.5px] font-medium ${meta.ink}`}>
                {fitPill(rung, helps, hurts, verified)}
              </Text>
            </View>
          </View>
        </Section>

        <Section title="Things to know" gap={23} top={44}>
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

        <Pressable
          onPress={() =>
            void Linking.openURL(
              `https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(ingredient.name)}`
            ).catch((err) => console.warn("openURL failed:", err))
          }
          style={{ marginTop: 28, marginHorizontal: 24 }}
          className="flex-row items-center justify-between rounded-panel bg-tint-lilac px-5 py-4 active:opacity-80"
        >
          <View className="gap-0.5">
            <Text className="text-[14.5px] font-semibold text-ink">Want to learn more?</Text>
            <Text className="text-[12.5px] text-ink-muted">See studies and evidence</Text>
          </View>
          <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
            <Path
              d="m9 5 7 7-7 7"
              stroke="#332E3A"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>

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
  gap = 12,
  top = 38,
  children,
}: {
  title: string;
  /** The mockup gives each section its own rhythm; these are its values. */
  gap?: number;
  top?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingTop: top, gap }} className="px-6">
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
