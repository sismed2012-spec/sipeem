"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getHistorialMapAnalytics,
  getAvailableHistorialYears,
  MapAnalyticsDTO,
} from "@/actions/analytics";
import { EdomexInteractiveMap } from "./EdomexInteractiveMap";
import { CartografiaVersionSelector } from "./CartografiaVersionSelector";
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
import {
  buildVersionedSectionsUrl,
  clearSectionOverlay,
  normalizeMunicipioClave,
  selectInitialCartografiaVersion,
} from "@/lib/cartografia-map";
import type { CartografiaVersion } from "@/lib/cartografia-versionada";
import {
  buildTerritorialIndicatorsUrl,
  createTerritorialIndicatorsRequestCoordinator,
} from "@/lib/territorial-indicators-client";
import {
  buildQuantileScale,
  buildTerritorialIndicatorIndex,
  type TerritorialThemePresentation,
} from "@/lib/territorial-indicators-map";
import type {
  TerritorialIndicatorsResponse,
  TerritorialLevel,
  TerritorialMetricKey,
} from "@/lib/territorial-indicators-types";
import { TerritorialIndicatorLegend } from "./TerritorialIndicatorLegend";
import {
  TerritorialIndicatorPanel,
  type TerritorialMapMode,
} from "./TerritorialIndicatorPanel";

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
  const [cartografiaVersions, setCartografiaVersions] = useState<
    CartografiaVersion[]
  >([]);
  const [selectedCartografiaVersionId, setSelectedCartografiaVersionId] =
    useState<number | null>(null);
  const [cartografiaLoading, setCartografiaLoading] = useState(true);
  const [cartografiaError, setCartografiaError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [cartografiaRefreshKey, setCartografiaRefreshKey] = useState(0);
  const [sectionRefreshKey, setSectionRefreshKey] = useState(0);
  const [coberturaMap, setCoberturaMap] = useState<Record<number, { compromisos: number; meta: number }>>({});
  const [legendOpen, setLegendOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [territorialMode, setTerritorialMode] =
    useState<TerritorialMapMode>("POLITICAL");
  const [territorialLevel, setTerritorialLevel] =
    useState<TerritorialLevel>("MUNICIPIO");
  const [territorialMetricKey, setTerritorialMetricKey] =
    useState<TerritorialMetricKey>("poblacionTotal");
  const [territorialResponse, setTerritorialResponse] =
    useState<TerritorialIndicatorsResponse | null>(null);
  const [territorialLoading, setTerritorialLoading] = useState(false);
  const [thematicError, setThematicError] = useState<string | null>(null);
  const [territorialRetryKey, setTerritorialRetryKey] = useState(0);
  const overlayCacheRef = useRef<OverlayDataMap>({});
  const overlayRequestsRef = useRef<
    Partial<Record<OverlayKey, Promise<MapFeatureCollection>>>
  >({});
  const territorialCoordinatorRef = useRef<
    ReturnType<typeof createTerritorialIndicatorsRequestCoordinator> | null
  >(null);

  if (territorialCoordinatorRef.current === null) {
    territorialCoordinatorRef.current =
      createTerritorialIndicatorsRequestCoordinator(
        async (_key, signal, input) => {
          const response = await fetch(buildTerritorialIndicatorsUrl(input), {
            signal,
            headers: { Accept: "application/json" },
          });
          if (!response.ok) {
            throw new Error("No se pudieron cargar los indicadores territoriales");
          }
          return (await response.json()) as TerritorialIndicatorsResponse;
        },
        (value) => {
          setTerritorialResponse(value);
          if (value) {
            setTerritorialLoading(false);
            setThematicError(null);
          }
        },
        () => {
          setTerritorialResponse(null);
          setTerritorialLoading(false);
          setThematicError("No se pudieron cargar los indicadores territoriales");
        }
      );
  }

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

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/cartografia/versiones", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalogo no disponible");
        const payload = (await response.json()) as unknown;
        if (!Array.isArray(payload)) throw new Error("catalogo invalido");
        return payload as CartografiaVersion[];
      })
      .then((versions) => {
        const initialVersion = selectInitialCartografiaVersion(versions);
        setCartografiaVersions(versions);
        setSelectedCartografiaVersionId((current) =>
          current != null && versions.some((version) => version.id === current)
            ? current
            : initialVersion?.id ?? null
        );
        setCartografiaError(
          initialVersion ? null : "No hay versiones cartográficas disponibles"
        );
      })
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setCartografiaError("No se pudo cargar el catálogo cartográfico");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCartografiaLoading(false);
      });

    return () => controller.abort();
  }, [cartografiaRefreshKey]);

  const seccionOverlayActive = activeOverlays.has("seccion");

  useEffect(() => {
    if (!seccionOverlayActive) return;

    setOverlayData((current) => clearSectionOverlay(current));
    setSectionError(null);

    const municipio = normalizeMunicipioClave(selectedMunicipio?.geoId);
    if (!municipio || selectedCartografiaVersionId == null) return;

    const controller = new AbortController();
    const url = buildVersionedSectionsUrl({
      versionId: selectedCartografiaVersionId,
      municipio,
    });

    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("secciones no disponibles");
        return (await response.json()) as MapFeatureCollection;
      })
      .then((data) =>
        setOverlayData((current) => ({ ...current, seccion: data }))
      )
      .catch((fetchError: unknown) => {
        if (fetchError instanceof DOMException && fetchError.name === "AbortError") {
          return;
        }
        setSectionError("No se pudieron cargar las secciones de esta versión");
      });

    return () => controller.abort();
  }, [
    selectedMunicipio?.geoId,
    selectedCartografiaVersionId,
    seccionOverlayActive,
    sectionRefreshKey,
  ]);

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

  const ensureOverlay = useCallback(async (key: OverlayKey) => {
    if (key === "seccion") return;

    setActiveOverlays((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      return next;
    });

    const cached = overlayCacheRef.current[key];
    if (cached) {
      setOverlayData((current) => ({ ...current, [key]: cached }));
      return;
    }

    let request = overlayRequestsRef.current[key];
    if (!request) {
      request = fetch(`/api/arcgis/${key}?returnGeometry=true`).then(
        async (response) => {
          if (!response.ok) throw new Error(await response.text());
          return (await response.json()) as MapFeatureCollection;
        }
      );
      overlayRequestsRef.current[key] = request;
    }

    try {
      const data = await request;
      overlayCacheRef.current[key] = data;
      setOverlayData((current) => ({ ...current, [key]: data }));
    } catch (overlayError) {
      console.error(`Error cargando overlay ${key}:`, overlayError);
      setActiveOverlays((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
      throw overlayError;
    } finally {
      delete overlayRequestsRef.current[key];
    }
  }, []);

  const toggleOverlay = useCallback(
    async (key: OverlayKey) => {
      const isCurrentlyActive = activeOverlays.has(key);

      if (isCurrentlyActive) {
        setActiveOverlays((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        setOverlayData((d) => {
          const copy = { ...d };
          delete copy[key];
          return copy;
        });
        return;
      }

      // seccion is lazy — only load if a municipio is selected
      if (key === "seccion" && !selectedMunicipio?.geoId) return;

      // La capa seccional versionada se carga en el efecto que también cancela
      // solicitudes obsoletas cuando cambia municipio o versión.
      if (key === "seccion") {
        setActiveOverlays((current) => new Set(current).add(key));
        return;
      }

      await ensureOverlay(key).catch(() => undefined);
    },
    [activeOverlays, ensureOverlay, selectedMunicipio]
  );

  const handleVerSecciones = useCallback(() => {
    if (!activeOverlays.has("seccion")) {
      toggleOverlay("seccion");
    }
  }, [activeOverlays, toggleOverlay]);

  const handleCartografiaVersionChange = useCallback((versionId: number) => {
    territorialCoordinatorRef.current?.clear();
    setTerritorialResponse(null);
    setThematicError(null);
    setSelectedCartografiaVersionId(versionId);
    setOverlayData((current) => clearSectionOverlay(current));
    setSectionError(null);
  }, []);

  const handleCartografiaRetry = useCallback(() => {
    if (cartografiaError) {
      setCartografiaLoading(true);
      setCartografiaError(null);
      setCartografiaRefreshKey((current) => current + 1);
      return;
    }

    setSectionError(null);
    setSectionRefreshKey((current) => current + 1);
  }, [cartografiaError]);

  const handleTerritorialModeChange = useCallback(
    (mode: TerritorialMapMode) => {
      territorialCoordinatorRef.current?.clear();
      setTerritorialResponse(null);
      setThematicError(null);
      setTerritorialMode(mode);
    },
    []
  );

  const handleTerritorialLevelChange = useCallback((level: TerritorialLevel) => {
    territorialCoordinatorRef.current?.clear();
    setTerritorialResponse(null);
    setThematicError(null);
    setTerritorialLevel(level);
  }, []);

  const handleTerritorialRetry = useCallback(() => {
    setTerritorialResponse(null);
    setThematicError(null);
    setTerritorialRetryKey((current) => current + 1);
  }, []);

  useEffect(() => {
    if (territorialMode !== "INDICATOR" || selectedCartografiaVersionId == null) {
      territorialCoordinatorRef.current?.clear();
      setTerritorialResponse(null);
      setTerritorialLoading(false);
      setThematicError(null);
      return;
    }

    let current = true;
    setTerritorialResponse(null);
    setTerritorialLoading(true);
    setThematicError(null);

    const load = async () => {
      try {
        if (territorialLevel === "DISTRITO_LOCAL") {
          await ensureOverlay("distrito_local");
        } else if (territorialLevel === "DISTRITO_FEDERAL") {
          await ensureOverlay("distrito_federal");
        }
        if (!current) return;
        await territorialCoordinatorRef.current?.select({
          level: territorialLevel,
          versionId: selectedCartografiaVersionId,
          nominalCutId: null,
          demographySourceId: null,
        });
      } catch {
        if (!current) return;
        territorialCoordinatorRef.current?.clear();
        setTerritorialResponse(null);
        setTerritorialLoading(false);
        setThematicError("No se pudo preparar la capa territorial");
      }
    };

    void load();
    return () => {
      current = false;
      territorialCoordinatorRef.current?.clear();
    };
  }, [
    ensureOverlay,
    selectedCartografiaVersionId,
    territorialLevel,
    territorialMode,
    territorialRetryKey,
  ]);

  const thematicPresentation = useMemo<TerritorialThemePresentation | null>(() => {
    if (
      territorialMode !== "INDICATOR" ||
      thematicError || !territorialResponse ||
      territorialResponse.rows.length === 0
    ) {
      return null;
    }
    return {
      level: territorialLevel,
      metricKey: territorialMetricKey,
      index: buildTerritorialIndicatorIndex(territorialResponse.rows),
      scale: buildQuantileScale(
        territorialResponse.rows.map(
          (row) => row.metrics[territorialMetricKey]
        )
      ),
    };
  }, [
    thematicError,
    territorialLevel,
    territorialMetricKey,
    territorialMode,
    territorialResponse,
  ]);

  const indicatorControls = (
    <TerritorialIndicatorPanel
      mode={territorialMode}
      level={territorialLevel}
      metricKey={territorialMetricKey}
      versionId={selectedCartografiaVersionId}
      nominalSource={territorialResponse?.nominalSource ?? null}
      demographicSource={territorialResponse?.demographicSource ?? null}
      loading={territorialLoading}
      error={thematicError}
      onModeChange={handleTerritorialModeChange}
      onLevelChange={handleTerritorialLevelChange}
      onMetricChange={setTerritorialMetricKey}
      onRetry={handleTerritorialRetry}
    />
  );

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

      <div className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm 2xl:hidden">
        <div className="flex flex-col gap-4">
          {isAnalytic && (
            <>
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
            </>
          )}

          <CartografiaVersionSelector
            versions={cartografiaVersions}
            selectedVersionId={selectedCartografiaVersionId}
            loading={cartografiaLoading}
            error={cartografiaError ?? sectionError}
            onChange={handleCartografiaVersionChange}
            onRetry={handleCartografiaRetry}
            className="shadow-none"
          />

          <div
            className={
              isAnalytic
                ? "grid grid-cols-[1fr_auto_auto] gap-2"
                : "flex justify-end"
            }
          >
            {isAnalytic && (
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
            )}

            {isAnalytic && (
              <Button
                variant="outline"
                className="h-11 px-3"
                onClick={() => setLegendOpen(true)}
              >
                <List className="h-4 w-4" />
                Leyenda
              </Button>
            )}
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

      <main className="relative min-h-[68vh] flex-1 overflow-hidden bg-slate-100 shadow-inner 2xl:min-h-0">
        <EdomexInteractiveMap
          geoData={geoData}
          overlayData={overlayData}
          analytics={analytics}
          isAnalytic={isAnalytic}
          onMunicipioSelect={setSelectedMunicipio}
          onVerSecciones={handleVerSecciones}
          coberturaMap={coberturaMap}
          cartografiaVersionId={selectedCartografiaVersionId}
          territorialTheme={thematicPresentation}
        />

        {isAnalytic && (
          thematicPresentation ? (
            <div className="absolute left-4 top-4 z-20 hidden 2xl:block">
              <TerritorialIndicatorLegend
                metricKey={territorialMetricKey}
                scale={thematicPresentation.scale}
              />
            </div>
          ) : (
            <MapLegend
              data={analytics}
              className="absolute left-4 top-4 z-20 hidden 2xl:block"
            />
          )
        )}

        <div className="absolute right-4 top-4 z-20 hidden w-72 flex-col gap-3 2xl:flex">
          <CartografiaVersionSelector
            versions={cartografiaVersions}
            selectedVersionId={selectedCartografiaVersionId}
            loading={cartografiaLoading}
            error={cartografiaError ?? sectionError}
            onChange={handleCartografiaVersionChange}
            onRetry={handleCartografiaRetry}
          />
          <LayerPanel
            activeOverlays={activeOverlays}
            onToggle={toggleOverlay}
            hasMunicipioSelected={selectedMunicipio?.geoId != null}
            sectionAvailable={selectedCartografiaVersionId != null}
            coberturaMap={coberturaMap}
            indicatorControls={indicatorControls}
          />
        </div>

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
            <DialogTitle>
              {thematicPresentation ? "Leyenda territorial" : "Leyenda electoral"}
            </DialogTitle>
            <DialogDescription>
              Distribucion de fuerzas y consistencia visible en el mapa.
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-4">
            {thematicPresentation ? (
              <TerritorialIndicatorLegend
                metricKey={territorialMetricKey}
                scale={thematicPresentation.scale}
              />
            ) : (
              <MapLegend data={analytics} className="max-w-none shadow-none ring-0" />
            )}
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
              sectionAvailable={selectedCartografiaVersionId != null}
              coberturaMap={coberturaMap}
              indicatorControls={indicatorControls}
              className="min-w-0 shadow-none ring-0"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
