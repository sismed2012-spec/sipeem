// src/app/(protected)/admin/situacion/page.tsx
import { getSituacionGlobal } from "@/actions/situacion";
import { getProyeccionML } from "@/actions/proyeccion-ml";
import GlobalKPIs from "@/components/situacion/GlobalKPIs";
import SituacionTable from "@/components/situacion/SituacionTable";
import { Gauge } from "lucide-react";

export default async function SituacionPage() {
  const [data, mlData] = await Promise.all([
    getSituacionGlobal(),
    getProyeccionML().catch(() => []),
  ]);

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
        <SituacionTable municipios={data.municipios} mlData={mlData} />
      </section>
    </div>
  );
}
