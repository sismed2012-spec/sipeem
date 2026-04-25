# Motor de Inteligencia Electoral — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve the existing `AsistenteChat` + `/api/ai/municipio-context` into a full Intelligence Engine with visual context panel, global cross-municipal analysis mode, and executive synthesis saving to `briefings`.

**Architecture:** Client-side `useState<Message[]>` for conversation history (resets on navigation); streaming Route Handlers (`streamText → toUIMessageStreamResponse()`); system prompt always built server-side from Supabase queries; `guardarSintesisIA` synthesizes with `generateText` (MODEL_RAPIDO) then saves to the existing `briefings` table with a `[Síntesis de análisis IA]` prefix.

**Tech Stack:** Next.js App Router, Vercel AI SDK (`streamText`, `generateText`), Supabase service client (`createServiceClient`), Tailwind CSS, shadcn/ui (`Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`, `Button`, `Textarea`), `sonner` toasts, `lucide-react` (`Brain`, `Bot`, `User`, `Send`, `Save`).

---

## File Map

| Action | File |
|--------|------|
| Create | `src/lib/inteligencia-types.ts` |
| Create | `src/app/api/ai/inteligencia/route.ts` |
| Create | `src/actions/inteligencia.ts` |
| Create | `src/components/inteligencia/ChatArea.tsx` |
| Create | `src/components/inteligencia/ContextPanel.tsx` |
| Create | `src/components/inteligencia/InteligenciaChatShell.tsx` |
| Create | `src/app/(protected)/admin/inteligencia/page.tsx` |
| Modify | `src/app/api/ai/municipio-context/route.ts` |
| Modify | `src/components/actores/ActoresTabs.tsx` |
| Modify | `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx` |
| Modify | `src/components/layout/SidebarNav.tsx` |
| Delete | `src/components/actores/AsistenteChat.tsx` |

---

## Task 1: Shared Types File

**Files:**
- Create: `src/lib/inteligencia-types.ts`

- [ ] **Step 1: Create the types file**

```ts
// src/lib/inteligencia-types.ts
export type Message = { role: "user" | "assistant"; content: string };

export type MunicipioKPIs = {
  nombre: string;
  proyeccion: { puntuacion: number; nivel: string } | null;
  termometros: {
    term1: number;
    term2: number;
    term3: number;
    term4: number;
    term5: number;
  } | null;
  coberturaPromedio: number | null;
  riesgoElectoral: string | null;
  estrategia: { prioridad: string; riesgo: string; estatus: string } | null;
};

export type ActoresData = {
  comite: { presidente: string; secretario: string } | null;
  planilla: { cargo: string; nombre: string; partido: string }[];
  aspirantes: { nombre: string; cargo_aspirado: string; partido: string }[];
};

export type HistorialItem = {
  anio: number;
  winnerSiglas: string;
  porcentaje: number | null;
};
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/inteligencia-types.ts
git commit -m "feat(inteligencia): add shared types for Motor de Inteligencia Electoral"
```

---

## Task 2: Enrich `/api/ai/municipio-context` Route

Adds cobertura de secciones, inline proyección calculation, competencia/riesgo, and 8-message history limit to the existing streaming route. **Do NOT call `getProyeccionMunicipios()`** — it loads all 125 municipalities. Calculate projection inline from direct Supabase queries using the service client already in scope.

**Files:**
- Modify: `src/app/api/ai/municipio-context/route.ts`

Current file has: `streamText`, `MODEL_ANALISIS`, `getUsuarioActual`, `getMunicipioStrategicFile`, `getActoresMunicipio`. No service client, no cobertura, no proyección, messages not limited.

- [ ] **Step 1: Replace the entire file with the enriched version**

