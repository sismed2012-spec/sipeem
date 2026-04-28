"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Search, Trophy, Vote } from "lucide-react";
import type { GubernaturaSeccionalDTO } from "@/actions/analytics";

type Props = {
  data: GubernaturaSeccionalDTO;
  municipalYear: number | null;
  municipalWinnerBySec: Record<number, string>;
};

type SortKey =
  | "seccion_asc"
  | "validos_desc"
  | "margin_desc"
  | "winner_asc"
  | "split_first";

function sortRows(
  rows: GubernaturaSeccionalDTO["rows"],
  sortKey: SortKey,
  munMap: Record<number, string>
) {
  return [...rows].sort((a, b) => {
    if (sortKey === "validos_desc")
      return b.numVotosValidos - a.numVotosValidos || a.seccionNumero - b.seccionNumero;
    if (sortKey === "margin_desc")
      return b.margin - a.margin || b.numVotosValidos - a.numVotosValidos;
    if (sortKey === "winner_asc")
      return (a.winnerFuerza ?? "").localeCompare(b.winnerFuerza ?? "") || a.seccionNumero - b.seccionNumero;
    if (sortKey === "split_first") {
      const aAligned = a.winnerFuerza === (munMap[a.seccionNumero] ?? null);
      const bAligned = b.winnerFuerza === (munMap[b.seccionNumero] ?? null);
      if (!aAligned && bAligned) return -1;
      if (aAligned && !bAligned) return 1;
      return b.numVotosValidos - a.numVotosValidos;
    }
    return a.seccionNumero - b.seccionNumero;
  });
}

