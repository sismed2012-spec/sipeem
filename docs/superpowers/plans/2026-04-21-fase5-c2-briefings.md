# Generador de Briefings Estratégicos (AI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botón "Generar Briefing" en la ficha municipal que produce un documento de análisis político de 1-2 páginas usando IA, exportable como PDF via print layout.

**Architecture:** Server Action `generarBriefing(municipioId)` que agrega todos los datos del municipio, llama a `generateAnalysis()` (non-streaming), guarda el resultado en una tabla `briefings` y lo muestra en una página de print `/print/briefing/[id]`. El botón en la UI espera el resultado y abre el print layout.

**Tech Stack:** `ai` v6 · Vercel AI Gateway · `src/lib/ai.ts` (de Fase 5 Setup) · @e965/xlsx para referencia de patrón

---

## PREREQUISITO: Fase 5 Setup completada

`src/lib/ai.ts` con `generateAnalysis()` debe existir.

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- Patrón de print layout: ya existe `src/app/print/municipio/[id]/page.tsx` (de D1)

---

### Task 1: Tabla `briefings` en Supabase

- [ ] **Step 1: Ejecutar en Supabase SQL Editor**

```sql
CREATE TABLE public.briefings (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  municipio_id  bigint NOT NULL REFERENCES public.municipios(id) ON DELETE CASCADE,
  contenido     text NOT NULL,
  generado_por  text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX briefings_municipio_idx ON public.briefings (municipio_id);
```

---

### Task 2: Server Action `generarBriefing`

**Files:**
- Create: `src/actions/briefings.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// src/actions/briefings.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateAnalysis } from "@/lib/ai";
import { getMunicipioStrategicFile } from "./estrategia";
import { getActoresMunicipio } from "./actores";

export async function generarBriefing(municipioId: number): Promise<number> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const [{ estrategia, electoral }, actores] = await Promise.all([
    getMunicipioStrategicFile(municipioId),
    getActoresMunicipio(municipioId),
  ]);

  const nombre = electoral?.summary?.nombre ?? `Municipio ${municipioId}`;
  const timeline = electoral?.timeline?.slice(0, 3) ?? [];
  const t = actores.termometros;

  const prompt = `Genera un briefing estratégico ejecutivo para el municipio de ${nombre}, Estado de México.

DATOS DISPONIBLES:
- Estrategia: Prioridad ${estrategia?.prioridad ?? "N/D"}, Riesgo ${estrategia?.riesgo ?? "N/D"}, Oportunidad ${estrategia?.oportunidad ?? "N/D"}, Estatus ${estrategia?.estatus ?? "N/D"}
- Historial reciente: ${timeline.map(t => `${t.anio}: ${t.winnerSiglas} ${t.porcentaje?.toFixed(1) ?? "?"}%`).join(", ") || "Sin datos"}
- Termómetros: ${t ? `T1=${t.term1} T2=${t.term2} T3=${t.term3} T4=${t.term4} T5=${t.term5} (promedio ${((t.term1+t.term2+t.term3+t.term4+t.term5)/5).toFixed(1)})` : "Sin datos"}
- Comité: ${actores.comite ? `${actores.comite.presidente} / ${actores.comite.secretario}` : "Sin registrar"}
- Aspirantes: ${actores.aspirantes.length} registrados
- Planilla: ${actores.planilla.length} integrantes
- Notas ejecutivas: ${estrategia?.notas_ejecutivas ?? "Sin notas"}
- Notas operativas: ${estrategia?.notas_operativas ?? "Sin notas"}

ESTRUCTURA DEL BRIEFING:
1. **Diagnóstico Ejecutivo** (2-3 párrafos): situación actual, fortalezas y vulnerabilidades clave
2. **Análisis de Riesgos** (lista de 3-5 riesgos con impacto estimado)
3. **Oportunidades Identificadas** (lista de 2-4 oportunidades)
4. **Recomendaciones Estratégicas** (3-5 acciones prioritarias concretas)
5. **Indicadores de Alerta** (2-3 señales de peligro a monitorear)

