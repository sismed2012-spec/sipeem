import { cache } from "react";

const FEATURE_SERVER_URL = (() => {
  const url = process.env.ARCGIS_FEATURE_SERVER_URL?.trim();
  return url?.replace(/\/+$/, "") ?? "";
})();

export const LAYER_IDS = {
  distrito_federal: 0,
  distrito_local: 1,
  entidad: 2,
  municipio: 3,
  seccion: 4,
} as const;

export type ArcGISLayerKey = keyof typeof LAYER_IDS;

export function getArcGISPortalUrl() {
  return (
    process.env.ARCGIS_PORTAL_URL?.trim() || "https://www.arcgis.com"
  ).replace(/\/+$/, "");
}

export function getArcGISAuthMode() {
  return process.env.ARCGIS_AUTH_MODE?.trim() || "none";
}

export function isArcGISEnabled() {
  return !!process.env.ARCGIS_FEATURE_SERVER_URL?.trim();
}

export function isArcGISLayer(s: string): s is ArcGISLayerKey {
  return s in LAYER_IDS;
}

// ── Token cache (module-level — survives across requests in the same process) ─
let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function resolveToken(): Promise<string> {
  const mode = getArcGISAuthMode();

  if (mode === "token") {
    return process.env.ARCGIS_TOKEN?.trim() ?? "";
  }

  if (mode === "client_credentials") {
    const now = Date.now();
    if (_cachedToken && now < _tokenExpiresAt - 5 * 60 * 1000) {
      return _cachedToken;
    }
    const portalUrl = getArcGISPortalUrl();
    const body = new URLSearchParams({
      client_id: process.env.ARCGIS_CLIENT_ID ?? "",
      client_secret: process.env.ARCGIS_CLIENT_SECRET ?? "",
      grant_type: "client_credentials",
    });
    const res = await fetch(`${portalUrl}/sharing/rest/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    const json = await res.json();
    if (json.error || !json.access_token) {
      throw new Error(
        `ArcGIS token error: ${json.error?.message ?? "sin access_token"}`
      );
    }
    _cachedToken = json.access_token as string;
    _tokenExpiresAt = now + (json.expires_in as number) * 1000;
    return _cachedToken;
  }

  return "";
}

// ── Core query ────────────────────────────────────────────────────────────────
export async function queryLayer(
  layer: ArcGISLayerKey,
  params?: {
    where?: string;
    outFields?: string;
    returnGeometry?: boolean;
    outSR?: number;
    resultRecordCount?: number;
    resultOffset?: number;
  }
): Promise<GeoJSON.FeatureCollection> {
  if (!FEATURE_SERVER_URL) {
    throw new Error(
      "ARCGIS_FEATURE_SERVER_URL no está definida. Configura las variables de entorno ArcGIS."
    );
  }

  const url = new URL(`${FEATURE_SERVER_URL}/${LAYER_IDS[layer]}/query`);
  url.searchParams.set("f", "geojson");
  url.searchParams.set("where", params?.where ?? "1=1");
  url.searchParams.set("outFields", params?.outFields ?? "*");
  url.searchParams.set("returnGeometry", String(params?.returnGeometry ?? true));
  url.searchParams.set("outSR", String(params?.outSR ?? 4326));
  if (params?.resultRecordCount != null) {
    url.searchParams.set("resultRecordCount", String(params.resultRecordCount));
  }
  if (params?.resultOffset != null) {
    url.searchParams.set("resultOffset", String(params.resultOffset));
  }

  const token = await resolveToken();
  if (token) url.searchParams.set("token", token);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const json = await res.json();

  if (json.error) {
    const code: number = json.error.code;
    if (code === 498 || code === 499) {
      throw new Error("Token ArcGIS inválido");
    }
    throw new Error(json.error.message ?? "Error ArcGIS desconocido");
  }

  if (!res.ok) {
    throw new Error(`ArcGIS HTTP ${res.status}`);
  }

  return json as GeoJSON.FeatureCollection;
}

// ── Cached wrapper for base map (reused within a single React request) ────────
export const getBaseMapData = cache(() =>
  queryLayer("municipio", { outFields: "*", returnGeometry: true, outSR: 4326 })
);
