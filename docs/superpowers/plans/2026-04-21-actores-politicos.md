# Actores Políticos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `/admin/estrategia-municipal/[id]` with 6 tabs — Estrategia (existing content) + Termómetros, Escenarios, Comité, Planilla, Aspirantes — backed by Supabase tables that already exist.

**Architecture:** Server Component fetches all data in parallel and passes it to a `"use client"` `ActoresTabs` wrapper that renders `@base-ui/react` Tabs. Single-row modules (Termómetros, Escenarios, Comité) use upsert forms; multi-row modules (Planilla, Aspirantes) use table + inline add, with Aspirantes supporting row-level inline editing.

**Tech Stack:** Next.js 16 App Router, Supabase service client, `@base-ui/react` Tabs, lucide-react, sonner toasts, TypeScript strict mode.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/actions/actores.ts` | Create | All server actions for actors data |
| `src/components/actores/ActoresTabs.tsx` | Create | `"use client"` tab shell, receives all data + children |
| `src/components/actores/TermometrosForm.tsx` | Create | Upsert form for 5 numeric dimensions |
| `src/components/actores/EscenariosForm.tsx` | Create | Upsert form for 4 scenarios × 2 text fields |
| `src/components/actores/ComiteForm.tsx` | Create | Upsert form for committee single record |
| `src/components/actores/PlanillaPanel.tsx` | Create | Table + add form for planilla members |
| `src/components/actores/AspirantesPanel.tsx` | Create | Table + inline edit + add form for aspirants |
| `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx` | Modify | Parallel fetch + wrap existing content in ActoresTabs |

---

## Task 1: Server Actions

**Files:**
- Create: `src/actions/actores.ts`

- [ ] **Step 1: Create the file**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import type {
  Termometros,
  Escenarios,
  ComiteMunicipal,
  Planilla,
  Aspirante,
} from "@/lib/types";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || (usuario.rol !== "director" && usuario.rol !== "admin")) {
    throw new Error("Privilegios insuficientes para acceder al módulo de actores");
  }
  return usuario;
}

export type ActoresMunicipioData = {
  termometros: Termometros | null;
  escenarios: Escenarios | null;
  comite: ComiteMunicipal | null;
  planilla: Planilla[];
  aspirantes: Aspirante[];
};

export async function getActoresMunicipio(
  municipioId: number
): Promise<ActoresMunicipioData> {
  await assertAdmin();
  const service = createServiceClient();

  const [
    { data: termometros },
    { data: escenarios },
    { data: comite },
    { data: planilla },
    { data: aspirantes },
  ] = await Promise.all([
    service.from("termometros").select("*").eq("municipio_id", municipioId).maybeSingle(),
    service.from("escenarios").select("*").eq("municipio_id", municipioId).maybeSingle(),
    service.from("comite_municipal").select("*").eq("municipio_id", municipioId).maybeSingle(),
    service.from("planilla").select("*").eq("municipio_id", municipioId).order("cargo"),
    service.from("aspirantes").select("*").eq("municipio_id", municipioId).order("nombre"),
  ]);

  return {
    termometros: termometros as Termometros | null,
    escenarios: escenarios as Escenarios | null,
    comite: comite as ComiteMunicipal | null,
    planilla: (planilla ?? []) as Planilla[],
    aspirantes: (aspirantes ?? []) as Aspirante[],
  };
}

export async function upsertTermometros(
  municipioId: number,
  data: { term1: number; term2: number; term3: number; term4: number; term5: number }
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service
    .from("termometros")
    .upsert({ municipio_id: municipioId, ...data }, { onConflict: "municipio_id" });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return { success: true };
}

export async function upsertEscenarios(
  municipioId: number,
  data: {
    e1_comp: string; e1_rec: string;
    e2_gen: string; e2_atr: string;
    e3_gob: string; e3_dem: string;
    e4_niv: string; e4_foco: string;
  }
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service
    .from("escenarios")
    .upsert({ municipio_id: municipioId, ...data }, { onConflict: "municipio_id" });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return { success: true };
}

export async function upsertComite(
  municipioId: number,
  data: {
    presidente: string;
    secretario: string;
    fachada_url: string | null;
    link_maps: string | null;
    inaugurado: boolean;
  }
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service
    .from("comite_municipal")
    .upsert({ municipio_id: municipioId, ...data }, { onConflict: "municipio_id" });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return { success: true };
}

export async function createPlanillaMember(
  municipioId: number,
  data: { cargo: string; nombre: string; partido: string }
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service.from("planilla").insert({
    municipio_id: municipioId,
    cargo: data.cargo.trim(),
    nombre: data.nombre.trim(),
    partido: data.partido.trim(),
    foto_url: null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return { success: true };
}

export async function deletePlanillaMember(id: number, municipioId: number) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service.from("planilla").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return { success: true };
}

export async function createAspirante(
  municipioId: number,
  data: {
    nombre: string;
    cargo_aspirado: string;
    partido: string;
    fecha_nacimiento: string | null;
    telefono: string | null;
    email: string | null;
    notas: string | null;
  }
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service.from("aspirantes").insert({
    municipio_id: municipioId,
    nombre: data.nombre.trim(),
    cargo_aspirado: data.cargo_aspirado.trim(),
    partido: data.partido.trim(),
    fecha_nacimiento: data.fecha_nacimiento || null,
    telefono: data.telefono?.trim() || null,
    email: data.email?.trim() || null,
    notas: data.notas?.trim() || null,
    foto_url: null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return { success: true };
}

export async function updateAspirante(
  id: number,
  municipioId: number,
  data: {
    nombre: string;
    cargo_aspirado: string;
    partido: string;
    fecha_nacimiento: string | null;
    telefono: string | null;
    email: string | null;
    notas: string | null;
  }
) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service
    .from("aspirantes")
    .update({
      nombre: data.nombre.trim(),
      cargo_aspirado: data.cargo_aspirado.trim(),
      partido: data.partido.trim(),
      fecha_nacimiento: data.fecha_nacimiento || null,
      telefono: data.telefono?.trim() || null,
      email: data.email?.trim() || null,
      notas: data.notas?.trim() || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return { success: true };
}

export async function deleteAspirante(id: number, municipioId: number) {
  await assertAdmin();
  const service = createServiceClient();

  const { error } = await service.from("aspirantes").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return { success: true };
}
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | head -30
```

