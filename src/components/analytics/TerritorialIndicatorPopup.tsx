"use client";

import { X } from "lucide-react";

import type {
  TerritorialIndicatorRow,
  TerritorialIndicatorsResponse,
  TerritorialMetricKey,
} from "@/lib/territorial-indicators-types";
import { TerritorialIndicatorSummary } from "./TerritorialIndicatorSummary";

interface Props {
  row: TerritorialIndicatorRow;
  metricKey: TerritorialMetricKey;
  nominalSource: TerritorialIndicatorsResponse["nominalSource"];
  demographicSource: TerritorialIndicatorsResponse["demographicSource"];
  onClose: () => void;
}

const LEVEL_LABELS = {
  MUNICIPIO: "Municipio",
  DISTRITO_LOCAL: "Distrito local",
  DISTRITO_FEDERAL: "Distrito federal",
} as const;

export function TerritorialIndicatorPopup({
  row,
  metricKey,
  nominalSource,
  demographicSource,
  onClose,
}: Props) {
  return (
    <aside className="pointer-events-auto absolute inset-x-3 bottom-3 z-40 w-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl 2xl:inset-x-auto 2xl:left-1/2 2xl:top-4 2xl:bottom-auto 2xl:w-72 2xl:-translate-x-1/2 2xl:rounded-xl">
      <header className="flex items-start justify-between bg-slate-900 px-4 py-3">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-blue-300">
            {LEVEL_LABELS[row.level]}
          </p>
          <h3 className="text-[13px] font-bold leading-tight text-white">
            {row.name}
          </h3>
          <p className="mt-0.5 text-[10px] text-slate-400">Clave {row.key}</p>
        </div>
        <button
          type="button"
          aria-label="Cerrar indicador territorial"
          onClick={onClose}
          className="ml-2 mt-0.5 shrink-0 text-slate-400 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="p-4">
        <TerritorialIndicatorSummary
          row={row}
          metricKey={metricKey}
          nominalSource={nominalSource}
          demographicSource={demographicSource}
        />
      </div>
    </aside>
  );
}
