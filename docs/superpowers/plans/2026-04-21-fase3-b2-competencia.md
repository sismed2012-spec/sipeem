# Análisis de Competencia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tab "Competencia" en la ficha municipal para registrar datos del adversario principal: candidato, partido, recursos estimados, fortaleza percibida y movimientos recientes.

**Architecture:** Tabla `competencia_municipal` (1 fila por municipio, upsert) + action `upsertCompetencia` + formulario `CompetenciaForm` siguiendo el patrón de `StrategicForm`. Tab en `ActoresTabs`.

**Tech Stack:** Supabase · Next.js Server Actions · Tailwind CSS 4

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- Patrón de referencia para upsert de 1 fila: `src/components/actores/ComiteForm.tsx`
- Patrón de referencia para action: `upsertComite` en `src/actions/actores.ts`

---

### Task 1: SQL tabla `competencia_municipal`

- [ ] **Step 1: Ejecutar en Supabase SQL Editor**

```sql
CREATE TABLE public.competencia_municipal (
  id                    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  municipio_id          bigint NOT NULL UNIQUE REFERENCES public.municipios(id) ON DELETE CASCADE,
  candidato_nombre      text,
  partido               text,
  fortaleza             text CHECK (fortaleza IN ('debil','media','fuerte','muy_fuerte')),
  recursos_estimados    text CHECK (recursos_estimados IN ('bajos','medios','altos','muy_altos')),
  ventajas              text,    -- textarea: ventajas percibidas del adversario
  debilidades           text,    -- textarea: debilidades identificadas
  movimientos_recientes text,    -- textarea: últimas acciones observadas
  riesgo_electoral      text CHECK (riesgo_electoral IN ('bajo','medio','alto','critico')),
  updated_at            timestamptz DEFAULT now()
);
```

---

### Task 2: Tipo `CompetenciaMunicipal` en `src/lib/types.ts`

- [ ] **Step 1: Agregar al final**

```typescript
export interface CompetenciaMunicipal {
  id: number;
  municipio_id: number;
  candidato_nombre: string | null;
  partido: string | null;
  fortaleza: "debil" | "media" | "fuerte" | "muy_fuerte" | null;
  recursos_estimados: "bajos" | "medios" | "altos" | "muy_altos" | null;
  ventajas: string | null;
  debilidades: string | null;
  movimientos_recientes: string | null;
  riesgo_electoral: "bajo" | "medio" | "alto" | "critico" | null;
  updated_at: string | null;
}
```

---

### Task 3: Action `upsertCompetencia` en `src/actions/actores.ts`

- [ ] **Step 1: Agregar a `ActoresMunicipioData`**

```typescript
import type { CompetenciaMunicipal } from "@/lib/types";

// En el tipo:
competencia: CompetenciaMunicipal | null;

// En getActoresMunicipio, agregar al Promise.all:
svc.from("competencia_municipal").select("*").eq("municipio_id", municipioId).maybeSingle()

// En el return:
competencia: competenciaRes.data as CompetenciaMunicipal | null
```

- [ ] **Step 2: Agregar función upsert**

```typescript
export async function upsertCompetencia(
  municipioId: number,
  data: Omit<CompetenciaMunicipal, "id" | "municipio_id" | "updated_at">
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc
    .from("competencia_municipal")
    .upsert({ ...data, municipio_id: municipioId, updated_at: new Date().toISOString() }, { onConflict: "municipio_id" });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}
```

---

### Task 4: Componente `CompetenciaForm`

**Files:**
- Create: `src/components/actores/CompetenciaForm.tsx`

- [ ] **Step 1: Crear formulario upsert**

Seguir exactamente el mismo patrón que `src/components/actores/ComiteForm.tsx`:
- `"use client"` + `useState` para loading/error
- `handleSubmit` con `e.preventDefault()`
- `<form key={JSON.stringify(initialData)} ...>` para remount en prop change
- `role="alert"` en error div
- `router.refresh()` al guardar
- Toast de éxito

Campos:
```tsx
// candidato_nombre: Input text, opcional
// partido: Input text, opcional
// fortaleza: Select (debil/media/fuerte/muy_fuerte), opcional
// recursos_estimados: Select, opcional
// riesgo_electoral: Select (bajo/medio/alto/critico), opcional
// ventajas: Textarea, opcional
// debilidades: Textarea, opcional
// movimientos_recientes: Textarea, opcional
```

---

### Task 5: Integrar en `ActoresTabs`

- [ ] **Step 1: Agregar tab "Competencia"**

1. Import `CompetenciaForm`
2. Agregar `competencia: CompetenciaMunicipal | null` al tipo de actores en props
3. `<TabsTrigger value="competencia">Competencia</TabsTrigger>`
4. `<TabsContent value="competencia"><CompetenciaForm municipioId={municipioId} initialData={actores.competencia} /></TabsContent>`

- [ ] **Step 2: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
