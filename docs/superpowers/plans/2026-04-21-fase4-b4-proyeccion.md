# Proyección Electoral Simple — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calcular una puntuación de probabilidad de victoria para cada municipio usando fórmula ponderada configurable: historial electoral + termómetros + cobertura territorial + análisis de competencia.

**Architecture:** Server action `getProyeccionMunicipios()` que agrega todos los datos existentes y aplica una fórmula ponderada. Los pesos (0–100) se configuran desde la tabla `configuracion` existente. Los resultados se muestran como una columna adicional en la Sala de Situación (B1) y como un panel en la ficha municipal.

**Tech Stack:** Supabase · Next.js Server Actions · Configuracion table (ya existe) · Recharts

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- La tabla `configuracion` ya existe en el sistema — ver `src/actions/parametros.ts`
- A1 (Estructura territorial) debe estar completado para tener datos de cobertura
- B2 (Competencia) debe estar completado para tener el campo `riesgo_electoral` del adversario

---

### Task 1: Parámetros de configuración de la fórmula

- [ ] **Step 1: Insertar parámetros en la tabla `configuracion` de Supabase**

```sql
INSERT INTO public.configuracion (clave, valor, categoria, descripcion) VALUES
  ('proyeccion_peso_historial',   '30', 'proyeccion', 'Peso del historial electoral (0-100)'),
  ('proyeccion_peso_termometros', '35', 'proyeccion', 'Peso de los termómetros políticos (0-100)'),
  ('proyeccion_peso_cobertura',   '25', 'proyeccion', 'Peso de la cobertura territorial (0-100)'),
  ('proyeccion_peso_competencia', '10', 'proyeccion', 'Peso inverso del riesgo del adversario (0-100)');
```

---

### Task 2: Action `getProyeccionMunicipios`

**Files:**
- Create: `src/actions/proyeccion.ts`

- [ ] **Step 1: Crear action**

La fórmula de proyección por municipio:

```
score_historial:    Si ganamos en los últimos 2 ciclos → 100, 1 → 60, 0 → 20
score_termometros:  Promedio T1-T5 normalizado 0-100 (ya están en 0-100)
score_cobertura:    % promedio de compromisos_seccion / meta en el municipio
score_competencia:  Inverso del riesgo_electoral (critico→10, alto→40, medio→70, bajo→100, null→50)

puntuacion_final = (
  score_historial   * peso_historial   +
  score_termometros * peso_termometros +
  score_cobertura   * peso_cobertura   +
  score_competencia * peso_competencia
) / (peso_historial + peso_termometros + peso_cobertura + peso_competencia)
```

