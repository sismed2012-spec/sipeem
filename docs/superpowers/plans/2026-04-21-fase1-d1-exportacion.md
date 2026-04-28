# Exportación PDF / Excel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir exportar (1) la ficha estratégica completa de un municipio a PDF via print layout, y (2) el listado completo de municipios con su estrategia a Excel.

**Architecture:** PDF via ruta dedicada `/print/municipio/[id]` con CSS de impresión — el usuario abre la ruta y usa Ctrl+P / "Guardar como PDF". Excel via server action que usa `@e965/xlsx` (ya instalado) y devuelve base64 al cliente para descarga.

**Tech Stack:** @e965/xlsx (ya en package.json) · Next.js App Router · CSS print media queries

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- `@e965/xlsx` ya está en `node_modules` — importar como `import * as XLSX from "@e965/xlsx"`
- Ruta print vive FUERA de `(protected)` para simplificar el layout, pero igual valida sesión
- Leer `src/actions/estrategia.ts` y `src/actions/actores.ts` para entender los tipos disponibles

## File Map

| Archivo | Acción |
|---------|--------|
| `src/app/print/municipio/[id]/page.tsx` | Crear — layout de impresión para PDF |
| `src/app/print/layout.tsx` | Crear — layout mínimo (sin sidebar) para rutas print |
| `src/actions/exportacion.ts` | Crear — `exportMunicipiosExcel()` |
| `src/components/exportacion/ExportarFichaBtn.tsx` | Crear — botón PDF (client) |
| `src/components/exportacion/ExportarListaBtn.tsx` | Crear — botón Excel (client) |
| `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx` | Modificar — agregar botón PDF |
| `src/app/(protected)/admin/estrategia-municipal/page.tsx` | Modificar — agregar botón Excel |

---

### Task 1: Layout mínimo para rutas de impresión

**Files:**
- Create: `src/app/print/layout.tsx`

- [ ] **Step 1: Crear layout**

