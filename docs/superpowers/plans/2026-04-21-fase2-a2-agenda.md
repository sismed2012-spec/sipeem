# Agenda Política y Eventos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un tab "Agenda" a la ficha municipal con CRUD de eventos políticos (mítines, recorridos, reuniones, visitas) con fecha, tipo, ubicación y aforo.

**Architecture:** Nueva tabla `eventos_campana` en Supabase. Server actions en `src/actions/agenda.ts`. Tab nuevo en `ActoresTabs` (pasará de 6 a 7 tabs). Panel CRUD `AgendaPanel` siguiendo el patrón de `PlanillaPanel`.

**Tech Stack:** Supabase · Next.js Server Actions · @base-ui/react Tabs · Tailwind CSS 4

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- Patrón de referencia: `src/components/actores/PlanillaPanel.tsx` y `src/actions/actores.ts`
- Tabs actualmente en `src/components/actores/ActoresTabs.tsx` — agregar 1 tab más (de 6 a 7)
- `logAction` de `src/lib/audit.ts` debe llamarse después de cada mutación (requiere Fase 1 D2 completada)
- Si D2 no está completo aún, omitir los calls a `logAction` y agregarlos después

## File Map

| Archivo | Acción |
|---------|--------|
| `src/actions/agenda.ts` | Crear — CRUD de eventos |
| `src/components/actores/AgendaPanel.tsx` | Crear — panel con tabla + formulario add |
| `src/components/actores/ActoresTabs.tsx` | Modificar — agregar tab "Agenda" |
| `src/lib/types.ts` | Modificar — agregar tipo `EventoCampana` |

---

### Task 1: SQL tabla `eventos_campana`

- [ ] **Step 1: Ejecutar en Supabase SQL Editor**

```sql
CREATE TABLE public.eventos_campana (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  municipio_id    bigint NOT NULL REFERENCES public.municipios(id) ON DELETE CASCADE,
  titulo          text NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('mitin','recorrido','reunion','visita','otro')),
  fecha           date NOT NULL,
  hora_inicio     time,
  hora_fin        time,
  ubicacion       text,
  aforo_estimado  int,
  aforo_real      int,
  responsable     text,
  notas           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX eventos_campana_municipio_idx ON public.eventos_campana (municipio_id);
CREATE INDEX eventos_campana_fecha_idx ON public.eventos_campana (fecha DESC);
```

---

### Task 2: Tipo `EventoCampana` en types.ts

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Agregar al final del archivo**

```typescript
export interface EventoCampana {
  id: number;
  municipio_id: number;
  titulo: string;
  tipo: "mitin" | "recorrido" | "reunion" | "visita" | "otro";
  fecha: string;
  hora_inicio: string | null;
  hora_fin: string | null;
  ubicacion: string | null;
  aforo_estimado: number | null;
  aforo_real: number | null;
  responsable: string | null;
  notas: string | null;
  created_at: string;
}
```

---

### Task 3: Server Actions `src/actions/agenda.ts`

**Files:**
- Create: `src/actions/agenda.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// src/actions/agenda.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import type { EventoCampana } from "@/lib/types";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");
}

export async function getEventosMunicipio(municipioId: number): Promise<EventoCampana[]> {
  await assertAdmin();
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("eventos_campana")
    .select("*")
    .eq("municipio_id", municipioId)
    .order("fecha", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EventoCampana[];
}

export async function createEvento(
  municipioId: number,
  data: Omit<EventoCampana, "id" | "municipio_id" | "created_at">
): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc.from("eventos_campana").insert({ ...data, municipio_id: municipioId });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}

export async function deleteEvento(id: number, municipioId: number): Promise<void> {
  await assertAdmin();
  const svc = createServiceClient();
  const { error } = await svc
    .from("eventos_campana")
    .delete()
    .eq("id", id)
    .eq("municipio_id", municipioId);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
}
```

---

### Task 4: Componente `AgendaPanel`

