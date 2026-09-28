import type { ListaNominalSeccionResponse } from "@/lib/lista-nominal-types";

interface Props {
  data: ListaNominalSeccionResponse;
}

const integerFormatter = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 0,
});

const percentageFormatter = new Intl.NumberFormat("es-MX", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string): string {
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

export function ListaNominalSeccionCard({ data }: Props) {
  const unavailable =
    data.status === "UNAVAILABLE" ||
    !data.cutoffDate ||
    !data.source ||
    !data.padron ||
    !data.nominal ||
    data.difference === null ||
    data.coverage === null;

  return (
    <section className="space-y-2 rounded-lg border border-violet-100 bg-violet-50/50 p-2.5">
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest text-violet-700">
          Lista nominal INE
        </div>
        <div className="mt-0.5 text-[9px] text-slate-500">
          Versión cartográfica {data.versionId}
        </div>
      </div>

      {unavailable ? (
        <p className="rounded border border-slate-200 bg-white px-2 py-2 text-[10px] text-slate-500">
          Sin dato nominal para este corte
        </p>
      ) : (
        <>
          <div className="rounded border border-violet-100 bg-white px-2 py-1.5 text-[9px] text-slate-600">
            Corte oficial {formatDate(data.cutoffDate!)} · {data.source!.provider}
          </div>
          <dl className="grid grid-cols-2 gap-1">
            <Metric label="Padrón electoral" value={data.padron!.total} />
            <Metric label="Lista nominal" value={data.nominal!.total} />
            <Metric label="Diferencia" value={data.difference!} />
            <Metric
              label="Cobertura"
              value={`${percentageFormatter.format(data.coverage!)}%`}
            />
          </dl>
          <div>
            <div className="mb-1 text-[9px] font-bold text-slate-500">
              Desglose de lista nominal
            </div>
            <dl className="grid grid-cols-3 gap-1">
              <Metric label="Hombres" value={data.nominal!.men} />
              <Metric label="Mujeres" value={data.nominal!.women} />
              <Metric label="No binario" value={data.nominal!.nonBinary} />
            </dl>
          </div>
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded bg-white px-1.5 py-1">
      <dt className="text-[8px] leading-tight text-slate-400">{label}</dt>
      <dd className="text-[10px] font-semibold text-slate-800">
        {typeof value === "number" ? integerFormatter.format(value) : value}
      </dd>
    </div>
  );
}
