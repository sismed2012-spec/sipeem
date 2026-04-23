"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { SituacionMunicipio } from "@/actions/situacion";
import type { ProyeccionMLMunicipio } from "@/actions/proyeccion-ml";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type Props = { municipios: SituacionMunicipio[]; mlData?: ProyeccionMLMunicipio[] };

const PRIORIDAD_COLORS: Record<string, string> = {
  Crítica: "bg-rose-100 text-rose-700 border-rose-200",
  Alta: "bg-orange-100 text-orange-700 border-orange-200",
  Media: "bg-amber-100 text-amber-700 border-amber-200",
  Baja: "bg-slate-100 text-slate-600 border-slate-200",
};

const RIESGO_COLORS: Record<string, string> = {
  Extremo: "bg-red-100 text-red-700 border-red-200",
  Alto: "bg-orange-100 text-orange-700 border-orange-200",
  Medio: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Bajo: "bg-green-100 text-green-600 border-green-200",
};

function TermBar({ value }: { value: number | null }) {
  if (value === null)
    return <span className="text-xs text-slate-300 italic">—</span>;
  const pct = Math.min(100, Math.max(0, (value / 100) * 100));
  const color =
    pct >= 70 ? "bg-emerald-400" : pct >= 40 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-600">{value.toFixed(0)}</span>
    </div>
  );
}

export default function SituacionTable({ municipios, mlData = [] }: Props) {
  const [search, setSearch] = useState("");
  const mlMap = useMemo(
    () => new Map(mlData.map((m) => [m.municipio_id, m])),
    [mlData]
  );

  const filtered = useMemo(
    () =>
      municipios.filter((m) =>
        m.nombre.toLowerCase().includes(search.toLowerCase())
      ),
    [municipios, search]
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar municipio..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl border-slate-200"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Municipio
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Prioridad
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Riesgo
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Estatus
              </th>
              <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Termóm. avg
              </th>
              <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Asp.
              </th>
              <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Planilla
              </th>
              <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Proyección
              </th>
              <th className="text-center px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                ML Score
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-slate-400 text-sm">
                  Sin resultados
                </td>
              </tr>
            )}
            {filtered.map((m) => (
              <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: m.color || "#94a3b8" }}
                    />
                    <span className="font-semibold text-slate-900">{m.nombre}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {m.prioridad ? (
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-black uppercase tracking-wide ${PRIORIDAD_COLORS[m.prioridad] ?? ""}`}
                    >
                      {m.prioridad}
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-300 italic">Sin ficha</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {m.riesgo ? (
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-black uppercase tracking-wide ${RIESGO_COLORS[m.riesgo] ?? ""}`}
                    >
                      {m.riesgo}
                    </Badge>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {m.estatus ?? <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <TermBar value={m.avgTermometro} />
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`text-xs font-bold ${
                      m.aspirantesCount > 0 ? "text-slate-900" : "text-slate-300"
                    }`}
                  >
                    {m.aspirantesCount}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span
                    className={`text-xs font-bold ${
                      m.planillaCount > 0 ? "text-slate-900" : "text-slate-300"
                    }`}
                  >
                    {m.planillaCount}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  {m.proyeccion !== null ? (
                    <div className="flex items-center justify-center gap-1.5">
                      <span className={`text-xs font-black ${
                        m.proyeccionNivel === "muy_alto" ? "text-emerald-600"
                        : m.proyeccionNivel === "alto" ? "text-blue-600"
                        : m.proyeccionNivel === "medio" ? "text-amber-600"
                        : "text-rose-600"
                      }`}>{m.proyeccion}%</span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {(() => {
                    const ml = mlMap.get(m.id);
                    if (!ml) return <span className="text-xs text-slate-300">—</span>;
                    const confColor =
                      ml.confianza === "alta"
                        ? "text-emerald-600"
                        : ml.confianza === "media"
                        ? "text-amber-600"
                        : "text-slate-400";
                    return (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs font-black text-slate-900">{ml.score_combinado}%</span>
                        <span className={`text-[9px] font-bold uppercase ${confColor}`}>{ml.confianza}</span>
                      </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/estrategia-municipal/${m.id}`}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 hover:underline"
                  >
                    Ver ficha →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-slate-400 text-right">
        {filtered.length} municipio{filtered.length !== 1 ? "s" : ""} · ordenados por urgencia
      </p>
    </div>
  );
}
