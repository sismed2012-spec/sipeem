"use client";

import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  LocateFixed,
  Minus,
  Plus,
} from "lucide-react";
import { MapAnalyticsDTO } from "@/actions/analytics";
import { MapTooltip } from "./MapTooltip";
import { MunicipioPopup, type ArcGISMunicipioProps } from "./MunicipioPopup";
import { SeccionPopup, type ArcGISSeccionProps } from "./SeccionPopup";
import { resolvePopupContext } from "./map-popup-resolvers";

type FeatureProperties = Record<string, string | number | null | undefined>;
type MapFeature = GeoJSON.Feature<GeoJSON.Geometry, GeoJSON.GeoJsonProperties>;
type MapFeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  GeoJSON.GeoJsonProperties
>;
type Point = [number, number];
type Ring = Point[];
type PolygonCoordinates = Ring[];
type MultiPolygonCoordinates = PolygonCoordinates[];

interface Props {
  geoData: MapFeatureCollection;
  overlayData: Record<string, MapFeatureCollection>;
  analytics: MapAnalyticsDTO[];
  isAnalytic: boolean;
  onMunicipioSelect?: (
    selection: { geoId: string | number | null; municipioId: number | null } | null
  ) => void;
  onVerSecciones?: () => void;
  coberturaMap?: Record<number, { compromisos: number; meta: number }>;
}

interface HoveredMunicipio {
  geoId: number | null;
  name: string;
  data?: MapAnalyticsDTO;
}

function firstString(
  ...values: Array<string | number | null | undefined>
): string | undefined {
  for (const value of values) {
    if (value == null || value === "") continue;
    return String(value);
  }

  return undefined;
}

function coberturaColor(compromisos: number, meta: number): string {
  if (!meta) return "#475569";
  const pct = compromisos / meta;
  if (pct >= 1.0) return "#10b981";
  if (pct >= 0.67) return "#3b82f6";
  if (pct >= 0.34) return "#f59e0b";
  return "#ef4444";
}

function arcgisPropsToMunicipio(p: FeatureProperties): ArcGISMunicipioProps {
  return {
    nombre: firstString(p.NOMBRE, p.NOMGEO, p.NOM_MUN, p.nombre) ?? "Municipio",
    cvegeo:
      firstString(
        p.ID,
        p.CVEGEO,
        p.CVE_MUN,
        p.MUNICIPIO,
        p.municipio_id,
        p.municipio
      ) ?? null,
    entidad: firstString(p.ENTIDAD, p.entidad) ?? null,
    municipio_clave: firstString(p.MUNICIPIO, p.CVE_MUN, p.municipio) ?? null,
    control: firstString(p.CONTROL, p.control) ?? null,
    properties: p,
  };
}

function arcgisPropsToSeccion(
  p: FeatureProperties,
  municipioId: number | null
): ArcGISSeccionProps {
  return {
    numero: p.SECCION ?? p.CVE_SECC ?? p.seccion ?? "?",
    municipio: firstString(p.NOMMUN, p.NOMGEO, p.NOMBRE, p.municipio) ?? null,
    municipioClave: firstString(p.MUNICIPIO, p.CVE_MUN, p.municipio) ?? null,
    dto_federal: p.DISTRITO_F ?? p.CVE_DTO_FED ?? p.DTO_FED ?? null,
    dto_local: p.DISTRITO_L ?? p.CVE_DTO_LOC ?? p.DTO_LOC ?? null,
    tipo: firstString(p.TIPO, p.tipo) ?? null,
    control: firstString(p.CONTROL, p.control) ?? null,
    municipioId,
  };
}

const OVERLAY_COLORS: Record<string, string> = {
  distrito_federal: "#f59e0b",
  distrito_local: "#8b5cf6",
  entidad: "#06b6d4",
  seccion: "#10b981",
};

const MAP_WIDTH = 1000;
const MAP_HEIGHT = 850;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.3;
const PAN_STEP = 80;
const DEFAULT_VIEW = { x: 0, y: 0, zoom: 1 };

function getFeatureRings(feature: MapFeature): Ring[] {
  if (feature.geometry.type === "Polygon") {
    const polygon = feature.geometry.coordinates as PolygonCoordinates;
    return polygon.length > 0 ? [polygon[0]] : [];
  }

  if (feature.geometry.type === "MultiPolygon") {
    const polygons = feature.geometry.coordinates as MultiPolygonCoordinates;
    return polygons.map((polygon) => polygon[0]).filter(Boolean);
  }

  return [];
}

