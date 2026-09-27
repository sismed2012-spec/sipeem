export type DemografiaPendingStatus =
  | "MULTISECCION"
  | "REVISION_MANUAL"
  | "SIN_CORRESPONDENCIA";

export interface DemografiaReviewInput {
  versionId: number | null;
  status: DemografiaPendingStatus | null;
  municipality: string | null;
  search: string | null;
  limit: number;
  offset: number;
}

export interface DemografiaReviewVersion {
  id: number;
  key: string;
  state: string;
  isDefault: boolean;
}

export interface DemografiaReviewCandidate {
  sectionId: number;
  cartographicSectionId: number;
  number: number;
  municipalityKey: string;
  municipalityName: string;
  contactType: "AREA" | "BORDE";
  intersectionArea: number;
  proportion: number;
  evidence: Record<string, unknown>;
}

export interface DemografiaReviewItem {
  correspondenceId: number;
  status: DemografiaPendingStatus;
  method: string;
  candidateCount: number;
  strictCoverage: boolean;
  distanceMeters: number | null;
  nameSimilarity: number | null;
  confidence: number;
  evidence: Record<string, unknown>;
  locality: {
    id: number;
    stateKey: string;
    municipalityKey: string;
    localityKey: string;
    municipalityName: string;
    name: string;
    population: number | null;
    latitude: number;
    longitude: number;
  };
  cartographicLocality: {
    id: number;
    name: string;
  } | null;
  candidates: DemografiaReviewCandidate[];
}

export interface DemografiaReviewResponse {
  selectedVersion: DemografiaReviewVersion;
  versions: DemografiaReviewVersion[];
  source: {
    id: number;
    provider: "INEGI";
    datasetKey: string;
    censusYear: number;
  };
  summary: {
    totalPending: number;
    multisection: number;
    manualReview: number;
    unmatched: number;
  };
  municipalities: Array<{ key: string; name: string; pending: number }>;
  items: DemografiaReviewItem[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

interface DemografiaReviewRpcResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

export type DemografiaReviewRpcInvoker = (
  functionName: "rpc_demografia_revision_bandeja",
  args: {
    p_cartografia_version_id: number | null;
    p_estado: DemografiaPendingStatus | null;
    p_clave_municipio: string | null;
    p_busqueda: string | null;
    p_limite: number;
    p_offset: number;
  }
) => PromiseLike<DemografiaReviewRpcResult>;

export class DemografiaReviewInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "DemografiaReviewInputError";
  }
}

export class DemografiaReviewGatewayError extends Error {
  readonly status = 502;
  override readonly cause: Error;

  constructor(cause: Error) {
    super("No se pudo consultar la bandeja demografica");
    this.name = "DemografiaReviewGatewayError";
    this.cause = cause;
  }
}

const PENDING_STATUSES: DemografiaPendingStatus[] = [
  "MULTISECCION",
  "REVISION_MANUAL",
  "SIN_CORRESPONDENCIA",
];

function optionalPositiveInteger(raw: string | null, name: string): number | null {
  const value = raw?.trim() ?? "";
  if (!value) return null;
  if (!/^\d+$/.test(value)) {
    throw new DemografiaReviewInputError(`${name} debe ser un entero positivo`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new DemografiaReviewInputError(`${name} debe ser un entero positivo`);
  }
  return parsed;
}

function boundedInteger(
  raw: string | null,
  name: string,
  defaultValue: number,
  minimum: number,
  maximum: number
): number {
  const value = raw?.trim() ?? "";
  if (!value) return defaultValue;
  if (!/^\d+$/.test(value)) {
    throw new DemografiaReviewInputError(`${name} debe ser un entero`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new DemografiaReviewInputError(
      `${name} debe estar entre ${minimum} y ${maximum}`
    );
  }
  return parsed;
}

export function parseDemografiaReviewParams(
  params: URLSearchParams
): DemografiaReviewInput {
  const statusRaw = params.get("status")?.trim() ?? "";
  if (statusRaw && !PENDING_STATUSES.includes(statusRaw as DemografiaPendingStatus)) {
    throw new DemografiaReviewInputError("status no es revisable");
  }

  const municipalityRaw = params.get("municipality")?.trim() ?? "";
  if (municipalityRaw && !/^\d{3}$/.test(municipalityRaw)) {
    throw new DemografiaReviewInputError(
      "municipality debe tener tres digitos"
    );
  }

  const searchRaw = params.get("search")?.trim() ?? "";
  if (searchRaw.length > 100) {
    throw new DemografiaReviewInputError("search admite hasta 100 caracteres");
  }

  return {
    versionId: optionalPositiveInteger(params.get("versionId"), "versionId"),
    status: (statusRaw || null) as DemografiaPendingStatus | null,
    municipality: municipalityRaw || null,
    search: searchRaw || null,
    limit: boundedInteger(params.get("limit"), "limit", 50, 1, 100),
    offset: boundedInteger(
      params.get("offset"),
      "offset",
      0,
      0,
      Number.MAX_SAFE_INTEGER
    ),
  };
}

function invalid(context: string): never {
  throw new DemografiaReviewGatewayError(
    new Error(`Respuesta RPC invalida: ${context}`)
  );
}

function record(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid(context);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) return invalid(context);
  return value;
}

function stringValue(value: unknown, context: string): string {
  if (typeof value !== "string" || !value.trim()) return invalid(context);
  return value.trim();
}

function integer(value: unknown, context: string, minimum = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) return invalid(context);
  return parsed;
}

