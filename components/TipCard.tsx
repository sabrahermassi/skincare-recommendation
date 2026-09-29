import { View } from "react-native";

import { Text } from "@/components/Text";
import { useNoteTextStyle } from "@/lib/note-font";
import { tipOfTheDay } from "@/lib/tips";
import { INK, MUTED, SPACE, SURFACE, TIP_NOTE, TYPE } from "@/lib/tokens";

// The tape across the card's top (v7): 80 × 22, a few degrees off straight.
const TAPE = { width: 80, height: 22, rise: 10, tilt: "-4deg" } as const;

/**
 * Tip of the day on Home (v7): a white paper note held on by a strip of tape,
 * "Tip of the day" in small capitals and the tip in handwriting. The same tip
 * for everyone all day (`lib/tips.ts`); tapping it does nothing. Large text,
 * Bold Text or a font not loaded yet show it in the UI font instead
 * (`useNoteTextStyle`), so it always reads.
 */
export function TipCard() {
  const tip = tipOfTheDay();
  const style = useNoteTextStyle(tip, "tip");
  return (
    <View
      accessible
      accessibilityLabel={`Tip of the day: ${tip}`}
      style={{
        marginTop: 32,
        borderRadius: TIP_NOTE.radius,
        backgroundColor: SURFACE,
        paddingTop: SPACE.section,
        paddingHorizontal: SPACE.gutter,
        paddingBottom: SPACE.gutter,
        ...TIP_NOTE.shadow,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: -TAPE.rise,
          alignSelf: "center",
          width: TAPE.width,
          height: TAPE.height,
          backgroundColor: TIP_NOTE.tape,
          transform: [{ rotate: TAPE.tilt }],
        }}
      />
      <Text style={{ fontSize: TYPE.caption, fontWeight: "600", letterSpacing: 0.8, textTransform: "uppercase", color: MUTED }}>Tip of the day</Text>
      <Text style={[style, { marginTop: SPACE.text, color: INK }]}>{tip}</Text>
    </View>
  );
}
