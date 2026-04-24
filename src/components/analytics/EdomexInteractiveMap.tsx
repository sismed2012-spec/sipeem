"use client";

import { useMemo, useState, useCallback } from "react";
import { MapAnalyticsDTO } from "@/actions/analytics";
import { MapTooltip } from "./MapTooltip";
import { MunicipioPopup, type ArcGISMunicipioProps } from "./MunicipioPopup";
import { SeccionPopup, type ArcGISSeccionProps } from "./SeccionPopup";
import { cn } from "@/lib/utils";

interface Props {
  geoData: any;
  overlayData: Record<string, any>;
  analytics: MapAnalyticsDTO[];
  isAnalytic: boolean;
  onMunicipioSelect?: (geoId: number | null) => void;
  onVerSecciones?: () => void;
  coberturaMap?: Record<number, { compromisos: number; meta: number }>;
}

// ── Cobertura color scale ─────────────────────────────────────────────────────
function coberturaColor(compromisos: number, meta: number): string {
  if (!meta) return "#475569";
  const pct = compromisos / meta;
  if (pct >= 1.0) return "#10b981";
  if (pct >= 0.67) return "#3b82f6";
  if (pct >= 0.34) return "#f59e0b";
  return "#ef4444";
}

// ── Field name mapping — update primary keys after inspecting live ArcGIS response ──
function arcgisPropsToMunicipio(
  p: Record<string, any>,
  electoralData: MapAnalyticsDTO | null
): ArcGISMunicipioProps {
  return {
    nombre: p.NOMGEO ?? p.NOM_MUN ?? p.NOMBRE ?? p.nombre ?? "Municipio",
    cvegeo: String(p.CVEGEO ?? p.CVE_MUN ?? p.municipio ?? ""),
    dto_federal: p.CVE_DTO_FED ?? p.DTO_FED ?? null,
    dto_local: p.CVE_DTO_LOC ?? p.DTO_LOC ?? null,
    lista_nominal: Number(p.NOM_LISTA ?? p.LISTA_NOM ?? 0) || null,
    num_secciones: Number(p.NUM_SECC ?? p.SECCIONES ?? 0) || null,
    properties: p,
  };
}

function arcgisPropsToSeccion(
  p: Record<string, any>,
  municipioId: number | null
): ArcGISSeccionProps {
  return {
    numero: p.SECCION ?? p.CVE_SECC ?? p.seccion ?? "?",
    municipio: p.NOMMUN ?? p.NOMGEO ?? p.municipio ?? null,
    dto_local: p.CVE_DTO_LOC ?? p.DTO_LOC ?? null,
    lista_nominal: Number(p.NOM_LISTA ?? p.LISTA_NOM ?? 0) || null,
    tipo: p.TIPO ?? p.tipo ?? null,
    municipioId,
  };
}

const OVERLAY_COLORS: Record<string, string> = {
  distrito_federal: "#f59e0b",
  distrito_local: "#8b5cf6",
  entidad: "#06b6d4",
  seccion: "#10b981",
};

export function EdomexInteractiveMap({
  geoData,
  overlayData,
  analytics,
  isAnalytic,
  onMunicipioSelect,
  onVerSecciones,
  coberturaMap = {},
}: Props) {
  const [hoveredMun, setHoveredMun] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [selectedMunicipio, setSelectedMunicipio] = useState<{
    arcgis: ArcGISMunicipioProps;
    electoralData: MapAnalyticsDTO | null;
    municipioId: number | null;
  } | null>(null);
  const [selectedSeccion, setSelectedSeccion] = useState<ArcGISSeccionProps | null>(null);

  const analyticsByGeoId = useMemo(() => {
    const map = new Map<number, MapAnalyticsDTO>();
    analytics.forEach((a) => {
      if (a.geo_municipio_id !== null) map.set(a.geo_municipio_id, a);
    });
    return map;
  }, [analytics]);

  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    geoData.features.forEach((f: any) => {
      const coords =
        f.geometry.type === "Polygon"
          ? [f.geometry.coordinates]
          : f.geometry.coordinates;
      coords.forEach((polygon: any) => {
        const ring = Array.isArray(polygon[0][0]) ? polygon[0] : polygon;
        ring.forEach((pt: any) => {
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
    (feature: any) => {
      const polygons =
        feature.geometry.type === "Polygon"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      return polygons
        .map((polygon: any) => {
          const ring = Array.isArray(polygon[0][0]) ? polygon[0] : polygon;
          return `M ${ring.map((pt: any) => project(pt[0], pt[1])).join(" L ")} Z`;
        })
        .join(" ");
    },
    [project]
  );

  const handleCloseMunicipio = useCallback(() => {
    setSelectedMunicipio(null);
    onMunicipioSelect?.(null);
  }, [onMunicipioSelect]);

  return (
    <div
      className="w-full h-full relative cursor-default select-none overflow-hidden bg-slate-50 flex items-center justify-center p-4 lg:p-12"
      onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
    >
      <div className="w-full h-full max-w-[1000px] max-h-[800px] relative">
        <svg
          viewBox="0 0 1000 850"
          className="w-full h-full drop-shadow-[0_25px_50px_rgba(0,0,0,0.15)]"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Base layer: municipios */}
          {geoData.features.map((feature: any, i: number) => {
            const geoId = feature.properties.municipio;
            const munNameRaw =
              feature.properties.NOMGEO ??
              feature.properties.NOM_MUN ??
              feature.properties.NOMBRE ??
              feature.properties.nombre ??
              "";
            const data = analyticsByGeoId.get(geoId);
            const fillColor =
              isAnalytic && data ? data.partido_color ?? "#f8fafc" : "#f1f5f9";
            const isHovered = hoveredMun?.geoId === geoId;

            return (
              <path
                key={`mun-${geoId ?? i}`}
                d={featureToPath(feature)}
                fill={fillColor}
                stroke={isHovered ? "#334155" : "#cbd5e1"}
                strokeWidth={isHovered ? "1.5" : "0.5"}
                className="transition-all duration-200 ease-out hover:brightness-95 cursor-pointer"
                onMouseEnter={() =>
                  setHoveredMun({ geoId, name: munNameRaw, data })
                }
                onMouseLeave={() => setHoveredMun(null)}
                onClick={() => {
                  const arcgis = arcgisPropsToMunicipio(
                    feature.properties,
                    data ?? null
                  );
                  setSelectedMunicipio({
                    arcgis,
                    electoralData: data ?? null,
                    municipioId: data?.municipio_id ?? null,
                  });
                  onMunicipioSelect?.(geoId);
                  setSelectedSeccion(null);
                }}
              />
            );
          })}

          {/* Overlay layers */}
          {Object.entries(overlayData).map(([overlayKey, fc]) => {
            if (!fc?.features?.length) return null;
            const color = OVERLAY_COLORS[overlayKey] ?? "#64748b";
            return (
              <g key={`overlay-${overlayKey}`}>
                {fc.features.map((feature: any, i: number) => {
                  if (overlayKey === "seccion") {
                    const p = feature.properties;
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
                          e.stopPropagation();
                          setSelectedSeccion(
                            arcgisPropsToSeccion(
                              feature.properties,
                              selectedMunicipio?.municipioId ?? null
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
        </svg>
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
