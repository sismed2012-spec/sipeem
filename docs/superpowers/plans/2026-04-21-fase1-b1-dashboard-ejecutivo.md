# Dashboard Ejecutivo (Sala de Situación) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear una "Sala de Situación" en `/admin/situacion` que muestre todos los municipios activos con KPIs globales y un semáforo ordenado por urgencia (combinación prioridad + riesgo).

**Architecture:** Server Component page que llama `getSituacionGlobal()` — un action que agrega municipios + estrategias + termómetros + conteos de aspirantes/planilla en 5 queries paralelas. La tabla de municipios es un Client Component para permitir filtrado/ordenamiento en el browser sin re-fetch.

**Tech Stack:** Next.js 16.2.3 Server Actions · React 19.2.4 · Tailwind CSS 4 · @base-ui/react · lucide-react

---

## Context (read before starting)

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay repositorio git — NO hacer commits
- Leer `AGENTS.md` y `node_modules/next/dist/docs/` antes de escribir código Next.js
- Patrón de server actions: ver `src/actions/analytics.ts` como referencia
- Patrón de páginas admin: ver `src/app/(protected)/admin/historial/dashboard/page.tsx`
- Sidebar: `src/components/SidebarNav.tsx` — agregar link de navegación
- No hay tests en el proyecto — verificar con `npm run build` al finalizar

## File Map

| Archivo | Acción |
|---------|--------|
| `src/actions/situacion.ts` | Crear — action con `getSituacionGlobal()` |
| `src/components/situacion/GlobalKPIs.tsx` | Crear — 4 tarjetas KPI (Server Component) |
| `src/components/situacion/SituacionTable.tsx` | Crear — tabla con filtro/sort (Client Component) |
| `src/app/(protected)/admin/situacion/page.tsx` | Crear — página principal |
| `src/components/SidebarNav.tsx` | Modificar — agregar link "Sala de Situación" |
| `src/app/(protected)/admin/page.tsx` | Modificar — agregar tarjeta al hub admin |

---

### Task 1: Server Action `getSituacionGlobal`

**Files:**
- Create: `src/actions/situacion.ts`

- [ ] **Step 1: Crear el archivo de action**

```typescript
// src/actions/situacion.ts
"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type SituacionMunicipio = {
  id: number;
  nombre: string;
  color: string;
  prioridad: string | null;
  riesgo: string | null;
  estatus: string | null;
  responsable: string | null;
  avgTermometro: number | null;
  aspirantesCount: number;
  planillaCount: number;
  urgencyScore: number; // 0–8: sum of prioridad score (1-4) + riesgo score (1-4)
};

export type SituacionGlobalDTO = {
  municipios: SituacionMunicipio[];
  kpis: {
    total: number;
    conEstrategia: number;   // % completado
    enRiesgoAlto: number;    // Alto o Extremo
    conAspirantes: number;   // al menos 1 aspirante registrado
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PRIORIDAD_SCORE: Record<string, number> = {
  Crítica: 4, Alta: 3, Media: 2, Baja: 1,
};
const RIESGO_SCORE: Record<string, number> = {
  Extremo: 4, Alto: 3, Medio: 2, Bajo: 1,
};

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------
export async function getSituacionGlobal(): Promise<SituacionGlobalDTO> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    redirect("/login");
  }

  const svc = createServiceClient();

  const [mRes, eRes, tRes, aRes, pRes] = await Promise.all([
    svc.from("municipios").select("id, nombre, color").eq("estatus", "activo").order("nombre"),
    svc.from("estrategia_municipal").select("municipio_id, prioridad, riesgo, estatus, responsable"),
    svc.from("termometros").select("municipio_id, term1, term2, term3, term4, term5"),
    svc.from("aspirantes").select("municipio_id"),
    svc.from("planilla").select("municipio_id"),
  ]);

  const firstError = mRes.error ?? eRes.error ?? tRes.error ?? aRes.error ?? pRes.error;
  if (firstError) throw new Error(firstError.message);

  // Build lookup maps
  const estrategiaMap = new Map((eRes.data ?? []).map((e) => [e.municipio_id, e]));
  const termMap = new Map((tRes.data ?? []).map((t) => [t.municipio_id, t]));

  const aspirantesCount: Record<number, number> = {};
  for (const a of aRes.data ?? [])
    aspirantesCount[a.municipio_id] = (aspirantesCount[a.municipio_id] ?? 0) + 1;

  const planillaCount: Record<number, number> = {};
  for (const p of pRes.data ?? [])
    planillaCount[p.municipio_id] = (planillaCount[p.municipio_id] ?? 0) + 1;

  const municipios: SituacionMunicipio[] = (mRes.data ?? []).map((m) => {
    const e = estrategiaMap.get(m.id) ?? null;
    const t = termMap.get(m.id) ?? null;
    const avgTermometro = t
      ? (t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5
      : null;
    const urgencyScore = e
      ? (PRIORIDAD_SCORE[e.prioridad] ?? 0) + (RIESGO_SCORE[e.riesgo] ?? 0)
      : 0;

    return {
      id: m.id,
      nombre: m.nombre,
      color: m.color,
      prioridad: e?.prioridad ?? null,
      riesgo: e?.riesgo ?? null,
      estatus: e?.estatus ?? null,
      responsable: e?.responsable ?? null,
      avgTermometro,
      aspirantesCount: aspirantesCount[m.id] ?? 0,
      planillaCount: planillaCount[m.id] ?? 0,
      urgencyScore,
    };
  });

  // Sort by urgency desc, then nombre asc
  municipios.sort((a, b) => b.urgencyScore - a.urgencyScore || a.nombre.localeCompare(b.nombre));

  const kpis = {
    total: municipios.length,
    conEstrategia: municipios.filter((m) => m.prioridad !== null).length,
    enRiesgoAlto: municipios.filter((m) => m.riesgo === "Alto" || m.riesgo === "Extremo").length,
    conAspirantes: municipios.filter((m) => m.aspirantesCount > 0).length,
  };

  return { municipios, kpis };
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd M:/SIPPEEM/sipeem && npx tsc --noEmit 2>&1 | head -20
```

