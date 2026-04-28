# Perfilado Automático de Aspirantes (AI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Al expandir la ficha de un aspirante, un botón "Perfilar con IA" busca información pública sobre él y genera un perfil automático con trayectoria, vínculos políticos y observaciones. El perfil se guarda en la tabla `aspirantes` como campo adicional.

**Architecture:** Columna `perfil_ia` en tabla `aspirantes`. Server Action `perfilarAspirante(id, municipioId)` que usa `buscarWeb()` + `generateAnalysis()`. El perfil se muestra expandible en `AspirantesPanel`.

**Tech Stack:** `ai` v6 · Vercel AI Gateway · `src/lib/busqueda-web.ts` (de C4) · Supabase

---

## PREREQUISITO: C4 (Monitoreo redes) completado para tener `src/lib/busqueda-web.ts`

Si C4 no está completado, crear `src/lib/busqueda-web.ts` con el código de la Task 2 del plan C4.

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- Leer `src/components/actores/AspirantesPanel.tsx` — el perfil se muestra en la fila expandida del aspirante

---

### Task 1: Agregar columna `perfil_ia` a `aspirantes`

- [ ] **Step 1: Ejecutar en Supabase SQL Editor**

```sql
ALTER TABLE public.aspirantes ADD COLUMN IF NOT EXISTS perfil_ia text;
ALTER TABLE public.aspirantes ADD COLUMN IF NOT EXISTS perfil_at timestamptz;
```

---

### Task 2: Actualizar tipo `Aspirante` en `src/lib/types.ts`

- [ ] **Step 1: Agregar campos opcionales**

```typescript
export interface Aspirante {
  // ... campos existentes ...
  perfil_ia?: string | null;   // NUEVO
  perfil_at?: string | null;   // NUEVO
}
```

---

### Task 3: Server Action `perfilarAspirante`

**Files:**
- Create: `src/actions/perfilado-ai.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// src/actions/perfilado-ai.ts
"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateAnalysis } from "@/lib/ai";
import { buscarWeb } from "@/lib/busqueda-web";

export async function perfilarAspirante(id: number, municipioId: number): Promise<string> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();

  // Get aspirante data
  const { data: aspirante, error } = await svc
    .from("aspirantes")
    .select("nombre, cargo_aspirado, partido")
    .eq("id", id)
    .eq("municipio_id", municipioId)
    .single();

  if (error || !aspirante) throw new Error("Aspirante no encontrado");

  // Search web for public info
  const query = `${aspirante.nombre} ${aspirante.partido} ${aspirante.cargo_aspirado} Estado de México política`;
  const resultados = await buscarWeb(query);

  const contexto = resultados.length > 0
    ? resultados.map((r, i) => `[${i + 1}] ${r.titulo}\n${r.contenido}`).join("\n\n")
    : "No se encontró información pública relevante.";

  const prompt = `Genera un perfil político breve de ${aspirante.nombre}, aspirante a ${aspirante.cargo_aspirado} por ${aspirante.partido} en el Estado de México.

INFORMACIÓN ENCONTRADA EN BÚSQUEDA WEB:
${contexto}

Genera un perfil con:
1. **Trayectoria conocida**: cargos previos, experiencia política o pública identificada
2. **Vínculos políticos**: partido, alianzas, grupos de poder identificados
3. **Presencia pública**: actividad en redes, menciones en medios
4. **Observaciones estratégicas**: fortalezas o riesgos desde perspectiva electoral

IMPORTANTE: Indica claramente si la información es limitada o no verificada. Solo usa información que aparezca en las fuentes proporcionadas. Máximo 200 palabras. En español.`;

  const perfil = await generateAnalysis(prompt);

  // Save to DB
  await svc
    .from("aspirantes")
    .update({ perfil_ia: perfil, perfil_at: new Date().toISOString() })
    .eq("id", id)
    .eq("municipio_id", municipioId);

  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return perfil;
}
```

---

### Task 4: Integrar botón en `AspirantesPanel`

**Files:**
- Modify: `src/components/actores/AspirantesPanel.tsx`

- [ ] **Step 1: Leer el componente actual**

Leer `src/components/actores/AspirantesPanel.tsx` completo.

- [ ] **Step 2: Agregar estado y botón de perfilado**

En el componente, agregar:
```typescript
import { perfilarAspirante } from "@/actions/perfilado-ai";
import { Brain, Loader2 } from "lucide-react";

// Estado por aspirante (solo uno a la vez)
const [perfilandoId, setPerfilandoId] = useState<number | null>(null);
const [perfilesLocales, setPerfilesLocales] = useState<Record<number, string>>({});
```

En la fila de cada aspirante (o en la sección expandida), agregar:
```tsx
<button
  onClick={async () => {
    setPerfilandoId(a.id);
    try {
      const perfil = await perfilarAspirante(a.id, municipioId);
      setPerfilesLocales(prev => ({ ...prev, [a.id]: perfil }));
      toast.success("Perfil generado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al perfilar");
    } finally {
      setPerfilandoId(null);
    }
  }}
  disabled={perfilandoId !== null}
  className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
>
  {perfilandoId === a.id ? (
    <><Loader2 className="w-3 h-3 animate-spin" /> Perfilando...</>
  ) : (
    <><Brain className="w-3 h-3" /> Perfilar con IA</>
  )}
</button>

{/* Mostrar perfil si existe */}
{(perfilesLocales[a.id] || a.perfil_ia) && (
  <div className="mt-2 p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-slate-700 leading-relaxed">
    {perfilesLocales[a.id] ?? a.perfil_ia}
  </div>
)}
```

- [ ] **Step 3: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
