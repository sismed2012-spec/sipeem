# Municipio Analytics Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reordenar la vista `/admin/historial/municipio/[id]` para subir la cronología detallada a la parte superior e incluir `2023` en la narrativa y gráficas cuando exista información disponible.

**Architecture:** La implementación se divide en dos capas. Primero se amplía el DTO de analítica municipal para producir una serie temporal enriquecida con metadatos suficientes para representar `2023` sin mezclar silenciosamente municipal y gubernatura. Después se recompone el layout de la página para mostrar una banda cronológica compacta antes de las gráficas y reutilizar esa misma serie en los charts.

**Tech Stack:** Next.js App Router, React Server Components, TypeScript, Supabase, Recharts, shadcn/ui.

---

### Task 1: Enriquecer la serie temporal municipal con `2023`

**Files:**
- Modify: `src/actions/analytics.ts`
- Test: `src/lib/historial-secciones-2021.test.ts` (patrón existente a seguir)
- Create: `src/lib/municipio-analytics.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "node:test";
import assert from "node:assert/strict";

import { mergeMunicipioTimelineEvents } from "@/lib/municipio-analytics";

describe("mergeMunicipioTimelineEvents", () => {
  it("injects a 2023 gubernatura event in descending chronology without dropping municipal years", () => {
    const result = mergeMunicipioTimelineEvents({
      municipal: [
        {
          id: 10,
          anio: 2024,
          winner: "PVEM_PT_MORENA",
          winnerSiglas: "PVEM_PT_MORENA",
          winnerColor: "#166534",
          votos: 13559,
          porcentaje: 43.51,
          margin: 5031,
          source: "oficial_municipal",
          electionType: "municipal",
          topParties: [],
        },
        {
          id: 8,
          anio: 2021,
          winner: "PRI",
          winnerSiglas: "PRI",
          winnerColor: "#dc2626",
          votos: 9866,
          porcentaje: 32.66,
          margin: 1116,
          source: "oficial_municipal",
          electionType: "municipal",
          topParties: [],
        },
      ],
      gubernatura2023: {
        id: 99,
        anio: 2023,
        winner: "MORENA",
        winnerSiglas: "MORENA",
        winnerColor: "#7f1d1d",
        votos: 12000,
        porcentaje: 41.2,
        margin: 850,
        source: "gubernatura_seccional",
        electionType: "gubernatura",
        topParties: [],
      },
    });

    assert.deepEqual(
      result.map((event) => [event.anio, event.electionType, event.source]),
      [
        [2024, "municipal", "oficial_municipal"],
        [2023, "gubernatura", "gubernatura_seccional"],
        [2021, "municipal", "oficial_municipal"],
      ]
    );
    expect(result).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/municipio-analytics.test.ts`

Expected: FAIL indicando que `@/lib/municipio-analytics` o `mergeMunicipioTimelineEvents` no existe.

- [ ] **Step 3: Write minimal implementation**

```ts
export type MunicipioTimelineEvent = {
  id: number;
  anio: number;
  winner: string;
  winnerSiglas: string;
  winnerColor: string;
  votos: number;
  porcentaje: number;
  margin: number;
  source: "oficial_municipal" | "legacy_municipal" | "gubernatura_seccional";
  electionType: "municipal" | "gubernatura";
  topParties: { siglas: string; votes: number; color: string }[];
};

export function mergeMunicipioTimelineEvents(input: {
  municipal: MunicipioTimelineEvent[];
  gubernatura2023?: MunicipioTimelineEvent | null;
}) {
  return [...input.municipal, ...(input.gubernatura2023 ? [input.gubernatura2023] : [])]
    .sort((a, b) => b.anio - a.anio);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/municipio-analytics.test.ts`

Expected: PASS con 1 test aprobado.

- [ ] **Step 5: Wire the analytics action**

Update `src/actions/analytics.ts` to:

```ts
import {
  mergeMunicipioTimelineEvents,
  type MunicipioTimelineEvent,
} from "@/lib/municipio-analytics";
```

Add DTO shape:

