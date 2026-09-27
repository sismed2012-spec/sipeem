import type { DemografiaSeccionResponse } from "@/lib/demografia-types";

interface Props {
  data: DemografiaSeccionResponse;
}

const GROUPS = [
  {
    title: "Población y edad",
    metrics: [
      ["pobtot", "Población total"],
      ["pobfem", "Población femenina"],
      ["pobmas", "Población masculina"],
      ["pob0_14", "0 a 14 años"],
      ["pob15_64", "15 a 64 años"],
      ["pob65_mas", "65 años y más"],
    ],
  },
  {
    title: "Educación y economía",
    metrics: [
      ["graproes", "Grado promedio escolar"],
      ["p15ym_an", "15 años y más analfabeta"],
      ["pea", "Población económicamente activa"],
      ["pocupada", "Población ocupada"],
    ],
  },
  {
    title: "Características sociales",
    metrics: [
      ["pder_ss", "Con derecho a salud"],
      ["pcon_disc", "Con discapacidad"],
      ["p3ym_hli", "Habla lengua indígena"],
      ["pob_afro", "Afrodescendiente"],
    ],
  },
  {
    title: "Vivienda y servicios",
    metrics: [
      ["tvivhab", "Viviendas habitadas"],
      ["vph_aguadv", "Con agua entubada"],
      ["vph_drenaj", "Con drenaje"],
      ["vph_c_elec", "Con electricidad"],
    ],
  },
  {
    title: "Conectividad",
    metrics: [
      ["vph_cel", "Con teléfono celular"],
      ["vph_pc", "Con computadora"],
      ["vph_inter", "Con internet"],
    ],
  },
] as const;

const numberFormatter = new Intl.NumberFormat("es-MX", {
  maximumFractionDigits: 2,
});

function formatted(value: number | null | undefined): string {
  return value == null || !Number.isFinite(value) ? "—" : numberFormatter.format(value);
}

function statusMessage(status: DemografiaSeccionResponse["status"]): string | null {
  if (status === "PARTIAL") return "Cobertura parcial: existen localidades pendientes.";
  if (status === "PENDING") return "Datos pendientes de correspondencia territorial.";
  return null;
}

export function DemografiaSeccionCard({ data }: Props) {
  const warning = statusMessage(data.status);
  return (
    <section className="space-y-2 rounded-lg border border-sky-100 bg-sky-50/50 p-2.5">
      <div>
        <div className="text-[9px] font-bold uppercase tracking-widest text-sky-700">
          Demografía INEGI
        </div>
        <div className="mt-0.5 text-[9px] text-slate-500">
          {data.source.provider} · {data.source.datasetKey} · Censo {data.source.censusYear}
        </div>
        <div className="text-[9px] text-slate-500">
          Versión cartográfica {data.versionId}
        </div>
      </div>

      {data.status === "UNAVAILABLE" ? (
        <p className="rounded border border-slate-200 bg-white px-2 py-2 text-[10px] text-slate-500">
          Datos demográficos no disponibles
        </p>
      ) : (
        <>
          {warning && (
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-[9px] font-medium text-amber-800">
              {warning}
            </p>
          )}
          <div className="rounded border border-sky-100 bg-white px-2 py-1.5 text-[9px] text-slate-600">
            <div>
              {data.coverage.includedLocalities} localidades incluidas ·{" "}
              {data.coverage.pendingLocalities} pendientes
            </div>
            <div className="font-medium text-slate-700">
              {data.coverage.percentage == null
                ? "Cobertura no calculable"
                : `Cobertura ${numberFormatter.format(data.coverage.percentage)}%`}
            </div>
          </div>

          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="mb-1 text-[9px] font-bold text-slate-500">{group.title}</div>
              <dl className="grid grid-cols-2 gap-1">
                {group.metrics.map(([key, label]) => (
                  <div key={key} className="rounded bg-white px-1.5 py-1">
                    <dt className="text-[8px] leading-tight text-slate-400">{label}</dt>
                    <dd className="text-[10px] font-semibold text-slate-800">
                      {formatted(data.indicators[key])}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
