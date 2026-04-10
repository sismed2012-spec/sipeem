import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format number with commas: 9850 -> "9,850" */
export function formatNumber(n: number): string {
  return n.toLocaleString("es-MX");
}

/** Format percentage: 12.7 -> "12.7%" */
export function formatPct(n: number): string {
  return `${n}%`;
}

/** Parse comma-formatted string to integer: "9,850" -> 9850 */
export function parseFormattedNumber(s: string): number {
  return parseInt(s.replace(/,/g, ""), 10) || 0;
}

/** Parse percentage string: "61.5%" -> 61.5 */
export function parseFormattedPct(s: string): number {
  return parseFloat(s.replace("%", "")) || 0;
}
