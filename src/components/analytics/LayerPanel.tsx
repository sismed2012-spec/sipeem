"use client";

import { cn } from "@/lib/utils";

export type OverlayKey =
  | "distrito_federal"
  | "distrito_local"
  | "entidad"
  | "seccion";

interface OverlayLayer {
  key: OverlayKey;
  label: string;
  color: string;
  lazy?: boolean;
}

const OVERLAY_LAYERS: OverlayLayer[] = [
  { key: "distrito_federal", label: "Dto. Federal", color: "#f59e0b" },
  { key: "distrito_local", label: "Dto. Local", color: "#8b5cf6" },
  { key: "entidad", label: "Entidad", color: "#06b6d4" },
  { key: "seccion", label: "Sección", color: "#10b981", lazy: true },
];

interface Props {
  activeOverlays: Set<OverlayKey>;
  onToggle: (key: OverlayKey) => void;
  hasMunicipioSelected: boolean;
  coberturaMap?: Record<number, { compromisos: number; meta: number }>;
}

export function LayerPanel({
  activeOverlays,
  onToggle,
  hasMunicipioSelected,
  coberturaMap = {},
}: Props) {
  return (
    <div className="absolute top-4 right-4 z-20 bg-slate-900/95 backdrop-blur-sm rounded-xl p-3 shadow-2xl min-w-[140px] border border-slate-700/50">
      <div className="text-slate-400 text-[9px] uppercase tracking-[0.18em] font-bold mb-2.5">
        Capas
      </div>

      {/* Base — always on */}
      <div className="flex items-center gap-2 py-1.5 border-b border-slate-700/60 mb-1">
        <div className="w-2.5 h-2.5 rounded-sm bg-blue-500 shrink-0" />
        <span className="text-slate-200 text-[11px]">Municipio</span>
        <span className="text-slate-600 text-[9px] ml-auto">base</span>
      </div>

      {OVERLAY_LAYERS.map((layer) => {
        const active = activeOverlays.has(layer.key);
        const disabled = layer.lazy && !hasMunicipioSelected && !active;

        return (
          <button
            key={layer.key}
            onClick={() => !disabled && onToggle(layer.key)}
            title={disabled ? "Selecciona un municipio primero" : undefined}
            className={cn(
              "w-full flex items-center gap-2 py-1.5 border-b border-slate-700/30 last:border-0 text-left transition-opacity",
              disabled && "opacity-40 cursor-not-allowed"
            )}
          >
            <div
              className="w-2.5 h-2.5 rounded-sm border-2 shrink-0 transition-colors"
              style={{
                borderColor: layer.color,
                backgroundColor: active ? layer.color : "transparent",
              }}
            />
            <span
              className={cn(
                "text-[11px]",
                active ? "text-slate-100 font-semibold" : "text-slate-400"
              )}
            >
              {layer.label}
            </span>
            {layer.lazy && (
              <span className="text-slate-600 text-[9px] ml-auto">lazy</span>
            )}
          </button>
        );
      })}

      {activeOverlays.has("seccion") && (
        <div className="border-t border-slate-700 pt-2 mt-2">
          <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1.5">Cobertura</p>
          {[
            { color: "#10b981", label: "100% Completado" },
            { color: "#3b82f6", label: "67–99% Avanzado" },
            { color: "#f59e0b", label: "34–66% En progreso" },
            { color: "#ef4444", label: "0–33% Crítico" },
            { color: "#475569", label: "Sin meta" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5 py-0.5">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
              <span className="text-[10px] text-slate-400">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
