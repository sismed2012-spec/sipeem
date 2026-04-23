import { getMunicipioStrategicFile } from "@/actions/estrategia";
import { getActoresMunicipio } from "@/actions/actores";
import { getProyeccionMunicipios } from "@/actions/proyeccion";
import { StrategicForm } from "@/components/estrategia/StrategicForm";
import ActoresTabs from "@/components/actores/ActoresTabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { notFound } from "next/navigation";
import ExportarFichaBtn from "@/components/exportacion/ExportarFichaBtn";
import GenerarBriefingBtn from "@/components/actores/GenerarBriefingBtn";
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
  const municipioId = parseInt(id, 10);
  if (isNaN(municipioId)) return notFound();

  const [{ estrategia, electoral }, actores, proyecciones] = await Promise.all([
    getMunicipioStrategicFile(municipioId),
    getActoresMunicipio(municipioId),
    getProyeccionMunicipios().catch(() => []),
  ]);

  const proyeccion = proyecciones.find((p) => p.municipio_id === municipioId) ?? null;

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

        <div className="flex items-center gap-3">
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
          <GenerarBriefingBtn municipioId={municipioId} />
          <ExportarFichaBtn municipioId={municipioId} />
          <Link
            href={`/admin/estructura/${municipioId}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-[10px] font-black uppercase tracking-[0.15em] px-3 py-2 transition-colors"
          >
            <Users className="w-3 h-3" /> Estructura territorial
          </Link>
        </div>
      </div>

      {/* Tabs wrapper — estrategia content passed as children */}
      <ActoresTabs municipioId={municipioId} actores={actores} proyeccion={proyeccion}>
        {/* Tab: Estrategia */}
        <section className="space-y-4">
          <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
            <Activity className="w-3 h-3 text-indigo-500" /> Resumen de Inteligencia Electoral
          </h2>

          {electoral && summary ? (
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