Sé directo, usa lenguaje político profesional, evita generalidades. Máximo 600 palabras en español.`;

  const contenido = await generateAnalysis(prompt);

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("briefings")
    .insert({
      municipio_id: municipioId,
      contenido,
      generado_por: usuario.email,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return data.id;
}

export async function getBriefingsMunicipio(municipioId: number) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("briefings")
    .select("id, generado_por, created_at")
    .eq("municipio_id", municipioId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBriefingById(id: number) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("briefings")
    .select("*, municipios(nombre)")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}
```

---

### Task 3: Botón `GenerarBriefingBtn` (Client Component)

**Files:**
- Create: `src/components/actores/GenerarBriefingBtn.tsx`

- [ ] **Step 1: Crear el componente**

```tsx
// src/components/actores/GenerarBriefingBtn.tsx
"use client";

import { useState } from "react";
import { generarBriefing } from "@/actions/briefings";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = { municipioId: number };

export default function GenerarBriefingBtn({ municipioId }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleGenerar() {
    setLoading(true);
    try {
      const briefingId = await generarBriefing(municipioId);
      toast.success("Briefing generado — abriendo en nueva pestaña");
      window.open(`/print/briefing/${briefingId}`, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al generar briefing");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      onClick={handleGenerar}
      disabled={loading}
      className="rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold gap-2"
    >
      {loading ? (
        <><Loader2 className="w-4 h-4 animate-spin" /> Generando con IA...</>
      ) : (
        <><Sparkles className="w-4 h-4" /> Generar Briefing</>
      )}
    </Button>
  );
}
```

---

### Task 4: Print layout para briefing

**Files:**
- Create: `src/app/print/briefing/[id]/page.tsx`

- [ ] **Step 1: Crear la página**

```tsx
// src/app/print/briefing/[id]/page.tsx
import { getBriefingById } from "@/actions/briefings";
import { getUsuarioActual } from "@/actions/auth";
import { redirect, notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function PrintBriefingPage({ params }: PageProps) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const { id } = await params;
  const briefingId = parseInt(id, 10);
  if (isNaN(briefingId)) return notFound();

  const briefing = await getBriefingById(briefingId);
  const municipioNombre = (briefing.municipios as any)?.nombre ?? `Municipio ${briefing.municipio_id}`;
  const fecha = new Date(briefing.created_at).toLocaleDateString("es-MX", { dateStyle: "long" });

  // Convert markdown-ish content to HTML paragraphs
  const sections = briefing.contenido.split("\n\n").map((block: string, i: number) => {
    if (block.startsWith("**") && block.includes("**")) {
      const title = block.match(/\*\*(.+?)\*\*/)?.[1] ?? "";
      const body = block.replace(/\*\*(.+?)\*\*/, "").trim();
      return (
        <div key={i} style={{ marginBottom: "1.25rem" }}>
          <h3 style={{ fontSize: 13, fontWeight: 900, color: "#1e293b", marginBottom: "0.4rem" }}>{title}</h3>
          <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.7 }}>{body}</p>
        </div>
      );
    }
    return (
      <p key={i} style={{ fontSize: 12, color: "#334155", lineHeight: 1.7, marginBottom: "1rem" }}>
        {block}
      </p>
    );
  });

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem" }}>
      <div style={{ borderBottom: "3px solid #4f46e5", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 3 }}>
          SIPEEM · Briefing Estratégico · IA
        </p>
        <h1 style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", margin: "0.25rem 0" }}>
          {municipioNombre}
        </h1>
        <p style={{ fontSize: 11, color: "#94a3b8" }}>
          Generado el {fecha} · por {briefing.generado_por}
        </p>
      </div>

      <div>{sections}</div>

      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.75rem", marginTop: "2rem" }}>
        <p style={{ fontSize: 9, color: "#cbd5e1", textAlign: "center", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          SIPEEM · Análisis generado con IA · Documento confidencial
        </p>
      </div>

      <script dangerouslySetInnerHTML={{ __html: "window.onload = () => window.print();" }} />
    </div>
  );
}
```

---

### Task 5: Integrar en ficha municipal

- [ ] **Step 1: Agregar botón en header de la ficha**

En `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx`, en el header junto a los badges:

```tsx
import GenerarBriefingBtn from "@/components/actores/GenerarBriefingBtn";

// En el JSX del header (junto a ExportarFichaBtn):
<GenerarBriefingBtn municipioId={municipioId} />
```

- [ ] **Step 2: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
