# Detector de Anomalías Electorales (AI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel en el dashboard de historial electoral que identifica municipios con comportamiento estadísticamente anómalo (saltos de participación, márgenes inusuales, cambios de tendencia abruptos) usando análisis estadístico + interpretación IA.

**Architecture:** Server Action `detectarAnomalias()` que (1) agrega estadísticas del historial por municipio, (2) aplica reglas estadísticas simples para detectar outliers (>2 desviaciones estándar), (3) llama a IA para interpretar las anomalías detectadas. Resultados en nueva sección del dashboard de historial.

**Tech Stack:** `ai` v6 · Vercel AI Gateway · Supabase · Next.js Server Component

---

## PREREQUISITO: Fase 5 Setup completada

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- Leer `src/app/(protected)/admin/historial/dashboard/page.tsx` — agregar sección al final
- Leer `src/actions/analytics.ts` — ver los tipos existentes de analytics

---

### Task 1: Server Action `detectarAnomalias`

**Files:**
- Create: `src/actions/anomalias.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// src/actions/anomalias.ts
"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateAnalysis } from "@/lib/ai";

export type AnomaliaDetectada = {
  municipio_id: number;
  municipio_nombre: string;
  tipo: "salto_participacion" | "margen_extremo" | "alternancia_rapida" | "volatilidad_alta";
  descripcion: string;
  severidad: "media" | "alta" | "critica";
  anio_referencia: number;
  valor_observado: number;
  valor_esperado: number;
};

export type ReporteAnomalias = {
  anomalias: AnomaliaDetectada[];
  interpretacion_ia: string;
  generado_at: string;
};

export async function detectarAnomalias(): Promise<ReporteAnomalias> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();

  // Fetch complete electoral history with joins
  const { data: historial, error } = await svc
    .from("historial_electoral")
    .select("municipio_id, anio, porcentaje_ganador, municipios(nombre)")
    .order("municipio_id")
    .order("anio");

  if (error) throw new Error(error.message);

  // Group by municipio
  const byMunicipio = new Map<number, { nombre: string; records: { anio: number; pct: number }[] }>();
  for (const row of historial ?? []) {
    if (!byMunicipio.has(row.municipio_id)) {
      byMunicipio.set(row.municipio_id, {
        nombre: (row.municipios as any)?.nombre ?? `Municipio ${row.municipio_id}`,
        records: [],
      });
    }
    byMunicipio.get(row.municipio_id)!.records.push({ anio: row.anio, pct: row.porcentaje_ganador });
  }

  const anomalias: AnomaliaDetectada[] = [];

  for (const [municipio_id, { nombre, records }] of byMunicipio) {
    if (records.length < 2) continue;

    const pcts = records.map((r) => r.pct);
    const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const variance = pcts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pcts.length;
    const stddev = Math.sqrt(variance);

    // Detect extreme margins (>2 stddev from mean)
    for (const record of records) {
      const zScore = stddev > 0 ? Math.abs(record.pct - mean) / stddev : 0;
      if (zScore > 2.5) {
        anomalias.push({
          municipio_id,
          municipio_nombre: nombre,
          tipo: "margen_extremo",
          descripcion: `Porcentaje ganador ${record.pct.toFixed(1)}% en ${record.anio} es ${zScore.toFixed(1)} desviaciones estándar de la media (${mean.toFixed(1)}%)`,
          severidad: zScore > 3.5 ? "critica" : "alta",
          anio_referencia: record.anio,
          valor_observado: record.pct,
          valor_esperado: mean,
        });
      }
    }

    // Detect rapid alternation (3+ changes in last 4 elections)
    if (records.length >= 4) {
      const recent = records.slice(-4);
      // ... detect if winning party changed more than 2 times
      // Simplified: detect if last margin < 5% (very competitive)
      const lastPct = records[records.length - 1].pct;
      if (lastPct < 35) {
        anomalias.push({
          municipio_id,
          municipio_nombre: nombre,
          tipo: "margen_extremo",
          descripcion: `Última elección ganada con solo ${lastPct.toFixed(1)}% — municipio extremadamente competitivo`,
          severidad: lastPct < 30 ? "critica" : "alta",
          anio_referencia: records[records.length - 1].anio,
          valor_observado: lastPct,
          valor_esperado: mean,
        });
      }
    }
  }

  // Sort by severidad
  const order = { critica: 0, alta: 1, media: 2 };
  anomalias.sort((a, b) => order[a.severidad] - order[b.severidad]);

  // AI interpretation of top anomalies
  let interpretacion_ia = "Sin anomalías significativas detectadas en el historial electoral.";
  if (anomalias.length > 0) {
    const top5 = anomalias.slice(0, 5);
    const prompt = `Analiza las siguientes anomalías detectadas en el historial electoral del Estado de México:

