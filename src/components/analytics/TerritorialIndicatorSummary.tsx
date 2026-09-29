import { formatTerritorialMetric } from "@/lib/territorial-indicators-map";
import {
  TERRITORIAL_METRICS,
  isTerritorialDemographicMetricKey,
  type TerritorialIndicatorRow,
  type TerritorialIndicatorsResponse,
  type TerritorialMetricKey,
} from "@/lib/territorial-indicators-types";

interface Props {
  row: TerritorialIndicatorRow;
  metricKey: TerritorialMetricKey;
  nominalSource: TerritorialIndicatorsResponse["nominalSource"];
  demographicSource: TerritorialIndicatorsResponse["demographicSource"];
}

const sourceDateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string): string {
  return sourceDateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

export function TerritorialIndicatorSummary({
  row,
  metricKey,
  nominalSource,
  demographicSource,
}: Props) {
  const metric = TERRITORIAL_METRICS.find((candidate) => candidate.key === metricKey);
  const value = row.metrics[metricKey];
  const metricSections = isTerritorialDemographicMetricKey(metricKey)
    ? row.metricQuality[metricKey]
    : null;

  return (
    <section aria-label="Resumen del indicador territorial" className="space-y-2">
      <div>
        <p className="text-[10px] uppercase tracking-wide text-slate-500">
          {metric?.label ?? "Indicador"}
        </p>
        <p className="text-lg font-bold text-slate-900">
          {formatTerritorialMetric(value, metricKey)}
        </p>
      </div>
      <div className="text-[10px] leading-relaxed text-slate-600">
        <p>
          {nominalSource
            ? `Corte nominal ${formatDate(nominalSource.cutoffDate)}`
            : "Corte nominal no disponible"}
        </p>
        <p>
          {demographicSource
            ? `Censo ${demographicSource.censusYear}`
            : "Fuente demográfica no disponible"}
        </p>
        <p>Nominal: {row.nominalSections} / {row.totalSections} secciones</p>
        <p>Demografía: {row.demographicSections} / {row.totalSections} secciones</p>
        {metricSections !== null ? (
          <p>Indicador: {metricSections} / {row.totalSections} secciones</p>
        ) : null}
      </div>
    </section>
  );
}
