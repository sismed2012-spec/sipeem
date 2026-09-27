export class CartografiaInputError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = "CartografiaInputError";
  }
}

export class CartografiaGatewayError extends Error {
  readonly status = 502;
  override readonly cause: Error;

  constructor(cause: Error) {
    super("No se pudo consultar la cartografia");
    this.name = "CartografiaGatewayError";
    this.cause = cause;
  }
}

interface CartografiaRpcError {
  message: string;
  code?: string;
}

interface CartografiaRpcResult {
  data: unknown;
  error: CartografiaRpcError | null;
}

export type CartografiaRpcInvoker = (
  functionName: string,
  args?: Record<string, unknown>
) => PromiseLike<CartografiaRpcResult>;

export interface CartografiaVersion {
  id: number;
  key: string;
  name: string;
  state: string;
  cutoffDate: string | null;
  publicationDate: string | null;
  expectedPublicationDate: string | null;
  validFrom: string | null;
  validUntil: string | null;
  isDefault: boolean;
  counts: Record<string, number>;
}

export interface CartografiaViewportInput {
  versionId: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  municipio: string | null;
  limit: number;
}

export interface CartografiaResolverInput {
  versionId: number;
  lat: number;
  lon: number;
}

function requiredNumber(params: URLSearchParams, name: string): number {
  const raw = params.get(name)?.trim();
  if (!raw) throw new CartografiaInputError(`${name} es obligatorio`);

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new CartografiaInputError(`${name} debe ser numerico`);
  }
  return value;
}

function positiveInteger(params: URLSearchParams, name: string): number {
  const value = requiredNumber(params, name);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CartografiaInputError(`${name} debe ser un entero positivo`);
  }
  return value;
}

export function parseViewportParams(
  params: URLSearchParams
): CartografiaViewportInput {
  const versionId = positiveInteger(params, "versionId");
  const minLon = requiredNumber(params, "minLon");
  const minLat = requiredNumber(params, "minLat");
  const maxLon = requiredNumber(params, "maxLon");
  const maxLat = requiredNumber(params, "maxLat");

  if (minLon < -180 || maxLon > 180 || minLon >= maxLon) {
    throw new CartografiaInputError("rango de longitud invalido");
  }
  if (minLat < -90 || maxLat > 90 || minLat >= maxLat) {
    throw new CartografiaInputError("rango de latitud invalido");
  }
  if (maxLon - minLon > 5 || maxLat - minLat > 5) {
    throw new CartografiaInputError("bbox excede la ventana maxima de 5 grados");
  }

  const municipioRaw = params.get("municipio")?.trim() ?? "";
  if (municipioRaw && !/^\d{3}$/.test(municipioRaw)) {
    throw new CartografiaInputError("municipio debe tener tres digitos");
  }

  const limitRaw = params.get("limit")?.trim();
  const limit = limitRaw ? Number(limitRaw) : 5000;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) {
    throw new CartografiaInputError("limit debe estar entre 1 y 10000");
  }

  return {
    versionId,
    minLon,
    minLat,
    maxLon,
    maxLat,
    municipio: municipioRaw || null,
    limit,
  };
}

export function parseResolverParams(
  params: URLSearchParams
): CartografiaResolverInput {
  const versionId = positiveInteger(params, "versionId");
  const lat = requiredNumber(params, "lat");
  const lon = requiredNumber(params, "lon");

  if (lat < -90 || lat > 90) {
    throw new CartografiaInputError("lat debe estar entre -90 y 90");
  }
  if (lon < -180 || lon > 180) {
    throw new CartografiaInputError("lon debe estar entre -180 y 180");
  }

  return { versionId, lat, lon };
}

function throwIfRpcFailed(result: CartografiaRpcResult): void {
  if (result.error) {
    throw new CartografiaGatewayError(new Error(result.error.message));
  }
}

function asRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CartografiaGatewayError(
      new Error(`Respuesta RPC invalida: ${context}`)
    );
  }
  return value as Record<string, unknown>;
}

function asGeometry(value: unknown): GeoJSON.Geometry {
  const geometry = asRecord(value, "geometry");
  if (typeof geometry.type !== "string") {
    throw new CartografiaGatewayError(
      new Error("Respuesta RPC invalida: geometry.type")
    );
  }
  return geometry as unknown as GeoJSON.Geometry;
}

export async function listCartografiaVersions(
  invoke: CartografiaRpcInvoker
): Promise<CartografiaVersion[]> {
  const result = await invoke("rpc_listar_versiones_cartograficas");
  throwIfRpcFailed(result);
  if (!Array.isArray(result.data)) {
    throw new CartografiaGatewayError(
      new Error("Respuesta RPC invalida: catalogo")
    );
  }

  return result.data.map((value) => {
    const row = asRecord(value, "version");
    return {
      id: Number(row.cartografia_version_id),
      key: String(row.clave),
      name: String(row.nombre),
      state: String(row.estado),
      cutoffDate: (row.fecha_corte as string | null) ?? null,
      publicationDate: (row.fecha_publicacion as string | null) ?? null,
      expectedPublicationDate:
        (row.fecha_publicacion_esperada as string | null) ?? null,
      validFrom: (row.vigente_desde as string | null) ?? null,
      validUntil: (row.vigente_hasta as string | null) ?? null,
      isDefault: row.es_predeterminada === true,
      counts: asRecord(row.conteos ?? {}, "conteos") as Record<string, number>,
    };
  });
}

export async function getVersionedSections(
  invoke: CartografiaRpcInvoker,
  input: CartografiaViewportInput
): Promise<GeoJSON.FeatureCollection> {
  const result = await invoke("rpc_secciones_en_vista", {
    p_cartografia_version_id: input.versionId,
    p_clave_municipio: input.municipio,
    p_min_long: input.minLon,
    p_min_lat: input.minLat,
    p_max_long: input.maxLon,
    p_max_lat: input.maxLat,
    p_limite: input.limit,
  });
  throwIfRpcFailed(result);
  if (!Array.isArray(result.data)) {
    throw new CartografiaGatewayError(
      new Error("Respuesta RPC invalida: secciones")
    );
  }

  return {
    type: "FeatureCollection",
    features: result.data.map((value) => {
      const row = asRecord(value, "seccion");
      const geometry = asGeometry(row.geometry);
      return {
        type: "Feature",
        id: Number(row.cartografia_seccion_id),
        geometry,
        properties: {
          cartografia_version_id: input.versionId,
          cartografia_seccion_id: Number(row.cartografia_seccion_id),
          seccion_id: Number(row.seccion_id),
          CVE_MUN: String(row.CVE_MUN),
          CVEGEO: String(row.CVEGEO),
          MUNICIPIO: Number(row.MUNICIPIO),
          SECCION: Number(row.SECCION),
          tipo: row.tipo == null ? null : Number(row.tipo),
        },
      } satisfies GeoJSON.Feature;
    }),
  };
}

export async function resolveVersionedTerritory(
  invoke: CartografiaRpcInvoker,
  input: CartografiaResolverInput
): Promise<Record<string, unknown>> {
  const result = await invoke("rpc_resolver_territorio_version", {
    p_latitud: input.lat,
    p_longitud: input.lon,
    p_cartografia_version_id: input.versionId,
  });
  throwIfRpcFailed(result);
  return asRecord(result.data, "resolucion territorial");
}
