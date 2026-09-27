import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PopOnToggle } from "@/components/PopOnToggle";
import { ReportMistakeLink } from "@/components/ReportMistakeLink";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SourceLink } from "@/components/SourceLink";
import { ReadingScale, Text, useLargeText } from "@/components/Text";
import { fetchProduct, resolveIngredientNames } from "@/data/api";
import { unknownIngredient, type Concern, type Ingredient, type ProductWithIngredients, type SkinProfile } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { StarIcon } from "@/components/icons/StarIcon";
import { comedogenicLabel } from "@/lib/format";
import { countedAgainst, ingredientLabel, isCommonIrritant, LABEL_META, type IngredientLabel } from "@/lib/ingredient-labels";
import { matchProduct, positionNote, positionWeightLabel, ruleFor, type Contraindication, type MatchResult } from "@/lib/matching";
import { openQuiz } from "@/lib/open-quiz";
import { CONCERN_TITLE, isPersonalized, isSensitive, treatAsReactive } from "@/lib/profile";
import { targetApplies, type IngredientRule } from "@/lib/rules";
import { isVerified, regulatoryStatus } from "@/lib/safety";
import { saveFromTap } from "@/lib/saving";
import { useAppStore } from "@/store/useAppStore";
import { CANVAS, CARD_SHADOW, CHOSEN, INK, LINE, MUTED, ROW_DIVIDER, SURFACE, TOUCH_TARGET, VERDICT, VERDICT_NEUTRAL } from "@/lib/tokens";
import { haptic } from "@/lib/haptics";
import { ingredientNameParam, productIdParam } from "@/lib/route-params";
import NotFound from "@/app/+not-found";

/**
 * Ingredient detail (design_handoff_ingredient_detail): what it does, how it
 * fits this person's skin and their score, where it sits on this label, and
 * the facts we hold about it — with Previous / Next to step along the label
 * without going back to the list.
 *
 * The handoff sets the look only. Every word here still comes from what we
 * hold — the curated rule, the ingredient's note, CosIng's function list, the
 * EU status, the pore rating, the label position — never written per
 * ingredient. A claim from a curated rule carries its checked source (#326).
 * The star stays in the corner: Saved's Ingredients tab is built on it, though
 * the mockup has none.
 */

/**
 * The verdict: the ingredient list's own label (`lib/ingredient-labels.ts`,
 * #324), or "none" for a row the list gives no word — so tapping a row never
 * opens a page that disagrees with it.
 */
type Fit = IngredientLabel | "none";

type Tone = { solid: string; tint: string; deep: string };
const NEUTRAL: Tone = { solid: MUTED, tint: VERDICT_NEUTRAL.tint, deep: MUTED };
const TONE: Record<Fit, Tone> = {
  good: VERDICT.high,
  watch: VERDICT.medium,
  avoid: VERDICT.low,
  unknown: NEUTRAL,
  none: NEUTRAL,
};
// The status pill: the list's own words for the row, so the two agree.
const STATUS_LABEL: Record<Fit, string> = {
  good: LABEL_META.good.label,
  watch: LABEL_META.watch.label,
  avoid: LABEL_META.avoid.label,
  unknown: "Not recognised",
  none: "No known concerns",
};

// The picture beside the name, on a soft blob in the status tint.
const ART = require("@/assets/illustrations/flask-with-serum.webp");
const ART_BOX = { width: 132, height: 120 };
const ART_CIRCLE = 104;
const CARD_RADIUS = 24;
const PAGER_BUTTON = 52;

/**
 * The route. A link can put anything in the name: one that can't be an
 * ingredient name is a page that doesn't exist, and a malformed `product` is
 * dropped, leaving the ingredient on its own (#29).
 */
export default function IngredientRoute() {
  const params = useLocalSearchParams<{ inci: string; product?: string }>();
  const inci = ingredientNameParam(params.inci);
  if (!inci) return <NotFound />;
  return <IngredientDetail inci={inci} productId={productIdParam(params.product) ?? undefined} />;
}

