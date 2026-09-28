export type TerritorialLevel =
  | "MUNICIPIO"
  | "DISTRITO_LOCAL"
  | "DISTRITO_FEDERAL";

export type TerritorialMetricKey =
  | "padronTotal"
  | "listaNominalTotal"
  | "coberturaPadronPct"
  | "poblacionTotal"
  | "pea"
  | "poblacionOcupada"
  | "poblacionConDiscapacidad"
  | "viviendasHabitadas"
  | "viviendasConInternet";

export type TerritorialDemographicMetricKey =
  | "poblacionTotal"
  | "poblacionFemenina"
  | "poblacionMasculina"
  | "poblacion0a14"
  | "poblacion15a64"
  | "poblacion65Mas"
  | "poblacion18Mas"
  | "pea"
  | "poblacionOcupada"
  | "poblacion15MasAnalfabeta"
  | "poblacionDerechohabienteSalud"
  | "poblacionConDiscapacidad"
  | "poblacion3MasHablanteLenguaIndigena"
  | "poblacionAfrodescendiente"
  | "viviendasHabitadas"
  | "viviendasConAgua"
  | "viviendasConDrenaje"
  | "viviendasConElectricidad"
  | "viviendasConCelular"
  | "viviendasConComputadora"
  | "viviendasConInternet";

export interface TerritorialIndicatorMetrics {
  padronHombres: number | null;
  padronMujeres: number | null;
  padronNoBinario: number | null;
  padronTotal: number | null;
  listaNominalHombres: number | null;
  listaNominalMujeres: number | null;
  listaNominalNoBinario: number | null;
  listaNominalTotal: number | null;
  diferencia: number | null;
  coberturaPadronPct: number | null;
  poblacionTotal: number | null;
  poblacionFemenina: number | null;
  poblacionMasculina: number | null;
  poblacion0a14: number | null;
  poblacion15a64: number | null;
  poblacion65Mas: number | null;
  poblacion18Mas: number | null;
  pea: number | null;
  poblacionOcupada: number | null;
  poblacion15MasAnalfabeta: number | null;
  poblacionDerechohabienteSalud: number | null;
  poblacionConDiscapacidad: number | null;
  poblacion3MasHablanteLenguaIndigena: number | null;
  poblacionAfrodescendiente: number | null;
  viviendasHabitadas: number | null;
  viviendasConAgua: number | null;
  viviendasConDrenaje: number | null;
  viviendasConElectricidad: number | null;
  viviendasConCelular: number | null;
  viviendasConComputadora: number | null;
  viviendasConInternet: number | null;
}

export interface TerritorialIndicatorRow {
  level: TerritorialLevel;
  territoryId: number;
  cartographyTerritoryId: number;
  key: string;
  name: string;
  totalSections: number;
  nominalSections: number;
  demographicSections: number;
  nominalSourceCoveragePercent: number;
  demographicSourceCoveragePercent: number;
  metricQuality: Record<TerritorialDemographicMetricKey, number>;
  metrics: TerritorialIndicatorMetrics;
}

export interface TerritorialIndicatorsInput {
  level: TerritorialLevel;
  versionId: number;
  nominalCutId: number | null;
  demographySourceId: number | null;
}

export interface TerritorialIndicatorsResponse {
  level: TerritorialLevel;
  versionId: number;
  nominalSource: { id: number; cutoffDate: string } | null;
  demographicSource: { id: number; censusYear: number } | null;
  rows: TerritorialIndicatorRow[];
}

export interface TerritorialMetricDefinition {
  key: TerritorialMetricKey;
  label: string;
  unit: "COUNT" | "PERCENT";
}

export const TERRITORIAL_METRICS: readonly TerritorialMetricDefinition[] = [
  { key: "padronTotal", label: "Padrón electoral", unit: "COUNT" },
  { key: "listaNominalTotal", label: "Lista nominal", unit: "COUNT" },
  { key: "coberturaPadronPct", label: "Cobertura padrón-lista", unit: "PERCENT" },
  { key: "poblacionTotal", label: "Población total", unit: "COUNT" },
  { key: "pea", label: "Población económicamente activa", unit: "COUNT" },
  { key: "poblacionOcupada", label: "Población ocupada", unit: "COUNT" },
  { key: "poblacionConDiscapacidad", label: "Población con discapacidad", unit: "COUNT" },
  { key: "viviendasHabitadas", label: "Viviendas habitadas", unit: "COUNT" },
  { key: "viviendasConInternet", label: "Viviendas con internet", unit: "COUNT" },
] as const;
