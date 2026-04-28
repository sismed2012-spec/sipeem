# Drill-down a Secciones Electorales — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar una capa de secciones electorales al mapa interactivo existente, permitiendo ver colores de cobertura/resultado a nivel sección dentro de cada municipio al hacer zoom.

**Architecture:** El mapa existente en `src/components/analytics/EdomexInteractiveMap.tsx` ya usa GeoJSON a nivel municipio. Este módulo agrega un segundo GeoJSON de secciones del Edomex. Al seleccionar un municipio, el mapa hace zoom y muestra sus secciones con color de cobertura (datos de `compromisos_seccion` de A1).

**Tech Stack:** GeoJSON de secciones Edomex (archivo estático en `/public`) · Leaflet o el mapa existente · Recharts · Next.js

---

## PREREQUISITO CRÍTICO

Este módulo requiere tener el GeoJSON de secciones electorales del Estado de México. Fuentes:
- INE: descargable en https://cartografia.ife.org.mx/
- SIPEEM puede obtenerlo del INE bajo solicitud

**Antes de ejecutar este plan: confirmar que el GeoJSON está disponible en `public/secciones-edomex.geojson`.**

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- Leer `src/components/analytics/EdomexInteractiveMap.tsx` y `ElectoralMapContainer.tsx` para entender el stack de mapa actual
- A1 (Estructura territorial) debe estar completado para tener datos de cobertura por sección

---

### Task 1: Verificar y colocar GeoJSON

- [ ] **Step 1: Confirmar el archivo**

El GeoJSON debe estar en `M:/SIPPEEM/sipeem/public/secciones-edomex.geojson`.

Si no existe, este plan no puede ejecutarse. Notificar al usuario para obtener el archivo.

Si existe: verificar que tiene una propiedad `SECCION` o `seccion` y `MUNICIPIO_ID` o equivalente para hacer join con los datos.

---

### Task 2: Action `getSeccionesMapData`

**Files:**
- Create: `src/actions/mapa-secciones.ts`

- [ ] **Step 1: Crear action**

```typescript
// src/actions/mapa-secciones.ts
"use server";
// ...

export type SeccionMapDTO = {
  municipio_id: number;
  seccion_numero: number;
  compromisos: number;
  meta: number;
  cobertura_pct: number; // 0-100
};

export async function getSeccionesMapData(municipioId: number): Promise<SeccionMapDTO[]> {
  await assertAdmin();
  const svc = createServiceClient();
  
  const { data, error } = await svc
    .from("compromisos_seccion")
    .select("seccion_id, compromisos, meta, secciones(numero)")
    .eq("municipio_id", municipioId)
    .order("fecha", { ascending: false });
  
  if (error) throw new Error(error.message);
  
  // Use most recent record per sección
  const seen = new Set<number>();
  const result: SeccionMapDTO[] = [];
  for (const row of data ?? []) {
    if (!row.seccion_id || seen.has(row.seccion_id)) continue;
    seen.add(row.seccion_id);
    result.push({
      municipio_id: municipioId,
      seccion_numero: (row.secciones as any)?.numero ?? 0,
      compromisos: row.compromisos,
      meta: row.meta,
      cobertura_pct: row.meta > 0 ? Math.round((row.compromisos / row.meta) * 100) : 0,
    });
  }
  return result;
}
```

---

### Task 3: Componente de capa de secciones

**Files:**
- Create: `src/components/analytics/SeccionesLayer.tsx`
- Modify: `src/components/analytics/EdomexInteractiveMap.tsx` (agregar prop `showSecciones` y renderizar capa)

- [ ] **Step 1: Leer el mapa actual**

Leer `src/components/analytics/EdomexInteractiveMap.tsx` y entender cómo se renderiza el GeoJSON y los event handlers de click/hover.

- [ ] **Step 2: Diseñar SeccionesLayer**

`SeccionesLayer` recibe:
- `municipioSeleccionado: number | null`
- `datos: SeccionMapDTO[]`
- GeoJSON de secciones filtrado por municipio

Renderiza polígonos de sección con color basado en `cobertura_pct`:
- 0% → rojo `#ef4444`
- 50% → ámbar `#f59e0b`
- 100% → verde `#22c55e`

- [ ] **Step 3: Integrar en página del mapa**

En `src/app/(protected)/mapa/page.tsx`, si existe lógica de municipio seleccionado, pasar los datos de secciones cuando el usuario hace click en un municipio.

- [ ] **Step 4: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
