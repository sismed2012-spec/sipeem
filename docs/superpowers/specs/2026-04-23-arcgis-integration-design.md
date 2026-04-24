# ArcGIS Integration — SIPEEM Design Spec
Date: 2026-04-23

## Objetivo

Reemplazar el GeoJSON estático local (`edomex_municipios_wgs84.geojson`) con datos en vivo del FeatureServer ArcGIS del Estado de México. Mantener el componente visual del mapa sin cambio de librería — solo enriquecer con datos reales y añadir overlays configurables y popups con datos combinados ArcGIS + Supabase.

---

## Servicio ArcGIS

- **URL base:** `https://services1.arcgis.com/IgzKWPBqILuPKm5Y/arcgis/rest/services/Estado_de_México/FeatureServer`
- **Autenticación:** token requerido (`Token Required: 499`). El usuario genera el token en ArcGIS Online → Account → My API Keys.
- **Capas:**

| ID | Nombre | Features aprox. |
|----|--------|-----------------|
| 0 | DISTRITO_FEDERAL | ~30 |
| 1 | DISTRITO_LOCAL | ~45 |
| 2 | ENTIDAD | 1 |
| 3 | MUNICIPIO | 125 |
| 4 | SECCION | 7,052 |

---

## Decisiones de diseño

| Decisión | Elección |
|----------|----------|
| Reemplazar GeoJSON local | Sí — MUNICIPIO (layer 3) como fuente única |
| Configuración de capas | Un solo `ARCGIS_FEATURE_SERVER_URL` + IDs hardcodeados en el lib |
| Autenticación | `ARCGIS_AUTH_MODE=token`, token en `ARCGIS_TOKEN` |
| UI de capas | MUNICIPIO base fija + overlays activables (Dto. Fed., Dto. Local, Sección, Entidad) |
| Secciones | Carga lazy — solo del municipio seleccionado, no los 7,052 globales |
| Click municipio | Popup inline con 3 tabs: Cartografía (ArcGIS) / Electoral (Supabase) / Estructura (Supabase) |
| Click sección | Popup con datos ArcGIS (lista nominal, tipo) + Supabase (promotor, compromisos, último evento) |

---

## Arquitectura

```
src/lib/arcgis.ts                    ← refactorizar
src/app/api/arcgis/[layer]/route.ts  ← ajuste menor
src/app/api/arcgis/catalog/route.ts  ← sin cambio
src/app/(protected)/mapa/page.tsx    ← readFile → queryLayer
src/components/analytics/ElectoralMapContainer.tsx ← overlays + popups
.env.local / .env.local.example      ← env vars nuevas
```

---

## src/lib/arcgis.ts — Refactorización

**Qué cambia:** eliminar el sistema de env vars por capa, sustituir por URL base + IDs hardcodeados.

```ts
const FEATURE_SERVER_URL = process.env.ARCGIS_FEATURE_SERVER_URL!

const LAYER_IDS = {
  distrito_federal: 0,
  distrito_local:   1,
  entidad:          2,
  municipio:        3,
  seccion:          4,
} as const

export type ArcGISLayerKey = keyof typeof LAYER_IDS
```

**Función principal:**
```ts
export async function queryLayer(
  layer: ArcGISLayerKey,
  params?: {
    where?: string
    outFields?: string
    returnGeometry?: boolean
    outSR?: number
    resultRecordCount?: number
    resultOffset?: number
  }
): Promise<GeoJSON.FeatureCollection>
```

- Default: `outSR=4326`, `f=geojson`, `where=1=1`, `returnGeometry=true`
- Token automático desde `ARCGIS_TOKEN`
- `municipio` y `entidad` usan `cache()` de React (estables, no cambian)
- `seccion` nunca cachea (se filtra por municipio en cada request)

**Helpers que se eliminan:** `getArcGISLayerCatalog`, `getArcGISLayerConfig`, `assertArcGISReady`, `ARCGIS_LAYER_KEYS`, `ARCGIS_QUERY_PARAM_ALLOWLIST` con env vars de capa.

**Helpers que se mantienen:** `getArcGISToken`, `getArcGISAuthMode`, `getArcGISPortalUrl`, `isArcGISEnabled`.

**Helper nuevo:** `isArcGISLayer(s: string): s is ArcGISLayerKey`

---

## /api/arcgis/[layer]/route.ts — Ajuste

- Reemplazar lookup de `getArcGISLayerConfig` con `isArcGISLayer` + `queryLayer`
- Añadir `outSR=4326` como default si no viene en la query
- Cap `resultRecordCount=2000` cuando `layer === 'seccion'` sin `where` específico (previene descarga global accidental)
- Mantener auth check (`getUsuarioActual`)
- Mantener allowlist de parámetros para `seccion` con `where=seccion_id=X` o `where=municipio_id=X`

---

## mapa/page.tsx — Cambio de fuente de datos

**Antes:**
```ts
const geoPath = path.join(process.cwd(), 'public', 'maps', 'edomex_municipios_wgs84.geojson')
const geoData = JSON.parse(await readFile(geoPath, 'utf-8'))
```

