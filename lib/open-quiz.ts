import { router } from "expo-router";

import { quizRoutes } from "@/lib/profile";

/**
 * How long after opening the quiz a repeat call is ignored — about as long as
 * the sheet takes to slide up. Same reason as `openScanner`'s guard: `push`
 * opens a fresh quiz every time, so a double tap would stack two, and
 * finishing one would leave the other on screen.
 */
const REPEAT_GUARD_MS = 800;

let lastOpenedAt = 0;

/**
 * Opens the skin quiz as a modal over whatever screen asked for it (#346):
 * a result's "See your skin match", Home's skin-profile card, Profile, or
 * Search. Finishing or closing it dismisses back to that same screen, so no
 * return address is passed along — a link can set a route param (#29), and
 * closing a modal needs none.
 */
export function openQuiz() {
  openQuizAt(Date.now());
}

/** `openQuiz` with the clock passed in — exported for the test. */
export function openQuizAt(now: number) {
  if (now - lastOpenedAt < REPEAT_GUARD_MS) return;
  lastOpenedAt = now;
  router.push(quizRoutes()[0]);
}
