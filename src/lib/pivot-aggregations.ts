export interface RatioFragment {
  numerator: number;
  denominator: number;
}

export function aggregatePercentage(parts: RatioFragment[]): number | null {
  if (parts.length === 0) return null;

  const numerator = parts.reduce((sum, part) => sum + part.numerator, 0);
  const denominator = parts.reduce((sum, part) => sum + part.denominator, 0);
  if (denominator <= 0) return null;

  return Number(((numerator / denominator) * 100).toFixed(2));
}
