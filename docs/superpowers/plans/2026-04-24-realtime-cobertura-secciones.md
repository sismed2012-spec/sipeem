# Realtime Cobertura de Secciones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colorear los polígonos de sección en el mapa en tiempo real según % de compromisos/meta usando Supabase Realtime, sin recargar la página.

**Architecture:** `ElectoralMapContainer` mantiene un `coberturaMap` (Record keyed por `seccion_numero`) que se inicializa con un fetch a `getCoberturaByMunicipio` y se actualiza en vivo via un canal Supabase Realtime en la tabla `compromisos_seccion`. El mapa lee ese mapa para calcular el color de cada sección. La leyenda vive dentro del `LayerPanel` existente.

**Tech Stack:** Next.js 16 App Router, Supabase Realtime (`postgres_changes`), React `useState` / `useEffect` / `useMemo`, TypeScript.

---

## Archivos

| Archivo | Cambio |
|---------|--------|
| `src/actions/estructura.ts` | Añadir `CoberturaSeccion` + `getCoberturaByMunicipio()` |
| `src/components/analytics/EdomexInteractiveMap.tsx` | Añadir `coberturaColor()` + prop `coberturaMap` + coloreo dinámico |
| `src/components/analytics/LayerPanel.tsx` | Añadir prop `coberturaMap` + leyenda de cobertura |
| `src/components/analytics/ElectoralMapContainer.tsx` | Añadir estado + useEffect de suscripción Realtime |

---

## Task 1: getCoberturaByMunicipio — acción server

**Files:**
- Modify: `src/actions/estructura.ts` (append al final, después de línea 203)

- [ ] **Step 1: Añadir el tipo y la función al final de `src/actions/estructura.ts`**

```ts
// ── Realtime cobertura ────────────────────────────────────────────────────────

export interface CoberturaSeccion {
  seccion_id: number;
  seccion_numero: number;
  compromisos: number;
  meta: number;
}

export async function getCoberturaByMunicipio(
  municipioId: number
): Promise<CoberturaSeccion[]> {
  await assertAdmin();
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("compromisos_seccion")
    .select("seccion_id, compromisos, meta, secciones!inner(numero)")
    .eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row: any) => ({
    seccion_id: row.seccion_id,
    seccion_numero: row.secciones.numero,
    compromisos: row.compromisos,
    meta: row.meta,
  }));
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/actions/estructura.ts
git commit -m "feat(estructura): add getCoberturaByMunicipio for Realtime map coloring"
```

---

## Task 2: coberturaColor + prop coberturaMap en EdomexInteractiveMap

**Files:**
- Modify: `src/components/analytics/EdomexInteractiveMap.tsx`

- [ ] **Step 1: Añadir función pura `coberturaColor` antes de `arcgisPropsToMunicipio` (línea 20)**

```ts
// ── Cobertura color scale ─────────────────────────────────────────────────────
function coberturaColor(compromisos: number, meta: number): string {
  if (!meta) return "#475569";
  const pct = compromisos / meta;
  if (pct >= 1.0) return "#10b981";
  if (pct >= 0.67) return "#3b82f6";
  if (pct >= 0.34) return "#f59e0b";
  return "#ef4444";
}
```

- [ ] **Step 2: Añadir `coberturaMap` a la interfaz `Props` (línea 16, después de `onVerSecciones?`)**

```ts
interface Props {
  geoData: any;
  overlayData: Record<string, any>;
  analytics: MapAnalyticsDTO[];
  isAnalytic: boolean;
  onMunicipioSelect?: (geoId: number | null) => void;
  onVerSecciones?: () => void;
  coberturaMap?: Record<number, { compromisos: number; meta: number }>;
}
```

- [ ] **Step 3: Destructurar `coberturaMap` en el componente (línea 56)**

```ts
export function EdomexInteractiveMap({
  geoData,
  overlayData,
  analytics,
  isAnalytic,
  onMunicipioSelect,
  onVerSecciones,
  coberturaMap = {},
}: Props) {
```

- [ ] **Step 4: Reemplazar el coloreo fijo de secciones**

Localizar el bloque `if (overlayKey === "seccion")` (línea ~197–216). Reemplazar el `<path>` de sección:

