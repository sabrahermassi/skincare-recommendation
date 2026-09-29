import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IconCircle } from "@/components/IconCircle";
import { PopOnToggle } from "@/components/PopOnToggle";
import { ReportMistakeLink } from "@/components/ReportMistakeLink";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SourceLink } from "@/components/SourceLink";
import { ReadingScale, Text } from "@/components/Text";
import { VerdictMarker } from "@/components/VerdictMarker";
import { fetchProduct, resolveIngredientNames } from "@/data/api";
import { unknownIngredient, type Concern, type Ingredient, type ProductWithIngredients, type SkinProfile } from "@/data/types";
import { displayIngredientName } from "@/lib/ingredient-name";
import { StarIcon } from "@/components/icons/StarIcon";
import { comedogenicLabel } from "@/lib/format";
import { countedAgainst, ingredientLabel, isCommonIrritant, labelWithoutProduct, ruleTargets, type IngredientLabel } from "@/lib/ingredient-labels";
import { matchProduct, positionNote, positionWeightLabel, ruleFor, type Contraindication, type MatchResult } from "@/lib/matching";
import { FROM_FINDER, useScoringProfile } from "@/lib/finder-choices";
import { openQuiz } from "@/lib/open-quiz";
import { CONCERN_TITLE, isPersonalized } from "@/lib/profile";
import type { IngredientRule } from "@/lib/rules";
import { contraindications, isVerified, regulatoryStatus } from "@/lib/safety";
import { saveFromTap } from "@/lib/saving";
import { useAppStore } from "@/store/useAppStore";
import { BUTTON, CANVAS, CARD_RADIUS, CHOSEN, DISPLAY_FONT, ICON_MUTED, INK, LINE, MUTED, ROW_DIVIDER, SPACE, SURFACE, TOUCH_TARGET, TYPE, VERDICT, VERDICT_NEUTRAL } from "@/lib/tokens";
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

type Tone = { solid: string; tint: string; deep: string; wash: string };
const TONE: Record<Fit, Tone> = {
  good: VERDICT.high,
  watch: VERDICT.medium,
  avoid: VERDICT.low,
  unknown: VERDICT_NEUTRAL,
  none: VERDICT_NEUTRAL,
};

const PAGER_BUTTON = 52;

/**
 * The route. A link can put anything in the name: one that can't be an
 * ingredient name is a page that doesn't exist, and a malformed `product` is
 * dropped, leaving the ingredient on its own (#29).
 */
export default function IngredientRoute() {
  const params = useLocalSearchParams<{ inci: string; product?: string; from?: string }>();
  const inci = ingredientNameParam(params.inci);
  if (!inci) return <NotFound />;
  // Opened from a product that came from the finder's results: score with the finder's answers too.
  const from = params.from === FROM_FINDER ? FROM_FINDER : undefined;
  return <IngredientDetail inci={inci} productId={productIdParam(params.product) ?? undefined} from={from} />;
}