**Files:**
- Create: `src/components/actores/AgendaPanel.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// src/components/actores/AgendaPanel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventoCampana } from "@/lib/types";
import { createEvento, deleteEvento } from "@/actions/agenda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Calendar } from "lucide-react";

const TIPO_LABELS: Record<EventoCampana["tipo"], string> = {
  mitin: "Mitin", recorrido: "Recorrido", reunion: "Reunión", visita: "Visita", otro: "Otro",
};

type Props = { municipioId: number; initialEventos: EventoCampana[] };

export default function AgendaPanel({ municipioId, initialEventos }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<EventoCampana["tipo"]>("mitin");

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await createEvento(municipioId, {
        titulo: (fd.get("titulo") as string).trim(),
        tipo,
        fecha: fd.get("fecha") as string,
        hora_inicio: (fd.get("hora_inicio") as string) || null,
        hora_fin: (fd.get("hora_fin") as string) || null,
        ubicacion: (fd.get("ubicacion") as string).trim() || null,
        aforo_estimado: fd.get("aforo_estimado") ? parseInt(fd.get("aforo_estimado") as string, 10) : null,
        aforo_real: null,
        responsable: (fd.get("responsable") as string).trim() || null,
        notas: (fd.get("notas") as string).trim() || null,
      });
      toast.success("Evento agregado");
      setShowForm(false);
      setFormError(null);
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
      await deleteEvento(id, municipioId);
      toast.success("Evento eliminado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      {initialEventos.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-8">Sin eventos registrados</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Título</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ubicación</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aforo</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialEventos.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                    {new Date(ev.fecha + "T12:00:00").toLocaleDateString("es-MX", { dateStyle: "medium" })}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-indigo-600">{TIPO_LABELS[ev.tipo]}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{ev.titulo}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{ev.ubicacion ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-center text-slate-500">{ev.aforo_estimado ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(ev.id)}
                      disabled={deletingId === ev.id}
                      aria-label="Eliminar evento"
                      className="text-rose-400 hover:text-rose-600 disabled:opacity-40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add form */}
      {!showForm ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowForm(true)}
          className="rounded-xl border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 font-semibold gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar evento
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="rounded-2xl border border-slate-200 p-4 space-y-4 bg-slate-50">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" /> Nuevo evento
          </h3>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="titulo" className="text-xs font-semibold">Título *</Label>
              <Input id="titulo" name="titulo" required placeholder="Ej. Mitin plaza central" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as EventoCampana["tipo"])}>
                <SelectTrigger className="rounded-xl border-slate-200 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABELS) as EventoCampana["tipo"][]).map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fecha" className="text-xs font-semibold">Fecha *</Label>
              <Input id="fecha" name="fecha" type="date" required className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ubicacion" className="text-xs font-semibold">Ubicación</Label>
              <Input id="ubicacion" name="ubicacion" placeholder="Ej. Plaza municipal" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="aforo_estimado" className="text-xs font-semibold">Aforo estimado</Label>
              <Input id="aforo_estimado" name="aforo_estimado" type="number" min={0} placeholder="500" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="responsable" className="text-xs font-semibold">Responsable</Label>
              <Input id="responsable" name="responsable" placeholder="Nombre del responsable" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="notas" className="text-xs font-semibold">Notas</Label>
              <Textarea id="notas" name="notas" rows={2} className="rounded-xl border-slate-200 text-sm resize-none" />
            </div>
          </div>

          {formError && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-medium">
              {formError}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={adding} size="sm" className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800">
              {adding ? "Agregando..." : "Agregar evento"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); setFormError(null); }} className="rounded-xl border-slate-200 font-semibold text-slate-600">
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
```

---

### Task 5: Integrar en `ActoresTabs`

**Files:**
- Modify: `src/components/actores/ActoresTabs.tsx`

- [ ] **Step 1: Leer ActoresTabs actual**

Leer `src/components/actores/ActoresTabs.tsx` completo.

- [ ] **Step 2: Agregar tab Agenda**

1. Agregar `import AgendaPanel from "./AgendaPanel"` al inicio.
2. En las props, agregar `eventos: EventoCampana[]` y el import del tipo.
3. En el `<TabsList>`, agregar `<TabsTrigger value="agenda">Agenda</TabsTrigger>`.
4. Agregar `<TabsContent value="agenda"><AgendaPanel municipioId={municipioId} initialEventos={actores.eventos} /></TabsContent>`.
5. En la interfaz de `actores`, agregar `eventos: EventoCampana[]`.

**Nota:** El tipo de `actores` en `ActoresTabs` es `ActoresMunicipioData` definido en `src/actions/actores.ts`. Agregar `eventos: EventoCampana[]` a ese tipo ahí también.

- [ ] **Step 3: Actualizar `ActoresMunicipioData` en `src/actions/actores.ts`**

En `src/actions/actores.ts`, actualizar el tipo exportado:
```typescript
import type { EventoCampana } from "@/lib/types";

export type ActoresMunicipioData = {
  termometros: Termometros | null;
  escenarios: Escenarios | null;
  comite: ComiteMunicipal | null;
  planilla: Planilla[];
  aspirantes: Aspirante[];
  eventos: EventoCampana[];  // NUEVO
};
```

Y en `getActoresMunicipio`, agregar la query de eventos al `Promise.all`:
```typescript
import { getEventosMunicipio } from "./agenda";

// Dentro del Promise.all:
const eventos = await getEventosMunicipio(municipioId).catch(() => []);

// En el return:
return { termometros, escenarios, comite, planilla, aspirantes, eventos };
```

- [ ] **Step 4: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
