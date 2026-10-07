import { forwardRef } from "react";
import { Pressable, TextInput, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";


import { FONT_SCALE, ICON_MUTED, INK, PLACEHOLDER, SURFACE, TYPE, WHITE, SPACE } from "@/lib/tokens";

/** The bar's height (v7). */
const SEARCH_BAR_HEIGHT = 44;

/**
 * Every search bar in the app: a 44pt stone pill (v9), no border or shade, a
 * grey magnifier, a darker grey placeholder, 17pt text, and a small clear
 * cross once there is something to clear.
 */
export const SearchBar = forwardRef<
  TextInput,
  {
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    accessibilityLabel?: string;
    autoFocus?: boolean;
    /** The keyboard's Search key (School asks its best match). */
    onSubmitEditing?: () => void;
  }
>(function SearchBar({ value, onChangeText, placeholder, accessibilityLabel, autoFocus, onSubmitEditing }, ref) {
  return (
    <View
      style={{ flex: 1, height: SEARCH_BAR_HEIGHT, borderRadius: SEARCH_BAR_HEIGHT / 2, backgroundColor: SURFACE, flexDirection: "row", alignItems: "center", gap: SPACE.block, paddingLeft: SPACE.gutter, paddingRight: SPACE.text }}
    >
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Circle cx={11} cy={11} r={7} stroke={ICON_MUTED} strokeWidth={2.2} />
        <Path d="m20 20-3.5-3.5" stroke={ICON_MUTED} strokeWidth={2.2} strokeLinecap="round" />
      </Svg>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={PLACEHOLDER}
        autoCorrect={false}
        autoFocus={autoFocus}
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        maxFontSizeMultiplier={FONT_SCALE.ui}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        style={{ flex: 1, height: SEARCH_BAR_HEIGHT, fontSize: TYPE.card, color: INK }}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChangeText("")} accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} className="active:opacity-70" style={{ padding: 6 }}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <Circle cx={12} cy={12} r={10} fill={ICON_MUTED} />
            <Path d="m15 9-6 6M9 9l6 6" stroke={WHITE} strokeWidth={2.2} strokeLinecap="round" />
          </Svg>
        </Pressable>
      ) : null}
    </View>
  );
});
