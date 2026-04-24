"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getHistorialMapAnalytics,
  getAvailableHistorialYears,
  MapAnalyticsDTO,
} from "@/actions/analytics";
import { EdomexInteractiveMap } from "./EdomexInteractiveMap";
import { MapLegend } from "./MapLegend";
import { LayerPanel, type OverlayKey } from "./LayerPanel";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Loader2, Calendar, Map as MapIcon, Info } from "lucide-react";

// geoData pre-loaded in Server Component to avoid client-side round-trip
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

  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayKey>>(new Set());
  const [overlayData, setOverlayData] = useState<Record<string, any>>({});
  const [selectedGeoMunicipioId, setSelectedGeoMunicipioId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAnalytic) return;
    getAvailableHistorialYears()
      .then(setAvailableYears)
      .catch((err: Error) => setError(err.message));
  }, [isAnalytic]);

  useEffect(() => {
    if (!isAnalytic) return;
    setDataLoading(true);
    const year = selectedYear === "latest" ? undefined : parseInt(selectedYear);
    getHistorialMapAnalytics(year)
      .then(setAnalytics)
      .catch(console.error)
      .finally(() => setDataLoading(false));
  }, [selectedYear, isAnalytic]);

  // When municipio is selected and seccion overlay is on, reload secciones for it
  useEffect(() => {
    if (!activeOverlays.has("seccion") || !selectedGeoMunicipioId) return;
    fetch(`/api/arcgis/seccion?returnGeometry=true&where=CVE_MUN=${selectedGeoMunicipioId}`)
      .then((r) => r.json())
      .then((data) => setOverlayData((d) => ({ ...d, seccion: data })))
      .catch(console.error);
  }, [selectedGeoMunicipioId, activeOverlays]);

  const toggleOverlay = useCallback(
    async (key: OverlayKey) => {
      const isCurrentlyActive = activeOverlays.has(key);

      setActiveOverlays((prev) => {
        const next = new Set(prev);
        if (isCurrentlyActive) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });

      if (isCurrentlyActive) {
        setOverlayData((d) => {
          const copy = { ...d };
          delete copy[key];
          return copy;
        });
        return;
      }

      // seccion is lazy — only load if a municipio is selected
      if (key === "seccion" && !selectedGeoMunicipioId) return;

      let url = `/api/arcgis/${key}?returnGeometry=true`;
      if (key === "seccion") {
        url += `&where=CVE_MUN=${selectedGeoMunicipioId}`;
      }

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setOverlayData((d) => ({ ...d, [key]: data }));
      } catch (err) {
        console.error(`Error cargando overlay ${key}:`, err);
        setActiveOverlays((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [activeOverlays, selectedGeoMunicipioId]
  );

  const handleVerSecciones = useCallback(() => {
    if (!activeOverlays.has("seccion")) {
      toggleOverlay("seccion");
    }
  }, [activeOverlays, toggleOverlay]);

  if (error) {
    return (
      <div className="p-12 text-center">
        <div className="inline-flex p-4 rounded-full bg-red-50 text-red-500 mb-4 border border-red-100">
          <Info className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900 tracking-tight">
          Fallo de Capa Visual
        </h2>
        <p className="text-slate-500 mt-2 text-sm">{error}</p>
      </div>
    );
  }

  const totalMunicipios = geoData?.features?.length || 0;

  return (
    <div className="w-full h-full flex flex-col md:flex-row bg-slate-50 overflow-hidden">
      {isAnalytic && (
        <aside className="w-full md:w-80 bg-white border-r border-slate-200 z-20 flex flex-col shadow-xl">
          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <Calendar className="w-3 h-3 text-indigo-500" />
                Ciclo Electoral
              </label>
              <Select
                value={selectedYear}
                onValueChange={(v) => setSelectedYear(v ?? "")}
              >
                <SelectTrigger className="w-full h-12 bg-slate-50 border-slate-200 font-bold text-slate-800 transition-all hover:bg-slate-100 focus:ring-indigo-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-slate-200">
                  <SelectItem value="latest" className="font-bold">
                    Resultado Vigente
                  </SelectItem>
                  {availableYears.map((year) => (
                    <SelectItem key={year} value={year.toString()}>
                      Elecciones {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-4 pt-6 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  Resumen Visual
                </span>
                {dataLoading && (
                  <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Card className="bg-slate-50 border-none p-3 text-center transition-colors hover:bg-indigo-50 group">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1 group-hover:text-indigo-400">
                    Total Cartografía
                  </div>
                  <div className="text-xl font-black text-slate-900 group-hover:text-indigo-600 tabular-nums">
                    {totalMunicipios}
                  </div>
                </Card>
                <Card className="bg-slate-50 border-none p-3 text-center transition-colors hover:bg-indigo-50 group">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter mb-1 group-hover:text-indigo-400">
                    Con Historial
                  </div>
                  <div className="text-xl font-black text-slate-900 group-hover:text-indigo-600 tabular-nums">
                    {analytics.length}
                  </div>
                </Card>
              </div>
            </div>

            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100/50">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-white rounded-xl text-indigo-500 shadow-sm shrink-0">
                  <MapIcon className="w-4 h-4" />
                </div>
                <div>
                  <h5 className="text-[11px] font-black text-indigo-900 truncate">
                    Vínculo Territorial
                  </h5>
                  <p className="text-[10px] text-indigo-600/70 mt-1 leading-relaxed">
                    Haz clic en un municipio para desplegar el análisis detallado.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-auto p-6 border-t border-slate-100 bg-slate-50/50">
            <div className="text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">
              Cartografía SIPEEM v3.0
            </div>
          </div>
        </aside>
      )}

      <main className="flex-1 relative bg-slate-100 overflow-hidden shadow-inner">
        <EdomexInteractiveMap
          geoData={geoData}
          overlayData={overlayData}
          analytics={analytics}
          isAnalytic={isAnalytic}
          onMunicipioSelect={setSelectedGeoMunicipioId}
          onVerSecciones={handleVerSecciones}
        />

        {isAnalytic && <MapLegend data={analytics} />}

        <LayerPanel
          activeOverlays={activeOverlays}
          onToggle={toggleOverlay}
          hasMunicipioSelected={selectedGeoMunicipioId !== null}
        />

        {!isAnalytic && (
          <div className="absolute top-6 left-6 z-10 w-full max-w-sm pointer-events-none">
            <div className="bg-white/90 backdrop-blur-md p-4 rounded-2xl border shadow-sm ring-1 ring-slate-900/5">
              <h4 className="font-black text-slate-900 text-xs tracking-tight uppercase">
                Módulo Geográfico
              </h4>
              <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest font-bold">
                Estado de México
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
