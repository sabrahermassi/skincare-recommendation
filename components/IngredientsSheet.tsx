import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, BackHandler, Easing, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { IngredientListRow, IngredientTabsList } from "@/components/IngredientTabsList";
import { Text } from "@/components/Text";
import type { ProductWithIngredients } from "@/data/types";
import { relativeTime } from "@/lib/format";
import { rungFor, type MatchResult } from "@/lib/matching";
import { BORDER_INACTIVE, CANVAS, INK, MUTED, MUTED_SOFT, TYPE } from "@/lib/tokens";

// How many ingredients show while the sheet is resting, and roughly how tall a
// row is, which sets how much of the sheet is above the bottom edge.
const PEEK_ROWS = 2;
const ROW_HEIGHT = 72;
const HEADER_HEIGHT = 74;
const SNAP_MS = 280;
const SHEET_RADIUS = 28;

/** How much of the sheet is showing while it rests, for whoever lays out above it. */
export function ingredientsSheetPeek(bottomInset: number) {
  return HEADER_HEIGHT + PEEK_ROWS * ROW_HEIGHT + Math.max(16, bottomInset);
}

/**
 * The ingredient list as a sheet resting at the bottom of the product screen:
 * its header and the first couple of ingredients show, and dragging it up (or
 * tapping its header) opens the whole list — tabs and all — over the screen.
 * Dragging the header down, tapping the dimmed screen, or Back closes it.
 *
 * Replaces the "View ingredients" button that opened the list as a separate
 * screen. `floating` is drawn just above the sheet's top edge and rides up with
 * it (the Save heart), fading out as the sheet opens.
 */
export function IngredientsSheet({
  product,
  match,
  floating,
}: {
  product: ProductWithIngredients;
  match: MatchResult;
  floating?: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const total = product.ingredients.length;

  const full = Math.round(height * 0.88);
  const collapsedY = full - ingredientsSheetPeek(insets.bottom);
  const collapsedRef = useRef(collapsedY);

  const [expanded, setExpanded] = useState(false);
  const expandedRef = useRef(false);
  // 0 = fully open, collapsedY = resting. Driven from JS because it moves layout
  // and is written by the finger.
  const [y] = useState(() => new Animated.Value(collapsedY));
  const currentY = useRef(collapsedY);
  const startY = useRef(collapsedY);

  useEffect(() => {
    const id = y.addListener(({ value }) => {
      currentY.current = value;
    });
    return () => y.removeListener(id);
  }, [y]);

  // A different window size (rotation, split screen) moves the resting place.
  useEffect(() => {
    collapsedRef.current = collapsedY;
    y.setValue(expandedRef.current ? 0 : collapsedY);
  }, [collapsedY, y]);

  const snap = useCallback(
    (open: boolean) => {
      expandedRef.current = open;
      setExpanded(open);
      Animated.timing(y, {
        toValue: open ? 0 : collapsedRef.current,
        duration: SNAP_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    },
    [y],
  );

  useEffect(() => {
    if (!expanded) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      snap(false);
      return true;
    });
    return () => sub.remove();
  }, [expanded, snap]);

  // The handlers read refs, but only when a finger moves — never during render.
  // eslint-disable-next-line react-hooks/refs
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderGrant: () => {
        y.stopAnimation();
        startY.current = currentY.current;
      },
      onPanResponderMove: (_event, g) => {
        y.setValue(Math.min(Math.max(startY.current + g.dy, 0), collapsedRef.current));
      },
      onPanResponderRelease: (_event, g) => {
        // A flick decides it; a slow drag goes to whichever end is nearer.
        const open = g.vy < -0.5 ? true : g.vy > 0.5 ? false : currentY.current < collapsedRef.current / 2;
        snap(open);
      },
    }),
  );

  const progress = y.interpolate({ inputRange: [0, collapsedY], outputRange: [1, 0], extrapolate: "clamp" });
  const fetched = Date.parse(product.fetchedAt ?? "");

  const openIngredient = (name: string) =>
    router.push({ pathname: "/ingredient/[inci]", params: { inci: name, product: product.id } });

  return (
    <>
      {/* The screen dims as the sheet rises; tapping it puts the sheet back. */}
      <Animated.View
        pointerEvents={expanded ? "auto" : "none"}
        style={[StyleSheet.absoluteFill, { backgroundColor: INK, opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.35] }) }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => snap(false)}
          accessibilityRole="button"
          accessibilityLabel="Close ingredients"
        />
      </Animated.View>

      <Animated.View
        // While resting, a drag anywhere on the sheet moves it; once open the
        // list scrolls, so only the header answers to a drag.
        {...(expanded ? {} : pan.panHandlers)}
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: full, transform: [{ translateY: y }] }}
      >
        {floating ? (
          <Animated.View
            pointerEvents={expanded ? "none" : "box-none"}
            style={{ position: "absolute", top: -68, right: 20, opacity: progress.interpolate({ inputRange: [0, 0.4], outputRange: [1, 0], extrapolate: "clamp" }) }}
          >
            {floating}
          </Animated.View>
        ) : null}

        <View
          style={{
            flex: 1,
            backgroundColor: CANVAS,
            borderTopLeftRadius: SHEET_RADIUS,
            borderTopRightRadius: SHEET_RADIUS,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: BORDER_INACTIVE,
            overflow: "hidden",
          }}
        >
          <View {...(expanded ? pan.panHandlers : {})}>
            <Pressable
              onPress={() => snap(!expanded)}
              accessibilityRole="button"
              accessibilityLabel={`Ingredients, ${total} listed`}
              accessibilityHint={expanded ? "Closes the full list" : "Opens the full list"}
              accessibilityState={{ expanded }}
              style={{ height: HEADER_HEIGHT, paddingHorizontal: 24, justifyContent: "center" }}
            >
              <View style={{ alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: MUTED_SOFT, marginBottom: 14 }} />
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: "PlayfairDisplay_500Medium", fontSize: TYPE.title, color: INK }}>Ingredients</Text>
                <Text style={{ fontSize: 13, fontWeight: "600", color: MUTED }}>{expanded ? "Close" : "See all"}</Text>
              </View>
            </Pressable>
          </View>

          <View style={{ flex: 1 }}>
            {/* Resting: the first few. */}
            <Animated.View
              pointerEvents={expanded ? "none" : "auto"}
              style={[StyleSheet.absoluteFill, { opacity: progress.interpolate({ inputRange: [0, 0.5], outputRange: [1, 0], extrapolate: "clamp" }) }]}
            >
              {product.ingredients.slice(0, PEEK_ROWS).map((ingredient) => (
                <IngredientListRow
                  key={ingredient.id}
                  ingredient={ingredient}
                  rung={rungFor(ingredient, match)}
                  warning={match.warnings.find((w) => w.ingredient.id === ingredient.id)}
                  onPress={() => openIngredient(ingredient.name)}
                />
              ))}
            </Animated.View>

            {/* Open: all of them, with the tabs. */}
            <Animated.View
              pointerEvents={expanded ? "auto" : "none"}
              style={[
                StyleSheet.absoluteFill,
                { paddingBottom: insets.bottom, opacity: progress.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: "clamp" }) },
              ]}
            >
              <IngredientTabsList
                ingredients={product.ingredients}
                match={match}
                metaLine={`${total} ingredient${total === 1 ? "" : "s"} · Tap for details`}
                subMetaLine={Number.isFinite(fetched) ? `Label read ${relativeTime(fetched)}` : undefined}
                onIngredientPress={(ingredient) => openIngredient(ingredient.name)}
              />
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </>
  );
}
