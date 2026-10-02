import type {
  TerritorialDemographicMetricKey,
  TerritorialIndicatorMetrics,
  TerritorialIndicatorRow,
  TerritorialIndicatorsInput,
  TerritorialIndicatorsResponse,
  TerritorialLevel,
} from "./territorial-indicators-types";

export class TerritorialIndicatorsInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "TerritorialIndicatorsInputError";
  }
}

export class TerritorialIndicatorsGatewayError extends Error {
  readonly status = 502;
  override readonly cause: Error;

  constructor(cause: Error) {
    super("No se pudieron consultar los indicadores territoriales");
    this.name = "TerritorialIndicatorsGatewayError";
    this.cause = cause;
  }
}

interface TerritorialIndicatorsRpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

interface TerritorialIndicatorsRpcArgs {
  p_nivel: TerritorialLevel;
  p_cartografia_version_id: number;
  p_lista_nominal_corte_id: number | null;
  p_demografia_fuente_id: number | null;
}

export type TerritorialIndicatorsRpcInvoker = (
  functionName: "rpc_indicadores_territoriales",
  args: TerritorialIndicatorsRpcArgs,
) => PromiseLike<TerritorialIndicatorsRpcResult>;

const LEVELS = new Set<TerritorialLevel>([
  "MUNICIPIO",
  "DISTRITO_LOCAL",
  "DISTRITO_FEDERAL",
]);

