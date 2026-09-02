import type { ComedogenicRating, SafetyLevel } from "@/data/types";
import { COMEDOGENIC_FLAG_THRESHOLD } from "./safety";

/** Prices are in Korean won; format for the Korean locale, not en-US. */
export function formatKRW(price: number): string {
  return `₩${price.toLocaleString("ko-KR")}`;
}

export function comedogenicLabel(rating: ComedogenicRating): string {
  if (rating === 0) return "Won't clog pores";
  if (rating < COMEDOGENIC_FLAG_THRESHOLD) return `Low pore risk (${rating}/5)`;
  if (rating === COMEDOGENIC_FLAG_THRESHOLD)
    return `Moderate pore risk (${rating}/5)`;
  return `High pore risk (${rating}/5)`;
}

export const SAFETY_LABEL: Record<SafetyLevel, string> = {
  safe: "Safe",
  caution: "Caution",
  avoid: "Avoid",
};

/**
 * Coarse "when did I look at this" label for the history log. Deliberately
 * vague past a week — the useful question in a shop is "recently or not?",
 * and a precise date would imply a precision the log doesn't need.
 */
export function relativeTime(timestamp: number, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 60) return "just now";

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.round(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;

  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;

  const months = Math.round(days / 30);
  return `${months} ${months === 1 ? "month" : "months"} ago`;
}
