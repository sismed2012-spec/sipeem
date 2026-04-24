# ArcGIS Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static GeoJSON with live ArcGIS FeatureServer data and add overlay layers + click popups to the electoral map.

**Architecture:** Server-side `queryLayer()` in `src/lib/arcgis.ts` handles OAuth2 token management and GeoJSON fetches from the FeatureServer. Client-side overlay loading goes through `/api/arcgis/[layer]`, which proxies to the same lib. Three new components (LayerPanel, MunicipioPopup, SeccionPopup) are wired into the existing ElectoralMapContainer and EdomexInteractiveMap.

**Tech Stack:** Next.js 16 App Router, Supabase, React `cache()`, ArcGIS REST FeatureServer, OAuth2 Client Credentials, GeoJSON/SVG rendering

---

## File Map

**Modify:**
- `src/lib/arcgis.ts` — complete rewrite: LAYER_IDS, `queryLayer()`, OAuth2 token cache
- `src/app/api/arcgis/[layer]/route.ts` — use `isArcGISLayer` + `queryLayer`, outSR default, seccion guard
- `src/app/api/arcgis/catalog/route.ts` — remove old layer catalog, use hardcoded layer list
- `.env.local.example` — swap per-layer URLs for `ARCGIS_FEATURE_SERVER_URL` + client credentials vars
- `src/app/(protected)/mapa/page.tsx` — replace `readFile` with `getBaseMapData()`
- `src/components/analytics/ElectoralMapContainer.tsx` — add overlay state + layer panel + popup wiring
- `src/components/analytics/EdomexInteractiveMap.tsx` — add overlay rendering + popup click handlers
- `src/actions/estructura.ts` — add `getEstructuraResumenByMunicipio()`, `getEstructuraBySeccion()`

**Create:**
- `src/components/analytics/LayerPanel.tsx` — floating overlay toggle panel
- `src/components/analytics/MunicipioPopup.tsx` — 3-tab popup for municipio click
- `src/components/analytics/SeccionPopup.tsx` — popup for seccion click

**Delete (after final validation):**
- `public/maps/edomex_municipios_wgs84.geojson`

---

### Task 1: Refactor src/lib/arcgis.ts

**Files:**
- Modify: `src/lib/arcgis.ts`

- [ ] **Step 1: Replace the entire file**

```ts
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

If `GeoJSON.FeatureCollection` is not found, install the types: `npm install --save-dev @types/geojson`.

Expected: no errors in `src/lib/arcgis.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/arcgis.ts
git commit -m "refactor(arcgis): replace per-layer env vars with single FeatureServer URL + LAYER_IDS"
```

---

### Task 2: Update /api/arcgis/[layer]/route.ts

**Files:**
- Modify: `src/app/api/arcgis/[layer]/route.ts`

- [ ] **Step 1: Replace the route handler**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getUsuarioActual } from "@/actions/auth";
import { isArcGISEnabled, isArcGISLayer, queryLayer } from "@/lib/arcgis";

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/arcgis/[layer]">
) {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!isArcGISEnabled()) {
    return NextResponse.json({ error: "ArcGIS no configurado" }, { status: 503 });
  }

  const { layer } = await context.params;
  if (!isArcGISLayer(layer)) {
    return NextResponse.json(
      {
        error: `Capa '${layer}' no existe. Válidas: distrito_federal, distrito_local, entidad, municipio, seccion`,
      },
      { status: 404 }
    );
  }

  const sp = request.nextUrl.searchParams;
  const where = sp.get("where") ?? undefined;

  if (layer === "seccion" && !where) {
    return NextResponse.json(
      { error: "Agrega filtro where para consultar secciones (ej. ?where=CVE_MUN=106)" },
      { status: 400 }
    );
  }

  const params = {
    where,
    outFields: sp.get("outFields") ?? undefined,
    returnGeometry: sp.has("returnGeometry")
      ? sp.get("returnGeometry") !== "false"
      : true,
    outSR: sp.has("outSR") ? Number(sp.get("outSR")) : 4326,
    resultRecordCount: layer === "seccion" ? 2000 : undefined,
    resultOffset: sp.has("resultOffset") ? Number(sp.get("resultOffset")) : undefined,
  };

  try {
    const data = await queryLayer(layer, params);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    if (msg.includes("Token ArcGIS inválido")) {
      return NextResponse.json({ error: "Token ArcGIS inválido" }, { status: 502 });
    }
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/arcgis/[layer]/route.ts
git commit -m "refactor(arcgis): update layer route — isArcGISLayer + queryLayer, outSR default, seccion guard"
```

---

### Task 3: Update /api/arcgis/catalog/route.ts

**Files:**
- Modify: `src/app/api/arcgis/catalog/route.ts`

- [ ] **Step 1: Replace the catalog handler**

```ts
import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/actions/auth";
import {
  isArcGISEnabled,
  getArcGISAuthMode,
  getArcGISPortalUrl,
} from "@/lib/arcgis";

const LAYER_INFO = [
  { key: "municipio", name: "Municipios", queryPath: "/api/arcgis/municipio" },
  { key: "seccion", name: "Secciones electorales", queryPath: "/api/arcgis/seccion" },
  { key: "distrito_federal", name: "Distritos Federales", queryPath: "/api/arcgis/distrito_federal" },
  { key: "distrito_local", name: "Distritos Locales", queryPath: "/api/arcgis/distrito_local" },
  { key: "entidad", name: "Entidad", queryPath: "/api/arcgis/entidad" },
] as const;

export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (!isArcGISEnabled()) {
    return NextResponse.json({
      enabled: false,
      message: "ArcGIS no configurado. Define ARCGIS_FEATURE_SERVER_URL en .env.local.",
      layers: [],
    });
  }

  return NextResponse.json({
    enabled: true,
    authMode: getArcGISAuthMode(),
    portalUrl: getArcGISPortalUrl(),
    layers: LAYER_INFO,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/arcgis/catalog/route.ts
git commit -m "refactor(arcgis): update catalog route — list all 5 hardcoded layers"
```