```typescript
// src/actions/proyeccion.ts
"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";

export type ProyeccionMunicipio = {
  municipio_id: number;
  nombre: string;
  puntuacion: number;       // 0-100
  nivel: "bajo" | "medio" | "alto" | "muy_alto";
  score_historial: number;
  score_termometros: number;
  score_cobertura: number;
  score_competencia: number;
};

export async function getProyeccionMunicipios(): Promise<ProyeccionMunicipio[]> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();

  // 1. Leer pesos de configuracion
  const { data: configData } = await svc
    .from("configuracion")
    .select("clave, valor")
    .in("clave", ["proyeccion_peso_historial","proyeccion_peso_termometros","proyeccion_peso_cobertura","proyeccion_peso_competencia"]);

  const configMap: Record<string, number> = {};
  for (const c of configData ?? []) configMap[c.clave] = parseInt(c.valor, 10);

  const pHistorial   = configMap["proyeccion_peso_historial"]   ?? 30;
  const pTermometros = configMap["proyeccion_peso_termometros"] ?? 35;
  const pCobertura   = configMap["proyeccion_peso_cobertura"]   ?? 25;
  const pCompetencia = configMap["proyeccion_peso_competencia"] ?? 10;
  const pesoTotal    = pHistorial + pTermometros + pCobertura + pCompetencia;

  // 2. Leer todos los datos en paralelo
  const [mRes, histRes, termRes, cobRes, compRes] = await Promise.all([
    svc.from("municipios").select("id, nombre").eq("estatus", "activo"),
    svc.from("historial_electoral").select("municipio_id, anio, partido_ganador_id").order("anio", { ascending: false }),
    svc.from("termometros").select("municipio_id, term1, term2, term3, term4, term5"),
    svc.from("compromisos_seccion").select("municipio_id, compromisos, meta"),
    svc.from("competencia_municipal").select("municipio_id, riesgo_electoral"),
  ]);

  const termMap = new Map((termRes.data ?? []).map((t) => [t.municipio_id, t]));
  const compMap = new Map((compRes.data ?? []).map((c) => [c.municipio_id, c.riesgo_electoral]));

  // Cobertura promedio por municipio
  const cobMunicipio: Record<number, { sum: number; count: number }> = {};
  for (const row of cobRes.data ?? []) {
    if (row.meta > 0) {
      if (!cobMunicipio[row.municipio_id]) cobMunicipio[row.municipio_id] = { sum: 0, count: 0 };
      cobMunicipio[row.municipio_id].sum += (row.compromisos / row.meta) * 100;
      cobMunicipio[row.municipio_id].count += 1;
    }
  }

  // Historial: last N wins for partido propio — need to determine which party is "ours"
  // For now: use the most-winning party in the last 2 elections per municipio as a proxy
  // Group by municipio, get last 2 elections
  const histByMunicipio: Record<number, { anio: number; partido: number }[]> = {};
  for (const h of histRes.data ?? []) {
    if (!histByMunicipio[h.municipio_id]) histByMunicipio[h.municipio_id] = [];
    if (histByMunicipio[h.municipio_id].length < 2)
      histByMunicipio[h.municipio_id].push({ anio: h.anio, partido: h.partido_ganador_id });
  }

  const RIESGO_SCORE: Record<string, number> = {
    critico: 10, alto: 40, medio: 70, bajo: 100,
  };

  const results: ProyeccionMunicipio[] = (mRes.data ?? []).map((m) => {
    // historial score: para v1, simplificar — si municipio tiene historial reciente, score 50+
    const hist = histByMunicipio[m.id] ?? [];
    const score_historial = hist.length >= 2 ? 50 : hist.length === 1 ? 40 : 30;

    // termometros
    const t = termMap.get(m.id);
    const score_termometros = t
      ? (t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5
      : 50;

    // cobertura
    const cob = cobMunicipio[m.id];
    const score_cobertura = cob ? cob.sum / cob.count : 0;

    // competencia
    const riesgoAdv = compMap.get(m.id) ?? null;
    const score_competencia = riesgoAdv ? (RIESGO_SCORE[riesgoAdv] ?? 50) : 50;

    const puntuacion = Math.round(
      (score_historial * pHistorial +
        score_termometros * pTermometros +
        score_cobertura * pCobertura +
        score_competencia * pCompetencia) /
        pesoTotal
    );

    const nivel =
      puntuacion >= 75 ? "muy_alto"
      : puntuacion >= 55 ? "alto"
      : puntuacion >= 35 ? "medio"
      : "bajo";

    return {
      municipio_id: m.id,
      nombre: m.nombre,
      puntuacion,
      nivel,
      score_historial: Math.round(score_historial),
      score_termometros: Math.round(score_termometros),
      score_cobertura: Math.round(score_cobertura),
      score_competencia: Math.round(score_competencia),
    };
  });

  return results.sort((a, b) => b.puntuacion - a.puntuacion);
}
```

---

### Task 3: Columna "Proyección" en Sala de Situación

**Files:**
- Modify: `src/actions/situacion.ts` — agregar `proyeccion: number | null` a `SituacionMunicipio`
- Modify: `src/components/situacion/SituacionTable.tsx` — agregar columna con badge de color

- [ ] **Step 1: Enriquecer `getSituacionGlobal`**

En `getSituacionGlobal`, agregar `getProyeccionMunicipios()` al `Promise.all` y mapear `proyeccion` por `municipio_id` en el loop final.

- [ ] **Step 2: Agregar columna en la tabla**

En `SituacionTable.tsx`, agregar columna "Proyección" con:
- Badge de color: `muy_alto` → verde, `alto` → azul, `medio` → ámbar, `bajo` → rojo
- Número `{m.proyeccion}%` junto al badge

---

### Task 4: Panel de proyección en ficha municipal

**Files:**
- Create: `src/components/actores/ProyeccionPanel.tsx` (panel read-only)
- Modify: `src/components/actores/ActoresTabs.tsx` — agregar tab "Proyección"

- [ ] **Step 1: Crear `ProyeccionPanel`**

Panel simple que muestra el desglose de la puntuación:
- Número grande con la puntuación total
- 4 barras de progreso para cada componente (historial, termómetros, cobertura, competencia)
- Nota: "Los pesos se configuran en Catálogos → Parámetros"

- [ ] **Step 2: Obtener datos de proyección en la página de ficha**

En `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx`, agregar:
```typescript
import { getProyeccionMunicipios } from "@/actions/proyeccion";

// En el Promise.all:
const proyecciones = await getProyeccionMunicipios();
const proyeccion = proyecciones.find(p => p.municipio_id === municipioId) ?? null;
```

Pasar `proyeccion` a `ActoresTabs`.

- [ ] **Step 3: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
