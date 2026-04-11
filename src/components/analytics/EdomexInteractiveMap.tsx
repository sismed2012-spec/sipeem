"use client";

import { useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { MapAnalyticsDTO } from "@/actions/analytics";
import { MapTooltip } from "./MapTooltip";
import { cn } from "@/lib/utils";

interface Props {
  geoData: any;
  analytics: MapAnalyticsDTO[];
  isAnalytic: boolean;
}

export function EdomexInteractiveMap({ geoData, analytics, isAnalytic }: Props) {
  const router = useRouter();
  const [hoveredMun, setHoveredMun] = useState<any>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Mapeo de analítica utilizando el ID geográfico homologado (geo_municipio_id)
   * como fuente primaria de verdad para la vinculación con el mapa.
   */
  const analyticsByGeoId = useMemo(() => {
    const map = new Map<number, MapAnalyticsDTO>();
    analytics.forEach(a => {
      if (a.geo_municipio_id !== null) {
        map.set(a.geo_municipio_id, a);
      }
    });
    return map;
  }, [analytics]);

  /** 
   * Mapeo auxiliar por nombre para diagnóstico de municipios no homologados
   */
  const diagnosticsByName = useMemo(() => {
    const map = new Map<string, MapAnalyticsDTO>();
    analytics.forEach(a => {
      map.set(normalizeName(a.municipio_nombre), a);
    });
    return map;
  }, [analytics]);

  // Cálculo de límites para proyección
  const bounds = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    geoData.features.forEach((f: any) => {
      const coords = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
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

  const viewbox = `0 0 1000 850`;
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const scale = Math.min(900 / width, 750 / height);

  const project = (lon: number, lat: number) => {
    const x = (lon - bounds.minX) * scale + 50;
    const y = 800 - ((lat - bounds.minY) * scale + 50);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  return (
    <div 
      className="w-full h-full relative cursor-default select-none overflow-hidden bg-slate-50 flex items-center justify-center p-4 lg:p-12" 
      onMouseMove={handleMouseMove}
      ref={containerRef}
    >
      <div className="w-full h-full max-w-[1000px] max-h-[800px] relative">
        <svg 
          viewBox={viewbox} 
          className="w-full h-full drop-shadow-[0_25px_50px_rgba(0,0,0,0.15)] filter"
          preserveAspectRatio="xMidYMid meet"
        >
          {geoData.features.map((feature: any, i: number) => {
            // Vinculación mediante ID Geográfico Homologado
            const geoId = feature.properties.municipio;
            const munNameRaw = feature.properties.nombre;
            const munNameNorm = normalizeName(munNameRaw);
            
            // Lógica de Matching Arquitectónica
            const data = analyticsByGeoId.get(geoId);
            const isHomologated = !!data;
            
            // Diagnóstico (fallback solo visual para detectar discrepancias en consola si es necesario)
            const diagnosticData = !isHomologated ? diagnosticsByName.get(munNameNorm) : null;
            if (diagnosticData) {
              // Municipio existe en DB por nombre pero no tiene el geoId correcto
              // Esto ayuda al administrador a saber qué sincronizar
            }

            const fillColor = isAnalytic && isHomologated ? (data?.partido_color || "#f8fafc") : "#f1f5f9";
            const isHovered = hoveredMun?.geoId === geoId;

            const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates;

            return (
              <path
                key={`${feature.properties.id || geoId}-${i}`}
                d={polygons.map((polygon: any) => {
                  const ring = Array.isArray(polygon[0][0]) ? polygon[0] : polygon;
                  return `M ${ring.map((pt: any) => project(pt[0], pt[1])).join(" L ")} Z`;
                }).join(" ")}
                fill={fillColor}
                stroke={isHovered ? "#334155" : "#cbd5e1"}
                strokeWidth={isHovered ? "1.5" : "0.5"}
                className={cn(
                  "transition-all duration-300 ease-out",
                  isAnalytic && isHomologated && "hover:brightness-95 cursor-pointer",
                  !isHomologated && "opacity-80"
                )}
                onMouseEnter={() => setHoveredMun({ 
                  geoId,
                  name: munNameRaw,
                  data: data 
                })}
                onMouseLeave={() => setHoveredMun(null)}
                onClick={() => {
                  if (data) router.push(`/admin/historial/municipio/${data.municipio_id}`);
                }}
              />
            );
          })}
        </svg>
      </div>

      {hoveredMun && (
        <MapTooltip 
          pos={mousePos} 
          municipio={{ nombre: hoveredMun.name, data: hoveredMun.data }} 
          isAnalytic={isAnalytic}
        />
      )}
    </div>
  );
}

function normalizeName(name: string) {
  if (!name) return "";
  return name.toString().toUpperCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, "")
    .trim();
}