---

### Task 4: Update .env.local.example

**Files:**
- Modify: `.env.local.example`

- [ ] **Step 1: Replace the ArcGIS section (from `# ArcGIS` to end of file)**

Replace lines 17–36 with:

```
# ─── ArcGIS FeatureServer ─────────────────────────────────────────────────────
# URL base del FeatureServer. Sin barra al final.
ARCGIS_FEATURE_SERVER_URL=https://services1.arcgis.com/IgzKWPBqILuPKm5Y/arcgis/rest/services/Estado_de_México/FeatureServer

# Portal ArcGIS para el flujo OAuth2
ARCGIS_PORTAL_URL=https://www.arcgis.com

# Modo de autenticación:
# - client_credentials: producción — el servidor obtiene token automáticamente
# - token: solo para prueba local rápida (token temporal de 1 hora)
# - none: capas públicas sin token
ARCGIS_AUTH_MODE=client_credentials

# OAuth2 Client Credentials (producción)
# Obtener en ArcGIS Online → My Content → App → Credentials
ARCGIS_CLIENT_ID=your-client-id-here
ARCGIS_CLIENT_SECRET=your-client-secret-here

# Token temporal (solo con ARCGIS_AUTH_MODE=token — NO commitear el valor real)
# ARCGIS_TOKEN=your-temporary-token-here

# Habilitar el visor ArcGIS en la UI
NEXT_PUBLIC_ENABLE_ARCGIS_MAP=true
```

- [ ] **Step 2: Update `.env.local` on your machine (not committed)**

For quick local testing with a temporary token:
```
ARCGIS_FEATURE_SERVER_URL=https://services1.arcgis.com/IgzKWPBqILuPKm5Y/arcgis/rest/services/Estado_de_México/FeatureServer
ARCGIS_AUTH_MODE=token
ARCGIS_TOKEN=<tu-token-temporal-de-arcgis-online>
NEXT_PUBLIC_ENABLE_ARCGIS_MAP=true
```

For production (once token-mode is validated):
```
ARCGIS_AUTH_MODE=client_credentials
ARCGIS_CLIENT_ID=sUbLwzjLzl0QeQCT
ARCGIS_CLIENT_SECRET=<secreto-desde-arcgis-online>
```

Remove these deprecated keys from `.env.local`:
```
ARCGIS_LAYER_MUNICIPIOS_URL
ARCGIS_LAYER_SECCIONES_URL
ARCGIS_LAYER_PUBLICIDAD_URL
ARCGIS_LAYER_RUTAS_URL
```

- [ ] **Step 3: Commit the example file only**

```bash
git add .env.local.example
git commit -m "chore(env): update ArcGIS env vars — single FeatureServer URL, client_credentials flow"
```

---

### Task 5: Update mapa/page.tsx to use queryLayer

**Files:**
- Modify: `src/app/(protected)/mapa/page.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import { Suspense } from "react";
import { getUsuarioActual } from "@/actions/auth";
import { ElectoralMapContainer } from "@/components/analytics/ElectoralMapContainer";
import { getBaseMapData } from "@/lib/arcgis";

export default async function MapaPage() {
  const usuario = await getUsuarioActual();
  const isAnalytic = usuario?.rol === "admin" || usuario?.rol === "director";

  const geoData = await getBaseMapData();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50/50">
      <div className="p-6 border-b bg-white shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter flex items-center gap-2">
              Cartografía Territorial
              {isAnalytic && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-full">
                  <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" />
                  <span className="text-[9px] text-indigo-700 uppercase tracking-[0.2em] font-black">
                    IA Analítica Activa
                  </span>
                </div>
              )}
            </h1>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-1 opacity-70">
              {isAnalytic
                ? "Inteligencia Política y Visualización de Tendencias Municipales"
                : "Sistema de Información Geográfica SIPEEM"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <Suspense fallback={<MapSkeleton />}>
          <ElectoralMapContainer isAnalytic={isAnalytic} geoData={geoData} />
        </Suspense>
      </div>
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-12 bg-slate-50">
      <div className="w-full max-w-4xl h-[600px] rounded-[2rem] bg-white shadow-2xl border border-slate-200 animate-pulse flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 bg-slate-100 rounded-full" />
        <div className="h-4 w-48 bg-slate-100 rounded-full" />
        <div className="h-2 w-32 bg-slate-50 rounded-full" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Start the dev server and verify the map loads from ArcGIS**

```bash
npm run dev
```

Navigate to `http://localhost:3000/mapa` (must be logged in). Expected: map renders 125 municipios from ArcGIS.

**Critical — inspect ArcGIS field names** (needed for Tasks 8 and 10):
Open DevTools → Network → find the ArcGIS request → look at `features[0].properties`. Record the exact field names for:
- Municipality name (e.g., `NOMGEO`, `NOM_MUN`, `NOMBRE`)
- Geographic code (e.g., `CVEGEO`, `CVE_MUN`)
- Federal district (e.g., `CVE_DTO_FED`, `DTO_FED`)
- Local district (e.g., `CVE_DTO_LOC`, `DTO_LOC`)
- Nominal list (e.g., `NOM_LISTA`, `LISTA_NOM`)

You will update the field mappings in `arcgisPropsToMunicipio` (Task 10) with these exact names.

- [ ] **Step 3: Commit**

```bash
git add src/app/(protected)/mapa/page.tsx
git commit -m "feat(mapa): replace static GeoJSON readFile with live ArcGIS queryLayer"
```

---

### Task 6: Add structure summary actions to estructura.ts

**Files:**
- Modify: `src/actions/estructura.ts`

- [ ] **Step 1: Add the two exported functions and interfaces at the end of the file**

