import { ThemeProvider, useTheme } from "expo-router/react-navigation";
import { Redirect, Stack, useSegments } from "expo-router";
import { useMemo } from "react";

import { QuizFrame } from "@/components/QuizFrame";
import { CONSENT_ROUTE } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

// The Continue button lives in QuizFrame and never moves; the step
// pages slide in from the right inside it, like any iOS push (#313). Each
// page draws its own copy of the background (QuizScreen), so a sliding page
// never shows the question underneath.
export default function QuizLayout() {
  const theme = useTheme();
  const consentAt = useAppStore((s) => s.profileConsentAt);
  // The segments are the whole app's, not this stack's: a screen pushed over
  // the quiz (the privacy policy, from the consent screen) is not a quiz step.
  const segments: string[] = useSegments();
  // Pages paint the navigation theme's background (grey by default) underneath
  // contentStyle, which would hide QuizFrame's background; clear it for the
  // quiz's steps only.
  const seeThrough = useMemo(
    () => ({ ...theme, colors: { ...theme.colors, background: "transparent" } }),
    [theme],
  );

  // No question without the consent screen first (#471), whatever opened it:
  // `openQuiz` goes there itself, but a link to /quiz/concerns would not.
  if (consentAt === null && segments[0] === "quiz" && segments[1] !== "before") {
    return <Redirect href={CONSENT_ROUTE} />;
  }

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