function IngredientDetail({ inci, productId, from }: { inci: string; productId?: string; from?: string }) {
  const insets = useSafeAreaInsets();

  const [product, setProduct] = useState<ProductWithIngredients | null>(null);
  const [resolvedIngredient, setResolvedIngredient] = useState<Ingredient | null>(null);
  const [loading, setLoading] = useState(true);
  const profile = useScoringProfile(from);
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
  // this row (#324). With no product there is no score, so the verdict comes
  // from what we hold about the ingredient itself (`labelWithoutProduct`).
  const labelOf = (i: Ingredient): Fit => (match ? (ingredientLabel(i, match, personalized) ?? "none") : (labelWithoutProduct(i, profile) ?? "none"));
  const fit = labelOf(ingredient);
  const tone = TONE[fit];

  // The warning that made the row Avoid comes first; one ingredient can carry
  // one per origin, each said with its own source (#347).
  // Without a product, the same warnings the score would raise for this
  // ingredient and profile — a pregnancy caution above all.
  const warnings = match ? match.warnings.filter((w) => w.ingredient.id === ingredient.id) : contraindications([ingredient], profile);
  const warning = warnings.find((w) => w.severity === "hazard" || w.origin === "pregnancy") ?? warnings[0];
  const warningLines = warning
    ? [warning, ...warnings.filter((w) => w !== warning)].filter((w, i, all) => all.findIndex((other) => other.reason === w.reason) === i)
    : [];

  const rule = ruleFor(ingredient);
  // With a product, what the score itself counted wins, as it does for the
  // label. Without one, the rule's own targets (`ruleTargets`).
  const helps = match ? fit === "good" : ruleTargets(ingredient, profile).helps;
  const hurts = match ? countedAgainst(ingredient, match) : ruleTargets(ingredient, profile).hurts;

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
    router.replace({ pathname: "/ingredient/[inci]", params: from ? { inci: to.name, product: product.id, from } : { inci: to.name, product: product.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: CANVAS }}>
      <ScreenHeader
        right={
          // Nothing to keep: starring an unrecognised name would save a string
          // we can say nothing about (#296).
          !verified ? undefined : (
            <IconCircle
              // Stars for anyone, signed in or not (#300).
              onPress={() => {
                haptic.tap();
                if (starred) toggleSavedIngredient(ingredient.name);
                else saveFromTap(() => saveIngredient(ingredient.name), "ingredient");
              }}
              accessibilityLabel={starred ? "Remove from starred ingredients" : "Star this ingredient"}
              accessibilityState={{ selected: starred }}
            >
              <PopOnToggle active={starred}>
                <StarIcon filled={starred} />
              </PopOnToggle>
            </IconCircle>
          )
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: inList ? 140 : insets.bottom + 32 }}>
        {/* The reading part of the screen: its text follows the phone's text
            size all the way up (#334). */}
        <ReadingScale>
          {/* The name in the page face, what kind of thing it is, and the
              verdict marker under it (v7). */}
          <View style={{ alignItems: "flex-start", gap: 8, paddingTop: SPACE.text, paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.block }}>
            <Text accessibilityRole="header" style={{ fontFamily: DISPLAY_FONT, fontSize: TYPE.heading, lineHeight: 28, letterSpacing: -0.5, color: INK }}>
              {displayIngredientName(primary)}
            </Text>
            {kind ? <Text style={{ fontSize: TYPE.label, color: MUTED }}>{kind}</Text> : null}
            {fit === "none" ? <Text style={{ fontSize: TYPE.label, color: MUTED }}>No known concerns</Text> : <VerdictMarker label={fit} />}
          </View>

          <View style={{ paddingHorizontal: SPACE.gutter, gap: SPACE.block }}>
            <Card style={{ padding: 16, gap: 4 }}>
              <CardHeading>What it does</CardHeading>
              <Text style={{ fontSize: TYPE.body, lineHeight: 22, color: INK }}>{whatItDoes(ingredient, rule?.reason)}</Text>
              {rule?.source ? <SourceLink source={rule.source} /> : null}
            </Card>

            {/* For your skin, on the verdict's light wash (v7). */}
            <View style={{ borderRadius: CARD_RADIUS, backgroundColor: tone.wash, padding: 16, gap: 4 }}>
              <CardHeading>For your skin</CardHeading>
              <Text style={{ fontSize: TYPE.body, fontWeight: "600", color: tone.deep }}>{fitHeadline(fit, helps, hurts, warning, rule, profile)}</Text>
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
              <Text style={{ marginTop: 4, fontSize: TYPE.caption, fontWeight: "600", color: tone.deep }}>{fitTag(fit, helps, hurts, warning, match)}</Text>
            </View>

            {/* Right under "For your skin" (v7 update). Only for a recognised
                name no rule covers (#326): a rule's claim
                links its own source above, and a general search beside it
                would read as backing the claim. */}
            {verified && !rule ? (
              <Pressable
                onPress={() =>
                  void WebBrowser.openBrowserAsync(`https://pubchem.ncbi.nlm.nih.gov/#query=${encodeURIComponent(ingredient.name)}`).catch((err) =>
                    console.warn("openBrowserAsync failed:", err)
                  )
                }
                accessibilityRole="link"
                accessibilityLabel="Read more on PubChem"
                accessibilityHint="Opens in your browser"
                style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: SPACE.block, borderRadius: CARD_RADIUS, paddingVertical: SPACE.text, paddingHorizontal: SPACE.gutter }}
                className="bg-surface active:bg-row-pressed"
              >
                <Ionicons name="book-outline" size={20} color={BUTTON.primary.fill} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={{ fontSize: TYPE.card, color: INK }}>Read more on PubChem</Text>
                  <Text style={{ fontSize: TYPE.caption, color: MUTED }}>Opens in your browser</Text>
                </View>
                <Ionicons name="open-outline" size={17} color={ICON_MUTED} />
              </Pressable>
            ) : null}

            {inList ? <OnThisLabel names={product.ingredients.map((i) => i.name)} index={index} colour={tone.solid} /> : null}

            {/* Good to know: neutral facts, no ticks (handoff). */}
            <Card style={{ paddingTop: 16, paddingBottom: 4 }}>
              <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                <CardHeading>Good to know</CardHeading>
              </View>
              {facts.length > 0 ? (
                facts.map((fact, i) => (
                  <View key={fact.key} style={{ paddingHorizontal: 16 }}>
                    <View style={{ flexDirection: "row", gap: 12, paddingVertical: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: ROW_DIVIDER }}>
                      <Text style={{ width: 120, fontSize: TYPE.label, color: MUTED }}>{fact.key}</Text>
                      <Text style={{ flex: 1, fontSize: 15, lineHeight: 21, color: INK }}>{fact.value}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={{ paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, lineHeight: 21, color: INK }}>
                  We hold no regulatory record, declared function or pore rating for this name.
                </Text>
              )}
            </Card>


            <Text style={{ fontSize: TYPE.caption, color: MUTED, paddingHorizontal: 4 }}>Reference data from Open Beauty Facts and EU CosIng.</Text>

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
                <Text style={{ fontSize: TYPE.caption, color: MUTED }}>Next · #{index + 2}</Text>
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

/** A white card (v7): its fill alone, no border or shadow. */
function Card({ style, children }: { style?: object; children: React.ReactNode }) {
  return <View style={[{ borderRadius: CARD_RADIUS, backgroundColor: SURFACE }, style]}>{children}</View>;
}

/** A card's heading (v7): SF 17 semibold. */
function CardHeading({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={{ fontSize: TYPE.card, fontWeight: "600", color: INK }}>
      {children}
    </Text>
  );
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
  // A long label's dots shrink so they still fit across the card; past about
  // a hundred they may shrink further still (`flexShrink`), never overflow it.
  const dot = total > 60 ? 3 : total > 40 ? 4 : 6;
  return (
    <Card style={{ padding: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <CardHeading>On this label</CardHeading>
        <Text style={{ fontSize: 13, color: MUTED }}>
          #{index + 1} of {total}
          {ordered ? ` · ${weight}` : ""}
        </Text>
      </View>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", height: 14 }}>
        {names.map((name, i) => (
          <View key={`${name}-${i}`} style={i === index ? { width: 12, height: 12, borderRadius: 6, backgroundColor: colour } : { flexShrink: 1, width: dot, height: dot, borderRadius: dot / 2, backgroundColor: LINE }} />
        ))}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: TYPE.caption, color: MUTED }}>More</Text>
        <Text style={{ fontSize: TYPE.caption, color: MUTED }}>Less</Text>
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
  if (hurts) {
    return inProduct
      ? "This is one of the things pulling the score down for the skin you described."
      : "It works against something you told us about your skin.";
  }
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
  if (inProduct) return "Nothing in your profile reacts to it, so it doesn't change your score.";
  if (!hasRule) return "Nothing in your profile reacts to it.";
  return "Neither helps nor hurts, given the answers you gave.";
}

/** The pill under the verdict: what it does to this person's score, where there is one. */
function fitTag(fit: Fit, helps: boolean, hurts: boolean, warning: Contraindication | undefined, match: MatchResult | null): string {
  if (fit === "unknown") return "Not in your score";
  // Only a score that exists can be lowered or raised: without a skin profile
  // the match refuses and holds none (#383 review). A pregnancy caution never
  // changes the score; a hazard caps it.
  const scored = match !== null && match.score !== null;
  if (scored && (hurts || (fit === "avoid" && warning?.severity === "hazard"))) return "Lowers your score";
  if (fit === "avoid" && warning) return "Flagged for you";
  if (scored && helps) return "Adds to your score";
  if (hurts) return "Counts against your goals";
  if (helps) return "Good for your goals";
  if (fit === "avoid") return "Best avoided generally";
  if (fit === "watch") return "Worth knowing";
  return "Neutral for you";
}