```tsx
if (overlayKey === "seccion") {
  const p = feature.properties;
  const seccionNumero = Number(
    p.SECCION ?? p.CVE_SECC ?? p.seccion ?? 0
  );
  const cobertura = coberturaMap[seccionNumero];
  const sectionColor = cobertura
    ? coberturaColor(cobertura.compromisos, cobertura.meta)
    : "#475569";
  return (
    <path
      key={`sec-${i}`}
      d={featureToPath(feature)}
      fill={`${sectionColor}55`}
      stroke={sectionColor}
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
```

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src/components/analytics/EdomexInteractiveMap.tsx
git commit -m "feat(mapa): add coberturaColor + dynamic section coloring from coberturaMap"
```

---

## Task 3: Leyenda de cobertura en LayerPanel

**Files:**
- Modify: `src/components/analytics/LayerPanel.tsx`

- [ ] **Step 1: Añadir `coberturaMap` a la interfaz `Props` (línea 25)**

```ts
interface Props {
  activeOverlays: Set<OverlayKey>;
  onToggle: (key: OverlayKey) => void;
  hasMunicipioSelected: boolean;
  coberturaMap?: Record<number, { compromisos: number; meta: number }>;
}
```

- [ ] **Step 2: Añadir `coberturaMap` a la destructuración del componente (línea 31)**

```ts
export function LayerPanel({
  activeOverlays,
  onToggle,
  hasMunicipioSelected,
  coberturaMap = {},
}: Props) {
```

- [ ] **Step 3: Añadir la leyenda al final del panel, antes del `</div>` de cierre (después de línea 83)**

```tsx
{activeOverlays.has("seccion") && (
  <div className="border-t border-slate-700/60 pt-2 mt-2">
    <p className="text-[9px] text-slate-500 uppercase tracking-[0.18em] font-bold mb-1.5">
      Cobertura
    </p>
    {[
      { color: "#10b981", label: "100% Completado" },
      { color: "#3b82f6", label: "67–99% Avanzado" },
      { color: "#f59e0b", label: "34–66% En progreso" },
      { color: "#ef4444", label: "0–33% Crítico" },
      { color: "#475569", label: "Sin meta" },
    ].map(({ color, label }) => (
      <div key={label} className="flex items-center gap-1.5 py-0.5">
        <div
          className="w-2.5 h-2.5 rounded-sm shrink-0"
          style={{ background: color }}
        />
        <span className="text-[10px] text-slate-400">{label}</span>
      </div>
    ))}
  </div>
)}
```

El bloque completo del `return` en `LayerPanel` queda así:

```tsx
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

    {activeOverlays.has("seccion") && (
      <div className="border-t border-slate-700/60 pt-2 mt-2">
        <p className="text-[9px] text-slate-500 uppercase tracking-[0.18em] font-bold mb-1.5">
          Cobertura
        </p>
        {[
          { color: "#10b981", label: "100% Completado" },
          { color: "#3b82f6", label: "67–99% Avanzado" },
          { color: "#f59e0b", label: "34–66% En progreso" },
          { color: "#ef4444", label: "0–33% Crítico" },
          { color: "#475569", label: "Sin meta" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5 py-0.5">
            <div
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: color }}
            />
            <span className="text-[10px] text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/LayerPanel.tsx
git commit -m "feat(mapa): add cobertura legend to LayerPanel when seccion overlay is active"
```

---

## Task 4: Suscripción Realtime en ElectoralMapContainer

**Files:**
- Modify: `src/components/analytics/ElectoralMapContainer.tsx`

- [ ] **Step 1: Añadir imports**

Al bloque de imports existente (línea 1–21), añadir:

```ts
import { getCoberturaByMunicipio } from "@/actions/estructura";
import { createClient } from "@/lib/supabase/client";
```

- [ ] **Step 2: Añadir estado y cliente Supabase dentro del componente**

Después de la línea `const [selectedGeoMunicipioId, setSelectedGeoMunicipioId] = useState<number | null>(null);` (línea ~38), añadir:

```ts
const supabase = useMemo(() => createClient(), []);
const [coberturaMap, setCoberturaMap] = useState<
  Record<number, { compromisos: number; meta: number }>
>({});
const seccionOverlayActive = activeOverlays.has("seccion");
```

- [ ] **Step 3: Añadir el useEffect de suscripción**

Después del useEffect que recarga secciones cuando cambia el municipio (línea ~58–64), añadir:

```ts
useEffect(() => {
  const id = selectedGeoMunicipioId;
  if (!id || !seccionOverlayActive) {
    setCoberturaMap({});
    return;
  }

  let channel: ReturnType<typeof supabase.channel> | null = null;

  getCoberturaByMunicipio(id)
    .then((rows) => {
      const cmap: Record<number, { compromisos: number; meta: number }> = {};
      const idMap: Record<number, number> = {};
      for (const r of rows) {
        cmap[r.seccion_numero] = { compromisos: r.compromisos, meta: r.meta };
        idMap[r.seccion_id] = r.seccion_numero;
      }
      setCoberturaMap(cmap);

      channel = supabase
        .channel(`compromisos-${id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "compromisos_seccion",
            filter: `municipio_id=eq.${id}`,
          },
          (payload) => {
            const rec = (payload.new ?? payload.old) as any;
            const numero = idMap[rec.seccion_id];
            if (numero == null) return;
            if (payload.eventType === "DELETE") {
              setCoberturaMap((prev) => {
                const n = { ...prev };
                delete n[numero];
                return n;
              });
            } else {
              setCoberturaMap((prev) => ({
                ...prev,
                [numero]: { compromisos: rec.compromisos, meta: rec.meta },
              }));
            }
          }
        )
        .subscribe();
    })
    .catch(() => {
      // Silently fail — sections render gray without cobertura data
    });

  return () => {
    channel?.unsubscribe();
  };
}, [selectedGeoMunicipioId, seccionOverlayActive, supabase]);
```

- [ ] **Step 4: Pasar `coberturaMap` a `EdomexInteractiveMap`**

Localizar el render de `<EdomexInteractiveMap>` (línea ~221) y añadir la prop:

```tsx
<EdomexInteractiveMap
  geoData={geoData}
  overlayData={overlayData}
  analytics={analytics}
  isAnalytic={isAnalytic}
  onMunicipioSelect={setSelectedGeoMunicipioId}
  onVerSecciones={handleVerSecciones}
  coberturaMap={coberturaMap}
/>
```

- [ ] **Step 5: Pasar `coberturaMap` a `LayerPanel`**

Localizar el render de `<LayerPanel>` (línea ~232) y añadir la prop:

```tsx
<LayerPanel
  activeOverlays={activeOverlays}
  onToggle={toggleOverlay}
  hasMunicipioSelected={selectedGeoMunicipioId !== null}
  coberturaMap={coberturaMap}
/>
```

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit
```

Esperado: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/components/analytics/ElectoralMapContainer.tsx
git commit -m "feat(mapa): add Supabase Realtime subscription for live seccion cobertura coloring"
```

---

## Task 5: Habilitar Realtime en Supabase + validación E2E

**Files:** ninguno (configuración en dashboard + prueba manual)

- [ ] **Step 1: Habilitar Realtime en la tabla `compromisos_seccion`**

Opción A (dashboard):
1. Abrir https://supabase.com/dashboard → proyecto SIPEEM
2. Table Editor → `compromisos_seccion`
3. Activar el toggle "Enable Realtime"
4. Guardar

Opción B (SQL editor en dashboard):
```sql
ALTER TABLE compromisos_seccion REPLICA IDENTITY FULL;
```
> Si la tabla ya está en la publicación `supabase_realtime` (lo hace el toggle automáticamente), no se necesita nada más.

- [ ] **Step 2: Arrancar el servidor de desarrollo**

```bash
npm run dev
```

Abrir http://localhost:3000/mapa

- [ ] **Step 3: Validar el flujo completo**

1. Hacer click en un municipio → se abre el popup
2. Activar el overlay "Sección" → polígonos de sección aparecen
3. Verificar que la leyenda de Cobertura aparece en el LayerPanel
4. Verificar que secciones **con** datos en `compromisos_seccion` muestran el color correcto (rojo/amarillo/azul/verde según %)
5. Verificar que secciones **sin** datos muestran el color gris `#475569`

- [ ] **Step 4: Verificar el Realtime — registrar un compromiso**

Desde una segunda pestaña del navegador, navegar a `/admin/estructura/[municipioId]` y actualizar el conteo de compromisos de una sección. Volver a la primera pestaña y confirmar que el color del polígono cambió en <2 segundos sin recargar.

- [ ] **Step 5: Verificar el campo de seccion_numero**

En DevTools (primera pestaña, Network → XHR/Fetch → `/api/arcgis/seccion`), inspeccionar `features[0].properties`. Confirmar que el campo `SECCION` (o `CVE_SECC`) existe y contiene el número de sección que coincide con `secciones.numero` en Supabase.

Si el campo tiene un nombre diferente, actualizar la fallback chain en `EdomexInteractiveMap.tsx` línea del `seccionNumero`:
```ts
const seccionNumero = Number(
  p.SECCION ?? p.CVE_SECC ?? p.<NOMBRE_REAL> ?? 0
);
```

- [ ] **Step 6: Build de producción**

```bash
npm run build
```

Esperado: sin errores, `/mapa` marcado como `ƒ Dynamic`.

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "feat(mapa): Supabase Realtime live cobertura — validado E2E"
```

- [ ] **Step 8: Deploy a Vercel**

```bash
vercel --prod
```
