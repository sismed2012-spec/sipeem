"use client";

import type { ChangeEvent } from "react";

import {
  TERRITORIAL_METRICS,
  type TerritorialIndicatorsResponse,
  type TerritorialLevel,
  type TerritorialMetricKey,
} from "@/lib/territorial-indicators-types";

export type TerritorialMapMode = "POLITICAL" | "INDICATOR";

interface Props {
  mode: TerritorialMapMode;
  level: TerritorialLevel;
  metricKey: TerritorialMetricKey;
  versionId: number | null;
  nominalSource: TerritorialIndicatorsResponse["nominalSource"];
  demographicSource: TerritorialIndicatorsResponse["demographicSource"];
  loading: boolean;
  error: string | null;
  onModeChange: (mode: TerritorialMapMode) => void;
  onLevelChange: (level: TerritorialLevel) => void;
  onMetricChange: (metric: TerritorialMetricKey) => void;
  onRetry: () => void;
}

const LEVELS: readonly { value: TerritorialLevel; label: string }[] = [
  { value: "MUNICIPIO", label: "Municipio" },
  { value: "DISTRITO_LOCAL", label: "Distrito local" },
  { value: "DISTRITO_FEDERAL", label: "Distrito federal" },
];

const sourceDateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatCutoffDate(value: string): string {
  return sourceDateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

export function TerritorialIndicatorPanel({
  mode,
  level,
  metricKey,
  versionId,
  nominalSource,
  demographicSource,
  loading,
  error,
  onModeChange,
  onLevelChange,
  onMetricChange,
  onRetry,
}: Props) {
  const selectionDisabled = versionId === null || loading;

  return (
    <section
      aria-labelledby="territorial-indicator-title"
      className="border-t border-slate-700/60 pt-3 mt-3"
    >
      <h3
        id="territorial-indicator-title"
        className="text-slate-400 text-[9px] uppercase tracking-[0.18em] font-bold mb-2"
      >
        Visualización
      </h3>

      <label className="block text-[10px] text-slate-400 mb-1" htmlFor="map-mode">
        Modo del mapa
      </label>
      <select
        id="map-mode"
        aria-label="Modo del mapa"
        value={mode}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onModeChange(event.target.value as TerritorialMapMode)
        }
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100"
      >
        <option value="POLITICAL">Mapa político</option>
        <option value="INDICATOR">Indicador territorial</option>
      </select>

      {mode === "INDICATOR" && (
        <div className="mt-2 space-y-2">
          <div>
            <label className="block text-[10px] text-slate-400 mb-1" htmlFor="territorial-level">
              Nivel territorial
            </label>
            <select
              id="territorial-level"
              aria-label="Nivel territorial"
              value={level}
              disabled={selectionDisabled}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                onLevelChange(event.target.value as TerritorialLevel)
              }
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100 disabled:opacity-50"
            >
              {LEVELS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] text-slate-400 mb-1" htmlFor="territorial-metric">
              Indicador
            </label>
            <select
              id="territorial-metric"
              aria-label="Indicador territorial"
              value={metricKey}
              disabled={selectionDisabled}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                onMetricChange(event.target.value as TerritorialMetricKey)
              }
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] text-slate-100 disabled:opacity-50"
            >
              {TERRITORIAL_METRICS.map((metric) => (
                <option key={metric.key} value={metric.key}>
                  {metric.label}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md bg-slate-950/70 px-2 py-1.5 text-[10px] text-slate-400">
            <div>
              {nominalSource
                ? `Corte nominal: ${formatCutoffDate(nominalSource.cutoffDate)}`
                : "Corte nominal: pendiente"}
            </div>
            <div>
              {demographicSource
                ? `Año demográfico: ${demographicSource.censusYear}`
                : "Año demográfico: pendiente"}
            </div>
          </div>

          {loading && (
            <p role="status" className="text-[10px] text-blue-300">
              Cargando indicadores
            </p>
          )}
          {error && (
            <div role="alert" className="rounded-md border border-red-500/40 p-2 text-[10px] text-red-200">
              <p>{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="mt-1 font-semibold text-red-100 underline underline-offset-2"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
