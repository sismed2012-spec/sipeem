import type {
  ListaNominalCounts,
  ListaNominalSeccionResponse,
} from "./lista-nominal-types";

export class ListaNominalInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "ListaNominalInputError";
  }
}

export class ListaNominalGatewayError extends Error {
  readonly status = 502;
  override readonly cause: Error;

  constructor(cause: Error) {
    super("No se pudo consultar la lista nominal");
    this.name = "ListaNominalGatewayError";
    this.cause = cause;
  }
}

interface ListaNominalRpcError {
  message: string;
  code?: string;
}

interface ListaNominalRpcResult {
  data: unknown;
  error: ListaNominalRpcError | null;
}

export type ListaNominalRpcInvoker = (
  functionName: "rpc_lista_nominal_seccion",
  args: {
    p_seccion_id: number;
    p_cartografia_version_id: number;
    p_fecha_corte: string | null;
  },
) => PromiseLike<ListaNominalRpcResult>;

export interface ListaNominalSectionInput {
  sectionId: number;
  versionId: number;
  cutoffDate: string | null;
}

function parsePositiveInteger(
  raw: string | null | undefined,
  name: string,
): number {
  const value = raw?.trim() ?? "";
  if (!value) throw new ListaNominalInputError(`${name} es obligatorio`);
  if (!/^\d+$/.test(value)) {
    throw new ListaNominalInputError(`${name} debe ser un entero positivo`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new ListaNominalInputError(`${name} debe ser un entero positivo`);
  }
  return parsed;
}

function parseIsoDate(raw: string | null): string | null {
  if (raw === null) return null;
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ListaNominalInputError("cutoffDate debe usar el formato YYYY-MM-DD");
  }
  const year = Number(value.slice(0, 4));
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    year < 1900 ||
    year > 2200 ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new ListaNominalInputError("cutoffDate no es una fecha válida");
  }
  return value;
}

export function parseListaNominalSectionParams(
  sectionId: string,
  searchParams: URLSearchParams,
): ListaNominalSectionInput {
  return {
    sectionId: parsePositiveInteger(sectionId, "seccionId"),
    versionId: parsePositiveInteger(searchParams.get("versionId"), "versionId"),
    cutoffDate: parseIsoDate(searchParams.get("cutoffDate")),
  };
}

function gatewayFailure(message: string): never {
  throw new ListaNominalGatewayError(
    new Error(`Respuesta RPC de lista nominal inválida: ${message}`),
  );
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

function normalizeCounts(value: unknown, context: string): ListaNominalCounts {
  const counts = asRecord(value, context);
  const normalized = {
    men: asNonnegativeInteger(counts.men, `${context}.men`),
    women: asNonnegativeInteger(counts.women, `${context}.women`),
    nonBinary: asNonnegativeInteger(counts.nonBinary, `${context}.nonBinary`),
    total: asNonnegativeInteger(counts.total, `${context}.total`),
  };
  if (
    normalized.total !==
    normalized.men + normalized.women + normalized.nonBinary
  ) {
    return gatewayFailure(`${context}.total`);
  }
  return normalized;
}

function unavailable(
  input: ListaNominalSectionInput,
): ListaNominalSeccionResponse {
  return {
    sectionId: input.sectionId,
    versionId: input.versionId,
    cutoffDate: input.cutoffDate,
    source: null,
    status: "UNAVAILABLE",
    padron: null,
    nominal: null,
    difference: null,
    coverage: null,
  };
}

function normalizeRow(
  value: unknown,
  input: ListaNominalSectionInput,
): ListaNominalSeccionResponse {
  const row = asRecord(value, "fila");
  const sectionId = asPositiveInteger(row.section_id, "section_id");
  const versionId = asPositiveInteger(row.version_id, "version_id");
  if (sectionId !== input.sectionId || versionId !== input.versionId) {
    return gatewayFailure("identidad sección/versión");
  }
  if (row.status !== "AVAILABLE") return gatewayFailure("status");

  const cutoffDate = parseIsoDate(
    typeof row.cutoff_date === "string" ? row.cutoff_date : null,
  );
  if (!cutoffDate || (input.cutoffDate && cutoffDate !== input.cutoffDate)) {
    return gatewayFailure("cutoff_date");
  }

  const rawSource = asRecord(row.source, "source");
  const fileName =
    typeof rawSource.fileName === "string" ? rawSource.fileName.trim() : "";
  const sha256 =
    typeof rawSource.sha256 === "string" ? rawSource.sha256 : "";
  if (
    rawSource.provider !== "INE" ||
    !fileName ||
    !/^[0-9a-f]{64}$/.test(sha256)
  ) {
    return gatewayFailure("source");
  }

  const padron = normalizeCounts(row.padron, "padron");
  const nominal = normalizeCounts(row.nominal, "nominal");
  const difference = asNonnegativeInteger(row.difference, "difference");
  if (difference !== padron.total - nominal.total) {
    return gatewayFailure("difference");
  }
  const coverage =
    typeof row.coverage === "number" ? row.coverage : Number(row.coverage);
  const expectedCoverage =
    padron.total === 0 ? 0 : (nominal.total / padron.total) * 100;
  if (
    !Number.isFinite(coverage) ||
    coverage < 0 ||
    coverage > 100 ||
    Math.abs(coverage - expectedCoverage) > 1e-7
  ) {
    return gatewayFailure("coverage");
  }

  return {
    sectionId,
    versionId,
    cutoffDate,
    source: { provider: "INE", fileName, sha256 },
    status: "AVAILABLE",
    padron,
    nominal,
    difference,
    coverage,
  };
}

export async function getVersionedNominalList(
  invoke: ListaNominalRpcInvoker,
  input: ListaNominalSectionInput,
): Promise<ListaNominalSeccionResponse> {
  const result = await invoke("rpc_lista_nominal_seccion", {
    p_seccion_id: input.sectionId,
    p_cartografia_version_id: input.versionId,
    p_fecha_corte: input.cutoffDate,
  });
  if (result.error) {
    throw new ListaNominalGatewayError(new Error(result.error.message));
  }
  if (!Array.isArray(result.data)) return gatewayFailure("colección");
  if (result.data.length === 0) return unavailable(input);
  if (result.data.length !== 1) return gatewayFailure("múltiples filas");
  return normalizeRow(result.data[0], input);
}