function parsePositiveInteger(
  raw: string | null,
  name: string,
  optional = false,
): number | null {
  if (raw === null && optional) return null;
  const value = raw?.trim() ?? "";
  if (!value) throw new TerritorialIndicatorsInputError(`${name} es obligatorio`);
  if (!/^\d+$/.test(value)) {
    throw new TerritorialIndicatorsInputError(`${name} debe ser un entero positivo`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new TerritorialIndicatorsInputError(`${name} debe ser un entero positivo`);
  }
  return parsed;
}

export function parseTerritorialIndicatorParams(
  params: URLSearchParams,
): TerritorialIndicatorsInput {
  const rawLevel = params.get("level")?.trim() ?? "";
  if (!LEVELS.has(rawLevel as TerritorialLevel)) {
    throw new TerritorialIndicatorsInputError("level inválido");
  }
  return {
    level: rawLevel as TerritorialLevel,
    versionId: parsePositiveInteger(params.get("versionId"), "versionId")!,
    nominalCutId: parsePositiveInteger(
      params.get("nominalCutId"),
      "nominalCutId",
      true,
    ),
    demographySourceId: parsePositiveInteger(
      params.get("demographySourceId"),
      "demographySourceId",
      true,
    ),
  };
}

function gatewayFailure(message: string): never {
  throw new TerritorialIndicatorsGatewayError(
    new Error(`Respuesta RPC de indicadores territoriales inválida: ${message}`),
  );
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return gatewayFailure(context);
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown, context: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || gatewayFailure(context);
}

function asNumber(value: unknown, context: string): number {
  if (
    typeof value !== "number" &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    return gatewayFailure(context);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return gatewayFailure(context);
  return number;
}

function asInteger(value: unknown, context: string): number {
  const number = asNumber(value, context);
  if (!Number.isSafeInteger(number)) return gatewayFailure(context);
  return number;
}

function asPositiveInteger(value: unknown, context: string): number {
  const number = asInteger(value, context);
  if (number < 1) return gatewayFailure(context);
  return number;
}

function asNullableNumber(value: unknown, context: string): number | null {
  return value === null ? null : asNumber(value, context);
}

function asPercent(value: unknown, context: string): number {
  const number = asNumber(value, context);
  if (number > 100) return gatewayFailure(context);
  return number;
}

function asNullablePercent(value: unknown, context: string): number | null {
  return value === null ? null : asPercent(value, context);
}

function asDate(value: unknown, context: string): string {
  const text = asText(value, context);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return gatewayFailure(context);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    return gatewayFailure(context);
  }
  return text;
}

const DEMOGRAPHIC_FIELDS: readonly [
  TerritorialDemographicMetricKey,
  string,
][] = [
  ["poblacionTotal", "pobtot"],
  ["poblacionFemenina", "pobfem"],
  ["poblacionMasculina", "pobmas"],
  ["poblacion0a14", "pob0_14"],
  ["poblacion15a64", "pob15_64"],
  ["poblacion65Mas", "pob65_mas"],
  ["poblacion18Mas", "p_18ymas"],
  ["pea", "pea"],
  ["poblacionOcupada", "pocupada"],
  ["poblacion15MasAnalfabeta", "p15ym_an"],
  ["poblacionDerechohabienteSalud", "pder_ss"],
  ["poblacionConDiscapacidad", "pcon_disc"],
  ["poblacion3MasHablanteLenguaIndigena", "p3ym_hli"],
  ["poblacionAfrodescendiente", "pob_afro"],
  ["viviendasHabitadas", "tvivhab"],
  ["viviendasConAgua", "vph_aguadv"],
  ["viviendasConDrenaje", "vph_drenaj"],
  ["viviendasConElectricidad", "vph_c_elec"],
  ["viviendasConCelular", "vph_cel"],
  ["viviendasConComputadora", "vph_pc"],
  ["viviendasConInternet", "vph_inter"],
];

interface NormalizedRow {
  row: TerritorialIndicatorRow;
  nominalSource: { id: number; cutoffDate: string };
  demographicSource: { id: number; censusYear: number };
  versionId: number;
}

function normalizeRow(
  value: unknown,
  input: TerritorialIndicatorsInput,
): NormalizedRow {
  const raw = asRecord(value, "fila");
  if (raw.nivel !== input.level) return gatewayFailure("nivel");
  const versionId = asPositiveInteger(
    raw.cartografia_version_id,
    "cartografia_version_id",
  );
  if (versionId !== input.versionId) return gatewayFailure("cartografia_version_id");

  const nominalSource = {
    id: asPositiveInteger(raw.lista_nominal_corte_id, "lista_nominal_corte_id"),
    cutoffDate: asDate(raw.lista_nominal_fecha_corte, "lista_nominal_fecha_corte"),
  };
  const demographicSource = {
    id: asPositiveInteger(raw.demografia_fuente_id, "demografia_fuente_id"),
    censusYear: asInteger(raw.demografia_anio_censal, "demografia_anio_censal"),
  };
  if (input.nominalCutId !== null && nominalSource.id !== input.nominalCutId) {
    return gatewayFailure("lista_nominal_corte_id");
  }
  if (
    input.demographySourceId !== null &&
    demographicSource.id !== input.demographySourceId
  ) {
    return gatewayFailure("demografia_fuente_id");
  }
  if (demographicSource.censusYear < 1900 || demographicSource.censusYear > 2200) {
    return gatewayFailure("demografia_anio_censal");
  }

  const totalSections = asPositiveInteger(raw.secciones_total, "secciones_total");
  const nominalSections = asInteger(raw.secciones_nominal, "secciones_nominal");
  const demographicSections = asInteger(
    raw.secciones_demografia,
    "secciones_demografia",
  );
  if (nominalSections > totalSections || demographicSections > totalSections) {
    return gatewayFailure("cobertura de secciones");
  }
  const nominalSourceCoveragePercent = asPercent(
    raw.cobertura_fuente_nominal_pct,
    "cobertura_fuente_nominal_pct",
  );
  const demographicSourceCoveragePercent = asPercent(
    raw.cobertura_fuente_demografia_pct,
    "cobertura_fuente_demografia_pct",
  );
  if (
    Math.abs(nominalSourceCoveragePercent - (nominalSections * 100) / totalSections) >
      1e-5 ||
    Math.abs(
      demographicSourceCoveragePercent -
        (demographicSections * 100) / totalSections,
    ) > 1e-5
  ) {
    return gatewayFailure("porcentaje de cobertura de secciones");
  }

  const metrics = {
    padronHombres: asNullableNumber(raw.padron_hombres, "padron_hombres"),
    padronMujeres: asNullableNumber(raw.padron_mujeres, "padron_mujeres"),
    padronNoBinario: asNullableNumber(raw.padron_no_binario, "padron_no_binario"),
    padronTotal: asNullableNumber(raw.padron_total, "padron_total"),
    listaNominalHombres: asNullableNumber(raw.lista_hombres, "lista_hombres"),
    listaNominalMujeres: asNullableNumber(raw.lista_mujeres, "lista_mujeres"),
    listaNominalNoBinario: asNullableNumber(raw.lista_no_binario, "lista_no_binario"),
    listaNominalTotal: asNullableNumber(raw.lista_total, "lista_total"),
    diferencia: asNullableNumber(raw.diferencia, "diferencia"),
    coberturaPadronPct: asNullablePercent(
      raw.cobertura_padron_pct,
      "cobertura_padron_pct",
    ),
  } as TerritorialIndicatorMetrics;
  for (const [metricKey, sqlKey] of DEMOGRAPHIC_FIELDS) {
    metrics[metricKey] = asNullableNumber(raw[sqlKey], sqlKey);
  }

  const rawQuality = asRecord(raw.calidad_metricas, "calidad_metricas");
  const metricQuality = {} as Record<TerritorialDemographicMetricKey, number>;
  for (const [metricKey, sqlKey] of DEMOGRAPHIC_FIELDS) {
    const count = asInteger(rawQuality[sqlKey], `calidad_metricas.${sqlKey}`);
    if (count > demographicSections) {
      return gatewayFailure(`calidad_metricas.${sqlKey}`);
    }
    metricQuality[metricKey] = count;
  }

  return {
    versionId,
    nominalSource,
    demographicSource,
    row: {
      level: input.level,
      territoryId: asPositiveInteger(raw.territorio_id, "territorio_id"),
      cartographyTerritoryId: asPositiveInteger(
        raw.cartografia_territorio_id,
        "cartografia_territorio_id",
      ),
      key: asText(raw.clave, "clave"),
      name: asText(raw.nombre, "nombre"),
      totalSections,
      nominalSections,
      demographicSections,
      nominalSourceCoveragePercent,
      demographicSourceCoveragePercent,
      metricQuality,
      metrics,
    },
  };
}

export async function getTerritorialIndicators(
  invoke: TerritorialIndicatorsRpcInvoker,
  input: TerritorialIndicatorsInput,
): Promise<TerritorialIndicatorsResponse> {
  const result = await invoke("rpc_indicadores_territoriales", {
    p_nivel: input.level,
    p_cartografia_version_id: input.versionId,
    p_lista_nominal_corte_id: input.nominalCutId,
    p_demografia_fuente_id: input.demographySourceId,
  });
  if (result.error) {
    throw new TerritorialIndicatorsGatewayError(new Error(result.error.message));
  }
  if (!Array.isArray(result.data)) return gatewayFailure("colección");
  if (result.data.length === 0) {
    return {
      level: input.level,
      versionId: input.versionId,
      nominalSource: null,
      demographicSource: null,
      rows: [],
    };
  }

  const normalized = result.data.map((value) => normalizeRow(value, input));
  const first = normalized[0];
  const territoryIds = new Set<number>();
  const cartographyIds = new Set<number>();
  const keys = new Set<string>();
  for (const item of normalized) {
    if (
      item.versionId !== first.versionId ||
      item.nominalSource.id !== first.nominalSource.id ||
      item.nominalSource.cutoffDate !== first.nominalSource.cutoffDate ||
      item.demographicSource.id !== first.demographicSource.id ||
      item.demographicSource.censusYear !== first.demographicSource.censusYear
    ) {
      return gatewayFailure("procedencia mixta");
    }
    if (
      territoryIds.has(item.row.territoryId) ||
      cartographyIds.has(item.row.cartographyTerritoryId) ||
      keys.has(item.row.key)
    ) {
      return gatewayFailure("territorio duplicado");
    }
    territoryIds.add(item.row.territoryId);
    cartographyIds.add(item.row.cartographyTerritoryId);
    keys.add(item.row.key);
  }

  return {
    level: input.level,
    versionId: input.versionId,
    nominalSource: first.nominalSource,
    demographicSource: first.demographicSource,
    rows: normalized.map((item) => item.row),
  };
}
