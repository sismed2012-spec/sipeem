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
