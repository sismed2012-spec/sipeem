import {
  TERRITORIAL_METRICS,
  type TerritorialIndicatorRow,
  type TerritorialIndicatorsResponse,
  type TerritorialLevel,
  type TerritorialMetricKey,
} from "./territorial-indicators-types";

export const NO_DATA_COLOR = "#94a3b8";
export const TERRITORIAL_SEQUENTIAL_PALETTE = [
  "#eff6ff",
  "#bfdbfe",
  "#60a5fa",
  "#2563eb",
  "#1e3a8a",
] as const;

export interface TerritorialIndicatorIndex {
  byCartographyId: Map<number, TerritorialIndicatorRow>;
  byKey: Map<string, TerritorialIndicatorRow>;
}

export interface QuantileBin {
  lower: number;
  upper: number;
  color: string;
}

export interface QuantileScale {
  bins: QuantileBin[];
  noDataColor: typeof NO_DATA_COLOR;
}

export interface TerritorialThemePresentation {
  level: TerritorialLevel;
  metricKey: TerritorialMetricKey;
  versionId: number;
  nominalSource: TerritorialIndicatorsResponse["nominalSource"];
  demographicSource: TerritorialIndicatorsResponse["demographicSource"];
  index: TerritorialIndicatorIndex;
  scale: QuantileScale;
}

function normalizeKey(level: TerritorialLevel, value: string): string | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const integer = Number(value);
  if (!Number.isSafeInteger(integer) || integer < 1) return null;
  return level === "MUNICIPIO" ? String(integer).padStart(3, "0") : String(integer);
}

export function buildTerritorialIndicatorIndex(
  rows: readonly TerritorialIndicatorRow[],
): TerritorialIndicatorIndex {
  const byCartographyId = new Map<number, TerritorialIndicatorRow>();
  const byKey = new Map<string, TerritorialIndicatorRow>();
  for (const row of rows) {
    byCartographyId.set(row.cartographyTerritoryId, row);
    const key = normalizeKey(row.level, row.key);
    if (key) byKey.set(key, row);
  }
  return { byCartographyId, byKey };
}

function positiveInteger(value: unknown): number | null {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    return null;
  }
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function municipalityKey(field: string, value: unknown): string | null {
  if (field === "CVEGEO") {
    const text = typeof value === "string" || typeof value === "number"
      ? String(value).trim()
      : "";
    if (!/^\d{3,}$/.test(text)) return null;
    return normalizeKey("MUNICIPIO", text.slice(-3));
  }
  const number = positiveInteger(value);
  return number === null ? null : String(number).padStart(3, "0");
}

function districtKey(value: unknown): string | null {
  const number = positiveInteger(value);
  return number === null ? null : String(number);
}

export function resolveTerritoryIndicator(
  level: TerritorialLevel,
  properties: Record<string, unknown>,
  index: TerritorialIndicatorIndex,
): TerritorialIndicatorRow | null {
  const idField = level === "MUNICIPIO"
    ? "cartografia_municipio_id"
    : level === "DISTRITO_LOCAL"
      ? "cartografia_distrito_local_id"
      : "cartografia_distrito_federal_id";
  const keyFields = level === "MUNICIPIO"
    ? ["CVE_MUN", "CVEGEO", "MUNICIPIO"]
    : level === "DISTRITO_LOCAL"
      ? ["DISTRITO_L", "CVE_DTO_LOC", "DTO_LOC", "DISTRITO"]
      : ["DISTRITO_F", "CVE_DTO_FED", "DTO_FED", "DISTRITO"];

  const idValue = properties[idField];
  const id = idValue === undefined || idValue === null
    ? null
    : positiveInteger(idValue);
  if (idValue !== undefined && idValue !== null && id === null) return null;

  const keys: string[] = [];
  for (const field of keyFields) {
    const value = properties[field];
    if (value === undefined || value === null || value === "") continue;
    const key = level === "MUNICIPIO"
      ? municipalityKey(field, value)
      : districtKey(value);
    if (key === null) return null;
    keys.push(key);
  }
  const distinctKeys = new Set(keys);
  if (distinctKeys.size > 1) return null;

  const byId = id === null ? null : index.byCartographyId.get(id) ?? null;
  const onlyKey = keys[0];
  const byKey = onlyKey === undefined ? null : index.byKey.get(onlyKey) ?? null;
  if (id !== null && !byId) return null;
  if (onlyKey !== undefined && !byKey) return null;
  if (byId && byKey && byId !== byKey) return null;
  return byId ?? byKey;
}

function paletteForBinCount(count: number): string[] {
  if (count <= 0) return [];
  if (count === 1) return [TERRITORIAL_SEQUENTIAL_PALETTE[2]];
  return Array.from({ length: count }, (_, index) => {
    const paletteIndex = Math.round(
      (index * (TERRITORIAL_SEQUENTIAL_PALETTE.length - 1)) / (count - 1),
    );
    return TERRITORIAL_SEQUENTIAL_PALETTE[paletteIndex];
  });
}

export function buildQuantileScale(
  values: readonly (number | null)[],
): QuantileScale {
  const sorted = values
    .filter((value): value is number => value !== null && Number.isFinite(value))
    .toSorted((left, right) => left - right);
  if (sorted.length === 0) return { bins: [], noDataColor: NO_DATA_COLOR };

  const upperBounds: number[] = [];
  const desiredBins = Math.min(5, new Set(sorted).size);
  for (let quantile = 1; quantile < desiredBins; quantile += 1) {
    const index = Math.ceil((quantile * sorted.length) / desiredBins) - 1;
    const boundary = sorted[index];
    if (boundary < sorted.at(-1)! && upperBounds.at(-1) !== boundary) {
      upperBounds.push(boundary);
    }
  }
  upperBounds.push(sorted.at(-1)!);

  const uniqueValues = [...new Set(sorted)];
  const colors = paletteForBinCount(upperBounds.length);
  let previousUpper = Number.NEGATIVE_INFINITY;
  const bins = upperBounds.map((upper, index) => {
    const lower = uniqueValues.find((value) => value > previousUpper) ?? upper;
    previousUpper = upper;
    return { lower, upper, color: colors[index] };
  });
  return { bins, noDataColor: NO_DATA_COLOR };
}

export function getIndicatorFill(
  value: number | null,
  scale: QuantileScale,
): string {
  if (value === null || !Number.isFinite(value)) return scale.noDataColor;
  return scale.bins.find((bin) => value <= bin.upper)?.color ?? scale.noDataColor;
}

const countFormatter = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 0,
});
const percentFormatter = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
  style: "percent",
});

export function formatTerritorialMetric(
  value: number | null,
  metricKey: TerritorialMetricKey,
): string {
  if (value === null || !Number.isFinite(value)) return "Sin dato";
  const definition = TERRITORIAL_METRICS.find((metric) => metric.key === metricKey);
  return definition?.unit === "PERCENT"
    ? percentFormatter.format(value / 100)
    : countFormatter.format(value);
}
