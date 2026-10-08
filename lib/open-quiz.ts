import { router } from "expo-router";

import { CONSENT_ROUTE, quizRoutes } from "@/lib/profile";
import { useAppStore } from "@/store/useAppStore";

/**
 * How long after opening the quiz a repeat call is ignored — about as long as
 * the sheet takes to slide up. Same reason as `openScanner`'s guard: `push`
 * opens a fresh quiz every time, so a double tap would stack two, and
 * finishing one would leave the other on screen.
 */
const REPEAT_GUARD_MS = 800;

let lastOpenedAt = 0;

/** Where the quiz goes when it is finished: back to the screen that opened it, or on to the Skincare routine. */
export type QuizDestination = "back" | "routine";

let destination: QuizDestination = "back";

/** Where the quiz now open leads. Read by its last step. */
export function quizDestination(): QuizDestination {
  return destination;
}

/**
 * Opens the skin quiz as a modal over whatever screen asked for it (#346).
 * Finished from a result ("Take the 1-minute quiz"), it closes back to that
 * result, which now shows the skin match. Opened from the Skincare routine
 * (`"routine"`), it ends on the routine it has just made possible. A button
 * hands its press event to `onPress`, so anything but that word means "back".
 */
export function openQuiz(then?: unknown) {
  openQuizAt(Date.now(), then === "routine" ? "routine" : "back");
}

/** `openQuiz` with the clock passed in — exported for the test. */
export function openQuizAt(now: number, then: QuizDestination = "back") {
  if (now - lastOpenedAt < REPEAT_GUARD_MS) return;
  lastOpenedAt = now;
  destination = then;
  // The first time, the screen that asks to be asked comes before question 1 (#471).
  router.push(useAppStore.getState().profileConsentAt === null ? CONSENT_ROUTE : quizRoutes()[0]);
}