```ts
// ── Popup summary types ───────────────────────────────────────────────────────

export interface EstructuraResumen {
  promotores: number;
  secciones_total: number;
  compromisos: number;
  ultimo_evento: string | null;
}

export interface SeccionDetalle {
  promotor: string | null;
  compromisos: number;
  meta: number;
  ultimo_evento: string | null;
}

// ── Popup summary actions ─────────────────────────────────────────────────────

export async function getEstructuraResumenByMunicipio(
  municipioId: number
): Promise<EstructuraResumen> {
  await assertAdmin();
  const svc = createServiceClient();

  const [
    { count: promotoresCount },
    { count: seccionesCount },
    { count: compromisos },
    { data: ultimoEvento },
  ] = await Promise.all([
    svc
      .from("promotores")
      .select("*", { count: "exact", head: true })
      .eq("municipio_id", municipioId),
    svc
      .from("secciones")
      .select("*", { count: "exact", head: true })
      .eq("municipio_id", municipioId),
    svc
      .from("compromisos_seccion")
      .select("*", { count: "exact", head: true })
      .eq("municipio_id", municipioId),
    svc
      .from("compromisos_seccion")
      .select("fecha")
      .eq("municipio_id", municipioId)
      .order("fecha", { ascending: false })
      .limit(1),
  ]);

  return {
    promotores: promotoresCount ?? 0,
    secciones_total: seccionesCount ?? 0,
    compromisos: compromisos ?? 0,
    ultimo_evento: ultimoEvento?.[0]?.fecha ?? null,
  };
}

export async function getEstructuraBySeccion(
  municipioId: number,
  seccionNumero: number
): Promise<SeccionDetalle> {
  await assertAdmin();
  const svc = createServiceClient();

  const { data: seccion } = await svc
    .from("secciones")
    .select("id, meta, promotores(nombre)")
    .eq("municipio_id", municipioId)
    .eq("numero", seccionNumero)
    .single();

  if (!seccion) {
    return { promotor: null, compromisos: 0, meta: 0, ultimo_evento: null };
  }

  const { count: compromisos, data: ultimoEvento } = await svc
    .from("compromisos_seccion")
    .select("fecha", { count: "exact" })
    .eq("seccion_id", (seccion as any).id)
    .order("fecha", { ascending: false })
    .limit(1);

  return {
    promotor: (seccion as any).promotores?.nombre ?? null,
    compromisos: compromisos ?? 0,
    meta: (seccion as any).meta ?? 0,
    ultimo_evento: ultimoEvento?.[0]?.fecha ?? null,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/estructura.ts
git commit -m "feat(estructura): add getEstructuraResumenByMunicipio and getEstructuraBySeccion for map popups"
```

---

### Task 7: Create LayerPanel component

**Files:**
- Create: `src/components/analytics/LayerPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { cn } from "@/lib/utils";

export type OverlayKey =
  | "distrito_federal"
  | "distrito_local"
  | "entidad"
  | "seccion";

interface OverlayLayer {
  key: OverlayKey;
  label: string;
  color: string;
  lazy?: boolean;
}

const OVERLAY_LAYERS: OverlayLayer[] = [
  { key: "distrito_federal", label: "Dto. Federal", color: "#f59e0b" },
  { key: "distrito_local", label: "Dto. Local", color: "#8b5cf6" },
  { key: "entidad", label: "Entidad", color: "#06b6d4" },
  { key: "seccion", label: "Sección", color: "#10b981", lazy: true },
];

interface Props {
  activeOverlays: Set<OverlayKey>;
  onToggle: (key: OverlayKey) => void;
  hasMunicipioSelected: boolean;
}

export function LayerPanel({
  activeOverlays,
  onToggle,
  hasMunicipioSelected,
}: Props) {
  return (
    <div className="absolute top-4 right-4 z-20 bg-slate-900/95 backdrop-blur-sm rounded-xl p-3 shadow-2xl min-w-[140px] border border-slate-700/50">
      <div className="text-slate-400 text-[9px] uppercase tracking-[0.18em] font-bold mb-2.5">
        Capas
      </div>

      {/* Base — always on */}
      <div className="flex items-center gap-2 py-1.5 border-b border-slate-700/60 mb-1">
        <div className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0" />
        <span className="text-slate-200 text-[11px]">Municipio</span>
        <span className="text-slate-600 text-[9px] ml-auto">base</span>
      </div>

      {OVERLAY_LAYERS.map((layer) => {
        const active = activeOverlays.has(layer.key);
        const disabled = layer.lazy && !hasMunicipioSelected && !active;

        return (
          <button
            key={layer.key}
            onClick={() => !disabled && onToggle(layer.key)}
            title={disabled ? "Selecciona un municipio primero" : undefined}
            className={cn(
              "w-full flex items-center gap-2 py-1.5 border-b border-slate-700/30 last:border-0 text-left transition-opacity",
              disabled && "opacity-40 cursor-not-allowed"
            )}
          >
            <div
              className="w-2.5 h-2.5 rounded-sm border-2 shrink-0 transition-colors"
              style={{
                borderColor: layer.color,
                backgroundColor: active ? layer.color : "transparent",
              }}
            />
            <span
              className={cn(
                "text-[11px]",
                active ? "text-slate-100 font-semibold" : "text-slate-400"
              )}
            >
              {layer.label}
            </span>
            {layer.lazy && (
              <span className="text-slate-600 text-[9px] ml-auto">lazy</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics/LayerPanel.tsx
git commit -m "feat(mapa): add LayerPanel component for overlay toggles"
```

---

### Task 8: Create MunicipioPopup component