Expected: no errors related to `actores.ts`. If there are type errors, check that `Termometros`, `Escenarios`, `ComiteMunicipal`, `Planilla`, `Aspirante` are all exported from `src/lib/types.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/actores.ts
git commit -m "feat: add actors server actions (termometros, escenarios, comite, planilla, aspirantes)"
```

---

## Task 2: ActoresTabs Shell + Page Modification

**Files:**
- Create: `src/components/actores/ActoresTabs.tsx`
- Modify: `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx`

- [ ] **Step 1: Create ActoresTabs**

The `Tabs` component from `@base-ui/react` uses `defaultValue` for the default active tab. `TabsTrigger` uses `value` prop. `TabsContent` is `TabsPrimitive.Panel` and also uses `value`. The `TabsList` default class has `w-fit` — override with `w-full h-auto flex-wrap` for 6 tabs.

```tsx
"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { ActoresMunicipioData } from "@/actions/actores";
import TermometrosForm from "./TermometrosForm";
import EscenariosForm from "./EscenariosForm";
import ComiteForm from "./ComiteForm";
import PlanillaPanel from "./PlanillaPanel";
import AspirantesPanel from "./AspirantesPanel";

type Props = {
  municipioId: number;
  actores: ActoresMunicipioData;
  children: React.ReactNode;
};

export default function ActoresTabs({ municipioId, actores, children }: Props) {
  return (
    <Tabs defaultValue="estrategia" className="space-y-6">
      <TabsList className="w-full h-auto flex-wrap gap-1 rounded-2xl p-1.5">
        <TabsTrigger value="estrategia">Estrategia</TabsTrigger>
        <TabsTrigger value="termometros">Termómetros</TabsTrigger>
        <TabsTrigger value="escenarios">Escenarios</TabsTrigger>
        <TabsTrigger value="comite">Comité</TabsTrigger>
        <TabsTrigger value="planilla">Planilla</TabsTrigger>
        <TabsTrigger value="aspirantes">Aspirantes</TabsTrigger>
      </TabsList>

      <TabsContent value="estrategia" className="space-y-8">
        {children}
      </TabsContent>

      <TabsContent value="termometros">
        <TermometrosForm municipioId={municipioId} initialData={actores.termometros} />
      </TabsContent>

      <TabsContent value="escenarios">
        <EscenariosForm municipioId={municipioId} initialData={actores.escenarios} />
      </TabsContent>

      <TabsContent value="comite">
        <ComiteForm municipioId={municipioId} initialData={actores.comite} />
      </TabsContent>

      <TabsContent value="planilla">
        <PlanillaPanel municipioId={municipioId} initialData={actores.planilla} />
      </TabsContent>

      <TabsContent value="aspirantes">
        <AspirantesPanel municipioId={municipioId} initialData={actores.aspirantes} />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: Modify the page**

Replace the entire contents of `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx` with:

```tsx
import { getMunicipioStrategicFile } from "@/actions/estrategia";
import { getActoresMunicipio } from "@/actions/actores";
import { StrategicForm } from "@/components/estrategia/StrategicForm";
import ActoresTabs from "@/components/actores/ActoresTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  ChevronLeft,
  Map as MapIcon,
  TrendingUp,
  Users,
  Calendar,
  History,
  Trophy,
  Activity,
} from "lucide-react";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function StrategicFilePage({ params }: PageProps) {
  const { id } = await params;
  const municipioId = parseInt(id);

  const [{ estrategia, electoral }, actores] = await Promise.all([
    getMunicipioStrategicFile(municipioId),
    getActoresMunicipio(municipioId),
  ]);

  const summary = electoral?.summary ?? null;
  const latestResult = electoral?.timeline?.[0] ?? null;

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header — always visible above tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <Link
            href="/admin/estrategia-municipal"
            className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] hover:text-indigo-500 transition-colors"
          >
            <ChevronLeft className="w-3 h-3" /> Regresar al Tablero
          </Link>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <MapIcon className="w-8 h-8 text-slate-900" />
            {summary?.nombre || `Municipio ${municipioId}`}
          </h1>
        </div>

        {estrategia && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2">
              Identidad Operativa:
            </span>
            <Badge className="bg-slate-900 font-black uppercase text-[9px] tracking-widest px-3 py-1">
              {estrategia.prioridad}
            </Badge>
            <Badge
              variant="outline"
              className="border-rose-200 text-rose-600 bg-rose-50 font-black uppercase text-[9px] tracking-widest px-3 py-1"
            >
              {estrategia.riesgo}
            </Badge>
          </div>
        )}
      </div>

      {/* Tabs wrapper — estrategia content passed as children */}
      <ActoresTabs municipioId={municipioId} actores={actores}>
        {/* Tab: Estrategia */}
        <section className="space-y-4">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
            <Activity className="w-3 h-3 text-indigo-500" /> Resumen de Inteligencia Electoral
          </h2>

          {electoral ? (
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="bg-white border-slate-200 shadow-sm overflow-hidden group">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="p-3 bg-slate-50 rounded-2xl text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                    <Trophy className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Fuerza Ganadora</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: latestResult?.winnerColor || "#cbd5e1" }}
                      />
                      <span className="text-sm font-black text-slate-900">
                        {latestResult?.winnerSiglas || "N/A"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-500">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Ciclo Vigente</p>
                    <p className="text-sm font-black text-slate-900">{latestResult?.anio || "N/A"}</p>
                  </div>
                </div>
              </Card>

              <Card className="bg-white border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-500">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Alternancia</p>
                    <p className="text-sm font-black text-slate-900">
                      {(summary.alternationRate * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="bg-white border-slate-200 shadow-sm p-5">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-amber-50 rounded-2xl text-amber-500">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Margen Promedio</p>
                    <p className="text-sm font-black text-slate-900">
                      {summary.avgCompetitiveness.toLocaleString()} Votos
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <Card className="bg-white border-slate-200 shadow-sm">
              <CardContent className="p-6">
                <div className="text-sm font-black text-slate-900">
                  Sin historial electoral disponible
                </div>
                <div className="text-xs text-slate-500 mt-2">
                  Puedes capturar la ficha estratégica aunque este municipio todavía no tenga
                  analítica electoral cargada.
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        <StrategicForm municipioId={municipioId} initialData={estrategia} />

        <footer className="pt-8 border-t border-slate-100 italic text-[10px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-3 h-3" />
            <span>
              Última actualización de ficha:{" "}
              {estrategia?.updated_at
                ? new Date(estrategia.updated_at).toLocaleString()
                : "Nunca"}
            </span>
          </div>
          <div className="font-black uppercase tracking-widest text-slate-300">
            SIPEEM v2.0 • Módulo Estratégico
          </div>
        </footer>
      </ActoresTabs>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | head -40
```

Expected: TypeScript compilation succeeds. The forms (TermometrosForm, etc.) don't exist yet — this will fail with "Cannot find module" errors. That's expected at this stage; proceed to next tasks to create each component.

- [ ] **Step 4: Commit**

```bash
git add src/components/actores/ActoresTabs.tsx src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx
git commit -m "feat: add ActoresTabs shell and wire up page with parallel data fetch"
```

---

## Task 3: TermometrosForm

**Files:**
- Create: `src/components/actores/TermometrosForm.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertTermometros } from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { Termometros } from "@/lib/types";

type Props = {
  municipioId: number;
  initialData: Termometros | null;
};

type TermKey = keyof Omit<Termometros, "id" | "municipio_id">;

const DIMS: Array<{ key: TermKey; label: string }> = [
  { key: "term1", label: "T1" },
  { key: "term2", label: "T2" },
  { key: "term3", label: "T3" },
  { key: "term4", label: "T4" },
  { key: "term5", label: "T5" },
];

export default function TermometrosForm({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      term1: parseFloat((fd.get("term1") as string) || "0"),
      term2: parseFloat((fd.get("term2") as string) || "0"),
      term3: parseFloat((fd.get("term3") as string) || "0"),
      term4: parseFloat((fd.get("term4") as string) || "0"),
      term5: parseFloat((fd.get("term5") as string) || "0"),
    };

    try {
      await upsertTermometros(municipioId, data);
      toast.success("Termómetros actualizados");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-slate-200 shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-black text-slate-900">Termómetros Políticos</CardTitle>
        <p className="text-sm text-slate-500">
          Mediciones de las 5 dimensiones de análisis (0–100).
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-5">
            {DIMS.map((dim) => (
              <div key={dim.key} className="grid gap-2">
                <Label htmlFor={dim.key}>{dim.label}</Label>
                <Input
                  id={dim.key}
                  name={dim.key}
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  defaultValue={initialData?.[dim.key] ?? 0}
                  className="rounded-xl border-slate-200"
                />
              </div>
            ))}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
              Error: {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800"
            >
              {loading ? "Guardando..." : "Guardar termómetros"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | grep -E "(error|Error|TermometrosForm)" | head -20
```

Expected: no errors for `TermometrosForm`.

- [ ] **Step 3: Commit**

```bash
git add src/components/actores/TermometrosForm.tsx
git commit -m "feat: add TermometrosForm (T1-T5 upsert)"
```

---

## Task 4: EscenariosForm

**Files:**
- Create: `src/components/actores/EscenariosForm.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertEscenarios } from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import type { Escenarios } from "@/lib/types";

type Props = {
  municipioId: number;
  initialData: Escenarios | null;
};

type EscKey = keyof Omit<Escenarios, "id" | "municipio_id">;

const GROUPS: Array<{
  label: string;
  fields: Array<{ key: EscKey; sub: string }>;
}> = [
  { label: "Escenario 1", fields: [{ key: "e1_comp", sub: "A" }, { key: "e1_rec", sub: "B" }] },
  { label: "Escenario 2", fields: [{ key: "e2_gen", sub: "A" }, { key: "e2_atr", sub: "B" }] },
  { label: "Escenario 3", fields: [{ key: "e3_gob", sub: "A" }, { key: "e3_dem", sub: "B" }] },
  { label: "Escenario 4", fields: [{ key: "e4_niv", sub: "A" }, { key: "e4_foco", sub: "B" }] },
];

export default function EscenariosForm({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      e1_comp: fd.get("e1_comp") as string,
      e1_rec: fd.get("e1_rec") as string,
      e2_gen: fd.get("e2_gen") as string,
      e2_atr: fd.get("e2_atr") as string,
      e3_gob: fd.get("e3_gob") as string,
      e3_dem: fd.get("e3_dem") as string,
      e4_niv: fd.get("e4_niv") as string,
      e4_foco: fd.get("e4_foco") as string,
    };

    try {
      await upsertEscenarios(municipioId, data);
      toast.success("Escenarios actualizados");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-slate-200 shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-black text-slate-900">Escenarios Políticos</CardTitle>
        <p className="text-sm text-slate-500">
          4 escenarios con 2 campos de análisis cada uno.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {GROUPS.map((group) => (
              <div
                key={group.label}
                className="space-y-3 p-4 rounded-xl border border-slate-100 bg-slate-50/50"
              >
                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                  {group.label}
                </p>
                {group.fields.map((field) => (
                  <div key={field.key} className="grid gap-1.5">
                    <Label htmlFor={field.key} className="text-slate-600 text-xs">
                      {field.sub}
                    </Label>
                    <Textarea
                      id={field.key}
                      name={field.key}
                      rows={2}
                      defaultValue={initialData?.[field.key] ?? ""}
                      className="rounded-xl border-slate-200 text-sm resize-none"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
              Error: {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800"
            >
              {loading ? "Guardando..." : "Guardar escenarios"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | grep -E "(error|Error|EscenariosForm)" | head -20
```

Expected: no errors for `EscenariosForm`.

- [ ] **Step 3: Commit**

```bash
git add src/components/actores/EscenariosForm.tsx
git commit -m "feat: add EscenariosForm (4 scenarios × 2 fields upsert)"
```

---

## Task 5: ComiteForm

**Files:**
- Create: `src/components/actores/ComiteForm.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { upsertComite } from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { ComiteMunicipal } from "@/lib/types";

type Props = {
  municipioId: number;
  initialData: ComiteMunicipal | null;
};

export default function ComiteForm({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      presidente: (fd.get("presidente") as string).trim(),
      secretario: (fd.get("secretario") as string).trim(),
      fachada_url: (fd.get("fachada_url") as string).trim() || null,
      link_maps: (fd.get("link_maps") as string).trim() || null,
      inaugurado: fd.get("inaugurado") === "on",
    };

    try {
      await upsertComite(municipioId, data);
      toast.success("Comité municipal actualizado");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-slate-200 shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-black text-slate-900">Comité Municipal</CardTitle>
        <p className="text-sm text-slate-500">Datos del comité municipal del partido.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="presidente">Presidente</Label>
              <Input
                id="presidente"
                name="presidente"
                required
                defaultValue={initialData?.presidente ?? ""}
                placeholder="Nombre completo"
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="secretario">Secretario</Label>
              <Input
                id="secretario"
                name="secretario"
                required
                defaultValue={initialData?.secretario ?? ""}
                placeholder="Nombre completo"
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fachada_url">URL Fachada (opcional)</Label>
              <Input
                id="fachada_url"
                name="fachada_url"
                type="url"
                defaultValue={initialData?.fachada_url ?? ""}
                placeholder="https://..."
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="link_maps">Google Maps (opcional)</Label>
              <Input
                id="link_maps"
                name="link_maps"
                type="url"
                defaultValue={initialData?.link_maps ?? ""}
                placeholder="https://maps.google.com/..."
                className="rounded-xl border-slate-200"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <input
              id="inaugurado"
              name="inaugurado"
              type="checkbox"
              defaultChecked={initialData?.inaugurado ?? false}
              className="h-4 w-4 rounded border-slate-300 accent-slate-900"
            />
            <Label htmlFor="inaugurado" className="font-medium text-slate-700 cursor-pointer">
              Comité inaugurado
            </Label>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
              Error: {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <Button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800"
            >
              {loading ? "Guardando..." : "Guardar comité"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | grep -E "(error|Error|ComiteForm)" | head -20
```

Expected: no errors for `ComiteForm`.

- [ ] **Step 3: Commit**

```bash
git add src/components/actores/ComiteForm.tsx
git commit -m "feat: add ComiteForm (committee upsert)"
```

---

## Task 6: PlanillaPanel

**Files:**
- Create: `src/components/actores/PlanillaPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPlanillaMember, deletePlanillaMember } from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { Planilla } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

type Props = {
  municipioId: number;
  initialData: Planilla[];
};

export default function PlanillaPanel({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      cargo: fd.get("cargo") as string,
      nombre: fd.get("nombre") as string,
      partido: fd.get("partido") as string,
    };

    try {
      await createPlanillaMember(municipioId, data);
      toast.success("Integrante agregado");
      (e.target as HTMLFormElement).reset();
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al agregar");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deletePlanillaMember(id, municipioId);
      toast.success("Integrante eliminado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-md overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl font-black text-slate-900">Planilla</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              Integrantes de la planilla de candidatos.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800 text-xs gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {initialData.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-400 text-sm font-medium italic">
              Sin integrantes registrados.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Cargo
                  </TableHead>
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Nombre
                  </TableHead>
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Partido
                  </TableHead>
                  <TableHead className="p-4 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialData.map((p) => (
                  <TableRow key={p.id} className="border-slate-50 hover:bg-slate-50/50">
                    <TableCell className="p-4 text-sm font-bold text-slate-700">
                      {p.cargo}
                    </TableCell>
                    <TableCell className="p-4 text-sm text-slate-900">{p.nombre}</TableCell>
                    <TableCell className="p-4 text-sm text-slate-500">{p.partido}</TableCell>
                    <TableCell className="p-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === p.id}
                        onClick={() => handleDelete(p.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card className="border-indigo-100 shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Nuevo integrante
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="cargo">Cargo</Label>
                  <Input
                    id="cargo"
                    name="cargo"
                    required
                    placeholder="Ej. Presidente"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    name="nombre"
                    required
                    placeholder="Nombre completo"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="partido">Partido</Label>
                  <Input
                    id="partido"
                    name="partido"
                    required
                    placeholder="Siglas del partido"
                    className="rounded-xl border-slate-200"
                  />
                </div>
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
                  {formError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={adding}
                  className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800"
                >
                  {adding ? "Agregando..." : "Agregar integrante"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border-slate-200"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | grep -E "(error|Error|PlanillaPanel)" | head -20
```

Expected: no errors for `PlanillaPanel`.

- [ ] **Step 3: Commit**

```bash
git add src/components/actores/PlanillaPanel.tsx
git commit -m "feat: add PlanillaPanel (list + add + delete)"
```

---

## Task 7: AspirantesPanel

**Files:**
- Create: `src/components/actores/AspirantesPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAspirante,
  updateAspirante,
  deleteAspirante,
} from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { Aspirante } from "@/lib/types";
import { Plus, Trash2, Pencil, X, Check } from "lucide-react";

type Props = {
  municipioId: number;
  initialData: Aspirante[];
};

type EditState = {
  id: number;
  nombre: string;
  cargo_aspirado: string;
  partido: string;
  fecha_nacimiento: string;
  telefono: string;
  email: string;
  notas: string;
};

export default function AspirantesPanel({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function startEdit(a: Aspirante) {
    setEditState({
      id: a.id,
      nombre: a.nombre,
      cargo_aspirado: a.cargo_aspirado,
      partido: a.partido,
      fecha_nacimiento: a.fecha_nacimiento ?? "",
      telefono: a.telefono ?? "",
      email: a.email ?? "",
      notas: a.notas ?? "",
    });
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editState) return;
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const data = {
      nombre: fd.get("nombre") as string,
      cargo_aspirado: fd.get("cargo_aspirado") as string,
      partido: fd.get("partido") as string,
      fecha_nacimiento: (fd.get("fecha_nacimiento") as string) || null,
      telefono: (fd.get("telefono") as string) || null,
      email: (fd.get("email") as string) || null,
      notas: (fd.get("notas") as string) || null,
    };

    try {
      await updateAspirante(editState.id, municipioId, data);
      toast.success("Aspirante actualizado");
      setEditState(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      nombre: fd.get("nombre_new") as string,
      cargo_aspirado: fd.get("cargo_aspirado_new") as string,
      partido: fd.get("partido_new") as string,
      fecha_nacimiento: (fd.get("fecha_nacimiento_new") as string) || null,
      telefono: (fd.get("telefono_new") as string) || null,
      email: (fd.get("email_new") as string) || null,
      notas: (fd.get("notas_new") as string) || null,
    };

    try {
      await createAspirante(municipioId, data);
      toast.success("Aspirante registrado");
      (e.target as HTMLFormElement).reset();
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteAspirante(id, municipioId);
      toast.success("Aspirante eliminado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-md overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl font-black text-slate-900">Aspirantes</CardTitle>
            <p className="text-sm text-slate-500 mt-1">Registro de aspirantes políticos.</p>
          </div>
          <Button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800 text-xs gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {initialData.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-400 text-sm font-medium italic">
              Sin aspirantes registrados.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Nombre
                  </TableHead>
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Cargo aspirado
                  </TableHead>
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Partido
                  </TableHead>
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Contacto
                  </TableHead>
                  <TableHead className="p-4 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialData.map((a) =>
                  editState?.id === a.id ? (
                    <TableRow key={a.id} className="bg-slate-50 border-slate-100">
                      <TableCell colSpan={5} className="p-4">
                        <form onSubmit={handleSaveEdit} className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Nombre</Label>
                              <Input
                                name="nombre"
                                defaultValue={editState.nombre}
                                required
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Cargo aspirado</Label>
                              <Input
                                name="cargo_aspirado"
                                defaultValue={editState.cargo_aspirado}
                                required
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Partido</Label>
                              <Input
                                name="partido"
                                defaultValue={editState.partido}
                                required
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Fecha nacimiento</Label>
                              <Input
                                name="fecha_nacimiento"
                                type="date"
                                defaultValue={editState.fecha_nacimiento}
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Teléfono</Label>
                              <Input
                                name="telefono"
                                defaultValue={editState.telefono}
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Email</Label>
                              <Input
                                name="email"
                                type="email"
                                defaultValue={editState.email}
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="text-xs">Notas</Label>
                            <Textarea
                              name="notas"
                              rows={2}
                              defaultValue={editState.notas}
                              className="rounded-xl border-slate-200 text-sm resize-none"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              disabled={saving}
                              size="sm"
                              className="rounded-xl bg-slate-900 font-bold text-xs gap-1.5"
                            >
                              <Check className="w-3 h-3" />
                              {saving ? "Guardando..." : "Guardar"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setEditState(null)}
                              className="rounded-xl border-slate-200 text-xs gap-1.5"
                            >
                              <X className="w-3 h-3" /> Cancelar
                            </Button>
                          </div>
                        </form>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={a.id} className="border-slate-50 hover:bg-slate-50/50">
                      <TableCell className="p-4 text-sm font-bold text-slate-900">
                        {a.nombre}
                      </TableCell>
                      <TableCell className="p-4 text-sm text-slate-700">
                        {a.cargo_aspirado}
                      </TableCell>
                      <TableCell className="p-4 text-sm text-slate-500">{a.partido}</TableCell>
                      <TableCell className="p-4 text-xs text-slate-400 space-y-0.5">
                        {a.telefono && <div>{a.telefono}</div>}
                        {a.email && <div>{a.email}</div>}
                        {!a.telefono && !a.email && <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(a)}
                            className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deletingId === a.id}
                            onClick={() => handleDelete(a.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card className="border-indigo-100 shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">Nuevo aspirante</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="nombre_new">Nombre</Label>
                  <Input
                    id="nombre_new"
                    name="nombre_new"
                    required
                    placeholder="Nombre completo"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cargo_aspirado_new">Cargo aspirado</Label>
                  <Input
                    id="cargo_aspirado_new"
                    name="cargo_aspirado_new"
                    required
                    placeholder="Ej. Presidente Municipal"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="partido_new">Partido</Label>
                  <Input
                    id="partido_new"
                    name="partido_new"
                    required
                    placeholder="Siglas del partido"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fecha_nacimiento_new">Fecha nacimiento (opcional)</Label>
                  <Input
                    id="fecha_nacimiento_new"
                    name="fecha_nacimiento_new"
                    type="date"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="telefono_new">Teléfono (opcional)</Label>
                  <Input
                    id="telefono_new"
                    name="telefono_new"
                    placeholder="Ej. 722 123 4567"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email_new">Email (opcional)</Label>
                  <Input
                    id="email_new"
                    name="email_new"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    className="rounded-xl border-slate-200"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notas_new">Notas (opcional)</Label>
                <Textarea
                  id="notas_new"
                  name="notas_new"
                  rows={2}
                  placeholder="Observaciones relevantes..."
                  className="rounded-xl border-slate-200 resize-none"
                />
              </div>

              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
                  {formError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={adding}
                  className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800"
                >
                  {adding ? "Registrando..." : "Registrar aspirante"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  className="rounded-xl border-slate-200"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Final build verification**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```

Expected: build succeeds with no TypeScript errors. All 7 new files compile cleanly.

- [ ] **Step 3: Commit**

```bash
git add src/components/actores/AspirantesPanel.tsx
git commit -m "feat: add AspirantesPanel (list + inline edit + add + delete)"
```

---

## Self-Review

**Spec coverage:**
- ✅ 6 tabs: Estrategia, Termómetros, Escenarios, Comité, Planilla, Aspirantes
- ✅ admin/director only — all actions call `assertAdmin()`
- ✅ T1–T5 numeric, 0–100 range
- ✅ 4 scenarios × 2 text fields with generic labels
- ✅ Comité: presidente, secretario, fachada_url, link_maps, inaugurado
- ✅ Planilla: add + delete (no inline edit — per spec)
- ✅ Aspirantes: add + inline edit + delete
- ✅ Header outside tabs (always visible)
- ✅ Existing strategy content moved into tab 1 as children
- ✅ Parallel fetch with `Promise.all`

**No placeholders:** All steps contain complete, ready-to-paste code.

**Type consistency:** `ActoresMunicipioData` exported from `actores.ts` and imported in `ActoresTabs.tsx`. All field names match `types.ts` exactly. `updateAspirante(id, municipioId, data)` signature consistent across `actores.ts` and `AspirantesPanel.tsx`. `deletePlanillaMember(id, municipioId)` consistent across both files.