```ts
import { streamText } from "ai";
import { MODEL_ANALISIS } from "@/lib/ai";
import { getUsuarioActual } from "@/actions/auth";
import { getMunicipioStrategicFile } from "@/actions/estrategia";
import { getActoresMunicipio } from "@/actions/actores";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { municipioId, messages } = (await req.json()) as {
    municipioId: number;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const svc = createServiceClient();

  const [[{ estrategia, electoral }, actores], cobRes, compRes, histRes] =
    await Promise.all([
      Promise.all([
        getMunicipioStrategicFile(municipioId),
        getActoresMunicipio(municipioId),
      ]),
      svc
        .from("compromisos_seccion")
        .select("compromisos,meta")
        .eq("municipio_id", municipioId),
      svc
        .from("competencia_municipal")
        .select("riesgo_electoral")
        .eq("municipio_id", municipioId)
        .maybeSingle(),
      svc
        .from("historial_electoral")
        .select("partido_ganador_id")
        .eq("municipio_id", municipioId)
        .order("anio", { ascending: false })
        .limit(2),
    ]);

  const nombre = electoral?.summary?.nombre ?? `Municipio ${municipioId}`;
  const timeline = electoral?.timeline?.slice(0, 3) ?? [];
  const t = actores.termometros;

  // Cobertura de secciones
  const cobRows = cobRes.data ?? [];
  const withMeta = cobRows.filter((r: { meta: number }) => r.meta > 0);
  const coberturaPromedio =
    withMeta.length > 0
      ? withMeta.reduce(
          (acc: number, r: { compromisos: number; meta: number }) =>
            acc + (r.compromisos / r.meta) * 100,
          0
        ) / withMeta.length
      : null;

  // Proyección inline (misma lógica que proyeccion.ts pero sin cargar los 125 municipios)
  const histCount = histRes.data?.length ?? 0;
  const score_historial = histCount >= 2 ? 50 : histCount === 1 ? 40 : 30;
  const score_termometros = t
    ? (t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5
    : 50;
  const score_cobertura = coberturaPromedio ?? 0;
  const RIESGO_SCORE: Record<string, number> = {
    critico: 10,
    alto: 40,
    medio: 70,
    bajo: 100,
  };
  const score_competencia =
    RIESGO_SCORE[compRes.data?.riesgo_electoral ?? ""] ?? 50;
  const puntuacion = Math.round(
    (score_historial * 30 +
      score_termometros * 35 +
      score_cobertura * 25 +
      score_competencia * 10) /
      100
  );
  const nivel =
    puntuacion >= 75
      ? "muy_alto"
      : puntuacion >= 55
      ? "alto"
      : puntuacion >= 35
      ? "medio"
      : "bajo";

  const systemPrompt = `Eres un analista político estratégico experto en elecciones municipales del Estado de México.
Estás analizando el municipio de ${nombre}.

## DATOS DEL MUNICIPIO

### Estrategia actual
${
  estrategia
    ? `- Prioridad: ${estrategia.prioridad}
- Riesgo político: ${estrategia.riesgo}
- Oportunidad: ${estrategia.oportunidad}
- Estatus: ${estrategia.estatus}
- Responsable: ${estrategia.responsable ?? "No asignado"}
- Notas ejecutivas: ${estrategia.notas_ejecutivas ?? "Sin notas"}
- Notas operativas: ${estrategia.notas_operativas ?? "Sin notas"}`
    : "Sin ficha estratégica registrada."
}

### Historial electoral reciente
${
  timeline.length > 0
    ? timeline
        .map(
          (h) =>
            `- ${h.anio}: Ganó ${h.winnerSiglas} con ${
              h.porcentaje?.toFixed(1) ?? "?"
            }% (margen: ${h.margin?.toLocaleString() ?? "?"} votos)`
        )
        .join("\n")
    : "Sin historial electoral disponible."
}

### Termómetros políticos (escala 0 a 100)
${
  t
    ? `T1=${t.term1} T2=${t.term2} T3=${t.term3} T4=${t.term4} T5=${t.term5}
Promedio: ${((t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5).toFixed(1)}`
    : "Sin termómetros registrados."
}

### Comité municipal
${
  actores.comite
    ? `Presidente: ${actores.comite.presidente} | Secretario: ${actores.comite.secretario} | Inaugurado: ${actores.comite.inaugurado ? "Sí" : "No"}`
    : "Sin comité registrado."
}

### Aspirantes registrados (${actores.aspirantes.length})
${
  actores.aspirantes
    .slice(0, 5)
    .map((a) => `- ${a.nombre} (${a.cargo_aspirado}, ${a.partido})`)
    .join("\n") || "Ninguno."
}

### Planilla de candidatos (${actores.planilla.length} integrantes)
${
  actores.planilla
    .slice(0, 5)
    .map((p) => `- ${p.cargo}: ${p.nombre} (${p.partido})`)
    .join("\n") || "Sin planilla registrada."
}

### Proyección electoral
Puntuación: ${puntuacion}/100 — Nivel: ${nivel}
Scores parciales: Historial=${score_historial} Termómetros=${score_termometros.toFixed(
  1
)} Cobertura=${score_cobertura.toFixed(1)} Competencia=${score_competencia}

### Cobertura de secciones
${
  coberturaPromedio !== null
    ? `Promedio: ${coberturaPromedio.toFixed(1)}% compromisos vs meta (${
        withMeta.length
      } secciones con meta asignada)`
    : "Sin datos de cobertura."
}

### Riesgo de competencia
${compRes.data?.riesgo_electoral ?? "Sin clasificar"}

## INSTRUCCIONES
- Responde SIEMPRE en español
- Sé conciso y estratégicamente útil
- Basa tus análisis en los datos anteriores
- Si no hay datos suficientes en alguna área, indícalo
- Usa formato Markdown para respuestas largas`;

  const result = streamText({
    model: MODEL_ANALISIS as any,
    system: systemPrompt,
    messages: messages.slice(-8),
    maxOutputTokens: 1500,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/municipio-context/route.ts
git commit -m "feat(inteligencia): enrich municipio-context route with cobertura, proyeccion, competencia and 8-msg limit"
```

---

## Task 3: Global Inteligencia Route

New streaming route for cross-municipal analysis mode. Uses `getSituacionGlobal()` to get the full enriched list (with proyección, termómetros, urgencyScore) and filters by `municipioIds` if provided, otherwise uses top-8 by urgency.