export function EdomexInteractiveMap({
  geoData,
  overlayData,
  analytics,
  isAnalytic,
  onMunicipioSelect,
  onVerSecciones,
  coberturaMap = {},
}: Props) {
  const [hoveredMun, setHoveredMun] = useState<HoveredMunicipio | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selectedMunicipio, setSelectedMunicipio] = useState<{
    arcgis: ArcGISMunicipioProps;
    electoralData: MapAnalyticsDTO | null;
    municipioId: number | null;
    geoValue: string | number | null;
  } | null>(null);
  const [selectedSeccion, setSelectedSeccion] =
    useState<ArcGISSeccionProps | null>(null);
  const [mapTransform, setMapTransform] = useState(DEFAULT_VIEW);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{
    px: number;
    py: number;
    tx: number;
    ty: number;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const isDraggingRef = useRef(false);
  const transformRef = useRef(mapTransform);

  useEffect(() => {
    transformRef.current = mapTransform;
  }, [mapTransform]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const rect = el.getBoundingClientRect();
      const cx = (e.clientX - rect.left) * (MAP_WIDTH / rect.width);
      const cy = (e.clientY - rect.top) * (MAP_HEIGHT / rect.height);

      setMapTransform((t) => {
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, t.zoom * factor));
        const wx = (cx - t.x) / t.zoom;
        const wy = (cy - t.y) / t.zoom;
        return { zoom: newZoom, x: cx - wx * newZoom, y: cy - wy * newZoom };
      });
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const onSvgPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    if (e.target !== e.currentTarget) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    isDraggingRef.current = false;

    const rect = e.currentTarget.getBoundingClientRect();
    dragRef.current = {
      px: e.clientX,
      py: e.clientY,
      tx: transformRef.current.x,
      ty: transformRef.current.y,
      scaleX: MAP_WIDTH / rect.width,
      scaleY: MAP_HEIGHT / rect.height,
    };
  }, []);

  const onSvgPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;

    const dx = e.clientX - drag.px;
    const dy = e.clientY - drag.py;

    if (!isDraggingRef.current && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      isDraggingRef.current = true;
      if (svgRef.current) svgRef.current.style.cursor = "grabbing";
    }

    if (isDraggingRef.current) {
      setMapTransform((t) => ({
        ...t,
        x: drag.tx + dx * drag.scaleX,
        y: drag.ty + dy * drag.scaleY,
      }));
    }
  }, []);

  const onSvgPointerUp = useCallback(() => {
    dragRef.current = null;
    if (svgRef.current) svgRef.current.style.cursor = "grab";

    setTimeout(() => {
      isDraggingRef.current = false;
    }, 0);
  }, []);

  const zoomIn = useCallback(() => {
    setMapTransform((t) => ({
      ...t,
      zoom: Math.min(MAX_ZOOM, t.zoom * ZOOM_STEP),
    }));
  }, []);

  const zoomOut = useCallback(() => {
    setMapTransform((t) => ({
      ...t,
      zoom: Math.max(MIN_ZOOM, t.zoom / ZOOM_STEP),
    }));
  }, []);

  const resetView = useCallback(() => {
    setMapTransform(DEFAULT_VIEW);
  }, []);

  const panMap = useCallback((dx: number, dy: number) => {
    setMapTransform((t) => ({ ...t, x: t.x + dx, y: t.y + dy }));
  }, []);

  const analyticsByGeoId = useMemo(() => {
    const map = new Map<number, MapAnalyticsDTO>();
    analytics.forEach((a) => {
      if (a.geo_municipio_id !== null) map.set(a.geo_municipio_id, a);
    });
    return map;
  }, [analytics]);

  const analyticsByMunicipioId = useMemo(() => {
    const map = new Map<number, MapAnalyticsDTO>();
    analytics.forEach((a) => {
      map.set(a.municipio_id, a);
    });
    return map;
  }, [analytics]);

  const bounds = useMemo(() => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    geoData.features.forEach((feature) => {
      getFeatureRings(feature).forEach((ring) => {
        ring.forEach((pt: Point) => {
          if (pt[0] < minX) minX = pt[0];
          if (pt[0] > maxX) maxX = pt[0];
          if (pt[1] < minY) minY = pt[1];
          if (pt[1] > maxY) maxY = pt[1];
        });
      });
    });

    return { minX, minY, maxX, maxY };
  }, [geoData]);

  const scale = Math.min(
    900 / (bounds.maxX - bounds.minX),
    750 / (bounds.maxY - bounds.minY)
  );

  const project = useCallback(
    (lon: number, lat: number) => {
      const x = (lon - bounds.minX) * scale + 50;
      const y = 800 - ((lat - bounds.minY) * scale + 50);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    },
    [bounds, scale]
  );

  const featureToPath = useCallback(
    (feature: MapFeature) => {
      return getFeatureRings(feature)
        .map((ring) => {
          return `M ${ring.map((pt) => project(pt[0], pt[1])).join(" L ")} Z`;
        })
        .join(" ");
    },
    [project]
  );

  function handleCloseMunicipio() {
    setSelectedMunicipio(null);
    setSelectedSeccion(null);
    onMunicipioSelect?.(null);
  }

  return (
    <div
      className="relative flex h-full w-full select-none items-center justify-center overflow-hidden bg-slate-50 p-1 cursor-default lg:p-3"
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      <div className="relative h-full min-h-[58vh] w-full sm:min-h-[68vh] 2xl:min-h-[640px]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          className="h-full w-full cursor-grab drop-shadow-[0_25px_50px_rgba(0,0,0,0.15)] 2xl:touch-none"
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={onSvgPointerDown}
          onPointerMove={onSvgPointerMove}
          onPointerUp={onSvgPointerUp}
          onPointerLeave={onSvgPointerUp}
          onPointerCancel={onSvgPointerUp}
        >
          <g
            transform={`translate(${mapTransform.x.toFixed(2)},${mapTransform.y.toFixed(2)}) scale(${mapTransform.zoom.toFixed(4)})`}
          >
            {geoData.features.map((feature, i) => {
              const p = (feature.properties ?? {}) as FeatureProperties;
              const rawId =
                p.CVE_MUN ??
                p.CVEGEO ??
                p.MUNICIPIO ??
                p.municipio_id ??
                p.municipio ??
                null;
              const popupContext = resolvePopupContext(
                p,
                analyticsByGeoId,
                analyticsByMunicipioId
              );
              const geoId: number | null = popupContext.analytics?.geo_municipio_id ??
                (rawId != null ? Number(rawId) || null : null);
              const munNameRaw =
                firstString(p.NOMGEO, p.NOM_MUN, p.NOMBRE, p.nombre) ?? "";
              const data = popupContext.analytics ?? undefined;
              const fillColor =
                isAnalytic && data ? data.partido_color ?? "#f1f5f9" : "#f1f5f9";
              const isHovered = hoveredMun?.geoId === geoId;
              const consistencyStroke =
                data?.consistency_status === "inconsistente"
                  ? "#dc2626"
                  : data?.consistency_status === "casi_consistente"
                  ? "#f59e0b"
                  : "#cbd5e1";
              const baseStroke = isHovered ? "#334155" : consistencyStroke;
              const baseStrokeWidth =
                data?.consistency_status === "inconsistente"
                  ? "1.6"
                  : data?.consistency_status === "casi_consistente"
                  ? "1.1"
                  : "0.5";

              return (
                <path
                  key={`mun-${geoId ?? i}`}
                  d={featureToPath(feature)}
                  fill={fillColor}
                  stroke={baseStroke}
                  strokeWidth={isHovered ? "1.8" : baseStrokeWidth}
                  strokeDasharray={
                    data?.consistency_status === "inconsistente" ? "3 2" : undefined
                  }
                  className="cursor-pointer transition-colors duration-200 ease-out hover:brightness-95"
                  onMouseEnter={() => {
                    if (!isDraggingRef.current) {
                      setHoveredMun({ geoId, name: munNameRaw, data });
                    }
                  }}
                  onMouseLeave={() => setHoveredMun(null)}
                  onClick={() => {
                    if (isDraggingRef.current) return;

                    setSelectedMunicipio({
                      arcgis: arcgisPropsToMunicipio(p),
                      electoralData: data ?? null,
                      municipioId: popupContext.municipioId,
                      geoValue: rawId,
                    });
                    onMunicipioSelect?.({
                      geoId: rawId,
                      municipioId: popupContext.municipioId,
                    });
                    setSelectedSeccion(null);
                  }}
                />
              );
            })}

            {Object.entries(overlayData).map(([overlayKey, fc]) => {
              if (!fc?.features?.length) return null;
              const color = OVERLAY_COLORS[overlayKey] ?? "#64748b";

              return (
                <g key={`overlay-${overlayKey}`}>
                  {fc.features.map((feature, i) => {
                    if (overlayKey === "seccion") {
                      const p = (feature.properties ?? {}) as FeatureProperties;
                      const seccionNumero = Number(
                        p.SECCION ?? p.CVE_SECC ?? p.seccion ?? 0
                      );
                      const cobertura = coberturaMap[seccionNumero];
                      const sectionColor = cobertura
                        ? coberturaColor(cobertura.compromisos, cobertura.meta)
                        : "#475569";

                      return (
                        <path
                          key={`sec-${i}`}
                          d={featureToPath(feature)}
                          fill={`${sectionColor}55`}
                          stroke={sectionColor}
                          strokeWidth="0.4"
                          className="cursor-pointer hover:brightness-90"
                          onClick={(e) => {
                            if (isDraggingRef.current) return;

                            e.stopPropagation();
                            const popupContext = resolvePopupContext(
                              p,
                              analyticsByGeoId,
                              analyticsByMunicipioId,
                              selectedMunicipio?.municipioId ?? null
                            );
                            setSelectedSeccion(
                              arcgisPropsToSeccion(
                                p,
                                popupContext.municipioId
                              )
                            );
                          }}
                        />
                      );
                    }

                    return (
                      <path
                        key={`ov-${i}`}
                        d={featureToPath(feature)}
                        fill="none"
                        stroke={color}
                        strokeWidth="0.7"
                        strokeDasharray="3 2"
                        className="pointer-events-none"
                      />
                    );
                  })}
                </g>
              );
            })}
          </g>
        </svg>

        <div className="absolute bottom-4 right-4 z-10 hidden rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2 text-[10px] font-medium text-slate-600 shadow-lg backdrop-blur-sm 2xl:block">
          Usa rueda y controles
        </div>

        <div className="absolute bottom-4 left-4 z-10 hidden flex-col gap-2 2xl:flex">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/90 p-1 shadow-lg backdrop-blur-sm">
            <button
              onClick={zoomIn}
              title="Acercar"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-slate-700"
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={zoomOut}
              title="Alejar"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-slate-700"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={resetView}
              title="Restablecer vista"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-slate-700"
            >
              <LocateFixed className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-xl border border-slate-700/50 bg-slate-800/90 p-1 shadow-lg backdrop-blur-sm">
            <div className="grid grid-cols-3 gap-1">
              <div />
              <button
                onClick={() => panMap(0, PAN_STEP)}
                title="Mover arriba"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-slate-700"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
              <div />
              <button
                onClick={() => panMap(PAN_STEP, 0)}
                title="Mover izquierda"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-slate-700"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <button
                onClick={resetView}
                title="Centrar"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-slate-700"
              >
                <LocateFixed className="h-4 w-4" />
              </button>
              <button
                onClick={() => panMap(-PAN_STEP, 0)}
                title="Mover derecha"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-slate-700"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
              <div />
              <button
                onClick={() => panMap(0, -PAN_STEP)}
                title="Mover abajo"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-white transition hover:bg-slate-700"
              >
                <ArrowDown className="h-4 w-4" />
              </button>
            </div>
          </div>

        </div>

        <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-2xl border border-slate-700/40 bg-slate-900/90 p-1.5 shadow-lg backdrop-blur-sm 2xl:hidden">
          <button
            onClick={zoomOut}
            title="Alejar"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:bg-slate-700"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            onClick={resetView}
            title="Centrar"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:bg-slate-700"
          >
            <LocateFixed className="h-4 w-4" />
          </button>
          <button
            onClick={zoomIn}
            title="Acercar"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-white transition hover:bg-slate-700"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {hoveredMun && !selectedMunicipio && (
        <MapTooltip
          pos={mousePos}
          municipio={{ nombre: hoveredMun.name, data: hoveredMun.data }}
          isAnalytic={isAnalytic}
        />
      )}

      {selectedMunicipio && (
        <MunicipioPopup
          arcgis={selectedMunicipio.arcgis}
          electoralData={selectedMunicipio.electoralData}
          municipioId={selectedMunicipio.municipioId}
          onClose={handleCloseMunicipio}
          onVerSecciones={() => onVerSecciones?.()}
        />
      )}

      {selectedSeccion && (
        <SeccionPopup
          seccion={selectedSeccion}
          onClose={() => setSelectedSeccion(null)}
        />
      )}
    </div>
  );
}
