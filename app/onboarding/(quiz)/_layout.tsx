import { ThemeProvider, useTheme } from "expo-router/react-navigation";
import { Stack } from "expo-router";
import { useMemo } from "react";

import { QuizFrame } from "@/components/QuizFrame";

// The background, Skip and the Continue button live in QuizFrame and never
// move; only the see-through step pages change inside it. No slide between
// steps: a see-through page sliding over another would show both questions at
// once — QuizScreen fades each step's content in instead.
export default function QuizLayout() {
  const theme = useTheme();
  // Pages paint the navigation theme's background (grey by default) underneath
  // contentStyle, which would hide QuizFrame's background; clear it for the
  // quiz's steps only.
  const seeThrough = useMemo(
    () => ({ ...theme, colors: { ...theme.colors, background: "transparent" } }),
    [theme],
  );

  return (
    <QuizFrame>
      <ThemeProvider value={seeThrough}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "none",
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </ThemeProvider>
    </QuizFrame>
  );
}
