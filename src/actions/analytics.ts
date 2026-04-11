"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";

// ---------------------------------------------------------------------------
// Auth guard
// ---------------------------------------------------------------------------
async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || (usuario.rol !== "director" && usuario.rol !== "admin")) {
    redirect("/login");
  }
}

// ---------------------------------------------------------------------------
// Types & DTOs
// ---------------------------------------------------------------------------

export type HistorialAnalyticsDTO = {
  kpis: {
    totalRecords: number;
    totalMunicipios: number;
    totalActiveYears: number;
    mostWinningParty: { siglas: string; color: string; count: number };
  };
  winsByParty: { id: number; siglas: string; color: string; wins: number }[];
  trendByYear: { year: number; count: number }[];
  competitiveMunicipios: { id: number; nombre: string; avgMargin: number; elections: number }[];
  volatileMunicipios: { id: number; nombre: string; changes: number; totalElections: number }[];
  dataQuality: {
    counts: {
      orphans: number;
      winnerMissing: number;
      voteMismatch: number;
      zeroDetail: number;
    };
    samples: {
      id: number;
      municipio: string;
      anio: number;
      issue: string;
    }[];
  };
};

export type MunicipioAnalyticsDTO = {
  summary: {
    nombre: string;
    totalElections: number;
    lastWinner: string;
    alternationRate: number;
    avgCompetitiveness: number;
  };
  timeline: {
    id: number;
    anio: number;
    winner: string;
    winnerSiglas: string;
    winnerColor: string;
    votos: number;
    porcentaje: number;
    margin: number;
    topParties: { siglas: string; votes: number }[];
  }[];
};