function IngredientDetail({ inci, productId }: { inci: string; productId?: string }) {
  const insets = useSafeAreaInsets();
  // Past the ordinary text ceiling the name needs the whole width, so the
  // decorative picture beside it goes (#334).
  const largeText = useLargeText();

  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [resolvedIngredient, setResolvedIngredient] = useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(true);
  const profile = useAppStore((s) => s.profile);
  const savedIngredients = useAppStore((s) => s.savedIngredients);
  const toggleSavedIngredient = useAppStore((s) => s.toggleSavedIngredient);
  const saveIngredient = useAppStore((s) => s.saveIngredient);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    if (productId) {
      fetchProduct(productId)
        .then((result) => {
          if (cancelled) return;
          // Only a successful read writes state, matching what the old `catch`
          // did — the product is context for this ingredient, not the subject
          // of the screen, so a failed read leaves it absent rather than
          // raising an error of its own.
          if (result.ok) setProduct(result.value);
          setLoading(false);
        });
    } else {
      // No product context — opened from a label result or a link, for
      // example. Resolve against the dictionary directly rather than assuming
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: CANVAS }}>
        <ActivityIndicator color={INK} />
      </View>
    );
  }

  const index = product?.ingredients.findIndex((i) => i.name === inci) ?? -1;
  const ingredient: Ingredient =
    index >= 0 && product
      ? product.ingredients[index]
      : (resolvedIngredient ?? unknownIngredient(inci));

  const match = product ? matchProduct(product, profile) : null;
  const personalized = isPersonalized(profile);
  // Previous / Next only mean something with a list behind them. Opened on its
  // own — from a label result or a link — there is nowhere to step (#296).
  const inList = product !== null && index >= 0;
  const verified = isVerified(ingredient);
  // Opened from a product, the verdict is the label the ingredient list gave
  // this row (#324). With no product there is nothing to score against, so a
  // recognised ingredient reads as "worth knowing" rather than a verdict.
  const labelOf = (i: Ingredient): Fit => (match ? (ingredientLabel(i, match, personalized) ?? "none") : isVerified(i) ? "watch" : "unknown");
  const fit = labelOf(ingredient);
  const tone = TONE[fit];

  // The warning that made the row Avoid comes first; one ingredient can carry
  // one per origin, each said with its own source (#347).
  const warnings = match?.warnings.filter((w) => w.ingredient.id === ingredient.id) ?? [];
  const warning = warnings.find((w) => w.severity === "hazard" || w.origin === "pregnancy") ?? warnings[0];
  const warningLines = warning
    ? [warning, ...warnings.filter((w) => w !== warning)].filter((w, i, all) => all.findIndex((other) => other.reason === w.reason) === i)
    : [];

  const rule = ruleFor(ingredient);
  // With a product, what the score itself counted wins, as it does for the
  // label. Without one, the rule's own targets, read the way `computeMatch`
  // reads sensitivity (#183).
  const helps = match ? fit === "good" : rule ? targetApplies(rule.helps, { ...profile, sensitive: isSensitive(profile) }) : false;
  const hurts = match ? countedAgainst(ingredient, match) : rule ? targetApplies(rule.hurts, { ...profile, sensitive: treatAsReactive(profile) }) : false;

  const { primary, secondary } = splitName(ingredient);
  const starred = savedIngredients.includes(ingredient.name);
  const kind = kindLine(ingredient, rule, secondary);

  // "Good to know": facts we hold, each one or left out — never "Unknown".
  const facts = [
    secondary?.startsWith("(") ? { key: "Also called", value: secondary.slice(1, -1) } : null,
    verified ? { key: "EU status", value: regulatoryStatus(ingredient) } : null,
    ingredient.functions && ingredient.functions.length > 0 ? { key: "Declared as", value: sentenceCase(ingredient.functions.slice(0, 3).join(", ")) } : null,
    verified && ingredient.comedogenic > 0 ? { key: "Pores", value: comedogenicLabel(ingredient.comedogenic) } : null,
    rule?.hurts?.sensitive ? { key: "Sensitive skin", value: "A common irritant for sensitive skin" } : null,
  ].filter((f): f is { key: string; value: string } => f !== null);

  const previous = inList && index > 0 ? product.ingredients[index - 1] : null;
  const next = inList && index < product.ingredients.length - 1 ? product.ingredients[index + 1] : null;
  const step = (to: Ingredient) => {
    if (!product) return;
    haptic.tap();
    router.replace({ pathname: "/ingredient/[inci]", params: { inci: to.name, product: product.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader
        // The product the person came from, as a quiet line (handoff).
        title={product ? `In ${product.name}` : undefined}
        quietTitle
        right={
          // Nothing to keep: starring an unrecognised name would save a string
          // we can say nothing about (#296).
          !verified ? undefined : (
            <Pressable
              // Stars for anyone, signed in or not (#300).
              onPress={() => {
                haptic.tap();
                if (starred) toggleSavedIngredient(ingredient.name);
                else saveFromTap(() => saveIngredient(ingredient.name), "ingredient");
              }}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={starred ? "Remove from starred ingredients" : "Star this ingredient"}
              accessibilityState={{ selected: starred }}
              className="active:opacity-70"
            >
              <PopOnToggle active={starred}>
                <StarIcon filled={starred} />
              </PopOnToggle>
            </Pressable>
          )
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: inList ? 140 : insets.bottom + 32 }}>
        {/* The reading part of the screen: its text follows the phone's text
            size all the way up (#334). */}
        <ReadingScale>
          {/* The name, what kind of thing it is, and its status; the picture
              beside it, dropped at large text so the name has the width (#334). */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 6, paddingHorizontal: 20, paddingBottom: 20 }}>
            <View style={{ flex: 1, alignItems: "flex-start", gap: 6 }}>
              <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 32, lineHeight: 36, color: INK }}>
                {displayIngredientName(primary)}
              </Text>
              {kind ? <Text style={{ fontSize: 15, color: MUTED }}>{kind}</Text> : null}
              <View
                style={{ marginTop: 6, flexDirection: "row", alignItems: "center", gap: 7, borderRadius: 999, paddingTop: 6, paddingRight: 12, paddingBottom: 6, paddingLeft: 10, backgroundColor: tone.tint }}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone.solid }} />
                <Text style={{ fontSize: 13, fontWeight: "600", color: tone.deep }}>{STATUS_LABEL[fit]}</Text>
              </View>
            </View>
            {largeText ? null : (
              <View style={{ ...ART_BOX, alignItems: "center", justifyContent: "center" }}>
                <View
                  style={{
                    position: "absolute",
                    top: 4,
                    left: 6,
                    right: 0,
                    bottom: 0,
                    backgroundColor: tone.tint,
                    opacity: 0.7,
                    borderTopLeftRadius: 70,
                    borderTopRightRadius: 56,
                    borderBottomRightRadius: 64,
                    borderBottomLeftRadius: 60,
                  }}
                />
                <View style={{ width: ART_CIRCLE, height: ART_CIRCLE, borderRadius: ART_CIRCLE / 2, overflow: "hidden", backgroundColor: SURFACE, alignItems: "center", justifyContent: "center" }}>
                  <Image source={ART} style={{ width: ART_CIRCLE - 8, height: ART_CIRCLE - 8 }} contentFit="contain" accessibilityLabel="" />
                </View>
              </View>
            )}
          </View>

          <View style={{ paddingHorizontal: 20, gap: 14 }}>
            {/* What it does: not a card. */}
            <View style={{ gap: 8, paddingHorizontal: 2, paddingBottom: 6 }}>
              <SectionLabel>What it does</SectionLabel>
              <Text style={{ fontSize: 16, lineHeight: 24, color: INK }}>{whatItDoes(ingredient, rule?.reason)}</Text>
              {rule?.source ? <SourceLink source={rule.source} /> : null}
            </View>

            {/* For your skin. */}
            <Card style={{ padding: 20, gap: 10 }}>
              <View style={{ width: 28, height: 4, borderRadius: 2, backgroundColor: tone.solid }} />
              <SectionLabel>For your skin</SectionLabel>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{ width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: tone.tint }}
                >
                  <Ionicons name={FIT_ICON[fit]} size={20} color={tone.solid} />
                </View>
                <Text style={{ flex: 1, fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 22, lineHeight: 26, color: INK }}>
                  {fitHeadline(fit, helps, hurts, warning, rule, profile)}
                </Text>
              </View>
              {/* A warning's own sentence is the most specific thing we hold,
                  with its source under it (#347). */}
              {fit !== "unknown" && warningLines.length > 0 ? (
                warningLines.map((w) => (
                  <View key={w.origin} style={{ gap: 4 }}>
                    <Text style={{ fontSize: 15, lineHeight: 22, color: INK }}>{w.reason}</Text>
                    {w.source ? <SourceLink source={w.source} /> : null}
                  </View>
                ))
              ) : fit === "none" && !personalized ? (
                // No skin profile, and nothing about it for everyone: a quiet
                // way to set one up, not a button (handoff). A fragrance or a
                // listed pore-clogger still says why, profile or not.
                <Pressable onPress={openQuiz} accessibilityRole="link" style={{ minHeight: TOUCH_TARGET, justifyContent: "center" }} className="active:opacity-70">
                  <Text style={{ fontSize: 15, lineHeight: 22, fontWeight: "600", color: CHOSEN.accent }}>Set up your skin profile to see how this fits you</Text>
                </Pressable>
              ) : (
                <Text style={{ fontSize: 15, lineHeight: 22, color: INK }}>
                  {fitBody(fit, helps, hurts, verified, Boolean(rule), isCommonIrritant(ingredient), match !== null)}
                </Text>
              )}
              <View style={{ alignSelf: "flex-start", marginTop: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: tone.tint }}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: tone.deep }}>{fitTag(fit, helps, hurts, warning, match)}</Text>
              </View>
            </Card>

            {inList ? <OnThisLabel names={product.ingredients.map((i) => i.name)} index={index} colour={tone.solid} /> : null}

            {/* Good to know: neutral facts, no ticks (handoff). */}
            <Card style={{ paddingTop: 20, paddingBottom: 6 }}>
              <Text style={{ fontFamily: "PlayfairDisplay_600SemiBold", fontSize: 21, color: INK, paddingHorizontal: 20, paddingBottom: 6 }}>Good to know</Text>
              {facts.length > 0 ? (
                facts.map((fact, i) => (
                  <View key={fact.key} style={{ paddingHorizontal: 20 }}>
                    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: ROW_DIVIDER }}>
                      <Text style={{ width: 120, fontSize: 14, color: MUTED }}>{fact.key}</Text>
                      <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: INK }}>{fact.value}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={{ paddingHorizontal: 20, paddingVertical: 13, fontSize: 15, lineHeight: 21, color: INK }}>
                  We hold no regulatory record, declared function or pore rating for this name.
                </Text>
              )}
            </Card>

            {/* Only for a recognised name no rule covers (#326): a rule's claim
                links its own source above, and a general search beside it
                would read as backing the claim. */}
            {verified && !rule ? (
              <Pressable
                onPress={() =>
                  void Linking.openURL(`https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(ingredient.name)}`).catch((err) =>
                    console.warn("openURL failed:", err)
                  )
                }
                accessibilityRole="link"
                accessibilityLabel="Read more on PubChem"
                accessibilityHint="Opens in your browser"
                style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: CARD_RADIUS, backgroundColor: VERDICT_NEUTRAL.tint, paddingVertical: 14, paddingLeft: 20, paddingRight: 16 }}
                className="active:opacity-80"
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: 16, fontWeight: "600", color: INK }}>Read more on PubChem</Text>
                  <Text style={{ fontSize: 13, color: MUTED }}>Opens in your browser</Text>
                </View>
                <Ionicons name="open-outline" size={18} color={MUTED} />
              </Pressable>
            ) : null}

            <Text style={{ fontSize: 12, color: MUTED, paddingHorizontal: 4 }}>Reference data from Open Beauty Facts and EU CosIng.</Text>

            {/* A wrong name, reading or claim gets told to us (#327). */}
            <View style={{ paddingHorizontal: 4 }}>
              <ReportMistakeLink subject={{ kind: "ingredient", name: ingredient.name }} />
            </View>
          </View>
        </ReadingScale>
      </ScrollView>

      {inList ? (
        // Previous and Next along the label, pinned to the bottom (handoff).
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            flexDirection: "row",
            gap: 10,
            borderTopWidth: 1,
            borderTopColor: VERDICT_NEUTRAL.tint,
            backgroundColor: CANVAS,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: Math.max(20, insets.bottom),
          }}
        >
          <Pressable
            onPress={previous ? () => step(previous) : undefined}
            disabled={!previous}
            accessibilityRole="button"
            accessibilityLabel="Previous ingredient"
            accessibilityState={{ disabled: !previous }}
            style={{ width: PAGER_BUTTON, height: PAGER_BUTTON, borderRadius: PAGER_BUTTON / 2, borderWidth: 1.5, borderColor: LINE, backgroundColor: SURFACE, alignItems: "center", justifyContent: "center", opacity: previous ? 1 : 0.4 }}
            className="active:opacity-70"
          >
            <Ionicons name="chevron-back" size={22} color={INK} />
          </Pressable>
          {next ? (
            <Pressable
              onPress={() => step(next)}
              accessibilityRole="button"
              accessibilityLabel={`Next ingredient: ${displayIngredientName(next.name)}`}
              style={{ flex: 1, height: PAGER_BUTTON, borderRadius: PAGER_BUTTON / 2, borderWidth: 1.5, borderColor: LINE, backgroundColor: SURFACE, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 20, paddingRight: 14 }}
              className="active:opacity-80"
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 12, color: MUTED }}>Next · #{index + 2}</Text>
                <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: "600", color: INK }}>
                  {displayIngredientName(next.name)}
                </Text>
              </View>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: TONE[labelOf(next)].solid }} />
              <Ionicons name="chevron-forward" size={20} color={MUTED} />
            </Pressable>
          ) : (
            <View style={{ flex: 1 }} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const FIT_ICON: Record<Fit, keyof typeof Ionicons.glyphMap> = {
  good: "heart",
  watch: "warning-outline",
  avoid: "warning-outline",
  unknown: "help-circle-outline",
  none: "heart-outline",
};

function Card({ style, children }: { style?: object; children: React.ReactNode }) {
  return <View style={[{ borderRadius: CARD_RADIUS, backgroundColor: SURFACE, ...CARD_SHADOW }, style]}>{children}</View>;
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={{ fontSize: 13, fontWeight: "600", color: MUTED }}>{children}</Text>;
}

// How much a position means, in words. Only for positions before the label's
// alphabetical tail, where order still says something (`positionNote`).
const AMOUNT: Record<string, string> = {
  "high concentration": "Ingredients are listed from most to least, so this is one of the main ones.",
  significant: "Ingredients are listed from most to least, so there's a fair amount of this.",
  moderate: "Listed from most to least: a moderate amount.",
  low: "Listed from most to least: only a small amount.",
  trace: "Listed from most to least: a trace amount.",
};

/**
 * Where it sits on this label: a dot for every ingredient, this one larger in
 * its status colour, and what the position says about how much there is.
 */
function OnThisLabel({ names, index, colour }: { names: string[]; index: number; colour: string }) {
  const total = names.length;
  const ordered = positionNote(names, index) !== null;
  const weight = positionWeightLabel(index);
  // A long label's dots shrink so they still fit across the card.
  const dot = total > 60 ? 3 : total > 40 ? 4 : 6;
  return (
    <Card style={{ padding: 20, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <SectionLabel>On this label</SectionLabel>
        <Text style={{ fontSize: 13, color: MUTED }}>
          #{index + 1} of {total}
          {ordered ? ` · ${weight}` : ""}
        </Text>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 14 }}>
        {names.map((name, i) => (
          <View key={`${name}-${i}`} style={i === index ? { width: 12, height: 12, borderRadius: 6, backgroundColor: colour } : { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: LINE }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 12, color: MUTED }}>More</Text>
        <Text style={{ fontSize: 12, color: MUTED }}>Less</Text>
      </View>
      <Text style={{ fontSize: 15, lineHeight: 22, color: INK }}>
        {ordered
          ? AMOUNT[weight]
          : "This part of the label is in alphabetical order, so its place doesn't say how much there is."}
      </Text>
    </Card>
  );
}

/** "Panthenol (Vitamin B5)" → the two lines the design draws. */
function splitName(ingredient: Ingredient): { primary: string; secondary: string | null } {
  const match = ingredient.name.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (match) return { primary: match[1], secondary: `(${match[2]})` };

  const role = ingredient.functions?.[0];
  return { primary: ingredient.name, secondary: role ? role.toLowerCase() : null };
}

/** The kind line under the name: the common name, or the role it's declared for. */
function kindLine(ingredient: Ingredient, rule: IngredientRule | undefined, secondary: string | null): string | null {
  const role = ingredient.functions?.[0];
  const parts = [secondary?.startsWith("(") ? secondary.slice(1, -1) : null, role ? sentenceCase(role) : null, rule?.helps ? "Active" : null];
  const line = parts.filter(Boolean).join(" · ");
  return line.length > 0 ? line : null;
}

function sentenceCase(text: string): string {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
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

/*
 * An unrecognised name is "unknown" unless something outranks not knowing — a
 * warning, a charge on the score, or a name on the pore-clogging lists
 * (`ingredientLabel`) — and then it reads like any other row with that label.
 */
function fitHeadline(
  fit: Fit,
  helps: boolean,
  hurts: boolean,
  warning: Contraindication | undefined,
  rule: IngredientRule | undefined,
  profile: SkinProfile
): string {
  if (fit === "unknown") return "Not enough to go on";
  // A caution for this person outranks what a rule says it does: a retinoid
  // is not a good fit while pregnant.
  if (fit === "avoid" && warning) return "Flagged for you";
  if (hurts) return "Flagged for your skin";
  if (helps) {
    // Named after the concern it works on, where it works on one of theirs.
    const concern = profile.concerns.find((c: Concern) => rule?.helps?.concerns?.includes(c));
    return concern ? `Helps with your ${CONCERN_TITLE[concern].toLowerCase()}` : "Suits your skin";
  }
  if (fit === "avoid") return "Flagged for everyone";
  if (fit === "watch") return "Worth a second look";
  return "Nothing against it";
}

function fitBody(
  fit: Fit,
  helps: boolean,
  hurts: boolean,
  verified: boolean,
  hasRule: boolean,
  commonIrritant: boolean,
  inProduct: boolean
): string {
  if (fit === "unknown") {
    return "We don't know enough about this one to say how it fits your skin, so it isn't counted in your score.";
  }
  if (hurts) return "This is one of the things pulling the score down for the skin you described.";
  if (!verified) {
    return "This name didn't match our ingredient dictionary, but it is on the published pore-clogging lists.";
  }
  if (helps) return "This actively helps with what you told us about your skin.";
  if (fit === "avoid") {
    return "The EU inventory restricts or prohibits this one, which applies to everybody rather than to your profile in particular.";
  }
  // Watch for everyone (#345): a restriction or pore rating doesn't explain it.
  if (fit === "watch" && commonIrritant) {
    return "A fragrance or common irritant, flagged for everyone rather than for your profile in particular.";
  }
  if (fit === "watch") {
    return "Carries a restriction or a pore rating worth knowing about, though nothing in your profile makes it a specific problem.";
  }
  if (inProduct || !hasRule) return "Nothing in your profile reacts to it, so it doesn't change your score.";
  return "Neither helps nor hurts, given the answers you gave.";
}

/** The pill under the verdict: what it does to this person's score, where there is one. */
function fitTag(fit: Fit, helps: boolean, hurts: boolean, warning: Contraindication | undefined, match: MatchResult | null): string {
  if (fit === "unknown") return "Not in your score";
  if (match && (hurts || (fit === "avoid" && warning))) return "Lowers your score";
  if (match && helps) return "Adds to your score";
  if (hurts) return "Counts against your goals";
  if (helps) return "Good for your goals";
  if (fit === "avoid") return "Best avoided generally";
  if (fit === "watch") return "Worth knowing";
  return "Neutral for you";
}
