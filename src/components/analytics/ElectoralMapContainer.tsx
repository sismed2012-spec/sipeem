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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  Loader2,
  Calendar,
  Map as MapIcon,
  Info,
  Layers3,
  List,
} from "lucide-react";
import { getCoberturaByMunicipio } from "@/actions/estructura";
import { createClient } from "@/lib/supabase/client";

type MapFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  GeoJSON.GeoJsonProperties
>;
type OverlayDataMap = Record<string, MapFeatureCollection>;

interface CoberturaRealtimeRecord {
  seccion_id: number;
  compromisos: number;
  meta: number;
}

interface SelectedMunicipioContext {
  geoId: string | number | null;
  municipioId: number | null;
}

function encodeWhereValue(value: string | number) {
  if (typeof value === "number") return String(value);
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  return `'${trimmed.replace(/'/g, "''")}'`;
}

export function ElectoralMapContainer({
  isAnalytic,
  geoData,
}: {
  isAnalytic: boolean;
  geoData: MapFeatureCollection;
}) {
  const [analytics, setAnalytics] = useState<MapAnalyticsDTO[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>("latest");
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeOverlays, setActiveOverlays] = useState<Set<OverlayKey>>(new Set());
  const [overlayData, setOverlayData] = useState<OverlayDataMap>({});
  const [selectedMunicipio, setSelectedMunicipio] =
    useState<SelectedMunicipioContext | null>(null);
  const [coberturaMap, setCoberturaMap] = useState<Record<number, { compromisos: number; meta: number }>>({});
  const [legendOpen, setLegendOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);

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

  const seccionOverlayActive = activeOverlays.has("seccion");

  useEffect(() => {
    if (!activeOverlays.has("seccion")) return;

    const geoId = selectedMunicipio?.geoId ?? null;
    if (!geoId) {
      setOverlayData((current) => {
        if (!current.seccion) return current;
        const next = { ...current };
        delete next.seccion;
        return next;
      });
      return;
    }

    const encodedValue = encodeWhereValue(geoId);
    fetch(`/api/arcgis/seccion?returnGeometry=true&where=MUNICIPIO=${encodedValue}`)
      .then((r) => r.json())
      .then((data: MapFeatureCollection) =>
        setOverlayData((d) => ({ ...d, seccion: data }))
      )
      .catch(console.error);
  }, [selectedMunicipio, activeOverlays]);

  useEffect(() => {
    const id = selectedMunicipio?.municipioId ?? null;
    if (typeof id !== "number" || !seccionOverlayActive) {
      setCoberturaMap({});
      return;
    }

    const supabase = createClient();
    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    getCoberturaByMunicipio(id)
      .then((rows) => {
        if (!active) return;
        const cmap: Record<number, { compromisos: number; meta: number }> = {};
        const idMap: Record<number, number> = {};
        for (const r of rows) {
          cmap[r.seccion_numero] = { compromisos: r.compromisos, meta: r.meta };
          idMap[r.seccion_id] = r.seccion_numero;
        }
        setCoberturaMap(cmap);

        channel = supabase
          .channel(`compromisos-${id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "compromisos_seccion",
              filter: `municipio_id=eq.${id}`,
            },
            (payload) => {
              const rec = (payload.new ?? payload.old) as
                | Partial<CoberturaRealtimeRecord>
                | null;
              if (!rec?.seccion_id) return;
              const numero = idMap[rec.seccion_id];
              if (numero == null) return;
              if (payload.eventType === "DELETE") {
                setCoberturaMap((prev) => {
                  const n = { ...prev };
                  delete n[numero];
                  return n;
                });
              } else {
                if (rec.compromisos == null || rec.meta == null) return;
                const compromisos = rec.compromisos;
                const meta = rec.meta;
                setCoberturaMap((prev) => ({
                  ...prev,
                  [numero]: { compromisos, meta },
                }));
              }
            }
          )
          .subscribe();
      })
      .catch(() => {
        // snapshot failed — secciones will show gray, no crash
      });

    return () => {
      active = false;
      channel?.unsubscribe();
    };
  }, [selectedMunicipio, seccionOverlayActive]);

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
      if (key === "seccion" && !selectedMunicipio?.geoId) return;

      let url = `/api/arcgis/${key}?returnGeometry=true`;
      if (key === "seccion") {
        const selectedValue = selectedMunicipio?.geoId;
        if (selectedValue == null) return;
        url += `&where=MUNICIPIO=${encodeWhereValue(selectedValue)}`;
      }

      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as MapFeatureCollection;
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
    [activeOverlays, selectedMunicipio]
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
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden 2xl:flex-row">
      {isAnalytic && (
        <aside className="hidden w-full bg-white border-r border-slate-200 z-20 flex-col shadow-xl 2xl:flex 2xl:w-80">
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

      {isAnalytic && (
        <div className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm 2xl:hidden">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                  Cartografia territorial
                </div>
                <div className="mt-1 text-sm font-black tracking-tight text-slate-900">
                  Mapa analitico
                </div>
              </div>
              {dataLoading && <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Card className="border-none bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Municipios
                </div>
                <div className="mt-1 text-lg font-black tabular-nums text-slate-900">
                  {totalMunicipios}
                </div>
              </Card>
              <Card className="border-none bg-slate-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Con historial
                </div>
                <div className="mt-1 text-lg font-black tabular-nums text-slate-900">
                  {analytics.length}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-[1fr_auto_auto] gap-2">
              <Select
                value={selectedYear}
                onValueChange={(v) => setSelectedYear(v ?? "")}
              >
                <SelectTrigger className="h-11 bg-slate-50 border-slate-200 font-bold text-slate-800">
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

              <Button
                variant="outline"
                className="h-11 px-3"
                onClick={() => setLegendOpen(true)}
              >
                <List className="h-4 w-4" />
                Leyenda
              </Button>
              <Button
                variant="outline"
                className="h-11 px-3"
                onClick={() => setLayersOpen(true)}
              >
                <Layers3 className="h-4 w-4" />
                Capas
              </Button>
            </div>
          </div>
        </div>
      )}

      <main className="relative min-h-[68vh] flex-1 overflow-hidden bg-slate-100 shadow-inner 2xl:min-h-0">
        <EdomexInteractiveMap
          geoData={geoData}
          overlayData={overlayData}
          analytics={analytics}
          isAnalytic={isAnalytic}
          onMunicipioSelect={setSelectedMunicipio}
          onVerSecciones={handleVerSecciones}
          coberturaMap={coberturaMap}
        />

        {isAnalytic && (
            <MapLegend
            data={analytics}
            className="absolute left-4 top-4 z-20 hidden 2xl:block"
          />
        )}

        <LayerPanel
          activeOverlays={activeOverlays}
          onToggle={toggleOverlay}
          hasMunicipioSelected={selectedMunicipio?.geoId != null}
          coberturaMap={coberturaMap}
          className="absolute right-4 top-4 z-20 hidden 2xl:block"
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

      <Dialog open={legendOpen} onOpenChange={setLegendOpen}>
        <DialogContent className="top-auto bottom-4 left-4 right-4 w-auto max-w-none translate-x-0 translate-y-0 rounded-2xl p-0 sm:max-w-none 2xl:hidden">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Leyenda electoral</DialogTitle>
            <DialogDescription>
              Distribucion de fuerzas y consistencia visible en el mapa.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-4">
            <MapLegend data={analytics} className="max-w-none shadow-none ring-0" />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={layersOpen} onOpenChange={setLayersOpen}>
        <DialogContent className="top-auto bottom-4 left-4 right-4 w-auto max-w-none translate-x-0 translate-y-0 rounded-2xl p-0 sm:max-w-none 2xl:hidden">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle>Capas del mapa</DialogTitle>
            <DialogDescription>
              Activa limites territoriales y cobertura seccional sin tapar el mapa.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-4">
            <LayerPanel
              activeOverlays={activeOverlays}
              onToggle={toggleOverlay}
              hasMunicipioSelected={selectedMunicipio?.geoId != null}
              coberturaMap={coberturaMap}
              className="min-w-0 shadow-none ring-0"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