**Files:**
- Create: `src/components/analytics/MunicipioPopup.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import type { MapAnalyticsDTO } from "@/actions/analytics";
import type { EstructuraResumen } from "@/actions/estructura";

export interface ArcGISMunicipioProps {
  nombre: string;
  cvegeo: string | null;
  dto_federal: string | number | null;
  dto_local: string | number | null;
  lista_nominal: number | null;
  num_secciones: number | null;
  properties: Record<string, unknown>;
}

interface Props {
  arcgis: ArcGISMunicipioProps;
  electoralData: MapAnalyticsDTO | null;
  municipioId: number | null;
  onClose: () => void;
  onVerSecciones: () => void;
}

type Tab = "cartografia" | "electoral" | "estructura";

export function MunicipioPopup({
  arcgis,
  electoralData,
  municipioId,
  onClose,
  onVerSecciones,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("cartografia");
  const [estructura, setEstructura] = useState<EstructuraResumen | null>(null);
  const [estructuraLoading, setEstructuraLoading] = useState(false);
  const [estructuraError, setEstructuraError] = useState(false);

  useEffect(() => {
    if (tab !== "estructura" || !municipioId || estructura) return;
    setEstructuraLoading(true);
    setEstructuraError(false);
    import("@/actions/estructura")
      .then(({ getEstructuraResumenByMunicipio }) =>
        getEstructuraResumenByMunicipio(municipioId)
      )
      .then(setEstructura)
      .catch(() => setEstructuraError(true))
      .finally(() => setEstructuraLoading(false));
  }, [tab, municipioId, estructura]);

  const TAB_LABELS: Record<Tab, string> = {
    cartografia: "Cartografía",
    electoral: "Electoral",
    estructura: "Estructura",
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden pointer-events-auto">
      <div className="bg-slate-900 px-4 py-3 flex items-start justify-between">
        <div>
          <div className="text-white text-[13px] font-bold leading-tight">
            {arcgis.nombre}
          </div>
          {arcgis.cvegeo && (
            <div className="text-slate-400 text-[10px] mt-0.5">
              CVEGEO: {arcgis.cvegeo}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors ml-2 mt-0.5 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex border-b border-slate-100">
        {(["cartografia", "electoral", "estructura"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${
              tab === t
                ? "text-blue-600 border-b-2 border-blue-500"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="p-3">
        {tab === "cartografia" && (
          <CartografiaTab
            arcgis={arcgis}
            onVerSecciones={onVerSecciones}
            onFichaCompleta={() => {
              if (electoralData?.municipio_id) {
                router.push(`/admin/historial/municipio/${electoralData.municipio_id}`);
              }
            }}
          />
        )}
        {tab === "electoral" && <ElectoralTab data={electoralData} />}
        {tab === "estructura" && (
          <EstructuraTab
            data={estructura}
            loading={estructuraLoading}
            error={estructuraError}
          />
        )}
      </div>
    </div>
  );
}

function CartografiaTab({
  arcgis,
  onVerSecciones,
  onFichaCompleta,
}: {
  arcgis: ArcGISMunicipioProps;
  onVerSecciones: () => void;
  onFichaCompleta: () => void;
}) {
  return (
    <div>
      <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-2">
        Datos ArcGIS
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <StatCell
          label="Dto. Federal"
          value={arcgis.dto_federal != null ? `D. ${arcgis.dto_federal}` : "—"}
        />
        <StatCell
          label="Dto. Local"
          value={arcgis.dto_local != null ? `D. ${arcgis.dto_local}` : "—"}
        />
        <StatCell label="Secciones" value={arcgis.num_secciones ?? "—"} />
        <StatCell
          label="Lista nominal"
          value={
            arcgis.lista_nominal != null
              ? arcgis.lista_nominal.toLocaleString("es-MX")
              : "—"
          }
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onVerSecciones}
          className="flex-1 bg-blue-500 text-white rounded-md py-1.5 text-[11px] font-semibold hover:bg-blue-600 transition-colors"
        >
          Ver secciones
        </button>
        <button
          onClick={onFichaCompleta}
          className="flex-1 bg-slate-100 text-slate-600 rounded-md py-1.5 text-[11px] font-semibold hover:bg-slate-200 transition-colors"
        >
          Ficha completa →
        </button>
      </div>
    </div>
  );
}

function ElectoralTab({ data }: { data: MapAnalyticsDTO | null }) {
  if (!data) {
    return (
      <p className="text-[11px] text-slate-400 text-center py-4">
        Sin datos electorales para este municipio.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-2">
        Último resultado registrado
      </div>
      {data.partido_siglas && (
        <StatRow
          label="Partido ganador"
          value={
            <span
              className="font-bold px-1.5 py-0.5 rounded text-white text-[11px]"
              style={{ backgroundColor: data.partido_color ?? "#64748b" }}
            >
              {data.partido_siglas}
            </span>
          }
        />
      )}
      <StatRow label="Año" value={data.anio} />
      <StatRow label="% obtenido" value={`${data.porcentaje_ganador.toFixed(1)}%`} />
      <StatRow label="Votos" value={data.votos_ganador.toLocaleString("es-MX")} />
      {data.alternancia_count > 0 && (
        <StatRow label="Alternancias" value={data.alternancia_count} />
      )}
    </div>
  );
}

function EstructuraTab({
  data,
  loading,
  error,
}: {
  data: EstructuraResumen | null;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-[11px] text-slate-400 text-center py-4">No disponible</p>
    );
  }
  return (
    <div>
      <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-2">
        Estructura de campo
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <StatCell label="Promotores" value={data.promotores} />
        <StatCell label="Secciones" value={data.secciones_total} />
        <StatCell label="Compromisos" value={data.compromisos} />
        {data.ultimo_evento && (
          <StatCell label="Último evento" value={data.ultimo_evento} />
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-slate-50 rounded px-2 py-1.5">
      <div className="text-[9px] text-slate-400">{label}</div>
      <div className="text-[12px] font-semibold text-slate-800">{value ?? "—"}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-[11px] font-semibold text-slate-800">{value}</span>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics/MunicipioPopup.tsx
git commit -m "feat(mapa): add MunicipioPopup with 3-tab design (Cartografía / Electoral / Estructura)"
```

