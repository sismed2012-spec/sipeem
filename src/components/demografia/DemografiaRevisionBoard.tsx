import Link from "next/link";
import { AlertTriangle, Database, Layers3, MapPin, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DemografiaPendingStatus,
  DemografiaReviewInput,
  DemografiaReviewResponse,
} from "@/lib/demografia-review";

interface DemografiaRevisionBoardProps {
  data: DemografiaReviewResponse;
  filters: DemografiaReviewInput;
}

const STATUS_LABELS: Record<DemografiaPendingStatus, string> = {
  MULTISECCION: "Múltiples secciones",
  REVISION_MANUAL: "Revisión manual",
  SIN_CORRESPONDENCIA: "Sin correspondencia",
};

const STATUS_CLASSES: Record<DemografiaPendingStatus, string> = {
  MULTISECCION: "border-blue-200 bg-blue-50 text-blue-700",
  REVISION_MANUAL: "border-amber-200 bg-amber-50 text-amber-700",
  SIN_CORRESPONDENCIA: "border-rose-200 bg-rose-50 text-rose-700",
};

function number(value: number | null, digits = 0): string {
  if (value === null) return "—";
  return value.toLocaleString("es-MX", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function percent(value: number | null, digits = 0): string {
  if (value === null) return "—";
  return `${number(value * 100, digits)}%`;
}

function pageHref(filters: DemografiaReviewInput, offset: number): string {
  const params = new URLSearchParams();
  if (filters.versionId !== null) params.set("versionId", String(filters.versionId));
  if (filters.status) params.set("status", filters.status);
  if (filters.municipality) params.set("municipality", filters.municipality);
  if (filters.search) params.set("search", filters.search);
  params.set("limit", String(filters.limit));
  params.set("offset", String(Math.max(0, offset)));
  return `/admin/demografia/revision?${params.toString()}`;
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
}) {
  return (
    <Card className={`border-slate-200 border-l-4 shadow-sm ${accent}`}>
      <CardHeader className="pb-0">
        <CardTitle className="flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-500">
          {label}
          {icon}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-3xl font-black tabular-nums text-slate-950">
          {value.toLocaleString("es-MX")}
        </p>
      </CardContent>
    </Card>
  );
}

export function DemografiaRevisionBoard({
  data,
  filters,
}: DemografiaRevisionBoardProps) {
  const from = data.pagination.total === 0 ? 0 : data.pagination.offset + 1;
  const to = Math.min(
    data.pagination.offset + data.items.length,
    data.pagination.total
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Pendientes"
          value={data.summary.totalPending}
          icon={<Database className="h-4 w-4 text-slate-500" />}
          accent="border-l-slate-700"
        />
        <SummaryCard
          label="Multisección"
          value={data.summary.multisection}
          icon={<Layers3 className="h-4 w-4 text-blue-600" />}
          accent="border-l-blue-500"
        />
        <SummaryCard
          label="Revisión manual"
          value={data.summary.manualReview}
          icon={<Users className="h-4 w-4 text-amber-600" />}
          accent="border-l-amber-500"
        />
        <SummaryCard
          label="Sin correspondencia"
          value={data.summary.unmatched}
          icon={<AlertTriangle className="h-4 w-4 text-rose-600" />}
          accent="border-l-rose-500"
        />
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="font-black text-slate-900">Filtros territoriales</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                Fuente {data.source.provider} {data.source.datasetKey} · Censo {data.source.censusYear}
              </p>
            </div>
            <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700">
              Sólo lectura
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1 text-xs font-bold text-slate-600">
              Versión cartográfica
              <select
                name="versionId"
                defaultValue={String(filters.versionId ?? data.selectedVersion.id)}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              >
                {data.versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.key}{version.isDefault ? " · vigente" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-600">
              Estado
              <select
                name="status"
                defaultValue={filters.status ?? ""}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              >
                <option value="">Todos los pendientes</option>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-600 xl:col-span-2">
              Municipio
              <select
                name="municipality"
                defaultValue={filters.municipality ?? ""}
                className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
              >
                <option value="">Todos los municipios</option>
                {data.municipalities.map((municipality) => (
                  <option key={municipality.key} value={municipality.key}>
                    {municipality.name} ({municipality.pending.toLocaleString("es-MX")})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-bold text-slate-600 xl:col-span-2">
              Localidad o municipio
              <div className="flex gap-2">
                <input
                  name="search"
                  defaultValue={filters.search ?? ""}
                  maxLength={100}
                  placeholder="Nombre o clave de localidad"
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                />
                <input type="hidden" name="limit" value={filters.limit} />
                <input type="hidden" name="offset" value="0" />
                <Button type="submit" className="h-9 bg-slate-900 px-4 text-white hover:bg-slate-800">
                  Filtrar
                </Button>
              </div>
            </label>
          </form>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
        <p>
          Mostrando <strong className="text-slate-800">{from.toLocaleString("es-MX")}–{to.toLocaleString("es-MX")}</strong>
          {" de "}<strong className="text-slate-800">{data.pagination.total.toLocaleString("es-MX")}</strong>
        </p>
        <p>Versión: <strong className="text-slate-800">{data.selectedVersion.key}</strong></p>
      </div>

      {data.items.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-slate-50 py-12 text-center">
          <CardContent>
            <MapPin className="mx-auto mb-3 h-8 w-8 text-slate-400" />
            <p className="font-bold text-slate-700">No hay localidades pendientes con estos filtros</p>
            <p className="mt-1 text-sm text-slate-500">Prueba otra versión, municipio o término de búsqueda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.items.map((item) => (
            <Card key={item.correspondenceId} className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="border-b border-slate-100">
                <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-black uppercase tracking-tight text-slate-950">
                        {item.locality.name}
                      </CardTitle>
                      <Badge variant="outline" className={STATUS_CLASSES[item.status]}>
                        {STATUS_LABELS[item.status]}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {item.locality.municipalityName} · {item.locality.stateKey}-{item.locality.municipalityKey}-{item.locality.localityKey}
                    </p>
                  </div>
                  <div className="text-left md:text-right">
                    <p className="text-2xl font-black tabular-nums text-slate-950">
                      {number(item.locality.population)}
                    </p>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">habitantes</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  <div><dt className="text-xs text-slate-500">Método</dt><dd className="font-bold text-slate-800">{item.method}</dd></div>
                  <div><dt className="text-xs text-slate-500">Confianza</dt><dd className="font-bold text-slate-800">{percent(item.confidence, 1)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Distancia</dt><dd className="font-bold text-slate-800">{item.distanceMeters === null ? "—" : `${number(item.distanceMeters, 1)} m`}</dd></div>
                  <div><dt className="text-xs text-slate-500">Similitud de nombre</dt><dd className="font-bold text-slate-800">{percent(item.nameSimilarity, 1)}</dd></div>
                  <div><dt className="text-xs text-slate-500">Coordenadas</dt><dd className="font-mono text-xs font-bold text-slate-800">{number(item.locality.latitude, 5)}, {number(item.locality.longitude, 5)}</dd></div>
                </dl>

                <div>
                  <p className="mb-2 text-xs font-black uppercase tracking-widest text-slate-500">
                    Secciones candidatas ({item.candidateCount})
                  </p>
                  {item.candidates.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                      No existe una sección candidata para esta localidad.
                    </p>
                  ) : (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {item.candidates.map((candidate) => (
                        <div key={candidate.cartographicSectionId} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-black text-slate-900">Sección {candidate.number}</p>
                            <Badge variant="outline" className="border-slate-200 bg-slate-50 text-slate-600">
                              {candidate.contactType === "AREA" ? "Área" : "Borde"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{candidate.municipalityName} · clave {candidate.municipalityKey}</p>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                            <div><span className="text-slate-500">Cobertura</span><p className="font-black text-slate-800">{percent(candidate.proportion)}</p></div>
                            <div><span className="text-slate-500">Intersección</span><p className="font-black text-slate-800">{number(candidate.intersectionArea, 1)} m²</p></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {data.pagination.offset > 0 ? (
          <Button variant="outline" render={<Link href={pageHref(filters, data.pagination.offset - data.pagination.limit)} />}>
            Anterior
          </Button>
        ) : null}
        {data.pagination.hasMore ? (
          <Button variant="outline" render={<Link href={pageHref(filters, data.pagination.offset + data.pagination.limit)} />}>
            Siguiente
          </Button>
        ) : null}
      </div>
    </div>
  );
}
