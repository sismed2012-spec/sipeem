import type {
  DemografiaSeccionResponse,
  DemografiaSectionStatus,
} from "./demografia-types";

export class DemografiaInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "DemografiaInputError";
  }
}

export class DemografiaGatewayError extends Error {
  readonly status = 502;
  override readonly cause: Error;

  constructor(cause: Error) {
    super("No se pudo consultar la demografia");
    this.name = "DemografiaGatewayError";
    this.cause = cause;
  }
}

interface DemografiaRpcError {
  message: string;
  code?: string;
}

interface DemografiaRpcResult {
  data: unknown;
  error: DemografiaRpcError | null;
}

export type DemografiaRpcInvoker = (
  functionName: "rpc_demografia_seccion",
  args: {
    p_seccion_id: number;
    p_cartografia_version_id: number;
    p_anio_censal: number;
  }
) => PromiseLike<DemografiaRpcResult>;

export interface DemografiaSectionInput {
  sectionId: number;
  versionId: number;
  censusYear: number;
}

function parsePositiveInteger(raw: string | null | undefined, name: string): number {
  const value = raw?.trim() ?? "";
  if (!value) throw new DemografiaInputError(`${name} es obligatorio`);
  if (!/^\d+$/.test(value)) {
    throw new DemografiaInputError(`${name} debe ser un entero positivo`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new DemografiaInputError(`${name} debe ser un entero positivo`);
  }
  return parsed;
}

export function parseDemografiaSectionParams(
  sectionId: string,
  searchParams: URLSearchParams
): DemografiaSectionInput {
  const parsedSectionId = parsePositiveInteger(sectionId, "seccionId");
  const versionId = parsePositiveInteger(searchParams.get("versionId"), "versionId");
  const censusYear = searchParams.has("censusYear")
    ? parsePositiveInteger(searchParams.get("censusYear"), "censusYear")
    : 2020;
  if (censusYear < 1900 || censusYear > 2200) {
    throw new DemografiaInputError("censusYear debe estar entre 1900 y 2200");
  }
  return { sectionId: parsedSectionId, versionId, censusYear };
}

function gatewayFailure(message: string): never {
  throw new DemografiaGatewayError(new Error(`Respuesta RPC invalida: ${message}`));
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return gatewayFailure(context);
  }
  return value as Record<string, unknown>;
}

function asPositiveInteger(value: unknown, context: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return gatewayFailure(context);
  return parsed;
}

function asNonnegativeInteger(value: unknown, context: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return gatewayFailure(context);
  return parsed;
}

function asNullableNumber(value: unknown, context: string): number | null {
  if (value === null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return gatewayFailure(context);
  return parsed;
}

function unavailable(input: DemografiaSectionInput): DemografiaSeccionResponse {
  return {
    sectionId: input.sectionId,
    versionId: input.versionId,
    source: { provider: "INEGI", datasetKey: "CPV2020_ITER", censusYear: input.censusYear },
    status: "UNAVAILABLE",
    coverage: {
      includedLocalities: 0,
      pendingLocalities: 0,
      includedPopulation: null,
      pendingPopulationReference: null,
      percentage: null,
      isAdditive: false,
    },
    indicators: {},
  };
}

function normalizeRow(
  value: unknown,
  input: DemografiaSectionInput
): DemografiaSeccionResponse {
  const row = asRecord(value, "fila");
  const sectionId = asPositiveInteger(row.section_id, "section_id");
  const versionId = asPositiveInteger(row.version_id, "version_id");
  if (sectionId !== input.sectionId || versionId !== input.versionId) {
    return gatewayFailure("identidad seccion/version");
  }

  const source = asRecord(row.source, "source");
  const censusYear = asPositiveInteger(source.censusYear, "source.censusYear");
  if (source.provider !== "INEGI" || censusYear !== input.censusYear) {
    return gatewayFailure("source");
  }
  const datasetKey = typeof source.datasetKey === "string" ? source.datasetKey.trim() : "";
  if (!datasetKey) return gatewayFailure("source.datasetKey");

  const validStatuses: DemografiaSectionStatus[] = ["COMPLETE", "PARTIAL", "PENDING"];
  if (!validStatuses.includes(row.status as DemografiaSectionStatus)) {
    return gatewayFailure("status");
  }
  const status = row.status as DemografiaSectionStatus;
  const coverage = asRecord(row.coverage, "coverage");
  if (coverage.isAdditive !== false) return gatewayFailure("coverage.isAdditive");
  const percentage = asNullableNumber(coverage.percentage, "coverage.percentage");
  if (percentage !== null && percentage > 100) {
    return gatewayFailure("coverage.percentage");
  }

  const rawIndicators = asRecord(row.indicators, "indicators");
  const indicators: Record<string, number | null> = {};
  for (const [key, indicator] of Object.entries(rawIndicators)) {
    if (indicator === null) indicators[key] = null;
    else if (typeof indicator === "number" && Number.isFinite(indicator)) indicators[key] = indicator;
    else return gatewayFailure(`indicators.${key}`);
  }

  return {
    sectionId,
    versionId,
    source: { provider: "INEGI", datasetKey, censusYear },
    status,
    coverage: {
      includedLocalities: asNonnegativeInteger(
        coverage.includedLocalities,
        "coverage.includedLocalities"
      ),
      pendingLocalities: asNonnegativeInteger(
        coverage.pendingLocalities,
        "coverage.pendingLocalities"
      ),
      includedPopulation: asNullableNumber(
        coverage.includedPopulation,
        "coverage.includedPopulation"
      ),
      pendingPopulationReference: asNullableNumber(
        coverage.pendingPopulationReference,
        "coverage.pendingPopulationReference"
      ),
      percentage,
      isAdditive: false,
    },
    indicators,
  };
}

export async function getVersionedSectionDemographics(
  invoke: DemografiaRpcInvoker,
  input: DemografiaSectionInput
): Promise<DemografiaSeccionResponse> {
  const result = await invoke("rpc_demografia_seccion", {
    p_seccion_id: input.sectionId,
    p_cartografia_version_id: input.versionId,
    p_anio_censal: input.censusYear,
  });
  if (result.error) throw new DemografiaGatewayError(new Error(result.error.message));
  if (!Array.isArray(result.data)) return gatewayFailure("coleccion");
  if (result.data.length === 0) return unavailable(input);
  if (result.data.length !== 1) return gatewayFailure("multiples filas");
  return normalizeRow(result.data[0], input);
}
