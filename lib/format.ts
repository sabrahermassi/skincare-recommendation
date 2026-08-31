import type { ComedogenicRating, SafetyLevel } from "@/data/types";

export function formatKRW(price: number): string {
  return `₩${price.toLocaleString("en-US")}`;
}

export function comedogenicLabel(rating: ComedogenicRating): string {
  if (rating === 0) return "Won't clog pores";
  if (rating <= 2) return `Low pore risk (${rating}/5)`;
  if (rating <= 3) return `Moderate pore risk (${rating}/5)`;
  return `High pore risk (${rating}/5)`;
}

export const SAFETY_LABEL: Record<SafetyLevel, string> = {
  safe: "Safe",
  caution: "Caution",
  avoid: "Avoid",
};