function numberValue(
  value: unknown,
  context: string,
  minimum = 0,
  maximum = Number.POSITIVE_INFINITY
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    return invalid(context);
  }
  return parsed;
}

function nullableNumber(value: unknown, context: string): number | null {
  return value === null ? null : numberValue(value, context);
}

function booleanValue(value: unknown, context: string): boolean {
  if (typeof value !== "boolean") return invalid(context);
  return value;
}

function jsonObject(value: unknown, context: string): Record<string, unknown> {
  return record(value, context);
}

function version(value: unknown, context: string): DemografiaReviewVersion {
  const row = record(value, context);
  return {
    id: integer(row.id, `${context}.id`, 1),
    key: stringValue(row.key, `${context}.key`),
    state: stringValue(row.state, `${context}.state`),
    isDefault: booleanValue(row.isDefault, `${context}.isDefault`),
  };
}

function candidate(value: unknown, context: string): DemografiaReviewCandidate {
  const row = record(value, context);
  const contactType = stringValue(row.contactType, `${context}.contactType`);
  if (contactType !== "AREA" && contactType !== "BORDE") {
    return invalid(`${context}.contactType`);
  }
  const municipalityKey = stringValue(
    row.municipalityKey,
    `${context}.municipalityKey`
  );
  if (!/^\d{3}$/.test(municipalityKey)) {
    return invalid(`${context}.municipalityKey`);
  }
  return {
    sectionId: integer(row.sectionId, `${context}.sectionId`, 1),
    cartographicSectionId: integer(
      row.cartographicSectionId,
      `${context}.cartographicSectionId`,
      1
    ),
    number: integer(row.number, `${context}.number`, 1),
    municipalityKey,
    municipalityName: stringValue(
      row.municipalityName,
      `${context}.municipalityName`
    ),
    contactType,
    intersectionArea: numberValue(
      row.intersectionArea,
      `${context}.intersectionArea`
    ),
    proportion: numberValue(row.proportion, `${context}.proportion`, 0, 1),
    evidence: jsonObject(row.evidence, `${context}.evidence`),
  };
}

function item(value: unknown, context: string): DemografiaReviewItem {
  const row = record(value, context);
  const status = stringValue(row.status, `${context}.status`);
  if (!PENDING_STATUSES.includes(status as DemografiaPendingStatus)) {
    return invalid(`${context}.status`);
  }
  const locality = record(row.locality, `${context}.locality`);
  const stateKey = stringValue(locality.stateKey, `${context}.locality.stateKey`);
  const municipalityKey = stringValue(
    locality.municipalityKey,
    `${context}.locality.municipalityKey`
  );
  const localityKey = stringValue(
    locality.localityKey,
    `${context}.locality.localityKey`
  );
  if (!/^\d{2}$/.test(stateKey) || !/^\d{3}$/.test(municipalityKey)
    || !/^\d{4}$/.test(localityKey)) {
    return invalid(`${context}.locality.keys`);
  }

  const rawCandidates = array(row.candidates, `${context}.candidates`);
  const candidates = rawCandidates.map((entry, index) =>
    candidate(entry, `${context}.candidates.${index}`)
  );
  const candidateCount = integer(
    row.candidateCount,
    `${context}.candidateCount`
  );
  if (candidates.length !== candidateCount) {
    return invalid(`${context}.candidateCount`);
  }

  let cartographicLocality: DemografiaReviewItem["cartographicLocality"] = null;
  if (row.cartographicLocality !== null) {
    const cartographic = record(
      row.cartographicLocality,
      `${context}.cartographicLocality`
    );
    cartographicLocality = {
      id: integer(cartographic.id, `${context}.cartographicLocality.id`, 1),
      name: stringValue(
        cartographic.name,
        `${context}.cartographicLocality.name`
      ),
    };
  }

  return {
    correspondenceId: integer(
      row.correspondenceId,
      `${context}.correspondenceId`,
      1
    ),
    status: status as DemografiaPendingStatus,
    method: stringValue(row.method, `${context}.method`),
    candidateCount,
    strictCoverage: booleanValue(
      row.strictCoverage,
      `${context}.strictCoverage`
    ),
    distanceMeters: nullableNumber(
      row.distanceMeters,
      `${context}.distanceMeters`
    ),
    nameSimilarity: row.nameSimilarity === null
      ? null
      : numberValue(
          row.nameSimilarity,
          `${context}.nameSimilarity`,
          0,
          1
        ),
    confidence: numberValue(row.confidence, `${context}.confidence`, 0, 1),
    evidence: jsonObject(row.evidence, `${context}.evidence`),
    locality: {
      id: integer(locality.id, `${context}.locality.id`, 1),
      stateKey,
      municipalityKey,
      localityKey,
      municipalityName: stringValue(
        locality.municipalityName,
        `${context}.locality.municipalityName`
      ),
      name: stringValue(locality.name, `${context}.locality.name`),
      population: nullableNumber(
        locality.population,
        `${context}.locality.population`
      ),
      latitude: numberValue(
        locality.latitude,
        `${context}.locality.latitude`,
        -90,
        90
      ),
      longitude: numberValue(
        locality.longitude,
        `${context}.locality.longitude`,
        -180,
        180
      ),
    },
    cartographicLocality,
    candidates,
  };
}

