# Estructura Territorial — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo de organización territorial por sección electoral: registrar promotores, asignarles secciones, capturar metas y avance de compromisos de voto por sección.

**Architecture:** 3 tablas nuevas (`secciones`, `promotores`, `compromisos_seccion`). Página independiente `/admin/estructura/[municipioId]` (no tab — es más compleja). Actions en `src/actions/estructura.ts`. Vista con resumen de cobertura % por sección.

**Tech Stack:** Supabase · Next.js Server Actions · Recharts (gráfica de barras de cobertura) · Tailwind CSS 4

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- Referencia para página por municipio: `src/app/(protected)/admin/historial/municipio/[id]/page.tsx`
- Esta es la feature más compleja de Fase 3 — leer el plan completo antes de empezar

---

### Task 1: SQL — 3 nuevas tablas

- [ ] **Step 1: Ejecutar en Supabase SQL Editor**

```sql
-- Catálogo de secciones electorales
CREATE TABLE public.secciones (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  municipio_id  bigint NOT NULL REFERENCES public.municipios(id) ON DELETE CASCADE,
  numero        int NOT NULL,
  tipo          text CHECK (tipo IN ('urbana','rural','mixta')),
  lista_nominal int,
  UNIQUE(municipio_id, numero)
);
CREATE INDEX secciones_municipio_idx ON public.secciones (municipio_id);

-- Promotores y activistas
CREATE TABLE public.promotores (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  municipio_id     bigint NOT NULL REFERENCES public.municipios(id) ON DELETE CASCADE,
  nombre           text NOT NULL,
  telefono         text,
  secciones_asign  int[] NOT NULL DEFAULT '{}',
  meta_compromisos int NOT NULL DEFAULT 0,
  activo           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX promotores_municipio_idx ON public.promotores (municipio_id);

-- Avance de compromisos por sección
CREATE TABLE public.compromisos_seccion (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  municipio_id  bigint NOT NULL REFERENCES public.municipios(id) ON DELETE CASCADE,
  seccion_id    bigint REFERENCES public.secciones(id) ON DELETE SET NULL,
  promotor_id   bigint REFERENCES public.promotores(id) ON DELETE SET NULL,
  compromisos   int NOT NULL DEFAULT 0,
  meta          int NOT NULL DEFAULT 0,
  fecha         date NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE(municipio_id, seccion_id, fecha)
);
CREATE INDEX compromisos_seccion_municipio_idx ON public.compromisos_seccion (municipio_id);
```

---

### Task 2: Tipos en `src/lib/types.ts`

- [ ] **Step 1: Agregar tipos al final**

```typescript
export interface SeccionElectoral {
  id: number;
  municipio_id: number;
  numero: number;
  tipo: "urbana" | "rural" | "mixta" | null;
  lista_nominal: number | null;
}

export interface Promotor {
  id: number;
  municipio_id: number;
  nombre: string;
  telefono: string | null;
  secciones_asign: number[];
  meta_compromisos: number;
  activo: boolean;
  created_at: string;
}

export interface CompromisoSeccion {
  id: number;
  municipio_id: number;
  seccion_id: number | null;
  promotor_id: number | null;
  compromisos: number;
  meta: number;
  fecha: string;
}
```

---

### Task 3: Actions `src/actions/estructura.ts`

- [ ] **Step 1: Crear el archivo con estas funciones**

```typescript
// src/actions/estructura.ts
"use server";
// ...

export async function getEstructuraMunicipio(municipioId: number): Promise<{
  secciones: SeccionElectoral[];
  promotores: Promotor[];
  compromisos: CompromisoSeccion[];
}>

export async function createSeccion(municipioId: number, data: Omit<SeccionElectoral, "id" | "municipio_id">): Promise<void>
export async function deleteSeccion(id: number, municipioId: number): Promise<void>

export async function createPromotor(municipioId: number, data: Omit<Promotor, "id" | "municipio_id" | "created_at">): Promise<void>
export async function updatePromotor(id: number, municipioId: number, data: Partial<Omit<Promotor, "id" | "municipio_id" | "created_at">>): Promise<void>
export async function deletePromotor(id: number, municipioId: number): Promise<void>

export async function upsertCompromisoSeccion(municipioId: number, seccionId: number, compromisos: number, meta: number): Promise<void>
// upsert on (municipio_id, seccion_id, fecha) conflict
```

Seguir exactamente los mismos patrones de `src/actions/actores.ts`: `assertAdmin()`, `createServiceClient()`, `.eq("municipio_id", municipioId)` en todos los deletes/updates, `revalidatePath`.

---

### Task 4: Página `/admin/estructura/[municipioId]`

**Files:**
- Create: `src/app/(protected)/admin/estructura/[municipioId]/page.tsx`
- Create: `src/components/estructura/SeccionesPanel.tsx` — tabla + add sección
- Create: `src/components/estructura/PromotoresPanel.tsx` — tabla + add/edit/delete promotor
- Create: `src/components/estructura/CoberturaChart.tsx` — gráfica de barras de cobertura % por sección (usa Recharts)

**Layout de la página:**
1. Header: breadcrumb "← Estructura" + nombre del municipio
2. KPIs: total secciones, total promotores activos, % cobertura global (compromisos/meta)
3. `<CoberturaChart>` — barra por sección con % completado
4. Tabs internos: "Secciones" | "Promotores"

---

### Task 5: Link desde ficha municipal

- [ ] **Step 1: En `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx`**

Agregar un botón en el header que lleve a `/admin/estructura/${municipioId}`:

```tsx
<Link href={`/admin/estructura/${municipioId}`} className="...">
  Ver estructura territorial
</Link>
```

- [ ] **Step 2: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
