import {
  formatTerritorialMetric,
  type QuantileScale,
} from "@/lib/territorial-indicators-map";
import {
  TERRITORIAL_METRICS,
  type TerritorialMetricKey,
} from "@/lib/territorial-indicators-types";

interface Props {
  metricKey: TerritorialMetricKey;
  scale: QuantileScale;
}

export function TerritorialIndicatorLegend({ metricKey, scale }: Props) {
  const metric = TERRITORIAL_METRICS.find((candidate) => candidate.key === metricKey);
  return (
    <section
      aria-label={`Leyenda de ${metric?.label ?? "indicador territorial"}`}
      className="rounded-xl border border-slate-700/50 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-sm"
    >
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
        {metric?.label ?? "Indicador territorial"}
      </h3>
      <div className="mt-2 space-y-1">
        {scale.bins.map((bin) => (
          <div key={`${bin.lower}:${bin.upper}`} className="flex items-center gap-2 text-[10px] text-slate-300">
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: bin.color }}
            />
            <span>
              {bin.lower === bin.upper
                ? formatTerritorialMetric(bin.upper, metricKey)
                : `${formatTerritorialMetric(bin.lower, metricKey)} – ${formatTerritorialMetric(bin.upper, metricKey)}`}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-[10px] text-slate-300">
          <span
            aria-hidden="true"
            className="h-3 w-3 shrink-0 rounded-sm"
            style={{ backgroundColor: scale.noDataColor }}
          />
          <span>Sin dato</span>
        </div>
      </div>
      <p className="mt-2 text-[9px] leading-snug text-slate-500">
        No se imputan valores faltantes.
      </p>
    </section>
  );
}
