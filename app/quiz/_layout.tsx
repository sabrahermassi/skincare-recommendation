import { ThemeProvider, useTheme } from "expo-router/react-navigation";
import { Stack } from "expo-router";
import { useMemo } from "react";

import { QuizFrame } from "@/components/QuizFrame";

// Skip and the Continue button live in QuizFrame and never move; the step
// pages slide in from the right inside it, like any iOS push (#313). Each
// page draws its own copy of the background (QuizScreen), so a sliding page
// never shows the question underneath.
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
            animation: "slide_from_right",
            contentStyle: { backgroundColor: "transparent" },
          }}
        />
      </ThemeProvider>
    </QuizFrame>
  );
}