export default function GubernaturaSeccionalPanel({
  data,
  municipalYear,
  municipalWinnerBySec,
}: Props) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("seccion_asc");
  const deferredQuery = useDeferredValue(query.trim().toUpperCase());

  const crossRefAvailable = Object.keys(municipalWinnerBySec).length > 0;

  const filteredRows = useMemo(() => {
    const base = !deferredQuery
      ? data.rows
      : data.rows.filter((row) => {
          const hay = [
            String(row.seccionNumero),
            row.winnerFuerza ?? "",
            ...row.topFuerzas.map((f) => f.fuerza),
          ]
            .join(" ")
            .toUpperCase();
          return hay.includes(deferredQuery);
        });
    return sortRows(base, sortKey, municipalWinnerBySec);
  }, [deferredQuery, data.rows, sortKey, municipalWinnerBySec]);

  const splitCount = useMemo(
    () =>
      data.rows.filter(
        (r) =>
          r.winnerFuerza !== null &&
          municipalWinnerBySec[r.seccionNumero] !== undefined &&
          r.winnerFuerza !== municipalWinnerBySec[r.seccionNumero]
      ).length,
    [data.rows, municipalWinnerBySec]
  );

  const participacionGlobal =
    data.totalListaNominal > 0
      ? ((data.totalVotes / data.totalListaNominal) * 100).toFixed(1)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-black uppercase tracking-tighter text-slate-800">
            <Vote className="h-5 w-5" /> Gubernatura 2023 — Detalle Seccional
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Distribución de fuerzas por sección en la elección de Gobernador.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge className="border-none bg-slate-100 text-slate-800">
            Año {data.year}
          </Badge>
          <Badge className="border-none bg-blue-50 text-blue-700">
            {data.totalSections} secciones
          </Badge>
          <Badge className="border-none bg-emerald-50 text-emerald-700">
            {data.totalValidVotes.toLocaleString()} válidos
          </Badge>
          {participacionGlobal && (
            <Badge className="border-none bg-amber-50 text-amber-700">
              {participacionGlobal}% participación
            </Badge>
          )}
          {crossRefAvailable && (
            <Badge className="border border-rose-100 bg-rose-50 text-rose-700">
              {splitCount} voto cruzado
            </Badge>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Ganador en Municipio
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {data.overallWinner ?? "N/D"}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              Gubernatura 2023
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Votos Válidos
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {data.totalValidVotes.toLocaleString()}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {data.totalVotes.toLocaleString()} totales
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Participación
            </p>
            <p className="mt-2 text-3xl font-black text-slate-900">
              {participacionGlobal ? `${participacionGlobal}%` : "N/D"}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {data.totalListaNominal > 0
                ? `LN ${data.totalListaNominal.toLocaleString()}`
                : "Sin lista nominal"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Voto Cruzado
            </p>
            {crossRefAvailable ? (
              <>
                <p className="mt-2 text-3xl font-black text-rose-600">
                  {splitCount}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  secciones vs Mun. {municipalYear}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-3xl font-black text-slate-300">—</p>
                <p className="mt-1 text-xs font-medium text-slate-400">
                  Sin referencia municipal
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden rounded-2xl border-slate-200 bg-white shadow-xl">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <CardTitle className="text-lg font-black uppercase tracking-tight">
                Resultados por Sección
              </CardTitle>
              <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                Gubernatura 2023
                {crossRefAvailable
                  ? ` · comparado con Municipal ${municipalYear}`
                  : " · sin referencia municipal seccional"}
              </CardDescription>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar sección o fuerza"
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-300 sm:w-56"
                />
              </label>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-300"
              >
                <option value="seccion_asc">Sección ↑</option>
                <option value="validos_desc">Más votos válidos</option>
                <option value="margin_desc">Mayor margen</option>
                <option value="winner_asc">Ganador A-Z</option>
                {crossRefAvailable && (
                  <option value="split_first">Voto cruzado primero</option>
                )}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border-b border-slate-100 bg-slate-50/40 px-6 py-3 text-[11px] font-bold text-slate-500">
            Mostrando {filteredRows.length} de {data.rows.length} secciones
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead className="bg-slate-50/80">
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Sección
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Ganador Gub. 2023
                  </th>
                  <th className="px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Top Fuerzas
                  </th>
                  {crossRefAvailable && (
                    <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                      Mun. {municipalYear}
                    </th>
                  )}
                  <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Válidos
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Margen
                  </th>
                  <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-widest text-slate-500">
                    LN
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const munWinner = municipalWinnerBySec[row.seccionNumero];
                  const isSplit =
                    row.winnerFuerza !== null &&
                    munWinner !== undefined &&
                    row.winnerFuerza !== munWinner;
                  const hasRef = munWinner !== undefined;

                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-100 align-top transition-colors hover:bg-slate-50/60 ${
                        isSplit ? "bg-rose-50/20" : ""
                      }`}
                    >
                      <td className="px-4 py-4">
                        <div className="font-black text-slate-900">
                          {row.seccionNumero}
                        </div>
                        <div className="mt-1 text-[10px] font-bold text-slate-400">
                          {row.casillas} casilla{row.casillas !== 1 ? "s" : ""}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <Trophy className="h-3 w-3 shrink-0 text-amber-500" />
                          <div>
                            <div className="font-black uppercase text-slate-900">
                              {row.winnerFuerza ?? "N/D"}
                            </div>
                            <div className="text-[11px] font-bold text-slate-500">
                              {row.winnerVotos.toLocaleString()} v.
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          {row.topFuerzas.map((f, i) => (
                            <div
                              key={f.fuerza}
                              className="flex items-center justify-between gap-4"
                            >
                              <div className="flex items-center gap-1.5">
                                {i === 0 ? (
                                  <Trophy className="h-3 w-3 text-amber-500" />
                                ) : (
                                  <Vote className="h-3 w-3 text-slate-300" />
                                )}
                                <span className="text-[11px] font-black uppercase text-slate-700">
                                  {f.fuerza}
                                </span>
                              </div>
                              <span className="text-[11px] font-black text-slate-500">
                                {f.votos.toLocaleString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                      {crossRefAvailable && (
                        <td className="px-4 py-4 text-center">
                          {hasRef ? (
                            <div className="space-y-1">
                              <div className="text-[11px] font-black uppercase text-slate-700">
                                {munWinner}
                              </div>
                              <Badge
                                className={`border text-[10px] ${
                                  isSplit
                                    ? "border-rose-100 bg-rose-50 text-rose-700"
                                    : "border-emerald-100 bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {isSplit ? "Cruzado" : "Alineado"}
                              </Badge>
                            </div>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-300">
                              —
                            </span>
                          )}
                        </td>
                      )}
                      <td className="px-4 py-4 text-right text-sm font-black text-slate-900">
                        {row.numVotosValidos.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="inline-flex rounded-full bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-700">
                          {row.margin.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-black text-slate-500">
                        {row.listaNominal?.toLocaleString() ?? "N/D"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