export type MapAnalyticsDTO = {
  municipio_id: number;
  geo_municipio_id: number | null; // ID oficial del mapa (INEGI/Edomex)
  municipio_nombre: string;
  partido_ganador_id: number | null;
  partido_siglas: string | null;
  partido_color: string | null;
  anio: number;
  votos_ganador: number;
  porcentaje_ganador: number;
  alternancia_count: number;
  margin: number;
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function getHistorialAnalytics(): Promise<HistorialAnalyticsDTO> {
  await assertAdmin();
  const service = createServiceClient();

  const { data: historial } = await service
    .from("historial_electoral")
    .select(`
      id, municipio_id, anio, partido_ganador_id, votos_ganador, porcentaje_ganador,
      municipios(id, nombre),
      partido_ganador:partidos(id, siglas, nombre, color)
    `)
    .order("anio", { ascending: false });

  if (!historial) throw new Error("Error al cargar historial para analítica");

  const { data: results } = await service
    .from("historial_electoral_resultados")
    .select("historial_id, partido_id, votos")
    .order("votos", { ascending: false });

  const resultsMap = new Map<number, any[]>();
  results?.forEach(r => {
    const list = resultsMap.get(r.historial_id) || [];
    list.push(r);
    resultsMap.set(r.historial_id, list);
  });

  const partyWins = new Map<number, { id: number; siglas: string; color: string; wins: number }>();
  historial.forEach(h => {
    if (!h.partido_ganador) return;
    const p = h.partido_ganador as any;
    const current = partyWins.get(p.id) || { id: p.id, siglas: p.siglas, color: p.color, wins: 0 };
    partyWins.set(p.id, { ...current, wins: current.wins + 1 });
  });

  const sortedWins = Array.from(partyWins.values()).sort((a, b) => b.wins - a.wins);

  const years = new Map<number, number>();
  historial.forEach(h => years.set(h.anio, (years.get(h.anio) || 0) + 1));
  const trend = Array.from(years.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);

  const munData = new Map<number, {
    id: number;
    nombre: string;
    margins: number[];
    winners: number[];
    electionYears: number[]
  }>();

  let orphans = 0;
  let winnerMissing = 0;
  let voteMismatch = 0;
  let zeroDetail = 0;
  const samples: HistorialAnalyticsDTO["dataQuality"]["samples"] = [];

  historial.forEach(h => {
    const mun = h.municipios as any;
    const current = munData.get(h.municipio_id) || {
      id: h.municipio_id,
      nombre: mun?.nombre || "N/A",
      margins: [],
      winners: [],
      electionYears: []
    };
    current.winners.push(h.partido_ganador_id!);
    current.electionYears.push(h.anio);

    const detail = resultsMap.get(h.id) || [];
    if (detail.length === 0) {
      orphans++;
      if (samples.length < 5) samples.push({ id: h.id, municipio: current.nombre, anio: h.anio, issue: "Sin desglose relacional" });
    } else {
      if (detail.length >= 2) {
        current.margins.push(detail[0].votos - detail[1].votos);
      }
      const winnerInResults = detail.find(d => d.partido_id === h.partido_ganador_id);
      const totalDetailVotes = detail.reduce((acc, curr) => acc + curr.votos, 0);

      if (totalDetailVotes === 0) {
        zeroDetail++;
        if (samples.length < 5) samples.push({ id: h.id, municipio: current.nombre, anio: h.anio, issue: "Suma detallada en cero" });
      }

      if (!winnerInResults) {
        winnerMissing++;
        if (samples.length < 5) samples.push({ id: h.id, municipio: current.nombre, anio: h.anio, issue: "Ganador no hallado en desglose" });
      } else if (winnerInResults.votos !== h.votos_ganador) {
        voteMismatch++;
        if (samples.length < 5) samples.push({ id: h.id, municipio: current.nombre, anio: h.anio, issue: "Inconsistencia de votos" });
      }
    }
    munData.set(h.municipio_id, current);
  });

  const volatile = Array.from(munData.values())
    .map(m => {
      const sorted = m.winners.map((w, i) => ({ w, y: m.electionYears[i] })).sort((a, b) => a.y - b.y);
      let changes = 0;
      for (let i = 1; i < sorted.length; i++) if (sorted[i].w !== sorted[i - 1].w) changes++;
      return { id: m.id, nombre: m.nombre, changes, totalElections: m.electionYears.length };
    })
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 5);

  const competitive = Array.from(munData.values())
    .filter(m => m.margins.length > 0)
    .map(m => ({
      id: m.id,
      nombre: m.nombre,
      avgMargin: m.margins.reduce((a, b) => a + b, 0) / m.margins.length,
      elections: m.margins.length
    }))
    .sort((a, b) => a.avgMargin - b.avgMargin)
    .slice(0, 5);

  return {
    kpis: {
      totalRecords: historial.length,
      totalMunicipios: munData.size,
      totalActiveYears: years.size,
      mostWinningParty: {
        siglas: sortedWins[0]?.siglas || "N/A",
        color: sortedWins[0]?.color || "#000",
        count: sortedWins[0]?.wins || 0
      }
    },
    winsByParty: sortedWins.slice(0, 10),
    trendByYear: trend,
    competitiveMunicipios: competitive,
    volatileMunicipios: volatile,
    dataQuality: {
      counts: { orphans, winnerMissing, voteMismatch, zeroDetail },
      samples
    }
  };
}

export async function getMunicipioHistorialAnalytics(municipioId: number): Promise<MunicipioAnalyticsDTO> {
  await assertAdmin();
  const service = createServiceClient();

  const { data: historial } = await service
    .from("historial_electoral")
    .select(`
      id, anio, votos_ganador, porcentaje_ganador, partido_ganador_id,
      municipios(nombre),
      partidos(siglas, nombre, color)
    `)
    .eq("municipio_id", municipioId)
    .order("anio", { ascending: true });

  if (!historial || historial.length === 0) throw new Error("No se encontraron registros");

  const { data: details } = await service
    .from("historial_electoral_resultados")
    .select(`historial_id, votos, porcentaje, partidos(siglas, color)`)
    .in("historial_id", historial.map(h => h.id))
    .order("votos", { ascending: false });

  const detailsMap = new Map<number, any[]>();
  details?.forEach(d => {
    const list = detailsMap.get(d.historial_id) || [];
    list.push(d);
    detailsMap.set(d.historial_id, list);
  });

  let totalChanges = 0;
  let totalMargin = 0;
  let marginCount = 0;

  const timeline = historial.map((h, i) => {
    const rowDetails = detailsMap.get(h.id) || [];
    let margin = 0;
    if (rowDetails.length >= 2) {
      margin = rowDetails[0].votos - rowDetails[1].votos;
      totalMargin += margin;
      marginCount++;
    }
    if (i > 0 && h.partido_ganador_id !== historial[i - 1].partido_ganador_id) totalChanges++;

    return {
      id: h.id,
      anio: h.anio,
      winner: (h.partidos as any).nombre,
      winnerSiglas: (h.partidos as any).siglas,
      winnerColor: (h.partidos as any).color,
      votos: h.votos_ganador,
      porcentaje: h.porcentaje_ganador,
      margin,
      topParties: rowDetails.slice(0, 3).map(d => ({ siglas: (d.partidos as any).siglas, votes: d.votos }))
    };
  });

  return {
    summary: {
      nombre: (historial[0].municipios as any).nombre,
      totalElections: historial.length,
      lastWinner: (historial[historial.length - 1].partidos as any).siglas,
      alternationRate: totalChanges / (historial.length - 1 || 1),
      avgCompetitiveness: marginCount > 0 ? totalMargin / marginCount : 0
    },
    timeline: timeline.reverse()
  };
}

