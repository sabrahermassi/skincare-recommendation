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
