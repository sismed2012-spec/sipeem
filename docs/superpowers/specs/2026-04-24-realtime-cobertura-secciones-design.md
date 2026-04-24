# Realtime Cobertura de Secciones — SIPEEM Design Spec
Date: 2026-04-24

## Objetivo

Colorear los polígonos de sección en el mapa electoral en tiempo real según el porcentaje de compromisos captados vs meta, usando Supabase Realtime. Cuando un promotor registra compromisos desde cualquier dispositivo, el color del polígono cambia en <200ms sin recargar la página.

---

## Escala de colores

| Rango | Color | Hex | Etiqueta |
|-------|-------|-----|----------|
| compromisos / meta ≥ 100% | Verde | `#10b981` | Completado |
| 67–99% | Azul | `#3b82f6` | Avanzado |
| 34–66% | Amarillo | `#f59e0b` | En progreso |
| 0–33% | Rojo | `#ef4444` | Crítico |
| sin meta (meta = 0 o NULL) | Gris | `#475569` | Sin meta asignada |

```ts
function coberturaColor(compromisos: number, meta: number): string {
  if (!meta) return "#475569";
  const pct = compromisos / meta;
  if (pct >= 1.0) return "#10b981";
  if (pct >= 0.67) return "#3b82f6";
  if (pct >= 0.34) return "#f59e0b";
  return "#ef4444";
}
```

---

## Arquitectura

```
ElectoralMapContainer (cliente)
  ├── getCoberturaByMunicipio(municipioId)   ← acción server nueva
  ├── coberturaMap: Record<seccion_numero, {compromisos, meta}>
  ├── seccionIdToNumero: Record<seccion_id, numero>   ← índice para traducir eventos Realtime
  ├── supabase.channel('compromisos-{municipioId}')
  │     .on('postgres_changes', { table: 'compromisos_seccion',
  │          filter: `municipio_id=eq.${id}` }, handler)
  │     .subscribe()
  └── EdomexInteractiveMap
        ├── prop coberturaMap (nuevo, optional, default {})
        ├── coberturaColor() pura
        └── LayerPanel
              └── leyenda de cobertura (aparece cuando seccion overlay activo)
```

### Flujo completo

1. Usuario activa toggle "Sección" en LayerPanel **y** hay un `selectedGeoMunicipioId` activo.
2. `ElectoralMapContainer` llama `getCoberturaByMunicipio(municipioId)`:
   - Query: `SELECT s.id, s.numero, cs.compromisos, cs.meta FROM compromisos_seccion cs JOIN secciones s ON s.id = cs.seccion_id WHERE cs.municipio_id = $1`
   - Construye `coberturaMap` (key = `s.numero`) y `seccionIdToNumero` (key = `cs.seccion_id`)
3. Abre canal Realtime `compromisos-{municipioId}` → suscribe a `postgres_changes` en `compromisos_seccion` filtrando por `municipio_id`.
4. Cada evento Realtime (`INSERT` / `UPDATE` / `DELETE`):
   - Obtiene `numero = seccionIdToNumero[payload.new.seccion_id]`
   - Actualiza `coberturaMap[numero]` con `{compromisos, meta}` del payload
   - React repinta solo los paths afectados
5. Al desactivar overlay o cambiar municipio: `channel.unsubscribe()` → limpiar `coberturaMap`.

---

## Archivos afectados

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/actions/estructura.ts` | Añadir `getCoberturaByMunicipio()` |
| `src/components/analytics/ElectoralMapContainer.tsx` | Añadir estado + `useEffect` de suscripción |
| `src/components/analytics/EdomexInteractiveMap.tsx` | Añadir prop `coberturaMap` + `coberturaColor()` + coloreo dinámico de secciones |
| `src/components/analytics/LayerPanel.tsx` | Añadir prop `coberturaMap` + sección de leyenda debajo del toggle de Sección |

Sin nuevas rutas. Sin nuevas tablas. Sin nuevas dependencias npm.

---

## Detalle por archivo

### `src/actions/estructura.ts` — nueva función

```ts
export interface CoberturaSeccion {
  seccion_id: number;
  seccion_numero: number;
  compromisos: number;
  meta: number;
}

export async function getCoberturaByMunicipio(
  municipioId: number
): Promise<CoberturaSeccion[]>
```

Implementación:
```ts
const { data } = await service
  .from("compromisos_seccion")
  .select("seccion_id, compromisos, meta, secciones!inner(numero)")
  .eq("municipio_id", municipioId);

return (data ?? []).map(row => ({
  seccion_id: row.seccion_id,
  seccion_numero: (row.secciones as any).numero,
  compromisos: row.compromisos,
  meta: row.meta,
}));
```

### `src/components/analytics/ElectoralMapContainer.tsx` — adiciones

```ts
// Estado nuevo
const [coberturaMap, setCoberturaMap] = useState<Record<number, { compromisos: number; meta: number }>>({});
const [seccionIdToNumero, setSeccionIdToNumero] = useState<Record<number, number>>({});

// Derivado estable para el array de dependencias
const seccionOverlayActive = activeOverlays.has("seccion");