**Files:**
- Create: `src/app/api/ai/inteligencia/route.ts`

- [ ] **Step 1: Create the directory and file**

```ts
import { streamText } from "ai";
import { MODEL_ANALISIS } from "@/lib/ai";
import { getUsuarioActual } from "@/actions/auth";
import { getSituacionGlobal } from "@/actions/situacion";

export async function POST(req: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, municipioIds } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    municipioIds?: number[];
  };

  const { municipios } = await getSituacionGlobal();

  const scope =
    municipioIds?.length
      ? municipios.filter((m) => municipioIds.includes(m.id))
      : municipios.slice(0, 8);

  const contexto = scope
    .map(
      (m) =>
        `- ${m.nombre}: proyección=${m.proyeccion ?? "N/D"}/100 nivel=${
          m.proyeccionNivel ?? "?"
        } ` +
        `termómetro=${m.avgTermometro?.toFixed(1) ?? "N/D"} ` +
        `prioridad=${m.prioridad ?? "N/D"} riesgo=${m.riesgo ?? "N/D"} ` +
        `aspirantes=${m.aspirantesCount} planilla=${m.planillaCount}`
    )
    .join("\n");

  const systemPrompt = `Eres un analista político estratégico experto en elecciones municipales del Estado de México.
Tienes acceso a los datos de los siguientes municipios del sistema SIPEEM:

${contexto}

Para preguntas sobre municipios no incluidos en la lista, indica que no tienes datos cargados para ese municipio.
Responde siempre en español. Sé conciso y estratégicamente útil. Usa Markdown para respuestas largas.`;

  const result = streamText({
    model: MODEL_ANALISIS as any,
    system: systemPrompt,
    messages: messages.slice(-8),
    maxOutputTokens: 1500,
  });

  return result.toUIMessageStreamResponse();
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai/inteligencia/route.ts
git commit -m "feat(inteligencia): add global cross-municipal streaming route"
```

---

## Task 4: `guardarSintesisIA` Server Action

Synthesizes the conversation with MODEL_RAPIDO (fast, cheap) then saves the result to the existing `briefings` table with a `[Síntesis de análisis IA]` prefix. `generadoPor` always comes from `getUsuarioActual()` on the server — never from the client.

**Files:**
- Create: `src/actions/inteligencia.ts`

- [ ] **Step 1: Create the Server Action**

```ts
"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateText } from "ai";
import { MODEL_RAPIDO } from "@/lib/ai";
import type { Message } from "@/lib/inteligencia-types";

export async function guardarSintesisIA(
  municipioId: number,
  messages: Message[]
): Promise<number> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol))
    redirect("/login");

  const intercambios = messages
    .filter((m) => m.content.trim())
    .map(
      (m) => `${m.role === "user" ? "Analista" : "IA"}: ${m.content}`
    )
    .join("\n\n");

  const { text: contenido } = await generateText({
    model: MODEL_RAPIDO as any,
    system: "Eres un redactor político. Genera un resumen ejecutivo conciso.",
    prompt: `Resume la siguiente conversación de análisis electoral en un briefing ejecutivo claro y estructurado (máximo 300 palabras). Incluye: tema central, hallazgos clave y recomendaciones mencionadas.\n\n${intercambios}`,
    maxOutputTokens: 600,
  });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("briefings")
    .insert({
      municipio_id: municipioId,
      contenido: `[Síntesis de análisis IA]\n\n${contenido}`,
      generado_por: usuario.email,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return data.id;
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/actions/inteligencia.ts
git commit -m "feat(inteligencia): add guardarSintesisIA server action — synthesizes with MODEL_RAPIDO, saves to briefings"
```

---

## Task 5: `ChatArea` Component

Extract the chat UI from `AsistenteChat.tsx` into a reusable presentational component. All state management (messages, loading) moves to the parent (`InteligenciaChatShell`). The component only renders and calls `onSend`. **Do not delete `AsistenteChat.tsx` yet** — that happens in Task 8.

**Files:**
- Create: `src/components/inteligencia/ChatArea.tsx`

- [ ] **Step 1: Create the directory and file**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, Bot, User } from "lucide-react";
import type { Message } from "@/lib/inteligencia-types";

interface Props {
  messages: Message[];
  loading: boolean;
  onSend: (content: string) => void;
  suggestions?: string[];
}