```ts
timeline: {
  id: number;
  anio: number;
  winner: string;
  winnerSiglas: string;
  winnerColor: string;
  votos: number;
  porcentaje: number;
  margin: number;
  source: "oficial_municipal" | "legacy_municipal" | "gubernatura_seccional";
  electionType: "municipal" | "gubernatura";
  topParties: {
    siglas: string;
    votes: number;
    color: string;
  }[];
}[];
```

Replace current return assembly with:

```ts
const municipalTimeline: MunicipioTimelineEvent[] = timeline.reverse().map((event) => ({
  ...event,
  electionType: "municipal",
}));

const gubernatura2023 = await buildMunicipioGubernaturaTimelineEvent(service, municipioId);

return {
  summary: { ... },
  sections,
  operations,
  timeline: mergeMunicipioTimelineEvents({
    municipal: municipalTimeline,
    gubernatura2023,
  }),
};
```

- [ ] **Step 6: Run focused verification**

Run: `npm.cmd run build`

Expected: build exitoso y sin errores de tipo sobre `timeline`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/municipio-analytics.test.ts src/lib/municipio-analytics.ts src/actions/analytics.ts
git commit -m "feat: enrich municipio timeline with 2023 election context"
```

### Task 2: Ajustar charts para consumir la serie enriquecida

**Files:**
- Modify: `src/components/analytics/MunicipalityCharts.tsx`
- Test: `src/lib/municipio-analytics.test.ts`

- [ ] **Step 1: Write the failing test**

Add:

```ts
it("preserves 2023 gubernatura as a chartable year label", () => {
  const result = mergeMunicipioTimelineEvents({
    municipal: [
      {
        id: 10,
        anio: 2024,
        winner: "PVEM_PT_MORENA",
        winnerSiglas: "PVEM_PT_MORENA",
        winnerColor: "#166534",
        votos: 13559,
        porcentaje: 43.51,
        margin: 5031,
        source: "oficial_municipal",
        electionType: "municipal",
        topParties: [],
      },
    ],
    gubernatura2023: {
      id: 99,
      anio: 2023,
      winner: "MORENA",
      winnerSiglas: "MORENA",
      winnerColor: "#7f1d1d",
      votos: 12000,
      porcentaje: 41.2,
      margin: 850,
      source: "gubernatura_seccional",
      electionType: "gubernatura",
      topParties: [],
    },
  });

  expect(result.map((event) => event.anio)).toEqual([2024, 2023]);
});
```

- [ ] **Step 2: Run test to verify it fails for the new chart contract if needed**

Run: `npx tsx --test src/lib/municipio-analytics.test.ts`

Expected: si falla, debe hacerlo por el orden o por el tipado actual; si ya pasa, continuar con la UI.

- [ ] **Step 3: Update chart data mapping**

In `src/components/analytics/MunicipalityCharts.tsx`, ensure the chart input type matches:

```ts
type TimelineDatum = {
  anio: number;
  winnerSiglas: string;
  margin: number;
  electionType: "municipal" | "gubernatura";
  source: "oficial_municipal" | "legacy_municipal" | "gubernatura_seccional";
  topParties: { siglas: string; votes: number; color: string }[];
};
```

Add year label helper:

```ts
function formatElectionLabel(event: TimelineDatum) {
  return event.electionType === "gubernatura"
    ? `${event.anio} Gub.`
    : `${event.anio}`;
}
```

Use it where X-axis labels are built so `2023` is visible and contextualized.

- [ ] **Step 4: Run verification**

Run: `npm.cmd run build`

Expected: charts compilan y `2023` se representa sin errores de tipo.

- [ ] **Step 5: Commit**

```bash
git add src/components/analytics/MunicipalityCharts.tsx src/lib/municipio-analytics.test.ts
git commit -m "feat: show 2023 election context in municipio charts"
```

### Task 3: Reordenar la página para subir la cronología compacta

**Files:**
- Modify: `src/app/(protected)/admin/historial/municipio/[id]/page.tsx`

- [ ] **Step 1: Write the failing test**

Because this route currently has no UI test harness, write a narrow structural test by extracting a pure helper first in the page file or companion helper file:

```ts
import { describe, it, expect } from "node:test";
import { getTimelineSpotlightEvents } from "@/lib/municipio-analytics";

