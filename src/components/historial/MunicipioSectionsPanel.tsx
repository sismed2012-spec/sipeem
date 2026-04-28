"use client";

import { useDeferredValue, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { deleteSeccionObjetivo, upsertSeccionObjetivo } from "@/actions/secciones-objetivo";
import { Layers3, MapPinned, Search, Trophy, Vote } from "lucide-react";

type SectionRow = {
  id: number;
  anio: number;
  seccionNumero: number;
  casillas: number;
  actasCasillaMec: number;
  listaNominal: number | null;
  votosValidos: number;
  votosNulos: number;
  votosNoRegistrados: number;
  totalVotos: number;
  winnerSiglas: string;
  winnerVotes: number;
  margin: number;
  promotor: string | null;
  coberturaCompromisos: number;
  coberturaMeta: number;
  coberturaPct: number | null;
  ultimoMovimiento: string | null;
  objetivoId: number | null;
  isObjective: boolean;
  topForces: { siglas: string; votes: number }[];
};

type SectionsPanelProps = {
  municipioId: number;
  showYearSelector?: boolean;
  sections: {
    year: number | null;
    availableYears: number[];
    totalSections: number;
    totalValidVotes: number;
    totalVotes: number;
    rows: SectionRow[];
  };
  operations: {
    promotoresTotal: number;
    promotoresActivos: number;
    incidenciasTotal: number;
    incidenciasAbiertas: number;
    incidenciasCriticas: number;
    compromisosCapturados: number;
    seccionesConCobertura: number;
    objetivosGuardados: number;
    ultimoMovimientoCobertura: string | null;
    ultimaIncidencia: string | null;
  };
  consistency: {
    status:
      | "sin_detalle_seccional"
      | "consistente"
      | "casi_consistente"
      | "inconsistente";
    comparedYear: number | null;
    officialValidos: number | null;
    seccionalValidos: number | null;
    diffValidos: number | null;
    diffTotal: number | null;
  };
};

type SortKey =
  | "priority_desc"
  | "seccion_asc"
  | "validos_desc"
  | "margin_asc"
  | "margin_desc"
  | "winner_asc";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPriorityScore(row: SectionRow) {
  const nominalFactor = row.listaNominal
    ? clamp(row.listaNominal / 1500, 0, 1)
    : clamp(row.votosValidos / 1200, 0, 1);
  const marginFactor = 1 - clamp(row.margin / 1200, 0, 1);
  const coverageFactor =
    row.coberturaPct == null
      ? row.coberturaCompromisos > 0
        ? 0.5
        : 1
      : 1 - clamp(row.coberturaPct / 100, 0, 1);
  const promotorFactor = row.promotor ? 0 : 1;

  return Math.round(
    nominalFactor * 35 +
      marginFactor * 35 +
      coverageFactor * 20 +
      promotorFactor * 10
  );
}

function getPriorityTier(score: number) {
  if (score >= 75) return "critica";
  if (score >= 55) return "alta";
  if (score >= 35) return "media";
  return "baja";
}

function getPriorityBadgeClass(tier: ReturnType<typeof getPriorityTier>) {
  if (tier === "critica") return "bg-rose-50 text-rose-700 border-rose-100";
  if (tier === "alta") return "bg-amber-50 text-amber-700 border-amber-100";
  if (tier === "media") return "bg-blue-50 text-blue-700 border-blue-100";
  return "bg-emerald-50 text-emerald-700 border-emerald-100";
}

function sortRows(rows: SectionRow[], sortKey: SortKey) {
  const sorted = [...rows];

  sorted.sort((a, b) => {
    if (sortKey === "priority_desc") {
      return (
        getPriorityScore(b) - getPriorityScore(a) ||
        a.margin - b.margin ||
        b.votosValidos - a.votosValidos
      );
    }
    if (sortKey === "validos_desc") {
      return (
        b.votosValidos - a.votosValidos || a.seccionNumero - b.seccionNumero
      );
    }
    if (sortKey === "margin_asc") {
      return a.margin - b.margin || b.votosValidos - a.votosValidos;
    }
    if (sortKey === "margin_desc") {
      return b.margin - a.margin || b.votosValidos - a.votosValidos;
    }
    if (sortKey === "winner_asc") {
      return (
        a.winnerSiglas.localeCompare(b.winnerSiglas) ||
        a.seccionNumero - b.seccionNumero
      );
    }

    return a.seccionNumero - b.seccionNumero;
  });

  return sorted;
}

function toneByConsistency(status: SectionsPanelProps["consistency"]["status"]) {
  if (status === "consistente") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }
  if (status === "casi_consistente") {
    return "bg-amber-50 text-amber-700 border-amber-100";
  }
  if (status === "inconsistente") {
    return "bg-rose-50 text-rose-700 border-rose-100";
  }
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export default function MunicipioSectionsPanel({
  municipioId,
  showYearSelector = true,
  sections,
  operations,
  consistency,
}: SectionsPanelProps) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("priority_desc");
  const [pendingObjectiveSection, setPendingObjectiveSection] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deferredQuery = useDeferredValue(query.trim().toUpperCase());

  const filteredRows = useMemo(() => {
    const baseRows = !deferredQuery
      ? sections.rows
      : sections.rows.filter((row) => {
          const haystack = [
            String(row.seccionNumero),
            row.winnerSiglas,
            row.promotor ?? "",
            ...row.topForces.map((force) => force.siglas),
          ]
            .join(" ")
            .toUpperCase();

          return haystack.includes(deferredQuery);
        });

    return sortRows(baseRows, sortKey);
  }, [deferredQuery, sections.rows, sortKey]);

  const keySections = useMemo(() => {
    const closest = [...sections.rows]
      .sort((a, b) => a.margin - b.margin || b.votosValidos - a.votosValidos)
      .slice(0, 5);
    const largest = [...sections.rows]
      .sort((a, b) => b.votosValidos - a.votosValidos || a.margin - b.margin)
      .slice(0, 5);
    const strongest = [...sections.rows]
      .sort((a, b) => b.margin - a.margin || b.winnerVotes - a.winnerVotes)
      .slice(0, 5);

    return { closest, largest, strongest };
  }, [sections.rows]);

  const targetSections = useMemo(
    () =>
      [...sections.rows]
        .sort(
          (a, b) =>
            getPriorityScore(b) - getPriorityScore(a) ||
            a.margin - b.margin ||
            b.votosValidos - a.votosValidos
        )
        .slice(0, 5),
    [sections.rows]
  );

  const savedObjectiveSections = useMemo(
    () =>
      [...sections.rows]
        .filter((row) => row.isObjective)
        .sort(
          (a, b) =>
            getPriorityScore(b) - getPriorityScore(a) ||
            a.seccionNumero - b.seccionNumero
        ),
    [sections.rows]
  );

  const savedObjectiveSummary = useMemo(() => {
    const summary = { critica: 0, alta: 0, media: 0, baja: 0 };
    for (const row of savedObjectiveSections) {
      summary[getPriorityTier(getPriorityScore(row))]++;
    }
    return summary;
  }, [savedObjectiveSections]);

  const seccionalSummary = useMemo(() => {
    if (sections.rows.length === 0) return null;

    const forceCounts = new Map<string, number>();
    let totalLN = 0;
    let competitivas = 0;

    for (const row of sections.rows) {
      forceCounts.set(row.winnerSiglas, (forceCounts.get(row.winnerSiglas) ?? 0) + 1);
      if (row.listaNominal) totalLN += row.listaNominal;
      if (row.margin < 300) competitivas++;
    }

    const dominantEntry = [...forceCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const participacion =
      totalLN > 0 ? ((sections.totalVotes / totalLN) * 100).toFixed(1) : null;

    return {
      dominantForce: dominantEntry?.[0] ?? "N/D",
      dominantCount: dominantEntry?.[1] ?? 0,
      totalLN,
      participacion,
      competitivas,
    };
  }, [sections.rows, sections.totalVotes]);

  function mapScoreToPriority(score: number): "Baja" | "Media" | "Alta" | "Critica" {
    const tier = getPriorityTier(score);
    if (tier === "critica") return "Critica";
    if (tier === "alta") return "Alta";
    if (tier === "media") return "Media";
    return "Baja";
  }

  function handleToggleObjective(section: SectionRow) {
    const score = getPriorityScore(section);
    setPendingObjectiveSection(section.seccionNumero);
    startTransition(async () => {
      try {
        if (section.isObjective) {
          await deleteSeccionObjetivo({
            municipioId,
            seccionNumero: section.seccionNumero,
          });
        } else {
          await upsertSeccionObjetivo({
            municipioId,
            seccionNumero: section.seccionNumero,
            prioridad: mapScoreToPriority(score),
            scoreSnapshot: score,
            anio: section.anio,
          });
        }
        router.refresh();
      } finally {
        setPendingObjectiveSection(null);
      }
    });
  }

  function handleSectionYearChange(nextYear: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("secciones", String(nextYear));
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-slate-800">
            <MapPinned className="h-5 w-5" /> Detalle Seccional
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            {sections.year
              ? `Desglose operativo por sección para ${sections.year}.`
              : "Sin detalle seccional cargado para este municipio."}
          </p>
        </div>
        {sections.year && (
          <div className="flex flex-wrap gap-2">
            <Badge className="border-none bg-slate-100 text-slate-800">
              Año {sections.year}
            </Badge>
            <Badge className="border-none bg-blue-50 text-blue-700">
              Secciones {sections.totalSections}
            </Badge>
            <Badge className="border-none bg-emerald-50 text-emerald-700">
              Válidos {sections.totalValidVotes.toLocaleString()}
            </Badge>
            <Badge className="border-none bg-amber-50 text-amber-700">
              Total {sections.totalVotes.toLocaleString()}
            </Badge>
          </div>
        )}
      </div>

      {showYearSelector && sections.availableYears.length > 1 && (
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
            {sections.availableYears.map((year) => (
              <button
                key={year}
                type="button"
                onClick={() => handleSectionYearChange(year)}
                className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest transition-colors ${
                  sections.year === year
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {year}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-sm xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-widest">
              Conciliación Municipal vs Secciones
            </CardTitle>
            <CardDescription className="text-xs font-medium text-slate-500">
              Contraste del último resultado municipal contra la suma seccional comparable.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Oficial válidos
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {consistency.officialValidos?.toLocaleString() ?? "N/D"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Seccional válidos
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {consistency.seccionalValidos?.toLocaleString() ?? "N/D"}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Diferencia
              </p>
              <p className="mt-2 text-2xl font-black text-slate-900">
                {consistency.diffValidos == null
                  ? "N/D"
                  : `${consistency.diffValidos > 0 ? "+" : ""}${consistency.diffValidos.toLocaleString()}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <Badge className={`border ${toneByConsistency(consistency.status)}`}>
                {consistency.status.replace(/_/g, " ")}
              </Badge>
              {consistency.comparedYear && (
                <Badge
                  variant="outline"
                  className="border-slate-200 bg-white text-slate-700"
                >
                  Año comparado {consistency.comparedYear}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-widest">
              Secciones Competidas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {keySections.closest.map((row) => (
              <div
                key={`closest-${row.id}`}
                className="flex items-center justify-between"
              >
                <div>
                  <p className="text-sm font-black text-slate-900">
                    Sección {row.seccionNumero}
                  </p>
                  <p className="text-[11px] font-medium text-slate-500">
                    {row.winnerSiglas}
                  </p>
                </div>
                <Badge className="border-none bg-rose-50 text-rose-700">
                  Margen {row.margin.toLocaleString()}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-widest">
              Secciones Clave
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Mayor volumen
              </p>
              <div className="space-y-2">
                {keySections.largest.slice(0, 3).map((row) => (
                  <div
                    key={`largest-${row.id}`}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-black text-slate-900">
                      Sección {row.seccionNumero}
                    </span>
                    <span className="font-black text-slate-600">
                      {row.votosValidos.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Dominio más amplio
              </p>
              <div className="space-y-2">
                {keySections.strongest.slice(0, 3).map((row) => (
                  <div
                    key={`strongest-${row.id}`}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-black text-slate-900">
                      Sección {row.seccionNumero}
                    </span>
                    <span className="font-black text-slate-600">
                      {row.margin.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Promotores
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {operations.promotoresActivos}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {operations.promotoresTotal} registrados
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Cobertura Seccional
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {operations.seccionesConCobertura}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {operations.compromisosCapturados.toLocaleString()} compromisos
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Incidencias Abiertas
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {operations.incidenciasAbiertas}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {operations.incidenciasCriticas} críticas
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Objetivos Guardados
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {operations.objetivosGuardados}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Último movimiento: {operations.ultimoMovimientoCobertura ?? "N/D"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-black uppercase tracking-widest">
            Secciones Objetivo
          </CardTitle>
          <CardDescription className="text-xs font-medium text-slate-500">
            Priorización por margen cerrado, tamaño de lista nominal y baja cobertura.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {targetSections.map((row) => {
            const score = getPriorityScore(row);
            const tier = getPriorityTier(score);
            return (
              <div
                key={`target-${row.id}`}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Sección {row.seccionNumero}
                    </p>
                    <p className="text-[11px] font-medium text-slate-500">
                      {row.winnerSiglas} · margen {row.margin.toLocaleString()}
                    </p>
                  </div>
                  <Badge className={`border ${getPriorityBadgeClass(tier)}`}>
                    {tier}
                  </Badge>
                </div>
                <div className="mt-4 space-y-1 text-[11px] font-medium text-slate-600">
                  <div className="flex justify-between">
                    <span>Score</span>
                    <span className="font-black text-slate-900">{score}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>LN</span>
                    <span>{row.listaNominal?.toLocaleString() ?? "N/D"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cobertura</span>
                    <span>
                      {row.coberturaPct == null
                        ? "Sin meta"
                        : `${row.coberturaPct.toFixed(0)}%`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Promotor</span>
                    <span>{row.promotor ?? "No"}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleToggleObjective(row)}
                  disabled={isPending && pendingObjectiveSection === row.seccionNumero}
                  className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                >
                  {pendingObjectiveSection === row.seccionNumero
                    ? "Guardando..."
                    : row.isObjective
                    ? "Quitar objetivo"
                    : "Guardar objetivo"}
                </button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-sm font-black uppercase tracking-widest">
                Objetivos Tácticos Guardados
              </CardTitle>
              <CardDescription className="text-xs font-medium text-slate-500">
                Vista consolidada municipal de secciones marcadas para seguimiento operativo.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border border-rose-100 bg-rose-50 text-rose-700">
                Crítica {savedObjectiveSummary.critica}
              </Badge>
              <Badge className="border border-amber-100 bg-amber-50 text-amber-700">
                Alta {savedObjectiveSummary.alta}
              </Badge>
              <Badge className="border border-blue-100 bg-blue-50 text-blue-700">
                Media {savedObjectiveSummary.media}
              </Badge>
              <Badge className="border border-emerald-100 bg-emerald-50 text-emerald-700">
                Baja {savedObjectiveSummary.baja}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {savedObjectiveSections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm font-medium text-slate-500">
              No hay secciones objetivo guardadas todavía.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {savedObjectiveSections.map((row) => {
                const score = getPriorityScore(row);
                const tier = getPriorityTier(score);
                return (
                  <div
                    key={`saved-objective-${row.id}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-base font-black text-slate-900">
                          Sección {row.seccionNumero}
                        </p>
                        <p className="text-[11px] font-medium text-slate-500">
                          {row.winnerSiglas} · margen {row.margin.toLocaleString()} · score {score}
                        </p>
                      </div>
                      <Badge className={`border ${getPriorityBadgeClass(tier)}`}>
                        {tier}
                      </Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-[11px] font-medium text-slate-600">
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-[10px] font-black uppercase text-slate-400">Promotor</p>
                        <p className="mt-1 font-black text-slate-800">{row.promotor ?? "Sin promotor"}</p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-[10px] font-black uppercase text-slate-400">Cobertura</p>
                        <p className="mt-1 font-black text-slate-800">
                          {row.coberturaPct == null ? "Sin meta" : `${row.coberturaPct.toFixed(0)}%`}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-[10px] font-black uppercase text-slate-400">LN</p>
                        <p className="mt-1 font-black text-slate-800">
                          {row.listaNominal?.toLocaleString() ?? "N/D"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-white px-3 py-2">
                        <p className="text-[10px] font-black uppercase text-slate-400">Último mov.</p>
                        <p className="mt-1 font-black text-slate-800">
                          {row.ultimoMovimiento ?? "N/D"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/admin/estructura/${municipioId}?seccion=${row.seccionNumero}`}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                      >
                        Ver estructura
                      </Link>
                      <Link
                        href={`/campo/secciones/${municipioId}?seccion=${row.seccionNumero}`}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
                      >
                        Ir a campo
                      </Link>
                      <button
                        onClick={() => handleToggleObjective(row)}
                        disabled={isPending && pendingObjectiveSection === row.seccionNumero}
                        className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[10px] font-black uppercase text-slate-700 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                      >
                        {pendingObjectiveSection === row.seccionNumero
                          ? "Procesando..."
                          : "Quitar"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {seccionalSummary && sections.year && (
        <div className="space-y-3 pt-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-base font-black uppercase tracking-tighter text-slate-700">
                <Layers3 className="h-4 w-4" /> Resumen Seccional {sections.year}
              </h3>
              <p className="mt-0.5 text-xs font-medium text-slate-400">
                Vista agregada del comportamiento seccional municipal.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="border-none bg-slate-100 text-slate-800">
                Año {sections.year}
              </Badge>
              <Badge className="border-none bg-blue-50 text-blue-700">
                {sections.totalSections} secciones
              </Badge>
              <Badge className="border-none bg-emerald-50 text-emerald-700">
                {sections.totalValidVotes.toLocaleString()} válidos
              </Badge>
              {seccionalSummary.participacion && (
                <Badge className="border-none bg-amber-50 text-amber-700">
                  {seccionalSummary.participacion}% participación
                </Badge>
              )}
              <Badge className="border border-rose-100 bg-rose-50 text-rose-700">
                {seccionalSummary.competitivas} competidas
              </Badge>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Fuerza Dominante
                </p>
                <p className="mt-2 text-3xl font-black text-slate-900">
                  {seccionalSummary.dominantForce}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {seccionalSummary.dominantCount} de {sections.totalSections} secciones
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Votos Válidos
                </p>
                <p className="mt-2 text-3xl font-black text-slate-900">
                  {sections.totalValidVotes.toLocaleString()}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {sections.totalVotes.toLocaleString()} totales
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Participación
                </p>
                <p className="mt-2 text-3xl font-black text-slate-900">
                  {seccionalSummary.participacion
                    ? `${seccionalSummary.participacion}%`
                    : "N/D"}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {seccionalSummary.totalLN > 0
                    ? `LN ${seccionalSummary.totalLN.toLocaleString()}`
                    : "Sin lista nominal"}
                </p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Secciones Competidas
                </p>
                <p className="mt-2 text-3xl font-black text-rose-600">
                  {seccionalSummary.competitivas}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  margen {"<"} 300 votos
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {sections.rows.length === 0 ? (
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-6 text-sm font-medium text-slate-500">
            No hay registros por sección disponibles para este municipio.
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-xl">
          <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardTitle className="text-lg font-black uppercase tracking-tight">
                  Secciones del Municipio
                </CardTitle>
                <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Ganador seccional, volumen de votos y concentración de fuerzas
                </CardDescription>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Buscar sección o fuerza"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-300 sm:w-56"
                  />
                </label>
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-300"
                >
                  <option value="priority_desc">Mayor prioridad</option>
                  <option value="margin_asc">Margen más cerrado</option>
                  <option value="validos_desc">Más votos válidos</option>
                  <option value="margin_desc">Mayor margen</option>
                  <option value="winner_asc">Ganador A-Z</option>
                  <option value="seccion_asc">Sección ascendente</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-b border-slate-100 bg-slate-50/40 px-6 py-3 text-[11px] font-bold text-slate-500">
              Mostrando {filteredRows.length} de {sections.rows.length} secciones
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px]">
                <thead className="bg-slate-50/80">
                  <tr className="border-b border-slate-100">
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Sección
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Ganador
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Top Fuerzas
                    </th>
                    <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Operación
                    </th>
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Prioridad
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Válidos
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Total
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Margen
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Casillas
                    </th>
                    <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                      LN
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((section) => {
                    const score = getPriorityScore(section);
                    const tier = getPriorityTier(score);
                    const rowAccent =
                      tier === "critica"
                        ? "bg-rose-50/40"
                        : tier === "alta"
                        ? "bg-amber-50/30"
                        : "";

                    return (
                      <tr
                        key={section.id}
                        className={`border-b border-slate-100 align-top transition-colors hover:bg-slate-50/60 ${rowAccent}`}
                      >
                        <td className="px-4 py-4">
                          <div className="font-black text-slate-900">
                            {section.seccionNumero}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge
                              variant="outline"
                              className="border-slate-200 bg-white text-[10px] font-black text-slate-600"
                            >
                              <Layers3 className="mr-1 h-3 w-3" />
                              MEC {section.actasCasillaMec}
                            </Badge>
                            <Link
                              href={`/admin/estructura/${municipioId}?seccion=${section.seccionNumero}`}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                            >
                              Estructura
                            </Link>
                            <Link
                              href={`/campo/secciones/${municipioId}?seccion=${section.seccionNumero}`}
                              className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-black text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                            >
                              Campo
                            </Link>
                            {section.isObjective && (
                              <Badge className="border border-amber-100 bg-amber-50 text-[10px] font-black uppercase text-amber-700">
                                Objetivo
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="font-black uppercase text-slate-900">
                            {section.winnerSiglas}
                          </div>
                          <div className="mt-1 text-[11px] font-bold text-slate-500">
                            {section.winnerVotes.toLocaleString()} votos
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            {section.topForces.length === 0 ? (
                              <span className="text-[11px] font-medium italic text-slate-400">
                                Sin detalle
                              </span>
                            ) : (
                              section.topForces.map((force, index) => (
                                <div
                                  key={`${section.id}-${force.siglas}`}
                                  className="flex items-center justify-between gap-4"
                                >
                                  <div className="flex items-center gap-2">
                                    {index === 0 ? (
                                      <Trophy className="h-3 w-3 text-amber-500" />
                                    ) : (
                                      <Vote className="h-3 w-3 text-slate-300" />
                                    )}
                                    <span className="text-[11px] font-black uppercase text-slate-700">
                                      {force.siglas}
                                    </span>
                                  </div>
                                  <span className="text-[11px] font-black text-slate-500">
                                    {force.votes.toLocaleString()}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-2">
                            <div className="text-[11px] font-black text-slate-800">
                              {section.promotor ?? "Sin promotor"}
                            </div>
                            <div className="text-[11px] font-medium text-slate-500">
                              {section.coberturaMeta > 0
                                ? `${section.coberturaCompromisos.toLocaleString()} / ${section.coberturaMeta.toLocaleString()}`
                                : `${section.coberturaCompromisos.toLocaleString()} compromisos`}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Badge
                                variant="outline"
                                className="border-slate-200 bg-white text-[10px] font-black text-slate-600"
                              >
                                {section.coberturaPct == null
                                  ? "Sin meta"
                                  : `${section.coberturaPct.toFixed(0)}% cobertura`}
                              </Badge>
                              {section.ultimoMovimiento && (
                                <Badge
                                  variant="outline"
                                  className="border-slate-200 bg-white text-[10px] font-black text-slate-600"
                                >
                                  {section.ultimoMovimiento}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <div className="flex flex-col items-center gap-2">
                            <Badge
                              className={`border ${getPriorityBadgeClass(tier)}`}
                            >
                              {tier}
                            </Badge>
                            <span className="text-xs font-black text-slate-700">
                              {score}
                            </span>
                            <button
                              onClick={() => handleToggleObjective(section)}
                              disabled={isPending && pendingObjectiveSection === section.seccionNumero}
                              className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:opacity-50"
                            >
                              {pendingObjectiveSection === section.seccionNumero
                                ? "..."
                                : section.isObjective
                                ? "Quitar"
                                : "Guardar"}
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-black text-slate-900">
                          {section.votosValidos.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-black text-slate-700">
                          {section.totalVotos.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-700">
                            {section.margin.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-black text-slate-700">
                          {section.casillas.toLocaleString()}
                        </td>
                        <td className="px-4 py-4 text-right text-sm font-black text-slate-500">
                          {section.listaNominal?.toLocaleString() ?? "N/D"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