**Después:**
```ts
const geoData = await queryLayer('municipio', {
  outFields: '*',
  returnGeometry: true,
  outSR: 4326,
})
```

- El archivo `public/maps/edomex_municipios_wgs84.geojson` se puede eliminar una vez validado.
- Si `ARCGIS_FEATURE_SERVER_URL` no está definido, la página lanza error descriptivo.

---

## ElectoralMapContainer.tsx — Overlays + Popups

### Panel de capas (nuevo)
Floating panel top-right con toggle por capa:

| Capa | Tipo | Default |
|------|------|---------|
| Municipio | base (siempre visible) | — |
| Dto. Federal | overlay | off |
| Dto. Local | overlay | off |
| Sección | lazy overlay | off |
| Entidad | overlay | off |

Al activar un overlay que no sea `seccion`, el componente hace `fetch('/api/arcgis/{layer}?returnGeometry=true')` y renderiza los polígonos con color distinto y opacidad reducida.

Al activar `seccion`, espera a que el usuario seleccione un municipio antes de cargar. Si ya hay un municipio seleccionado, carga inmediatamente con `where={CAMPO_MUNICIPIO}={id}`.

> **Nota de implementación:** el nombre exacto del campo de municipio en la capa SECCION (ej. `MUNICIPIO`, `CVE_MUN`, `municipio_id`) debe verificarse en `FeatureServer/4?f=json` una vez configurado el token. Usar ese nombre en el `where`.

### Popup municipio (3 tabs)
Se abre al hacer click en un polígono de municipio.

**Tab 1 — Cartografía** (datos de ArcGIS, disponibles sin fetch adicional — vienen en el GeoJSON base):
- Nombre, CVEGEO, Dto. Federal, Dto. Local, lista nominal, número de secciones

**Tab 2 — Electoral** (fetch Supabase via `getHistorialByMunicipio` en `src/actions/historial.ts`):
- Último resultado capturado, tendencia (termómetro), responsable, votos objetivo, avance de estructura

**Tab 3 — Estructura** (fetch Supabase via `getEstructuraByMunicipio` en `src/actions/estructura.ts`):
- Promotores registrados, cobertura de secciones %, compromisos captados, último evento de campo

Botón "Ver secciones" en el popup activa el overlay lazy de secciones para ese municipio.
Botón "Ficha completa" navega a `/admin/historial/municipio/[id]`.

### Popup sección
Se abre al hacer click en un polígono de sección (solo cuando el overlay está activo).

**Datos ArcGIS** (vienen en el feature del overlay):
- Número de sección, lista nominal, tipo (urbana/rural/mixta), municipio y Dto. Local

**Datos Supabase** (fetch lazy via `getEstructuraBySeccion` en `src/actions/estructura.ts` al abrir el popup):
- Promotor asignado, compromisos captados / meta, fecha último evento de campo, badge de estatus de cobertura

Botón "Abrir ficha completa" navega a la página de detalle de estructura de esa sección.

---

## Variables de entorno

### Eliminar
```
ARCGIS_LAYER_MUNICIPIOS_URL
ARCGIS_LAYER_SECCIONES_URL
ARCGIS_LAYER_PUBLICIDAD_URL
ARCGIS_LAYER_RUTAS_URL
```

### Agregar
```
ARCGIS_FEATURE_SERVER_URL=https://services1.arcgis.com/IgzKWPBqILuPKm5Y/arcgis/rest/services/Estado_de_México/FeatureServer
```

### Mantener
```
ARCGIS_AUTH_MODE=token
ARCGIS_TOKEN=<generar en ArcGIS Online → Account → My API Keys>
ARCGIS_PORTAL_URL=https://www.arcgis.com
NEXT_PUBLIC_ENABLE_ARCGIS_MAP=true  ← cambiar de false a true
```

---

## Manejo de errores

| Escenario | Comportamiento |
|-----------|---------------|
| `ARCGIS_FEATURE_SERVER_URL` no definido | `mapa/page.tsx` lanza error → `error.tsx` muestra mensaje descriptivo |
| Token inválido o expirado | API route devuelve `502` con mensaje "Token ArcGIS inválido" |
| Sección sin `where` → >2000 features | API route rechaza con `400` "Agrega filtro where para consultar secciones" |
| Overlay fetch falla en cliente | Toast de error, overlay no se muestra, mapa base sigue funcionando |
| Supabase fetch en popup falla | Tab muestra skeleton + "No disponible", no bloquea el popup |

---

## Archivos a eliminar tras validación
- `public/maps/edomex_municipios_wgs84.geojson`

---

## Orden de implementación sugerido
1. Refactorizar `src/lib/arcgis.ts`
2. Ajustar `/api/arcgis/[layer]/route.ts` y `/api/arcgis/catalog/route.ts`
3. Actualizar env vars (`.env.local`, `.env.local.example`, Vercel)
4. Actualizar `mapa/page.tsx` para usar `queryLayer`
5. Validar que el mapa base sigue funcionando
6. Añadir panel de overlays a `ElectoralMapContainer`
7. Implementar popup de municipio (3 tabs)
8. Implementar carga lazy de secciones + popup de sección
9. Eliminar GeoJSON estático