describe("getTimelineSpotlightEvents", () => {
  it("returns chronological cards for the hero band before the chart section", () => {
    const events = getTimelineSpotlightEvents([
      { anio: 2024 } as never,
      { anio: 2023 } as never,
      { anio: 2021 } as never,
    ]);

    expect(events.map((event) => event.anio)).toEqual([2024, 2023, 2021]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/municipio-analytics.test.ts`

Expected: FAIL porque `getTimelineSpotlightEvents` no existe.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/municipio-analytics.ts` add:

```ts
export function getTimelineSpotlightEvents(events: MunicipioTimelineEvent[]) {
  return events.slice(0, 3);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/municipio-analytics.test.ts`

Expected: PASS.

- [ ] **Step 5: Update the page layout**

In `src/app/(protected)/admin/historial/municipio/[id]/page.tsx`:

- render a new compact chronology section directly after the KPI grid
- move the current detailed cards out of the bottom section
- keep the strategic panel paired with the charts below

Target structure:

```tsx
<KpiGrid />

<Card>
  <CardHeader>Registro Cronológico</CardHeader>
  <CardContent>
    <div className="grid gap-4 xl:grid-cols-3">
      {spotlightEvents.map(...)}
    </div>
  </CardContent>
</Card>

<div className="grid gap-8 lg:grid-cols-3">
  <div className="lg:col-span-2">
    <Charts />
  </div>
  <StrategicPanel />
</div>
```

Also tag `2023` cards:

```tsx
{event.electionType === "gubernatura" && (
  <Badge className="border-none bg-amber-50 text-amber-700">
    Gubernatura
  </Badge>
)}
```

- [ ] **Step 6: Run verification**

Run: `npm.cmd run build`

Expected: la página compila y la cronología queda por encima de las gráficas.

- [ ] **Step 7: Commit**

```bash
git add src/app/(protected)/admin/historial/municipio/[id]/page.tsx src/lib/municipio-analytics.ts src/lib/municipio-analytics.test.ts
git commit -m "feat: move municipio chronology ahead of charts"
```

### Task 4: Pulido visual y eliminación del bloque redundante inferior

**Files:**
- Modify: `src/app/(protected)/admin/historial/municipio/[id]/page.tsx`

- [ ] **Step 1: Write the failing test**

Add one more helper-level test:

```ts
import { buildEventTone } from "@/lib/municipio-analytics";

it("assigns a distinct tone to gubernatura events", () => {
  expect(
    buildEventTone({
      electionType: "gubernatura",
      source: "gubernatura_seccional",
    } as never)
  ).toEqual("amber");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --test src/lib/municipio-analytics.test.ts`

Expected: FAIL porque `buildEventTone` no existe.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/municipio-analytics.ts` add:

```ts
export function buildEventTone(event: Pick<MunicipioTimelineEvent, "electionType" | "source">) {
  if (event.electionType === "gubernatura") return "amber";
  if (event.source === "legacy_municipal") return "slate";
  return "emerald";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --test src/lib/municipio-analytics.test.ts`

Expected: PASS.

- [ ] **Step 5: Apply visual refinements**

In the page:

- compact KPI card spacing
- stronger chronology container
- remove the old standalone heading and duplicated lower chronology grid
- preserve the section selector and section panels below the charts

Suggested classes:

```tsx
className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-xl"
className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5"
```

- [ ] **Step 6: Run final verification**

Run: `npm.cmd run build`

Expected: build exitoso y vista lista para revisión visual.

- [ ] **Step 7: Commit**

```bash
git add src/app/(protected)/admin/historial/municipio/[id]/page.tsx src/lib/municipio-analytics.ts src/lib/municipio-analytics.test.ts
git commit -m "style: polish municipio intelligence layout"
```

## Self-Review

- Cobertura del spec:
  - cronología subida a la parte superior: Task 3
  - inclusión explícita de `2023`: Tasks 1 y 2
  - diferenciación visual de gubernatura: Tasks 3 y 4
  - conservación del panel seccional especializado: Task 3
- No hay placeholders pendientes.
- Los nombres `mergeMunicipioTimelineEvents`, `getTimelineSpotlightEvents` y `buildEventTone` se mantienen consistentes en todas las tareas.