Esperado: sin errores nuevos (puede haber el error pre-existente de analytics.ts:153).

---

### Task 2: Componente GlobalKPIs

**Files:**
- Create: `src/components/situacion/GlobalKPIs.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// src/components/situacion/GlobalKPIs.tsx
import type { SituacionGlobalDTO } from "@/actions/situacion";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Users, BarChart3, MapPin } from "lucide-react";

type Props = { kpis: SituacionGlobalDTO["kpis"] };

export default function GlobalKPIs({ kpis }: Props) {
  const pctConEstrategia =
    kpis.total > 0 ? Math.round((kpis.conEstrategia / kpis.total) * 100) : 0;

  const items = [
    {
      label: "Municipios activos",
      value: kpis.total,
      sub: "En el sistema",
      icon: MapPin,
      bg: "bg-slate-50",
      fg: "text-slate-500",
    },
    {
      label: "Con estrategia",
      value: `${pctConEstrategia}%`,
      sub: `${kpis.conEstrategia} de ${kpis.total}`,
      icon: BarChart3,
      bg: "bg-indigo-50",
      fg: "text-indigo-500",
    },
    {
      label: "Riesgo alto / extremo",
      value: kpis.enRiesgoAlto,
      sub: "Requieren atención inmediata",
      icon: AlertTriangle,
      bg: "bg-rose-50",
      fg: "text-rose-500",
    },
    {
      label: "Con aspirantes",
      value: kpis.conAspirantes,
      sub: "Al menos 1 registrado",
      icon: Users,
      bg: "bg-emerald-50",
      fg: "text-emerald-500",
    },
  ] as const;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="border-slate-200 shadow-sm">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${item.bg}`}>
                <Icon className={`w-5 h-5 ${item.fg}`} />
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  {item.label}
                </p>
                <p className="text-2xl font-black text-slate-900">{item.value}</p>
                <p className="text-[10px] text-slate-400">{item.sub}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
```

---

### Task 3: Componente SituacionTable (Client)

**Files:**
- Create: `src/components/situacion/SituacionTable.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// src/components/situacion/SituacionTable.tsx
"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { SituacionMunicipio } from "@/actions/situacion";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type Props = { municipios: SituacionMunicipio[] };

const PRIORIDAD_COLORS: Record<string, string> = {
  Crítica: "bg-rose-100 text-rose-700 border-rose-200",
  Alta: "bg-orange-100 text-orange-700 border-orange-200",
  Media: "bg-amber-100 text-amber-700 border-amber-200",
  Baja: "bg-slate-100 text-slate-600 border-slate-200",
};

const RIESGO_COLORS: Record<string, string> = {
  Extremo: "bg-red-100 text-red-700 border-red-200",
  Alto: "bg-orange-100 text-orange-700 border-orange-200",
  Medio: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Bajo: "bg-green-100 text-green-600 border-green-200",
};

function TermBar({ value }: { value: number | null }) {
  if (value === null)
    return <span className="text-xs text-slate-300 italic">—</span>;
  const pct = Math.min(100, Math.max(0, (value / 100) * 100));
  const color =
    pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-600">{value.toFixed(0)}</span>
    </div>
  );
}