export async function getAvailableHistorialYears(): Promise<number[]> {
  await assertAdmin();
  const service = createServiceClient();
  const { data, error } = await service
    .from("historial_electoral")
    .select("anio")
    .order("anio", { ascending: false });

  if (error || !data) return [];
  const years = Array.from(new Set(data.map(h => h.anio)));
  return years;
}

export async function getHistorialMapAnalytics(year?: number): Promise<MapAnalyticsDTO[]> {
  await assertAdmin();
  const service = createServiceClient();

  const { data: allHistory } = await service
    .from("historial_electoral")
    .select("municipio_id, anio, partido_ganador_id")
    .order("municipio_id")
    .order("anio", { ascending: true });

  const alternanciaMap = new Map<number, number>();
  if (allHistory) {
    let lastMunId: number | null = null;
    let lastWinnerId: number | null = null;
    allHistory.forEach(h => {
      if (h.municipio_id !== lastMunId) {
        alternanciaMap.set(h.municipio_id, 0);
      } else if (h.partido_ganador_id !== lastWinnerId) {
        alternanciaMap.set(h.municipio_id, (alternanciaMap.get(h.municipio_id) || 0) + 1);
      }
      lastMunId = h.municipio_id;
      lastWinnerId = h.partido_ganador_id;
    });
  }

  let query = service
    .from("historial_electoral")
    .select(`
      id, municipio_id, anio, votos_ganador, porcentaje_ganador, partido_ganador_id,
      municipios(id, nombre, geo_municipio_id),
      partidos!partido_ganador_id(siglas, color),
      resultados:historial_electoral_resultados(votos, partido_id)
    `);

  if (year) query = query.eq("anio", year);

  const { data: historial, error } = await query;
  if (error || !historial) throw new Error(error?.message || "Error al obtener datos de mapa");

  const mapData: MapAnalyticsDTO[] = [];
  const processed = new Set<number>();
  const sorted = [...historial].sort((a, b) => b.anio - a.anio);

  for (const h of sorted) {
    if (!year && processed.has(h.municipio_id)) continue;
    processed.add(h.municipio_id);

    const mun = h.municipios as any;
    const partido = h.partidos as any;
    const resultados = (h.resultados as any[]) || [];
    const sortedRes = [...resultados].sort((a, b) => b.votos - a.votos);
    const margin = sortedRes.length > 1 ? sortedRes[0].votos - sortedRes[1].votos : h.votos_ganador;

    mapData.push({
      municipio_id: h.municipio_id,
      geo_municipio_id: mun?.geo_municipio_id || null,
      municipio_nombre: mun?.nombre || "N/A",
      partido_ganador_id: h.partido_ganador_id,
      partido_siglas: partido?.siglas || "N/A",
      partido_color: partido?.color || "#94a3b8",
      anio: h.anio,
      votos_ganador: h.votos_ganador,
      porcentaje_ganador: h.porcentaje_ganador,
      alternancia_count: alternanciaMap.get(h.municipio_id) || 0,
      margin
    });
  }

  return mapData;
}