export default function ChatArea({
  messages,
  loading,
  onSend,
  suggestions,
}: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput("");
  }

  return (
    <div className="flex flex-col h-[500px]">
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-2">
            <Bot className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-sm text-slate-400">
              Pregunta sobre la estrategia, riesgos, aspirantes o cualquier
              aspecto de este municipio.
            </p>
            {suggestions && suggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {suggestions.map((sugg) => (
                  <button
                    key={sugg}
                    onClick={() => setInput(sugg)}
                    className="text-xs px-3 py-1.5 rounded-full border border-indigo-200 text-indigo-600 hover:bg-indigo-50 transition-colors"
                  >
                    {sugg}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2 ${
              msg.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            {msg.role === "assistant" && (
              <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-indigo-600" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-slate-900 text-white rounded-tr-sm"
                  : "bg-slate-100 text-slate-800 rounded-tl-sm"
              }`}
            >
              {msg.content ||
                (loading && i === messages.length - 1 ? "▋" : "")}
            </div>
            {msg.role === "user" && (
              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-600" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder="Pregunta... (Enter para enviar)"
          rows={2}
          className="flex-1 rounded-xl border-slate-200 text-sm resize-none"
          disabled={loading}
        />
        <Button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-indigo-600 hover:bg-indigo-700 self-end h-10 w-10 p-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/inteligencia/ChatArea.tsx
git commit -m "feat(inteligencia): add ChatArea presentational component extracted from AsistenteChat"
```

---

## Task 6: `ContextPanel` Component

Left-side panel showing contextual data. In `mode="municipal"`: tabs KPIs / Actores / Historial. In `mode="global"`: tabs Municipios (checkbox selector, max 5) / Selección. Guardar button at the bottom — disabled until `canGuardar` is true.

**Files:**
- Create: `src/components/inteligencia/ContextPanel.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import type {
  MunicipioKPIs,
  ActoresData,
  HistorialItem,
} from "@/lib/inteligencia-types";

interface Props {
  mode: "municipal" | "global";
  // municipal
  kpis?: MunicipioKPIs | null;
  actoresData?: ActoresData | null;
  historialData?: HistorialItem[];
  // global
  municipios?: { id: number; nombre: string }[];
  selectedIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
  // common
  onGuardar: () => void;
  canGuardar: boolean;
  saving: boolean;
}

export default function ContextPanel({
  mode,
  kpis,
  actoresData,
  historialData = [],
  municipios = [],
  selectedIds = [],
  onSelectionChange,
  onGuardar,
  canGuardar,
  saving,
}: Props) {
  function toggleMunicipio(id: number) {
    if (!onSelectionChange) return;
    if (selectedIds.includes(id)) {
      onSelectionChange(selectedIds.filter((x) => x !== id));
    } else if (selectedIds.length < 5) {
      onSelectionChange([...selectedIds, id]);
    }
  }

  const nivelColor = (nivel: string) => {
    if (nivel === "muy_alto") return "bg-emerald-100 text-emerald-700";
    if (nivel === "alto") return "bg-blue-100 text-blue-700";
    if (nivel === "medio") return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-2 border-b border-slate-100">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {mode === "municipal" ? "Contexto del municipio" : "Selección de municipios"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {mode === "municipal" ? (
          <Tabs defaultValue="kpis" className="flex flex-col h-full">
            <TabsList className="w-full rounded-none border-b border-slate-100 bg-slate-50 h-auto p-1 gap-0.5 shrink-0">
              <TabsTrigger value="kpis" className="text-xs flex-1">
                KPIs
              </TabsTrigger>
              <TabsTrigger value="actores" className="text-xs flex-1">
                Actores
              </TabsTrigger>
              <TabsTrigger value="historial" className="text-xs flex-1">
                Historial
              </TabsTrigger>
            </TabsList>

            <TabsContent value="kpis" className="p-3 space-y-3 mt-0 overflow-y-auto">
              {kpis ? (
                <>
                  {kpis.proyeccion && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase">
                        Proyección
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-slate-900">
                          {kpis.proyeccion.puntuacion}
                        </span>
                        <span className="text-xs text-slate-400">/100</span>
                        <span
                          className={`ml-auto text-xs font-bold px-2 py-0.5 rounded-full ${nivelColor(
                            kpis.proyeccion.nivel
                          )}`}
                        >
                          {kpis.proyeccion.nivel.replace("_", " ")}
                        </span>
                      </div>
                    </div>
                  )}

                  {kpis.termometros &&
                    (() => {
                      const term = kpis.termometros!;
                      return (
                        <div className="space-y-1">
                          <p className="text-[9px] font-black text-slate-400 uppercase">
                            Termómetros
                          </p>
                          {(
                            [
                              "term1",
                              "term2",
                              "term3",
                              "term4",
                              "term5",
                            ] as const
                          ).map((k, i) => (
                            <div key={k} className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 w-5">
                                T{i + 1}
                              </span>
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full">
                                <div
                                  className="h-1.5 rounded-full bg-indigo-500"
                                  style={{ width: `${term[k]}%` }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-slate-700 w-6 text-right">
                                {term[k]}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 rounded-xl p-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase">
                        Cobertura
                      </p>
                      <p className="text-sm font-black text-slate-900">
                        {kpis.coberturaPromedio !== null
                          ? `${kpis.coberturaPromedio.toFixed(1)}%`
                          : "N/D"}
                      </p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase">
                        Competencia
                      </p>
                      <p className="text-sm font-black text-slate-900">
                        {kpis.riesgoElectoral ?? "N/D"}
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 text-center py-4">
                  Sin datos KPI
                </p>
              )}
            </TabsContent>

            <TabsContent value="actores" className="p-3 space-y-3 mt-0 overflow-y-auto">
              {actoresData ? (
                <>
                  {actoresData.comite && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase">
                        Comité
                      </p>
                      <p className="text-xs text-slate-700">
                        Pte: {actoresData.comite.presidente}
                      </p>
                      <p className="text-xs text-slate-700">
                        Sec: {actoresData.comite.secretario}
                      </p>
                    </div>
                  )}

                  {actoresData.aspirantes.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase">
                        Aspirantes ({actoresData.aspirantes.length})
                      </p>
                      {actoresData.aspirantes.slice(0, 5).map((a, i) => (
                        <p key={i} className="text-xs text-slate-700">
                          • {a.nombre} ({a.partido})
                        </p>
                      ))}
                    </div>
                  )}

                  {actoresData.planilla.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-black text-slate-400 uppercase">
                        Planilla ({actoresData.planilla.length})
                      </p>
                      {actoresData.planilla.slice(0, 5).map((p, i) => (
                        <p key={i} className="text-xs text-slate-700">
                          • {p.cargo}: {p.nombre}
                        </p>
                      ))}
                    </div>
                  )}

                  {!actoresData.comite &&
                    actoresData.aspirantes.length === 0 &&
                    actoresData.planilla.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-4">
                        Sin actores registrados
                      </p>
                    )}
                </>
              ) : (
                <p className="text-xs text-slate-400 text-center py-4">
                  Sin datos de actores
                </p>
              )}
            </TabsContent>

            <TabsContent value="historial" className="p-3 mt-0 overflow-y-auto">
              {historialData.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  Historial disponible en la ficha de Estrategia Municipal
                </p>
              ) : (
                <div className="space-y-2">
                  {historialData.map((h) => (
                    <div
                      key={h.anio}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="font-bold text-slate-700">{h.anio}</span>
                      <span className="text-slate-600">{h.winnerSiglas}</span>
                      <span className="text-slate-500">
                        {h.porcentaje?.toFixed(1) ?? "?"}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          // Global mode
          <Tabs defaultValue="municipios" className="flex flex-col h-full">
            <TabsList className="w-full rounded-none border-b border-slate-100 bg-slate-50 h-auto p-1 gap-0.5 shrink-0">
              <TabsTrigger value="municipios" className="text-xs flex-1">
                Municipios
              </TabsTrigger>
              <TabsTrigger value="seleccion" className="text-xs flex-1">
                Selección
              </TabsTrigger>
            </TabsList>

            <TabsContent value="municipios" className="p-3 mt-0 overflow-y-auto">
              <p className="text-[9px] font-black text-slate-400 uppercase mb-2">
                Selecciona hasta 5 · {selectedIds.length}/5
              </p>
              <div className="space-y-0.5">
                {municipios.map((m) => {
                  const selected = selectedIds.includes(m.id);
                  const disabled = !selected && selectedIds.length >= 5;
                  return (
                    <label
                      key={m.id}
                      className={`flex items-center gap-2 text-xs rounded-lg px-2 py-1.5 cursor-pointer ${
                        selected
                          ? "bg-indigo-50 text-indigo-700 font-semibold"
                          : disabled
                          ? "opacity-40 cursor-not-allowed"
                          : "text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={disabled}
                        onChange={() => toggleMunicipio(m.id)}
                        className="accent-indigo-600 shrink-0"
                      />
                      {m.nombre}
                    </label>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="seleccion" className="p-3 mt-0 overflow-y-auto">
              {selectedIds.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">
                  Selecciona municipios para analizar
                </p>
              ) : (
                <div className="space-y-1">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-2">
                    Municipios activos en análisis
                  </p>
                  {municipios
                    .filter((m) => selectedIds.includes(m.id))
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center gap-2 text-xs text-slate-700"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                        {m.nombre}
                      </div>
                    ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>

      <div className="px-3 py-3 border-t border-slate-100 shrink-0">
        <Button
          onClick={onGuardar}
          disabled={!canGuardar || saving}
          size="sm"
          className="w-full rounded-xl bg-slate-900 hover:bg-slate-700 text-white text-xs gap-1.5"
          title={
            mode === "global" && !canGuardar
              ? "Selecciona exactamente un municipio para guardar"
              : undefined
          }
        >
          <Save className="w-3.5 h-3.5" />
          {saving ? "Guardando..." : "Guardar síntesis"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/inteligencia/ContextPanel.tsx
git commit -m "feat(inteligencia): add ContextPanel with KPIs/Actores/Historial tabs (municipal) and municipio selector (global)"
```

---

## Task 7: `InteligenciaChatShell` Component

The main shell that orchestrates state, streaming, and saving. Mounts `ContextPanel` (left, `w-72`) + `ChatArea` (right, `flex-1`). All streaming logic is taken from the existing `AsistenteChat.tsx`.

**Files:**
- Create: `src/components/inteligencia/InteligenciaChatShell.tsx`

- [ ] **Step 1: Create the file**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { guardarSintesisIA } from "@/actions/inteligencia";
import ContextPanel from "./ContextPanel";
import ChatArea from "./ChatArea";
import type {
  Message,
  MunicipioKPIs,
  ActoresData,
  HistorialItem,
} from "@/lib/inteligencia-types";

interface Props {
  mode: "municipal" | "global";
  municipioId?: number;
  municipios?: { id: number; nombre: string }[];
  kpis?: MunicipioKPIs | null;
  actoresData?: ActoresData | null;
  historialData?: HistorialItem[];
}

const MUNICIPAL_SUGGESTIONS = [
  "¿Cuáles son los principales riesgos?",
  "¿Qué me dicen los termómetros?",
  "¿Cómo está la estructura de actores?",
];

const GLOBAL_SUGGESTIONS = [
  "¿Qué municipios tienen mayor riesgo?",
  "¿Dónde concentrar esfuerzos esta semana?",
  "Compara la proyección de los municipios seleccionados",
];

export default function InteligenciaChatShell({
  mode,
  municipioId,
  municipios = [],
  kpis,
  actoresData,
  historialData = [],
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedMunicipioIds, setSelectedMunicipioIds] = useState<number[]>(
    municipioId ? [municipioId] : []
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canSave, setCanSave] = useState(false);

  // In municipal mode: always the fixed municipioId.
  // In global mode: only valid when exactly 1 municipio is selected.
  const effectiveMunicipioId =
    mode === "municipal"
      ? municipioId!
      : selectedMunicipioIds.length === 1
      ? selectedMunicipioIds[0]
      : undefined;

  const canActuallySave = canSave && effectiveMunicipioId !== undefined;

  async function handleSend(content: string) {
    const userMsg: Message = { role: "user", content };
    const updatedMessages = [...messages, userMsg];
    setMessages([...updatedMessages, { role: "assistant", content: "" }]);
    setLoading(true);

    const url =
      mode === "municipal"
        ? "/api/ai/municipio-context"
        : "/api/ai/inteligencia";

    const body =
      mode === "municipal"
        ? { messages: updatedMessages.slice(-8), municipioId }
        : {
            messages: updatedMessages.slice(-8),
            municipioIds: selectedMunicipioIds,
          };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error(`Error ${res.status}`);
      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (line.startsWith("0:")) {
            try {
              const parsed = JSON.parse(line.slice(2));
              if (typeof parsed === "string") {
                assistantText += parsed;
                setMessages((prev) => [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: assistantText },
                ]);
              }
            } catch {
              // skip malformed lines
            }
          }
        }
      }
      setCanSave(true);
    } catch (err) {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        {
          role: "assistant",
          content: `Error: ${
            err instanceof Error ? err.message : "Sin respuesta"
          }`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleGuardar() {
    if (!canActuallySave) return;
    setSaving(true);
    try {
      await guardarSintesisIA(effectiveMunicipioId!, messages);
      toast.success("Síntesis guardada en Briefings");
    } catch {
      toast.error("Error al guardar la síntesis");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full gap-4">
      <div className="w-72 shrink-0">
        <ContextPanel
          mode={mode}
          kpis={kpis}
          actoresData={actoresData}
          historialData={historialData}
          municipios={municipios}
          selectedIds={selectedMunicipioIds}
          onSelectionChange={setSelectedMunicipioIds}
          onGuardar={handleGuardar}
          canGuardar={canActuallySave}
          saving={saving}
        />
      </div>
      <div className="flex-1 min-w-0">
        <ChatArea
          messages={messages}
          loading={loading}
          onSend={handleSend}
          suggestions={
            mode === "municipal" ? MUNICIPAL_SUGGESTIONS : GLOBAL_SUGGESTIONS
          }
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/inteligencia/InteligenciaChatShell.tsx
git commit -m "feat(inteligencia): add InteligenciaChatShell — orchestrates streaming, context panel, and synthesis saving"
```

---

## Task 8: Migrate `ActoresTabs`, Delete `AsistenteChat`

Swaps `<AsistenteChat>` for `<InteligenciaChatShell mode="municipal">` inside the "Asistente IA" tab. Adds `nombre: string` prop to `ActoresTabs` and updates the page that renders it to pass the municipio name. Deletes `AsistenteChat.tsx`.

**Files:**
- Modify: `src/components/actores/ActoresTabs.tsx`
- Modify: `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx`
- Delete: `src/components/actores/AsistenteChat.tsx`

- [ ] **Step 1: Modify `ActoresTabs.tsx`**

Replace the entire file:

```tsx
"use client";

import type { ReactNode } from "react";
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
import AgendaPanel from "./AgendaPanel";
import IncidenciasPanel from "./IncidenciasPanel";
import CompromisosPanel from "./CompromisosPanel";
import CompetenciaForm from "./CompetenciaForm";
import ProyeccionPanel from "./ProyeccionPanel";
import TermometrosDiagnostico from "./TermometrosDiagnostico";
import PulsoDigitalPanel from "./PulsoDigitalPanel";
import InteligenciaChatShell from "@/components/inteligencia/InteligenciaChatShell";
import type { ProyeccionMunicipio } from "@/actions/proyeccion";
import type { MunicipioKPIs, ActoresData } from "@/lib/inteligencia-types";

type Props = {
  municipioId: number;
  nombre: string;
  actores: ActoresMunicipioData;
  proyeccion: ProyeccionMunicipio | null;
  children: ReactNode;
};

export default function ActoresTabs({
  municipioId,
  nombre,
  actores,
  proyeccion,
  children,
}: Props) {
  const kpis: MunicipioKPIs = {
    nombre,
    proyeccion: proyeccion
      ? { puntuacion: proyeccion.puntuacion, nivel: proyeccion.nivel }
      : null,
    termometros: actores.termometros
      ? {
          term1: actores.termometros.term1,
          term2: actores.termometros.term2,
          term3: actores.termometros.term3,
          term4: actores.termometros.term4,
          term5: actores.termometros.term5,
        }
      : null,
    coberturaPromedio: null,
    riesgoElectoral: actores.competencia?.riesgo_electoral ?? null,
    estrategia: null,
  };

  const actoresData: ActoresData = {
    comite: actores.comite
      ? {
          presidente: actores.comite.presidente,
          secretario: actores.comite.secretario,
        }
      : null,
    planilla: actores.planilla.map((p) => ({
      cargo: p.cargo,
      nombre: p.nombre,
      partido: p.partido,
    })),
    aspirantes: actores.aspirantes.map((a) => ({
      nombre: a.nombre,
      cargo_aspirado: a.cargo_aspirado,
      partido: a.partido,
    })),
  };

  return (
    <Tabs defaultValue="estrategia" className="space-y-6">
      <TabsList className="w-full h-auto flex-wrap gap-1 rounded-2xl p-1.5">
        <TabsTrigger value="estrategia">Estrategia</TabsTrigger>
        <TabsTrigger value="termometros">Termómetros</TabsTrigger>
        <TabsTrigger value="escenarios">Escenarios</TabsTrigger>
        <TabsTrigger value="comite">Comité</TabsTrigger>
        <TabsTrigger value="planilla">Planilla</TabsTrigger>
        <TabsTrigger value="aspirantes">Aspirantes</TabsTrigger>
        <TabsTrigger value="agenda">Agenda</TabsTrigger>
        <TabsTrigger value="incidencias">Incidencias</TabsTrigger>
        <TabsTrigger value="compromisos">Compromisos</TabsTrigger>
        <TabsTrigger value="competencia">Competencia</TabsTrigger>
        <TabsTrigger value="proyeccion">Proyección</TabsTrigger>
        <TabsTrigger value="asistente">Asistente IA</TabsTrigger>
        <TabsTrigger value="pulso">Pulso Digital</TabsTrigger>
      </TabsList>

      <TabsContent value="estrategia" className="space-y-8">
        {children}
      </TabsContent>

      <TabsContent value="termometros">
        <TermometrosForm municipioId={municipioId} initialData={actores.termometros} />
        <TermometrosDiagnostico municipioId={municipioId} termometros={actores.termometros} />
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

      <TabsContent value="agenda">
        <AgendaPanel municipioId={municipioId} initialEventos={actores.eventos} />
      </TabsContent>

      <TabsContent value="incidencias">
        <IncidenciasPanel municipioId={municipioId} initialIncidencias={actores.incidencias} />
      </TabsContent>

      <TabsContent value="compromisos">
        <CompromisosPanel municipioId={municipioId} initialCompromisos={actores.compromisos} />
      </TabsContent>

      <TabsContent value="competencia">
        <CompetenciaForm municipioId={municipioId} initialData={actores.competencia} />
      </TabsContent>

      <TabsContent value="proyeccion">
        <ProyeccionPanel proyeccion={proyeccion} />
      </TabsContent>

      <TabsContent value="asistente">
        <InteligenciaChatShell
          mode="municipal"
          municipioId={municipioId}
          kpis={kpis}
          actoresData={actoresData}
          historialData={[]}
        />
      </TabsContent>

      <TabsContent value="pulso">
        <PulsoDigitalPanel municipioId={municipioId} initialPulso={actores.pulso} />
      </TabsContent>
    </Tabs>
  );
}
```

- [ ] **Step 2: Update `[id]/page.tsx` to pass `nombre` prop**

In `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx`, locate the `<ActoresTabs>` call (around line 89) and add the `nombre` prop:

```tsx
// Before:
<ActoresTabs municipioId={municipioId} actores={actores} proyeccion={proyeccion}>

// After:
<ActoresTabs
  municipioId={municipioId}
  nombre={summary?.nombre ?? `Municipio ${municipioId}`}
  actores={actores}
  proyeccion={proyeccion}
>
```

Note: `summary` is already computed at the top of the page as `const summary = electoral?.summary ?? null;`

- [ ] **Step 3: Delete `AsistenteChat.tsx`**

```bash
git rm src/components/actores/AsistenteChat.tsx
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors. If TypeScript complains about `actores.competencia?.riesgo_electoral` not existing on the type, check `ActoresMunicipioData` from `@/actions/actores` — `competencia` should have a `riesgo_electoral` field since it's used in `CompetenciaForm`.

- [ ] **Step 5: Commit**

```bash
git add src/components/actores/ActoresTabs.tsx
git add src/app/\(protected\)/admin/estrategia-municipal/\[id\]/page.tsx
git commit -m "feat(inteligencia): replace AsistenteChat with InteligenciaChatShell in ActoresTabs; add nombre prop"
```

---

## Task 9: Global Page + SidebarNav Entry

Creates the `/admin/inteligencia` page (Server Component — loads active municipalities list, renders `InteligenciaChatShell mode="global"`) and adds the "Inteligencia IA" entry to the sidebar for admin users.

**Files:**
- Create: `src/app/(protected)/admin/inteligencia/page.tsx`
- Modify: `src/components/layout/SidebarNav.tsx`

- [ ] **Step 1: Create the inteligencia page**

```tsx
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "@/actions/auth";
import { redirect } from "next/navigation";
import InteligenciaChatShell from "@/components/inteligencia/InteligenciaChatShell";

export default async function InteligenciaPage() {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol))
    redirect("/login");

  const svc = createServiceClient();
  const { data: municipios } = await svc
    .from("municipios")
    .select("id, nombre")
    .eq("estatus", "activo")
    .order("nombre");

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div>
        <h1 className="text-xl font-black text-slate-900 tracking-tight">
          Inteligencia Electoral
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Análisis comparativo cross-municipio con IA
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <InteligenciaChatShell
          mode="global"
          municipios={municipios ?? []}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add sidebar entry in `SidebarNav.tsx`**

Add `Brain` to the existing import from `lucide-react` and add the `isInteligencia` active check + link after the "Sala de Situación" link.

```tsx
// Modify the import line (add Brain):
import { Gauge, ClipboardList, Key, Smartphone, Brain } from "lucide-react";

// Add to the pathname checks block (after isAuditoria):
const isInteligencia = pathname.startsWith("/admin/inteligencia");

// Add after the Sala de Situación <Link> inside the {esAdmin && (...)} block:
<Link href="/admin/inteligencia" className={itemClass(isInteligencia)}>
  <span className={iconClass(isInteligencia, "bg-violet-600/20 text-violet-300")}>
    <Brain className="h-4 w-4" />
  </span>
  Inteligencia IA
</Link>
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(protected\)/admin/inteligencia/page.tsx
git add src/components/layout/SidebarNav.tsx
git commit -m "feat(inteligencia): add /admin/inteligencia global page and SidebarNav entry"
```

---

## Task 10: End-to-End Validation

Verifies the full system works: municipal chat with enriched context, global cross-municipal chat, and synthesis saving.

**Files:** none (validation only)

- [ ] **Step 1: Production build check**

```bash
npm run build
```

Expected: build succeeds with zero TypeScript errors. Note any warnings but don't block on them.

- [ ] **Step 2: Start dev server**

```bash
npm run dev
```

- [ ] **Step 3: Validate municipal mode**

1. Navigate to `/admin/estrategia-municipal/{any municipioId}`
2. Click tab **"Asistente IA"**
3. Verify: `ContextPanel` appears on the left with KPIs tab showing proyección and termómetros
4. Click tab **"Actores"** — verify comité/planilla/aspirantes
5. Click tab **"Historial"** — verify empty state message "Historial disponible en la ficha de Estrategia Municipal"
6. Send a message: "¿Cuál es el mayor riesgo electoral de este municipio?"
7. Verify: streaming response appears word-by-word (cursor `▋` visible while streaming)
8. Verify: assistant response mentions cobertura or proyección data (confirms enriched context is working)

- [ ] **Step 4: Validate global mode**

1. Navigate to `/admin/inteligencia`
2. Verify: sidebar shows "Inteligencia IA" link with Brain icon, highlighted as active
3. Verify: `ContextPanel` on left shows "Municipios" tab with checkbox list
4. Select 2-3 municipalities (verify 5-limit enforced)
5. Send: "Compara los municipios seleccionados"
6. Verify: streaming response references the selected municipalities by name

- [ ] **Step 5: Validate synthesis saving — municipal mode**

1. In municipal mode, after at least one assistant response, the "Guardar síntesis" button should be enabled
2. Click "Guardar síntesis"
3. Verify: toast "Síntesis guardada en Briefings" appears
4. Navigate to the Briefings section of that municipio (Estrategia → tab Estrategia → scroll to briefings, or direct URL)
5. Verify: new briefing with content starting `[Síntesis de análisis IA]` is visible

- [ ] **Step 6: Validate synthesis saving — global mode (single municipio)**

1. In `/admin/inteligencia`, select exactly 1 municipio
2. Send a message and wait for response
3. Verify: "Guardar síntesis" button is now enabled
4. Select a 2nd municipio — verify button becomes disabled again
5. Deselect back to 1 — verify button re-enables
6. Click "Guardar síntesis" — verify toast and briefing created for that municipio

- [ ] **Step 7: Commit validation**

If fixes were needed during validation, commit them now. Otherwise:

```bash
git log --oneline -8
```

Confirm all tasks are committed cleanly.