function normalize(
  value: unknown,
  input: DemografiaReviewInput
): DemografiaReviewResponse {
  const row = record(value, "root");
  const selectedVersion = version(row.selectedVersion, "selectedVersion");
  if (input.versionId !== null && selectedVersion.id !== input.versionId) {
    return invalid("selectedVersion.id");
  }

  const versions = array(row.versions, "versions").map((entry, index) =>
    version(entry, `versions.${index}`)
  );
  if (!versions.some(({ id }) => id === selectedVersion.id)) {
    return invalid("versions.selected");
  }

  const source = record(row.source, "source");
  if (source.provider !== "INEGI") return invalid("source.provider");
  const summary = record(row.summary, "summary");
  const totalPending = integer(summary.totalPending, "summary.totalPending");
  const multisection = integer(summary.multisection, "summary.multisection");
  const manualReview = integer(summary.manualReview, "summary.manualReview");
  const unmatched = integer(summary.unmatched, "summary.unmatched");
  if (totalPending !== multisection + manualReview + unmatched) {
    return invalid("summary.totalPending");
  }

  const municipalities = array(row.municipalities, "municipalities").map(
    (entry, index) => {
      const municipality = record(entry, `municipalities.${index}`);
      const key = stringValue(municipality.key, `municipalities.${index}.key`);
      if (!/^\d{3}$/.test(key)) return invalid(`municipalities.${index}.key`);
      return {
        key,
        name: stringValue(municipality.name, `municipalities.${index}.name`),
        pending: integer(municipality.pending, `municipalities.${index}.pending`),
      };
    }
  );

  const items = array(row.items, "items").map((entry, index) =>
    item(entry, `items.${index}`)
  );
  const pagination = record(row.pagination, "pagination");
  const offset = integer(pagination.offset, "pagination.offset");
  const limit = integer(pagination.limit, "pagination.limit", 1);
  const total = integer(pagination.total, "pagination.total");
  const hasMore = booleanValue(pagination.hasMore, "pagination.hasMore");
  if (offset !== input.offset || limit !== input.limit || items.length > limit) {
    return invalid("pagination.request");
  }
  if (hasMore !== (offset + items.length < total)) {
    return invalid("pagination.hasMore");
  }

  return {
    selectedVersion,
    versions,
    source: {
      id: integer(source.id, "source.id", 1),
      provider: "INEGI",
      datasetKey: stringValue(source.datasetKey, "source.datasetKey"),
      censusYear: integer(source.censusYear, "source.censusYear", 1900),
    },
    summary: { totalPending, multisection, manualReview, unmatched },
    municipalities,
    items,
    pagination: { offset, limit, total, hasMore },
  };
}

export async function getDemografiaReviewQueue(
  invoke: DemografiaReviewRpcInvoker,
  input: DemografiaReviewInput
): Promise<DemografiaReviewResponse> {
  const result = await invoke("rpc_demografia_revision_bandeja", {
    p_cartografia_version_id: input.versionId,
    p_estado: input.status,
    p_clave_municipio: input.municipality,
    p_busqueda: input.search,
    p_limite: input.limit,
    p_offset: input.offset,
  });
  if (result.error) {
    throw new DemografiaReviewGatewayError(new Error(result.error.message));
  }
  return normalize(result.data, input);
}