export default function SituacionTable({ municipios }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () =>
      municipios.filter((m) =>
        m.nombre.toLowerCase().includes(search.toLowerCase())
      ),
    [municipios, search]
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar municipio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl border-slate-200"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Municipio
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Prioridad
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Riesgo
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Estatus
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Termóm. avg
              </th>
              <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Asp.
              </th>
              <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Planilla
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Sin resultados
                </td>
              </tr>
            )}
            {filtered.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: m.color || "#94a3b8" }}
                    />
                    <span className="font-semibold text-slate-900">{m.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {m.prioridad ? (
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-black uppercase tracking-wide ${PRIORIDAD_COLORS[m.prioridad] ?? ""}`}
                    >
                      {m.prioridad}
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-300 italic">Sin ficha</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {m.riesgo ? (
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-black uppercase tracking-wide ${RIESGO_COLORS[m.riesgo] ?? ""}`}
                    >
                      {m.riesgo}
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {m.estatus ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <TermBar value={m.avgTermometro} />
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`text-xs font-bold ${
                      m.aspirantesCount > 0 ? "text-slate-900" : "text-slate-300"
                    }`}
                  >
                    {m.aspirantesCount}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`text-xs font-bold ${
                      m.planillaCount > 0 ? "text-slate-900" : "text-slate-300"
                    }`}
                  >
                    {m.planillaCount}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/estrategia-municipal/${m.id}`}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    Ver ficha →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400 text-right">
        {filtered.length} municipio{filtered.length !== 1 ? "s" : ""} · ordenados por urgencia
      </p>
    </div>
  );
}
```

---

### Task 4: Página `/admin/situacion`

**Files:**
- Create: `src/app/(protected)/admin/situacion/page.tsx`

- [ ] **Step 1: Crear la página**

```tsx
// src/app/(protected)/admin/situacion/page.tsx
import { getSituacionGlobal } from "@/actions/situacion";
import GlobalKPIs from "@/components/situacion/GlobalKPIs";
import SituacionTable from "@/components/situacion/SituacionTable";
import { Gauge } from "lucide-react";

export default async function SituacionPage() {
  const data = await getSituacionGlobal();

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">
          Inteligencia Operativa
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight flex items-center gap-3">
          <Gauge className="w-8 h-8" />
          Sala de Situación
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Vista ejecutiva de todos los municipios activos. Ordenados por urgencia estratégica.
        </p>
      </div>

      {/* KPIs */}
      <GlobalKPIs kpis={data.kpis} />

      {/* Table */}
      <section className="space-y-3">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.25em]">
          Estado por Municipio
        </h2>
        <SituacionTable municipios={data.municipios} />
      </section>
    </div>
  );
}
```

---

### Task 5: Integración en Sidebar y Hub Admin

**Files:**
- Modify: `src/components/SidebarNav.tsx`
- Modify: `src/app/(protected)/admin/page.tsx`

- [ ] **Step 1: Leer el SidebarNav actual**

Leer el archivo completo: `src/components/SidebarNav.tsx`

- [ ] **Step 2: Agregar link "Sala de Situación" al sidebar**

Buscar el bloque de links de admin (donde están "Estrategia municipal", "Historial", etc.) y agregar ANTES del primer link de admin:

```tsx
{/* Dentro del array de nav items o en el JSX donde se renderizan los links admin */}
<Link
  href="/admin/situacion"
  className={/* misma clase que los otros links admin */}
>
  <Gauge className="w-4 h-4" />
  Sala de Situación
</Link>
```

Ajustar el import de Gauge desde lucide-react en el sidebar.

- [ ] **Step 3: Agregar tarjeta en `/admin/page.tsx`**

Abrir `src/app/(protected)/admin/page.tsx` y agregar una tarjeta en el grid:

```tsx
<div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
    <Gauge className="w-6 h-6" />
  </div>
  <h2 className="text-xl font-bold text-slate-900">Sala de Situación</h2>
  <p className="mt-2 text-sm leading-6 text-slate-600">
    Vista ejecutiva de todos los municipios: prioridad, riesgo, termómetros y actores.
  </p>
  <div className="mt-6">
    <Link
      href="/admin/situacion"
      className="inline-flex rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
    >
      Abrir módulo
    </Link>
  </div>
</div>
```

Agregar import: `import { Gauge } from "lucide-react";`

- [ ] **Step 4: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```

Esperado: `✓ Compiled successfully` o solo el error pre-existente de analytics.ts.