// useEffect de suscripción
useEffect(() => {
  const id = selectedGeoMunicipioId;
  if (!id || !seccionOverlayActive) {
    setCoberturaMap({});
    return;
  }

  let channel: ReturnType<typeof supabase.channel> | null = null;

  getCoberturaByMunicipio(id).then(rows => {
    const cmap: Record<number, { compromisos: number; meta: number }> = {};
    const idMap: Record<number, number> = {};
    for (const r of rows) {
      cmap[r.seccion_numero] = { compromisos: r.compromisos, meta: r.meta };
      idMap[r.seccion_id] = r.seccion_numero;
    }
    setCoberturaMap(cmap);
    setSeccionIdToNumero(idMap);

    channel = supabase
      .channel(`compromisos-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "compromisos_seccion",
          filter: `municipio_id=eq.${id}` },
        (payload) => {
          const rec = (payload.new ?? payload.old) as any;
          const numero = idMap[rec.seccion_id];
          if (numero == null) return;
          if (payload.eventType === "DELETE") {
            setCoberturaMap(prev => { const n = { ...prev }; delete n[numero]; return n; });
          } else {
            setCoberturaMap(prev => ({
              ...prev,
              [numero]: { compromisos: rec.compromisos, meta: rec.meta },
            }));
          }
        }
      )
      .subscribe();
  }).catch(() => {
    // snapshot vacío — secciones en gris, sin crash
  });

  return () => { channel?.unsubscribe(); };
}, [selectedGeoMunicipioId, seccionOverlayActive]);
```

### `src/components/analytics/EdomexInteractiveMap.tsx` — adiciones

```ts
// Prop nueva (opcional)
coberturaMap?: Record<number, { compromisos: number; meta: number }>;

// Función pura (fuera del componente)
function coberturaColor(compromisos: number, meta: number): string {
  if (!meta) return "#475569";
  const pct = compromisos / meta;
  if (pct >= 1.0) return "#10b981";
  if (pct >= 0.67) return "#3b82f6";
  if (pct >= 0.34) return "#f59e0b";
  return "#ef4444";
}

// En el render de secciones — reemplaza color fijo "#10b981":
const cobertura = coberturaMap?.[seccionNumero];
const fillColor = cobertura
  ? coberturaColor(cobertura.compromisos, cobertura.meta)
  : "#475569";
```

El `seccionNumero` se extrae de `feature.properties` via la misma fallback chain que ya existe para el popup: `p.SECCION ?? p.CVE_SEC ?? p.NUM_SEC`.

> **Nota de validación:** el valor numérico de este campo debe coincidir con `secciones.numero` en Supabase. Verificar en DevTools (primer feature del overlay) que el número coincide con los registrados en DB. Si hay discrepancia, el `coberturaMap` no encontrará coincidencias y las secciones quedarán grises — diagnóstico fácil.

### `src/components/analytics/LayerPanel.tsx` — leyenda integrada

```ts
// Prop nueva
coberturaMap?: Record<number, { compromisos: number; meta: number }>;

// En el JSX, debajo del toggle de Sección (solo cuando está activo):
{activeOverlays.has("seccion") && (
  <div className="border-t border-slate-700 pt-2 mt-2">
    <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1.5">Cobertura</p>
    {[
      { color: "#10b981", label: "100% Completado" },
      { color: "#3b82f6", label: "67–99% Avanzado" },
      { color: "#f59e0b", label: "34–66% En progreso" },
      { color: "#ef4444", label: "0–33% Crítico" },
      { color: "#475569", label: "Sin meta" },
    ].map(({ color, label }) => (
      <div key={label} className="flex items-center gap-1.5 py-0.5">
        <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
        <span className="text-[10px] text-slate-400">{label}</span>
      </div>
    ))}
  </div>
)}
```

---

## Supabase — configuración manual requerida

Antes de que Realtime funcione, habilitar en el dashboard de Supabase:

1. **Table Editor → `compromisos_seccion` → toggle "Enable Realtime"**
   — O via SQL:
   ```sql
   ALTER TABLE compromisos_seccion REPLICA IDENTITY FULL;
   -- ya incluida en la publicación supabase_realtime por defecto al activar el toggle
   ```

2. **RLS:** el cliente autenticado ya tiene acceso a `compromisos_seccion` via las políticas existentes. No se requieren cambios de RLS.

---

## Cliente Supabase en browser

Usar el browser client que ya existe en el proyecto:
```ts
import { createClient } from "@/lib/supabase/client";
const supabase = createClient();
```

---

## Manejo de errores

| Escenario | Comportamiento |
|-----------|---------------|
| `getCoberturaByMunicipio` falla | `coberturaMap = {}` → secciones grises, sin crash, sin toast (fallo silencioso aceptable) |
| Canal Realtime no conecta | Mapa muestra snapshot inicial estático; Supabase reintenta automáticamente |
| Evento con `seccion_id` no en índice | Ignorado silenciosamente |
| Cambio de municipio con canal abierto | `useEffect` cleanup hace `channel.unsubscribe()` antes de abrir nuevo canal |
| Overlay desactivado | Cleanup cierra canal, `coberturaMap` se limpia |

---

## Lo que NO cambia

- Lógica de fetch ArcGIS (overlay GeoJSON)
- Popups (MunicipioPopup, SeccionPopup)
- Rutas de API
- Schema de base de datos
- Dependencias npm

---

## Orden de implementación

1. Habilitar Realtime en `compromisos_seccion` en Supabase dashboard
2. Añadir `getCoberturaByMunicipio` + tipo `CoberturaSeccion` en `estructura.ts`
3. Añadir `coberturaColor()` + prop `coberturaMap` en `EdomexInteractiveMap.tsx`
4. Añadir leyenda en `LayerPanel.tsx`
5. Añadir estado + `useEffect` de suscripción en `ElectoralMapContainer.tsx`
6. Validar end-to-end: registrar compromiso → ver cambio de color en <1s
