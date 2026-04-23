"use client";

import { useEffect, useState } from "react";
import { getHistorialMapAnalytics, getAvailableHistorialYears, MapAnalyticsDTO } from "@/actions/analytics";
import { EdomexInteractiveMap } from "./EdomexInteractiveMap";
import { MapLegend } from "./MapLegend";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Loader2, Calendar, Map as MapIcon, Info } from "lucide-react";

// geoData se pre-carga en el Server Component padre para eliminar el fetch
// client-side y reducir el número de round-trips al renderizar el mapa.
export function ElectoralMapContainer({
  isAnalytic,
  geoData,
}: {
  isAnalytic: boolean;
  geoData: any;
}) {
  const [analytics, setAnalytics] = useState<MapAnalyticsDTO[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("latest");
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar años disponibles solo una vez
  useEffect(() => {
    if (!isAnalytic) return;
    getAvailableHistorialYears()
      .then(setAvailableYears)
      .catch((err) => setError(err.message));
  }, [isAnalytic]);

  // 2. Cargar Capa Analítica cada vez que cambie el año
  useEffect(() => {
    async function loadData() {
      if (!isAnalytic) return;
      setDataLoading(true);
      try {
        const year = selectedYear === "latest" ? undefined : parseInt(selectedYear);
        const data = await getHistorialMapAnalytics(year);
        setAnalytics(data);
      } catch (err) {
        console.error(err);
      } finally {
        setDataLoading(false);
      }
    }
    loadData();
  }, [selectedYear, isAnalytic]);

  if (error) {
    return (
      <div className="p-12 text-center">
        <div className="inline-flex p-4 rounded-full bg-red-50 text-red-500 mb-4 border border-red-100">
           <Info className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight">Fallo de Capa Visual</h2>
        <p className="text-slate-500 mt-2 text-sm">{error}</p>
      </div>
    );
  }

  const totalMunicipios = geoData?.features?.length || 0;

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-slate-50 overflow-hidden">
      {/* Sidebar de Filtros e Info (Solo Admin) */}
      {isAnalytic && (
        <aside className="w-full md:w-80 bg-white border-r border-slate-200 z-20 flex flex-col shadow-xl">
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Calendar className="w-3 h-3 text-indigo-500" />
                Ciclo Electoral
              </label>
              <Select value={selectedYear} onValueChange={(v) => setSelectedYear(v ?? "")}>
                <SelectTrigger className="w-full h-12 bg-slate-50 border-slate-200 font-bold text-slate-800 transition-all hover:bg-slate-100 focus:ring-indigo-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="latest" className="font-bold">Resultado Vigente</SelectItem>
                  {availableYears.map(year => (
                    <SelectItem key={year} value={year.toString()}>
                      Elecciones {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Resumen Visual</span>
                {dataLoading && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-slate-50 border-none p-3 text-center transition-colors hover:bg-indigo-50 group">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1 group-hover:text-indigo-400">Total Cartografía</div>
                  <div className="text-xl font-black text-slate-900 group-hover:text-indigo-600 tabular-nums">{totalMunicipios}</div>
                </Card>
                <Card className="bg-slate-50 border-none p-3 text-center transition-colors hover:bg-indigo-50 group">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1 group-hover:text-indigo-400">Con Historial</div>
                  <div className="text-xl font-black text-slate-900 group-hover:text-indigo-600 tabular-nums">{analytics.length}</div>
                </Card>
              </div>
            </div>
            
            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100/50">
               <div className="flex items-start gap-3">
                  <div className="p-2 bg-white rounded-xl text-indigo-500 shadow-sm shrink-0">
                    <MapIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <h5 className="text-[11px] font-black text-indigo-900 truncate">Vínculo Territorial</h5>
                    <p className="text-[10px] text-indigo-600/70 mt-1 leading-relaxed">
                      Haz clic en un municipio para desplegar el análisis detallado de competitividad.
                    </p>
                  </div>
               </div>
            </div>
          </div>

          <div className="mt-auto p-6 border-t border-slate-100 bg-slate-50/50">
             <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">Cartografía SIPEEM v2.0</div>
          </div>
        </aside>
      )}

      {/* Area del Mapa */}
      <main className="flex-1 relative bg-slate-100 overflow-hidden shadow-inner">
        <EdomexInteractiveMap 
          geoData={geoData} 
          analytics={analytics} 
          isAnalytic={isAnalytic} 
        />

        {isAnalytic && <MapLegend data={analytics} />}

        {/* Overlay informativo rol operador */}
        {!isAnalytic && (
          <div className="absolute top-6 left-6 z-10 w-full max-w-sm pointer-events-none">
             <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl border shadow-sm ring-1 ring-slate-900/5">
                <h4 className="font-black text-slate-900 text-xs tracking-tight uppercase">Módulo Geográfico</h4>
                <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">Estado de México</p>
             </div>
          </div>
        )}
      </main>
    </div>
  );
}
