import { getUsuarioActual } from "@/actions/auth";
import { getMunicipioHistorialAnalytics } from "@/actions/analytics";
import {
  MunicipioMultiPartyChart,
  MunicipioMarginChart,
} from "@/components/analytics/MunicipalityCharts";
import MunicipioSectionsPanel from "@/components/historial/MunicipioSectionsPanel";
import GubernaturaSeccionalPanel from "@/components/historial/GubernaturaSeccionalPanel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTimelineSpotlightEvents } from "@/lib/municipio-analytics";
import {
  ChevronLeft,
  FileText,
  History,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ secciones?: string }>;
};

export default async function MunicipioAnalyticsPage({
  params,
  searchParams,
}: PageProps) {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.rol === "operador") redirect("/mapa");

  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const requestedSectionParam = resolvedSearchParams.secciones;
  const requestedGubernatura = requestedSectionParam === "gubernatura-2023";
  const requestedSectionYear =
    requestedSectionParam && !requestedGubernatura
      ? parseInt(requestedSectionParam)
      : undefined;
  const municipalSectionYear = requestedSectionYear;
  const municipioId = parseInt(id);
  const data = await getMunicipioHistorialAnalytics(
    municipioId,
    municipalSectionYear,
    { includeGubernatura: true }
  );
  const gubernaturaData = data.gubernatura2023;

  const availableMunicipalSectionYears = [...data.sections.availableYears].sort(
    (a, b) => b - a
  );

  const selectedSectionYear =
    requestedSectionYear &&
    availableMunicipalSectionYears.includes(requestedSectionYear)
      ? requestedSectionYear
      : requestedGubernatura && gubernaturaData
      ? "gubernatura-2023"
      : data.sections.year;

  const municipalWinnerBySec: Record<number, string> = {};
  data.sections.rows.forEach((r) => {
    municipalWinnerBySec[r.seccionNumero] = r.winnerSiglas;
  });

  const municipalTimeline = data.timeline.filter(
    (event) => event.electionType === "municipal"
  );
  const latestEvent = municipalTimeline[0] ?? null;
  const prevEvent = municipalTimeline[1] ?? null;
  const deltaFuerza =
    prevEvent != null && latestEvent != null
      ? Number(latestEvent.porcentaje) - Number(prevEvent.porcentaje)
      : null;

  const alternationColor =
    data.summary.alternationRate > 0.5 ? "text-rose-600" : "text-emerald-600";
  const competitivenessColor =
    data.summary.avgCompetitiveness < 1000 ? "text-rose-600" : "text-blue-600";
  const sourceLabel =
    data.summary.source === "oficial_municipal"
      ? "Fuente oficial municipal"
      : data.summary.source === "legacy_municipal"
      ? "Fuente legacy municipal"
      : "Fuente mixta";
  const consistencyLabel =
    data.summary.consistency.status === "consistente"
      ? "Consistente con secciones"
      : data.summary.consistency.status === "casi_consistente"
      ? "Casi consistente con secciones"
      : data.summary.consistency.status === "inconsistente"
      ? "Difiere del detalle seccional"
      : "Sin detalle seccional comparable";
  const consistencyTone =
    data.summary.consistency.status === "consistente"
      ? "bg-emerald-50 text-emerald-700"
      : data.summary.consistency.status === "casi_consistente"
      ? "bg-amber-50 text-amber-700"
      : data.summary.consistency.status === "inconsistente"
      ? "bg-rose-50 text-rose-700"
      : "bg-slate-100 text-slate-600";
  const spotlightEvents = getTimelineSpotlightEvents(data.timeline);

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12 animate-in fade-in duration-700">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/historial"
          className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-900"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 font-bold transition-colors group-hover:bg-slate-50">
            <ChevronLeft className="h-3 w-3" />
          </div>
          Cerrar Perfil Local
        </Link>
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase">
            Perfil de Inteligencia: {data.summary.nombre}
          </h1>
          <p className="mt-1 font-medium text-slate-500">
            Análisis detallado de evolución política y comportamiento de voto.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge className="border-none bg-slate-100 text-slate-800">
              {sourceLabel}
            </Badge>
            <Badge className={`${consistencyTone} border-none`}>
              {consistencyLabel}
            </Badge>
            {data.summary.consistency.diffValidos !== null && (
              <Badge
                variant="outline"
                className="border-slate-200 bg-white text-slate-700"
              >
                Diff válidos:{" "}
                {data.summary.consistency.diffValidos > 0 ? "+" : ""}
                {data.summary.consistency.diffValidos.toLocaleString()}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="flex h-32 flex-col justify-center border-slate-200 border-b-4 border-b-slate-100 bg-white px-6 shadow-sm">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Escrutinios
          </p>
          <div className="text-3xl font-black leading-none text-slate-900">
            {data.summary.totalElections}
          </div>
        </Card>
        <Card className="flex h-32 flex-col justify-center border-slate-200 border-b-4 border-b-slate-900 bg-white px-6 shadow-sm">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Fuerza Actual
          </p>
          <div className="flex items-end gap-3">
            <div className="text-3xl font-black leading-none text-slate-900">
              {data.summary.lastWinner}
            </div>
            {deltaFuerza != null && (
              <div
                className={`mb-0.5 flex items-center gap-1 text-[11px] font-black ${
                  deltaFuerza >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {deltaFuerza >= 0 ? (
                  <TrendingUp className="h-3.5 w-3.5" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5" />
                )}
                {deltaFuerza >= 0 ? "+" : ""}
                {deltaFuerza.toFixed(1)}%
              </div>
            )}
          </div>
          {prevEvent && (
            <p className="mt-1 text-[9px] font-bold uppercase tracking-widest text-slate-400">
              vs {prevEvent.anio}
            </p>
          )}
        </Card>
        <Card className="flex h-32 flex-col justify-center border-slate-200 border-b-4 border-b-emerald-100 bg-white px-6 shadow-sm">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Alternancia
          </p>
          <div className={`text-3xl font-black leading-none ${alternationColor}`}>
            {(data.summary.alternationRate * 100).toFixed(0)}%
          </div>
        </Card>
        <Card className="flex h-32 flex-col justify-center border-slate-200 border-b-4 border-b-rose-100 bg-white px-6 shadow-sm">
          <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">
            Margen Promedio
          </p>
          <div
            className={`text-3xl font-black leading-none ${competitivenessColor}`}
          >
            {data.summary.avgCompetitiveness.toLocaleString()} v.
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/60 p-6">
          <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-800">
            Cronología Destacada
          </CardTitle>
          <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Secuencia completa del municipio en orden cronológico inverso
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          {spotlightEvents.map((event) => (
            <article
              key={event.id}
              className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3.5 shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="text-2xl font-black leading-none tracking-tight text-slate-900">
                      {event.anio}
                    </div>
                    {event.electionType === "gubernatura" && (
                      <Badge className="border-none bg-amber-100 text-[9px] font-black uppercase tracking-widest text-amber-800">
                        Gubernatura / 2023
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    {event.winnerSiglas}
                  </div>
                </div>
                <div
                  className="h-9 w-9 rounded-xl shadow-sm"
                  style={{ backgroundColor: event.winnerColor }}
                  aria-hidden="true"
                />
              </div>
              <div className="space-y-2.5">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                    Ganador
                  </p>
                  <p className="text-sm font-semibold text-slate-700">
                    {event.winner}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Votos
                    </p>
                    <p className="text-base font-black text-slate-950">
                      {event.votos.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      %
                    </p>
                    <Badge className="border-none bg-emerald-50 text-[10px] font-black uppercase text-emerald-700">
                      {event.porcentaje}%
                    </Badge>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Margen
                    </p>
                    <p className="text-base font-black text-slate-950">
                      {event.margin.toLocaleString()}
                    </p>
                  </div>
                </div>
                {event.topParties.length > 0 && (
                  <div className="border-t border-slate-200 pt-2.5">
                    <p className="mb-2 text-[9px] font-black uppercase tracking-widest text-slate-400">
                      Balance de Fuerzas
                    </p>
                    <div className="space-y-1.5">
                      {event.topParties.slice(0, 3).map((party, index) => (
                        <div
                          key={`${event.id}-${party.siglas}`}
                          className="flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2.5 w-2.5 rounded-full border border-white/60"
                              style={{ backgroundColor: party.color }}
                              aria-hidden="true"
                            />
                            <span
                              className={`text-[11px] uppercase ${
                                index === 0
                                  ? "font-black text-slate-900"
                                  : "font-bold text-slate-500"
                              }`}
                            >
                              {party.siglas}
                            </span>
                          </div>
                          <span
                            className={`text-[11px] ${
                              index === 0
                                ? "font-black text-slate-900"
                                : "font-bold text-slate-400"
                            }`}
                          >
                            {party.votes.toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </article>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-xl">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-6">
              <CardTitle className="text-lg font-black uppercase tracking-tight">
                Distribución de Fuerzas por Año
              </CardTitle>
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Votos de las principales fuerzas en cada proceso electoral
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <MunicipioMultiPartyChart data={data.timeline} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-md">
            <CardHeader className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
              <CardTitle className="text-sm font-black uppercase tracking-tight text-slate-700">
                Tendencia del Margen
              </CardTitle>
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Diferencia de votos entre 1° y 2° lugar — línea punteada = promedio histórico
              </CardDescription>
            </CardHeader>
            <CardContent className="px-6 pb-4 pt-4">
              <MunicipioMarginChart data={data.timeline} />
            </CardContent>
          </Card>
        </div>

        <Card className="overflow-hidden rounded-2xl border-none bg-slate-900 text-white shadow-2xl">
          <CardHeader className="border-b border-white/10 bg-slate-800/50 p-6">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-400" />
              <CardTitle className="text-sm font-black uppercase tracking-widest italic">
                Análisis Estratégico
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-8 p-8">
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 shadow-inner">
                  <TrendingUp className="h-4 w-4 text-emerald-400" />
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/60">
                    Tendencia de Alternancia
                  </p>
                  <p className="text-sm font-medium leading-relaxed opacity-90">
                    {data.summary.alternationRate > 0.4
                      ? "Alta volatilidad política detectada. El municipio presenta una competencia abierta con cambios frecuentes en la fuerza gobernante."
                      : "Tendencia a la estabilidad o dominio prolongado. Una o pocas fuerzas políticas mantienen el control histórico."}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-500/20 shadow-inner">
                  <Users className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-blue-400/60">
                    Escenario Competitivo
                  </p>
                  <p className="text-sm font-medium leading-relaxed opacity-90">
                    {data.summary.avgCompetitiveness < 1500
                      ? "Escenario de alta competencia. Las victorias suelen definirse por márgenes estrechos, indicando un electorado fragmentado o polarizado."
                      : "Victorias consolidadas. Los ganadores suelen obtener una ventaja clara sobre la segunda fuerza."}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 shadow-inner">
                  <History className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="mb-1 text-[9px] font-black uppercase tracking-[0.2em] text-amber-400/60">
                    Historial Validado
                  </p>
                  <p className="text-sm font-medium italic leading-relaxed opacity-90">
                    Estado actual encabezado por{" "}
                    <span className="font-black text-white">
                      {data.summary.lastWinner}
                    </span>
                    . Se han verificado{" "}
                    <span className="font-black text-white">
                      {data.summary.totalElections}
                    </span>{" "}
                    escrutinios históricos.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {(availableMunicipalSectionYears.length > 1 || gubernaturaData) && (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-widest">
              Anos Seccionales Disponibles
            </CardTitle>
            <CardDescription className="text-xs font-medium text-slate-500">
              Cambia el ano del detalle seccional para este municipio.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {availableMunicipalSectionYears.map((year) => (
              <Link
                key={year}
                href={`/admin/historial/municipio/${id}?secciones=${year}`}
                className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest transition-colors ${
                  selectedSectionYear === year
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {year}
              </Link>
            ))}
            {gubernaturaData && (
              <Link
                href={`/admin/historial/municipio/${id}?secciones=gubernatura-2023`}
                className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest transition-colors ${
                  selectedSectionYear === "gubernatura-2023"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                Gubernatura 2023
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {selectedSectionYear === "gubernatura-2023" && gubernaturaData ? (
        <GubernaturaSeccionalPanel
          data={gubernaturaData}
          municipalYear={data.sections.year}
          municipalWinnerBySec={municipalWinnerBySec}
        />
      ) : (
        <MunicipioSectionsPanel
          municipioId={municipioId}
          showYearSelector={false}
          sections={data.sections}
          operations={data.operations}
          consistency={data.summary.consistency}
        />
      )}
    </div>
  );
}