```tsx
// src/app/print/layout.tsx
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <style>{`
          @media print {
            @page { margin: 1.5cm; size: A4 portrait; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: system-ui, sans-serif; color: #1e293b; background: white; }
        `}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

### Task 2: Página de impresión de ficha municipal

**Files:**
- Create: `src/app/print/municipio/[id]/page.tsx`

- [ ] **Step 1: Crear la página**

```tsx
// src/app/print/municipio/[id]/page.tsx
import { getMunicipioStrategicFile } from "@/actions/estrategia";
import { getActoresMunicipio } from "@/actions/actores";
import { getUsuarioActual } from "@/actions/auth";
import { redirect, notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function PrintMunicipioPage({ params }: PageProps) {
  // Auth check
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const { id } = await params;
  const municipioId = parseInt(id, 10);
  if (isNaN(municipioId)) return notFound();

  const [{ estrategia, electoral }, actores] = await Promise.all([
    getMunicipioStrategicFile(municipioId),
    getActoresMunicipio(municipioId),
  ]);

  const nombre = electoral?.summary?.nombre ?? `Municipio ${municipioId}`;
  const fecha = new Date().toLocaleDateString("es-MX", { dateStyle: "long" });

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem" }}>
      {/* Header */}
      <div style={{ borderBottom: "3px solid #1e293b", paddingBottom: "1rem", marginBottom: "1.5rem" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 3 }}>
          SIPEEM · Ficha Estratégica Municipal
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 900, color: "#0f172a", margin: "0.25rem 0" }}>
          {nombre}
        </h1>
        <p style={{ fontSize: 11, color: "#94a3b8" }}>Generado el {fecha}</p>
      </div>

      {/* Estrategia */}
      {estrategia && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: "0.75rem" }}>
            Identidad Estratégica
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem", marginBottom: "1rem" }}>
            {[
              { label: "Prioridad", value: estrategia.prioridad },
              { label: "Riesgo", value: estrategia.riesgo },
              { label: "Oportunidad", value: estrategia.oportunidad },
              { label: "Estatus", value: estrategia.estatus },
            ].map((item) => (
              <div key={item.label} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.5rem" }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>{item.label}</p>
                <p style={{ fontSize: 14, fontWeight: 900, color: "#1e293b" }}>{item.value}</p>
              </div>
            ))}
          </div>
          {estrategia.notas_ejecutivas && (
            <div style={{ marginBottom: "0.75rem" }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Notas Ejecutivas</p>
              <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>{estrategia.notas_ejecutivas}</p>
            </div>
          )}
          {estrategia.notas_operativas && (
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", marginBottom: 4 }}>Notas Operativas</p>
              <p style={{ fontSize: 12, color: "#334155", lineHeight: 1.6 }}>{estrategia.notas_operativas}</p>
            </div>
          )}
        </section>
      )}

      {/* Termómetros */}
      {actores.termometros && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: "0.75rem" }}>
            Termómetros Políticos
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.5rem" }}>
            {(["term1","term2","term3","term4","term5"] as const).map((k, i) => (
              <div key={k} style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: "0.5rem", textAlign: "center" }}>
                <p style={{ fontSize: 9, fontWeight: 700, color: "#94a3b8" }}>T{i+1}</p>
                <p style={{ fontSize: 20, fontWeight: 900, color: "#1e293b" }}>{actores.termometros![k]}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Comité */}
      {actores.comite && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: "0.75rem" }}>
            Comité Municipal
          </h2>
          <p style={{ fontSize: 12, color: "#334155" }}>
            <strong>Presidente:</strong> {actores.comite.presidente} ·{" "}
            <strong>Secretario:</strong> {actores.comite.secretario} ·{" "}
            <strong>Inaugurado:</strong> {actores.comite.inaugurado ? "Sí" : "No"}
          </p>
        </section>
      )}

      {/* Planilla */}
      {actores.planilla.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: "0.75rem" }}>
            Planilla de Candidatos ({actores.planilla.length})
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Cargo</th>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Nombre</th>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Partido</th>
              </tr>
            </thead>
            <tbody>
              {actores.planilla.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "4px 8px", color: "#475569" }}>{p.cargo}</td>
                  <td style={{ padding: "4px 8px", fontWeight: 600, color: "#1e293b" }}>{p.nombre}</td>
                  <td style={{ padding: "4px 8px", color: "#475569" }}>{p.partido}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Aspirantes */}
      {actores.aspirantes.length > 0 && (
        <section style={{ marginBottom: "1.5rem" }}>
          <h2 style={{ fontSize: 11, fontWeight: 900, color: "#64748b", textTransform: "uppercase", letterSpacing: 2, marginBottom: "0.75rem" }}>
            Aspirantes Registrados ({actores.aspirantes.length})
          </h2>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Nombre</th>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Cargo aspirado</th>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Partido</th>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #e2e8f0" }}>Contacto</th>
              </tr>
            </thead>
            <tbody>
              {actores.aspirantes.map((a) => (
                <tr key={a.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "4px 8px", fontWeight: 600, color: "#1e293b" }}>{a.nombre}</td>
                  <td style={{ padding: "4px 8px", color: "#475569" }}>{a.cargo_aspirado}</td>
                  <td style={{ padding: "4px 8px", color: "#475569" }}>{a.partido}</td>
                  <td style={{ padding: "4px 8px", color: "#475569" }}>{a.telefono ?? a.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Footer */}
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: "0.75rem", marginTop: "2rem" }}>
        <p style={{ fontSize: 9, color: "#cbd5e1", textAlign: "center", fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
          SIPEEM v2.0 · Documento confidencial · Uso interno
        </p>
      </div>

      {/* Auto-print trigger */}
      <script dangerouslySetInnerHTML={{ __html: "window.onload = () => window.print();" }} />
    </div>
  );
}
```

---

### Task 3: Action de exportación a Excel

**Files:**
- Create: `src/actions/exportacion.ts`

- [ ] **Step 1: Crear action**

```typescript
// src/actions/exportacion.ts
"use server";

import * as XLSX from "@e965/xlsx";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";

export async function exportMunicipiosExcel(): Promise<string> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();

  const [mRes, eRes, tRes, aRes, pRes] = await Promise.all([
    svc.from("municipios").select("id, nombre, color, distrito, region").eq("estatus", "activo").order("nombre"),
    svc.from("estrategia_municipal").select("municipio_id, prioridad, riesgo, oportunidad, estatus, responsable"),
    svc.from("termometros").select("municipio_id, term1, term2, term3, term4, term5"),
    svc.from("aspirantes").select("municipio_id"),
    svc.from("planilla").select("municipio_id"),
  ]);

  const eMap = new Map((eRes.data ?? []).map((e) => [e.municipio_id, e]));
  const tMap = new Map((tRes.data ?? []).map((t) => [t.municipio_id, t]));
  const aspCount: Record<number, number> = {};
  for (const a of aRes.data ?? []) aspCount[a.municipio_id] = (aspCount[a.municipio_id] ?? 0) + 1;
  const planCount: Record<number, number> = {};
  for (const p of pRes.data ?? []) planCount[p.municipio_id] = (planCount[p.municipio_id] ?? 0) + 1;

  const rows = (mRes.data ?? []).map((m) => {
    const e = eMap.get(m.id);
    const t = tMap.get(m.id);
    return {
      "Municipio": m.nombre,
      "Distrito": m.distrito ?? "",
      "Región": m.region ?? "",
      "Prioridad": e?.prioridad ?? "Sin ficha",
      "Riesgo": e?.riesgo ?? "Sin ficha",
      "Oportunidad": e?.oportunidad ?? "",
      "Estatus": e?.estatus ?? "",
      "Responsable": e?.responsable ?? "",
      "T1": t?.term1 ?? "",
      "T2": t?.term2 ?? "",
      "T3": t?.term3 ?? "",
      "T4": t?.term4 ?? "",
      "T5": t?.term5 ?? "",
      "Promedio Termómetros": t ? ((t.term1+t.term2+t.term3+t.term4+t.term5)/5).toFixed(1) : "",
      "Aspirantes": aspCount[m.id] ?? 0,
      "Planilla": planCount[m.id] ?? 0,
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Municipios");

  // Return as base64 string for client download
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "base64" }) as string;
  return buf;
}
```

---

### Task 4: Botones de exportación (Client Components)

**Files:**
- Create: `src/components/exportacion/ExportarFichaBtn.tsx`
- Create: `src/components/exportacion/ExportarListaBtn.tsx`

- [ ] **Step 1: Botón PDF para ficha individual**

```tsx
// src/components/exportacion/ExportarFichaBtn.tsx
"use client";

import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

type Props = { municipioId: number };

export default function ExportarFichaBtn({ municipioId }: Props) {
  return (
    <Button
      variant="outline"
      size="sm"
      className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold gap-2"
      onClick={() => window.open(`/print/municipio/${municipioId}`, "_blank")}
    >
      <FileText className="w-3.5 h-3.5" />
      Exportar PDF
    </Button>
  );
}
```

- [ ] **Step 2: Botón Excel para lista de municipios**

```tsx
// src/components/exportacion/ExportarListaBtn.tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportMunicipiosExcel } from "@/actions/exportacion";
import { Download } from "lucide-react";
import { toast } from "sonner";

export default function ExportarListaBtn() {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const base64 = await exportMunicipiosExcel();
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sipeem-municipios-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Archivo descargado");
    } catch {
      toast.error("Error al exportar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={loading}
      className="rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold gap-2"
    >
      <Download className="w-3.5 h-3.5" />
      {loading ? "Exportando..." : "Exportar Excel"}
    </Button>
  );
}
```

---

### Task 5: Integrar botones en páginas existentes

**Files:**
- Modify: `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx`
- Modify: `src/app/(protected)/admin/estrategia-municipal/page.tsx` (o el componente de lista)

- [ ] **Step 1: Agregar `ExportarFichaBtn` en la página de ficha**

Leer `src/app/(protected)/admin/estrategia-municipal/[id]/page.tsx`.

En el header (bloque `<div className="flex flex-col md:flex-row ...`), dentro del `div` del lado derecho con los badges de prioridad/riesgo, agregar después de los badges:

```tsx
import ExportarFichaBtn from "@/components/exportacion/ExportarFichaBtn";

// En el JSX del header:
<ExportarFichaBtn municipioId={municipioId} />
```

- [ ] **Step 2: Agregar `ExportarListaBtn` en la página del listado estratégico**

Leer `src/app/(protected)/admin/estrategia-municipal/page.tsx`.

Buscar el header de la página y agregar el botón de Excel junto al título:

```tsx
import ExportarListaBtn from "@/components/exportacion/ExportarListaBtn";

// En el JSX del header:
<ExportarListaBtn />
```

- [ ] **Step 3: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```

Esperado: `✓ Compiled successfully`