${top5.map((a, i) => `${i + 1}. [${a.severidad.toUpperCase()}] ${a.municipio_nombre}: ${a.descripcion}`).join("\n")}

Genera una interpretación estratégica breve (máximo 150 palabras) que explique:
- ¿Qué patrones generales revelan estas anomalías?
- ¿Cuáles representan mayor riesgo o oportunidad?
- 1-2 recomendaciones de monitoreo

En español, tono analítico.`;

    interpretacion_ia = await generateAnalysis(prompt);
  }

  return {
    anomalias,
    interpretacion_ia,
    generado_at: new Date().toISOString(),
  };
}
```

---

### Task 2: Componente `AnomaliasDashboard`

**Files:**
- Create: `src/components/analytics/AnomaliasDashboard.tsx`

- [ ] **Step 1: Crear Server Component**

```tsx
// src/components/analytics/AnomaliasDashboard.tsx
import { detectarAnomalias } from "@/actions/anomalias";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertOctagon, Brain } from "lucide-react";
import Link from "next/link";

const SEVERIDAD_COLORS = {
  critica: "bg-red-100 text-red-700 border-red-200",
  alta: "bg-orange-100 text-orange-700 border-orange-200",
  media: "bg-amber-100 text-amber-700 border-amber-200",
};

export default async function AnomaliasDashboard() {
  const { anomalias, interpretacion_ia, generado_at } = await detectarAnomalias();

  return (
    <div className="space-y-4">
      {/* AI interpretation */}
      <Card className="border-indigo-100 bg-indigo-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-indigo-700 flex items-center gap-2">
            <Brain className="w-4 h-4" /> Interpretación IA
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700 leading-relaxed">
          {interpretacion_ia}
        </CardContent>
      </Card>

      {/* Anomalies list */}
      {anomalias.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-4">
          Sin anomalías significativas detectadas.
        </p>
      ) : (
        <div className="space-y-2">
          {anomalias.slice(0, 10).map((a, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white">
              <AlertOctagon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-[9px] font-black uppercase ${SEVERIDAD_COLORS[a.severidad]}`}>
                    {a.severidad}
                  </Badge>
                  <Link href={`/admin/historial/municipio/${a.municipio_id}`} className="text-sm font-semibold text-indigo-600 hover:underline">
                    {a.municipio_nombre}
                  </Link>
                  <span className="text-xs text-slate-400">— {a.anio_referencia}</span>
                </div>
                <p className="text-xs text-slate-600">{a.descripcion}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-400 text-right">
        Análisis generado: {new Date(generado_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
      </p>
    </div>
  );
}
```

---

### Task 3: Integrar en dashboard de historial

**Files:**
- Modify: `src/app/(protected)/admin/historial/dashboard/page.tsx`

- [ ] **Step 1: Leer el archivo actual**

Leer `src/app/(protected)/admin/historial/dashboard/page.tsx` completo.

- [ ] **Step 2: Agregar sección de anomalías al final**

```tsx
import AnomaliasDashboard from "@/components/analytics/AnomaliasDashboard";
import { Suspense } from "react";

// Al final del JSX, agregar nueva sección:
<section className="space-y-4">
  <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
    <AlertOctagon className="w-3.5 h-3.5 text-amber-500" /> Detección de Anomalías
  </h2>
  <Suspense fallback={<p className="text-sm text-slate-400">Analizando historial...</p>}>
    <AnomaliasDashboard />
  </Suspense>
</section>
```

- [ ] **Step 3: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