---

### Task 9: Create SeccionPopup component

**Files:**
- Create: `src/components/analytics/SeccionPopup.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import type { SeccionDetalle } from "@/actions/estructura";

export interface ArcGISSeccionProps {
  numero: string | number;
  municipio: string | null;
  dto_local: string | number | null;
  lista_nominal: number | null;
  tipo: string | null;
  municipioId: number | null;
}

interface Props {
  seccion: ArcGISSeccionProps;
  onClose: () => void;
}

export function SeccionPopup({ seccion, onClose }: Props) {
  const [detalle, setDetalle] = useState<SeccionDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!seccion.municipioId) return;
    setLoading(true);
    setError(false);
    import("@/actions/estructura")
      .then(({ getEstructuraBySeccion }) =>
        getEstructuraBySeccion(seccion.municipioId!, Number(seccion.numero))
      )
      .then(setDetalle)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [seccion.municipioId, seccion.numero]);

  const daysSince =
    detalle?.ultimo_evento
      ? Math.floor(
          (Date.now() - new Date(detalle.ultimo_evento).getTime()) / 86_400_000
        )
      : null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden pointer-events-auto">
      <div className="bg-slate-950 px-4 py-2.5 flex items-start justify-between">
        <div>
          <div className="text-white text-[12px] font-bold">
            Sección {seccion.numero}
          </div>
          <div className="text-slate-400 text-[9px] mt-0.5">
            {seccion.municipio}
            {seccion.dto_local != null ? ` · Dto. Local ${seccion.dto_local}` : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors ml-2 mt-0.5 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">
            ArcGIS
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <StatCell
              label="Lista nominal"
              value={
                seccion.lista_nominal != null
                  ? seccion.lista_nominal.toLocaleString("es-MX")
                  : "—"
              }
            />
            <StatCell label="Tipo" value={seccion.tipo ?? "—"} />
          </div>
        </div>

        <div>
          <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">
            Supabase — Estructura
          </div>
          {loading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          )}
          {!loading && (error || !detalle) && (
            <p className="text-[11px] text-slate-400 text-center py-2">
              No disponible
            </p>
          )}
          {!loading && detalle && (
            <>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <StatCell
                  label="Promotor"
                  value={detalle.promotor ?? "Sin asignar"}
                  highlight={!!detalle.promotor}
                />
                <StatCell
                  label="Compromisos"
                  value={
                    detalle.meta > 0
                      ? `${detalle.compromisos} / ${detalle.meta}`
                      : String(detalle.compromisos)
                  }
                  highlight={detalle.compromisos > 0}
                />
              </div>
              {daysSince != null && (
                <div
                  className={`rounded px-2.5 py-1.5 text-[10px] font-medium ${
                    daysSince > 14
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  }`}
                >
                  {daysSince > 14
                    ? `⚠ Último evento hace ${daysSince} días`
                    : `✓ Último evento hace ${daysSince} días`}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded px-2 py-1.5 border ${
        highlight
          ? "bg-emerald-50 border-emerald-200"
          : "bg-slate-50 border-transparent"
      }`}
    >
      <div className={`text-[9px] ${highlight ? "text-emerald-600" : "text-slate-400"}`}>
        {label}
      </div>
      <div
        className={`text-[12px] font-semibold ${
          highlight ? "text-emerald-700" : "text-slate-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics/SeccionPopup.tsx
git commit -m "feat(mapa): add SeccionPopup with ArcGIS + Supabase estructura data"
```

---

### Task 10: Update EdomexInteractiveMap — overlay rendering + popup handlers

**Files:**
- Modify: `src/components/analytics/EdomexInteractiveMap.tsx`

> **Before this task:** Take the ArcGIS field names you recorded in Task 5 Step 2 and update the `arcgisPropsToMunicipio` and `arcgisPropsToSeccion` functions accordingly. The fallback chains below cover common naming patterns — remove fallbacks once you know the exact names.

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { useMemo, useState, useCallback } from "react";
import { MapAnalyticsDTO } from "@/actions/analytics";
import { MapTooltip } from "./MapTooltip";
import { MunicipioPopup, type ArcGISMunicipioProps } from "./MunicipioPopup";
import { SeccionPopup, type ArcGISSeccionProps } from "./SeccionPopup";
import { cn } from "@/lib/utils";

interface Props {
  geoData: any;
  overlayData: Record<string, any>;
  analytics: MapAnalyticsDTO[];
  isAnalytic: boolean;
  onMunicipioSelect?: (geoId: number | null) => void;
  onVerSecciones?: () => void;
}

// ── Field name mapping — update with exact names from Task 5 ─────────────────
function arcgisPropsToMunicipio(
  p: Record<string, any>,
  electoralData: MapAnalyticsDTO | null
): ArcGISMunicipioProps {
  return {
    nombre: p.NOMGEO ?? p.NOM_MUN ?? p.NOMBRE ?? p.nombre ?? "Municipio",
    cvegeo: String(p.CVEGEO ?? p.CVE_MUN ?? p.municipio ?? ""),
    dto_federal: p.CVE_DTO_FED ?? p.DTO_FED ?? null,
    dto_local: p.CVE_DTO_LOC ?? p.DTO_LOC ?? null,
    lista_nominal: Number(p.NOM_LISTA ?? p.LISTA_NOM ?? 0) || null,
    num_secciones: Number(p.NUM_SECC ?? p.SECCIONES ?? 0) || null,
    properties: p,
  };
}

function arcgisPropsToSeccion(
  p: Record<string, any>,
  municipioId: number | null
): ArcGISSeccionProps {
  return {
    numero: p.SECCION ?? p.CVE_SECC ?? p.seccion ?? "?",
    municipio: p.NOMMUN ?? p.NOMGEO ?? p.municipio ?? null,
    dto_local: p.CVE_DTO_LOC ?? p.DTO_LOC ?? null,
    lista_nominal: Number(p.NOM_LISTA ?? p.LISTA_NOM ?? 0) || null,
    tipo: p.TIPO ?? p.tipo ?? null,
    municipioId,
  };
}

const OVERLAY_COLORS: Record<string, string> = {
  distrito_federal: "#f59e0b",
  distrito_local: "#8b5cf6",
  entidad: "#06b6d4",
  seccion: "#10b981",
};

export function EdomexInteractiveMap({
  geoData,
  overlayData,
  analytics,
  isAnalytic,
  onMunicipioSelect,
  onVerSecciones,
}: Props) {
  const [hoveredMun, setHoveredMun] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selectedMunicipio, setSelectedMunicipio] = useState<{
    arcgis: ArcGISMunicipioProps;
    electoralData: MapAnalyticsDTO | null;
    municipioId: number | null;
  } | null>(null);
  const [selectedSeccion, setSelectedSeccion] = useState<ArcGISSeccionProps | null>(null);

  const analyticsByGeoId = useMemo(() => {
    const map = new Map<number, MapAnalyticsDTO>();
    analytics.forEach((a) => {
      if (a.geo_municipio_id !== null) map.set(a.geo_municipio_id, a);
    });
    return map;
  }, [analytics]);

  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    geoData.features.forEach((f: any) => {
      const coords =
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : f.geometry.coordinates;
      coords.forEach((polygon: any) => {
        const ring = Array.isArray(polygon[0][0]) ? polygon[0] : polygon;
        ring.forEach((pt: any) => {
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        });
      });
    });
    return { minX, minY, maxX, maxY };
  }, [geoData]);

  const scale = Math.min(
    900 / (bounds.maxX - bounds.minX),
    750 / (bounds.maxY - bounds.minY)
  );

  const project = useCallback(
    (lon: number, lat: number) => {
      const x = (lon - bounds.minX) * scale + 50;
      const y = 800 - ((lat - bounds.minY) * scale + 50);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    },
    [bounds, scale]
  );

  const featureToPath = useCallback(
    (feature: any) => {
      const polygons =
        feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      return polygons
        .map((polygon: any) => {
          const ring = Array.isArray(polygon[0][0]) ? polygon[0] : polygon;
          return `M ${ring.map((pt: any) => project(pt[0], pt[1])).join(" L ")} Z`;
        })
        .join(" ");
    },
    [project]
  );

  const handleCloseMunicipio = useCallback(() => {
    setSelectedMunicipio(null);
    onMunicipioSelect?.(null);
  }, [onMunicipioSelect]);

  return (
    <div
      className="w-full h-full relative cursor-default select-none overflow-hidden bg-slate-50 flex items-center justify-center p-4 lg:p-12"
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      <div className="w-full h-full max-w-[1000px] max-h-[800px] relative">
        <svg
          viewBox="0 0 1000 850"
          className="w-full h-full drop-shadow-[0_25px_50px_rgba(0,0,0,0.15)]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Base layer: municipios */}
          {geoData.features.map((feature: any, i: number) => {
            const geoId = feature.properties.municipio;
            const munNameRaw =
              feature.properties.NOMGEO ??
              feature.properties.NOM_MUN ??
              feature.properties.NOMBRE ??
              feature.properties.nombre ??
              "";
            const data = analyticsByGeoId.get(geoId);
            const fillColor =
              isAnalytic && data ? data.partido_color ?? "#f8fafc" : "#f1f5f9";
            const isHovered = hoveredMun?.geoId === geoId;

            return (
              <path
                key={`mun-${geoId ?? i}`}
                d={featureToPath(feature)}
                fill={fillColor}
                stroke={isHovered ? "#334155" : "#cbd5e1"}
                strokeWidth={isHovered ? "1.5" : "0.5"}
                className={cn(
                  "transition-all duration-200 ease-out hover:brightness-95 cursor-pointer"
                )}
                onMouseEnter={() =>
                  setHoveredMun({ geoId, name: munNameRaw, data })
                }
                onMouseLeave={() => setHoveredMun(null)}
                onClick={() => {
                  const arcgis = arcgisPropsToMunicipio(
                    feature.properties,
                    data ?? null
                  );
                  setSelectedMunicipio({
                    arcgis,
                    electoralData: data ?? null,
                    municipioId: data?.municipio_id ?? null,
                  });
                  onMunicipioSelect?.(geoId);
                  setSelectedSeccion(null);
                }}
              />
            );
          })}

          {/* Overlay layers */}
          {Object.entries(overlayData).map(([overlayKey, fc]) => {
            if (!fc?.features?.length) return null;
            const color = OVERLAY_COLORS[overlayKey] ?? "#64748b";
            return (
              <g key={`overlay-${overlayKey}`}>
                {fc.features.map((feature: any, i: number) => {
                  if (overlayKey === "seccion") {
                    return (
                      <path
                        key={`sec-${i}`}
                        d={featureToPath(feature)}
                        fill={`${color}22`}
                        stroke={color}
                        strokeWidth="0.4"
                        className="cursor-pointer hover:brightness-90"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedSeccion(
                            arcgisPropsToSeccion(
                              feature.properties,
                              selectedMunicipio?.municipioId ?? null
                            )
                          );
                        }}
                      />
                    );
                  }
                  return (
                    <path
                      key={`ov-${i}`}
                      d={featureToPath(feature)}
                      fill="none"
                      stroke={color}
                      strokeWidth="0.7"
                      strokeDasharray="3 2"
                      className="pointer-events-none"
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {hoveredMun && !selectedMunicipio && (
        <MapTooltip
          pos={mousePos}
          municipio={{ nombre: hoveredMun.name, data: hoveredMun.data }}
          isAnalytic={isAnalytic}
        />
      )}

      {selectedMunicipio && (
        <MunicipioPopup
          arcgis={selectedMunicipio.arcgis}
          electoralData={selectedMunicipio.electoralData}
          municipioId={selectedMunicipio.municipioId}
          onClose={handleCloseMunicipio}
          onVerSecciones={() => onVerSecciones?.()}
        />
      )}

      {selectedSeccion && (
        <SeccionPopup
          seccion={selectedSeccion}
          onClose={() => setSelectedSeccion(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/components/analytics/EdomexInteractiveMap.tsx
git commit -m "feat(mapa): add overlay rendering + municipio/seccion popup click handlers"
```

---

### Task 11: Update ElectoralMapContainer — overlay state + layer panel

**Files:**
- Modify: `src/components/analytics/ElectoralMapContainer.tsx`

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getHistorialMapAnalytics,
  getAvailableHistorialYears,
  MapAnalyticsDTO,
} from "@/actions/analytics";
import { EdomexInteractiveMap } from "./EdomexInteractiveMap";
import { MapLegend } from "./MapLegend";
import { LayerPanel, type OverlayKey } from "./LayerPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Loader2, Calendar, Map as MapIcon, Info } from "lucide-react";

// geoData pre-loaded in Server Component to avoid client-side round-trip
export function ElectoralMapContainer({
  isAnalytic,
  geoData,
}: {
  isAnalytic: boolean;
  geoData: any;
}) {
  const [analytics, setAnalytics] = useState<MapAnalyticsDTO[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("latest");
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayKey>>(new Set());
  const [overlayData, setOverlayData] = useState<Record<string, any>>({});
  const [selectedGeoMunicipioId, setSelectedGeoMunicipioId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAnalytic) return;
    getAvailableHistorialYears()
      .then(setAvailableYears)
      .catch((err: Error) => setError(err.message));
  }, [isAnalytic]);

  useEffect(() => {
    if (!isAnalytic) return;
    setDataLoading(true);
    const year = selectedYear === "latest" ? undefined : parseInt(selectedYear);
    getHistorialMapAnalytics(year)
      .then(setAnalytics)
      .catch(console.error)
      .finally(() => setDataLoading(false));
  }, [selectedYear, isAnalytic]);

  // When municipio is selected and seccion overlay is on, reload secciones for it
  useEffect(() => {
    if (!activeOverlays.has("seccion") || !selectedGeoMunicipioId) return;
    // Verify the field name for municipio in the seccion layer after Task 5 Step 2
    // Common values: CVE_MUN, MUNICIPIO — update the where clause accordingly
    fetch(`/api/arcgis/seccion?returnGeometry=true&where=CVE_MUN=${selectedGeoMunicipioId}`)
      .then((r) => r.json())
      .then((data) => setOverlayData((d) => ({ ...d, seccion: data })))
      .catch(console.error);
  }, [selectedGeoMunicipioId, activeOverlays]);

  const toggleOverlay = useCallback(
    async (key: OverlayKey) => {
      const isCurrentlyActive = activeOverlays.has(key);

      setActiveOverlays((prev) => {
        const next = new Set(prev);
        if (isCurrentlyActive) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });

      if (isCurrentlyActive) {
        setOverlayData((d) => {
          const copy = { ...d };
          delete copy[key];
          return copy;
        });
        return;
      }

      // seccion is lazy — only load if a municipio is selected
      if (key === "seccion" && !selectedGeoMunicipioId) return;

      let url = `/api/arcgis/${key}?returnGeometry=true`;
      if (key === "seccion") {
        url += `&where=CVE_MUN=${selectedGeoMunicipioId}`;
      }

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setOverlayData((d) => ({ ...d, [key]: data }));
      } catch (err) {
        console.error(`Error cargando overlay ${key}:`, err);
        setActiveOverlays((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [activeOverlays, selectedGeoMunicipioId]
  );

  const handleVerSecciones = useCallback(() => {
    if (!activeOverlays.has("seccion")) {
      toggleOverlay("seccion");
    }
  }, [activeOverlays, toggleOverlay]);

  if (error) {
    return (
      <div className="p-12 text-center">
        <div className="inline-flex p-4 rounded-full bg-red-50 text-red-500 mb-4 border border-red-100">
          <Info className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight">
          Fallo de Capa Visual
        </h2>
        <p className="text-slate-500 mt-2 text-sm">{error}</p>
      </div>
    );
  }

  const totalMunicipios = geoData?.features?.length || 0;

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-slate-50 overflow-hidden">
      {isAnalytic && (
        <aside className="w-full md:w-80 bg-white border-r border-slate-200 z-20 flex flex-col shadow-xl">
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Calendar className="w-3 h-3 text-indigo-500" />
                Ciclo Electoral
              </label>
              <Select
                value={selectedYear}
                onValueChange={(v) => setSelectedYear(v ?? "")}
              >
                <SelectTrigger className="w-full h-12 bg-slate-50 border-slate-200 font-bold text-slate-800 transition-all hover:bg-slate-100 focus:ring-indigo-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="latest" className="font-bold">
                    Resultado Vigente
                  </SelectItem>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      Elecciones {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  Resumen Visual
                </span>
                {dataLoading && (
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-slate-50 border-none p-3 text-center transition-colors hover:bg-indigo-50 group">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1 group-hover:text-indigo-400">
                    Total Cartografía
                  </div>
                  <div className="text-xl font-black text-slate-900 group-hover:text-indigo-600 tabular-nums">
                    {totalMunicipios}
                  </div>
                </Card>
                <Card className="bg-slate-50 border-none p-3 text-center transition-colors hover:bg-indigo-50 group">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1 group-hover:text-indigo-400">
                    Con Historial
                  </div>
                  <div className="text-xl font-black text-slate-900 group-hover:text-indigo-600 tabular-nums">
                    {analytics.length}
                  </div>
                </Card>
              </div>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100/50">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white rounded-xl text-indigo-500 shadow-sm shrink-0">
                  <MapIcon className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-[11px] font-black text-indigo-900 truncate">
                    Vínculo Territorial
                  </h5>
                  <p className="text-[10px] text-indigo-600/70 mt-1 leading-relaxed">
                    Haz clic en un municipio para desplegar el análisis detallado.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto p-6 border-t border-slate-100 bg-slate-50/50">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">
              Cartografía SIPEEM v3.0
            </div>
          </div>
        </aside>
      )}

      <main className="flex-1 relative bg-slate-100 overflow-hidden shadow-inner">
        <EdomexInteractiveMap
          geoData={geoData}
          overlayData={overlayData}
          analytics={analytics}
          isAnalytic={isAnalytic}
          onMunicipioSelect={setSelectedGeoMunicipioId}
          onVerSecciones={handleVerSecciones}
        />

        {isAnalytic && <MapLegend data={analytics} />}

        <LayerPanel
          activeOverlays={activeOverlays}
          onToggle={toggleOverlay}
          hasMunicipioSelected={selectedGeoMunicipioId !== null}
        />

        {!isAnalytic && (
          <div className="absolute top-6 left-6 z-10 w-full max-w-sm pointer-events-none">
            <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl border shadow-sm ring-1 ring-slate-900/5">
              <h4 className="font-black text-slate-900 text-xs tracking-tight uppercase">
                Módulo Geográfico
              </h4>
              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">
                Estado de México
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Full browser test**

Start the dev server (`npm run dev`). Test these scenarios at `/mapa`:

1. Map loads with 125 municipios from ArcGIS (no static file)
2. Click a municipio → popup opens with 3 tabs
3. Cartografía tab shows ArcGIS data (check field values are not "—" — if they are, update field names in `arcgisPropsToMunicipio`)
4. Electoral tab shows party data for homologated municipios
5. Estructura tab loads Supabase data (spinner → data or "No disponible")
6. Click "Ver secciones" → seccion overlay loads (tiles appear over selected municipio)
7. Click a seccion tile → SeccionPopup opens
8. LayerPanel (top-right) → toggle "Dto. Federal" → dashed amber lines appear
9. Toggle it off → lines disappear
10. Close municipio popup → secciones overlay persists

- [ ] **Step 4: Commit**

```bash
git add src/components/analytics/ElectoralMapContainer.tsx
git commit -m "feat(mapa): wire overlays, LayerPanel, and Ver-secciones into ElectoralMapContainer"
```

---

### Task 12: Remove static GeoJSON

**Files:**
- Delete: `public/maps/edomex_municipios_wgs84.geojson`

> Only run this after completing all browser tests in Task 11 Step 3 successfully.

- [ ] **Step 1: Confirm map works end-to-end without the file**

The file is no longer referenced anywhere in the codebase (Tasks 1–11 replaced all usages). Verify with:

```bash
grep -r "edomex_municipios_wgs84" src/
```

Expected: no results.

- [ ] **Step 2: Delete the file**

```bash
git rm public/maps/edomex_municipios_wgs84.geojson
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove static edomex_municipios_wgs84.geojson — replaced by live ArcGIS data"
```

---

## Self-Review

**Spec coverage:**
- ✅ `src/lib/arcgis.ts` refactored (Task 1) — single `ARCGIS_FEATURE_SERVER_URL`, `LAYER_IDS`, `queryLayer()`
- ✅ OAuth2 `client_credentials` token flow with 5-min pre-expiry cache (Task 1)
- ✅ `token` mode for local testing (Task 1)
- ✅ `isArcGISLayer()` type guard (Task 1)
- ✅ React `cache()` on `getBaseMapData()` for municipio (Task 1)
- ✅ `/api/arcgis/[layer]` uses `isArcGISLayer` + `queryLayer`, `outSR=4326` default, seccion guard (Task 2)
- ✅ Catalog route lists all 5 hardcoded layers (Task 3)
- ✅ Env vars updated — old per-layer URLs removed (Task 4)
- ✅ `mapa/page.tsx` uses `getBaseMapData()` — no file reads (Task 5)
- ✅ `getEstructuraResumenByMunicipio()` and `getEstructuraBySeccion()` (Task 6)
- ✅ LayerPanel with Municipio base + 4 overlay toggles (Task 7)
- ✅ MunicipioPopup with 3 tabs: Cartografía, Electoral, Estructura (Task 8)
- ✅ SeccionPopup with ArcGIS + lazy Supabase estructura data (Task 9)
- ✅ Overlay polygon rendering — dashed lines for district overlays, fill for secciones (Task 10)
- ✅ Lazy seccion load — only on municipio select or "Ver secciones" click (Task 11)
- ✅ Overlay fetch error → toast-less removal from active set, map base stays working (Task 11)
- ✅ Supabase tab error → spinner → "No disponible", popup stays open (Tasks 8, 9)
- ✅ Static GeoJSON deleted after validation (Task 12)
- ✅ Error scenarios: `ARCGIS_FEATURE_SERVER_URL` missing → descriptive throw; token invalid → 502; seccion without where → 400

**Placeholder note:** `arcgisPropsToMunicipio` and `arcgisPropsToSeccion` use multi-fallback chains for field names — these are not placeholders but defensive lookups. Task 5 Step 2 tells you how to find the actual names; Task 10 tells you to update the primary lookup once confirmed. The `where=CVE_MUN=...` in seccion queries is also flagged for verification.

**Type consistency:** `OverlayKey` defined in LayerPanel → used in ElectoralMapContainer. `ArcGISMunicipioProps` defined in MunicipioPopup → used in EdomexInteractiveMap. `ArcGISSeccionProps` defined in SeccionPopup → used in EdomexInteractiveMap. `EstructuraResumen`/`SeccionDetalle` defined in estructura.ts → imported in popups. `overlayData: Record<string, any>` flows from ElectoralMapContainer → EdomexInteractiveMap.
