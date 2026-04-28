# Interpretación IA de Termómetros — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel de diagnóstico automático junto al formulario de Termómetros que interpreta la combinación T1-T5 con IA y genera un diagnóstico político de 2-3 párrafos. Se actualiza cada vez que se guardan los termómetros.

**Architecture:** Server Action `interpretarTermometros(municipioId)` que llama a `generateAnalysis()`. El diagnóstico se guarda en una nueva columna `diagnostico_ia` de la tabla `termometros`. El panel `TermometrosDiagnostico` se muestra en el tab de Termómetros después del formulario.

**Tech Stack:** `ai` v6 · Vercel AI Gateway · `src/lib/ai.ts` · Supabase column addition

---

## PREREQUISITO: Fase 5 Setup completada

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- Leer `src/components/actores/TermometrosForm.tsx` — el diagnóstico se renderiza DEBAJO del formulario existente

---

### Task 1: Agregar columna `diagnostico_ia` a la tabla `termometros`

- [ ] **Step 1: Ejecutar en Supabase SQL Editor**

```sql
ALTER TABLE public.termometros ADD COLUMN IF NOT EXISTS diagnostico_ia text;
ALTER TABLE public.termometros ADD COLUMN IF NOT EXISTS diagnostico_at timestamptz;
```

---

### Task 2: Actualizar tipo `Termometros` en `src/lib/types.ts`

- [ ] **Step 1: Agregar campos opcionales**

```typescript
export interface Termometros {
  id: number;
  municipio_id: number;
  term1: number;
  term2: number;
  term3: number;
  term4: number;
  term5: number;
  diagnostico_ia?: string | null;   // NUEVO
  diagnostico_at?: string | null;   // NUEVO
}
```

---

### Task 3: Server Action `interpretarTermometros`

**Files:**
- Create: `src/actions/termometros-ai.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// src/actions/termometros-ai.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateAnalysis } from "@/lib/ai";

export async function interpretarTermometros(municipioId: number): Promise<string> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const { data: t, error } = await svc
    .from("termometros")
    .select("term1, term2, term3, term4, term5")
    .eq("municipio_id", municipioId)
    .single();

  if (error || !t) throw new Error("No hay termómetros registrados para este municipio");

  const promedio = (t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5;

  const prompt = `Analiza los siguientes termómetros políticos de un municipio del Estado de México.

Los termómetros miden 5 dimensiones estratégicas clave (cada uno en escala de 0 a 100):
- T1: ${t.term1} — Fortaleza organizacional interna
- T2: ${t.term2} — Competitividad electoral percibida
- T3: ${t.term3} — Presencia territorial y cobertura
- T4: ${t.term4} — Movilización y activismo
- T5: ${t.term5} — Imagen pública del candidato/partido
- Promedio general: ${promedio.toFixed(1)}

Genera un diagnóstico político conciso con:
1. **Diagnóstico global** (1 párrafo): ¿Qué sugiere esta combinación de termómetros?
2. **Fortalezas y debilidades críticas** (máximo 2 de cada una)
3. **Recomendación táctica inmediata** (1 acción concreta para mejorar el indicador más bajo)

Sé específico, usa lenguaje político operativo, máximo 200 palabras. En español.`;

  const diagnostico = await generateAnalysis(prompt);

  // Save to DB
  await svc
    .from("termometros")
    .update({ diagnostico_ia: diagnostico, diagnostico_at: new Date().toISOString() })
    .eq("municipio_id", municipioId);

  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return diagnostico;
}
```

---

### Task 4: Componente `TermometrosDiagnostico`

**Files:**
- Create: `src/components/actores/TermometrosDiagnostico.tsx`

- [ ] **Step 1: Crear componente**

```tsx
// src/components/actores/TermometrosDiagnostico.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { interpretarTermometros } from "@/actions/termometros-ai";
import type { Termometros } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2, Brain } from "lucide-react";
import { toast } from "sonner";

type Props = {
  municipioId: number;
  termometros: Termometros | null;
};

export default function TermometrosDiagnostico({ municipioId, termometros }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [diagnosticoLocal, setDiagnosticoLocal] = useState<string | null>(
    termometros?.diagnostico_ia ?? null
  );

  async function handleInterpretar() {
    setLoading(true);
    try {
      const resultado = await interpretarTermometros(municipioId);
      setDiagnosticoLocal(resultado);
      toast.success("Diagnóstico generado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al interpretar");
    } finally {
      setLoading(false);
    }
  }

  if (!termometros) {
    return (
      <p className="text-xs text-slate-400 italic">
        Guarda los termómetros primero para generar un diagnóstico.
      </p>
    );
  }

  return (
    <div className="space-y-3 mt-6 pt-6 border-t border-slate-100">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-indigo-500" /> Diagnóstico IA
        </h3>
        <Button
          onClick={handleInterpretar}
          disabled={loading}
          size="sm"
          variant="outline"
          className="rounded-xl border-indigo-200 text-indigo-600 hover:bg-indigo-50 gap-2 font-semibold"
        >
          {loading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando...</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5" /> {diagnosticoLocal ? "Regenerar" : "Generar diagnóstico"}</>
          )}
        </Button>
      </div>

      {diagnosticoLocal ? (
        <Card className="border-indigo-100 bg-indigo-50/30">
          <CardContent className="p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {diagnosticoLocal}
            {termometros.diagnostico_at && (
              <p className="text-[10px] text-slate-400 mt-3 italic">
                Generado:{" "}
                {new Date(termometros.diagnostico_at).toLocaleString("es-MX", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-slate-400 italic">
          Haz clic en "Generar diagnóstico" para que la IA interprete los termómetros actuales.
        </p>
      )}
    </div>
  );
}
```

---

### Task 5: Integrar en tab de Termómetros

**Files:**
- Modify: `src/components/actores/ActoresTabs.tsx`

- [ ] **Step 1: Agregar `TermometrosDiagnostico` debajo de `TermometrosForm` en el tab de termómetros**

En `ActoresTabs.tsx`, dentro del `<TabsContent value="termometros">`:

```tsx
import TermometrosDiagnostico from "./TermometrosDiagnostico";

// Después de <TermometrosForm .../>:
<TermometrosDiagnostico
  municipioId={municipioId}
  termometros={actores.termometros}
/>
```

- [ ] **Step 2: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
