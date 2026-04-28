"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { getFuerzaCatalogSeed } from "@/lib/historial-seccion-consolidation";
import {
  mergeMunicipioTimelineEvents,
  type MunicipioTimelineEvent,
} from "@/lib/municipio-analytics";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || (usuario.rol !== "director" && usuario.rol !== "admin")) {
    redirect("/login");
  }
}

export type HistorialAnalyticsDTO = {
  kpis: {
    totalRecords: number;
    totalMunicipios: number;
    totalActiveYears: number;
    mostWinningParty: { siglas: string; color: string; count: number };
  };
  winsByParty: { id: number; siglas: string; color: string; wins: number }[];
  trendByYear: { year: number; count: number }[];
  competitiveMunicipios: {
    id: number;
    nombre: string;
    avgMargin: number;
    elections: number;
  }[];
  volatileMunicipios: {
    id: number;
    nombre: string;
    changes: number;
    totalElections: number;
  }[];
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
  tacticalObjectives: {
    filters: {
      priority: string | null;
      status: string | null;
      municipioId: number | null;
      year: number | null;
    };
    filterOptions: {
      priorities: string[];
      statuses: string[];
      years: number[];
      municipios: { id: number; nombre: string }[];
    };
    counts: {
      total: number;
      criticas: number;
      altas: number;
      municipios: number;
      pendientes: number;
      atendidas: number;
    };
    topMunicipios: {
      municipioId: number;
      nombre: string;
      total: number;
      criticas: number;
    }[];
    topSecciones: {
      id: number;
      municipioId: number;
      municipio: string;
      seccionNumero: number | null;
      prioridad: string;
      estatus: string;
      score: number | null;
      anio: number | null;
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
    source: "oficial_municipal" | "legacy_municipal" | "mixto";
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
  sections: {
    year: number | null;
    availableYears: number[];
    totalSections: number;
    totalValidVotes: number;
    totalVotes: number;
    rows: {
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
    }[];
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
  gubernatura2023: GubernaturaSeccionalDTO | null;
  timeline: {
    id: number;
    anio: number;
    winner: string;
    winnerSiglas: string;
    winnerColor: string;
    votos: number;
    porcentaje: number;
    margin: number;
    source:
      | "oficial_municipal"
      | "legacy_municipal"
      | "gubernatura_seccional";
    electionType: "municipal" | "gubernatura";
    topParties: { siglas: string; votes: number; color: string }[];
  }[];
};

export type MapAnalyticsDTO = {
  municipio_id: number;
  geo_municipio_id: number | null;
  municipio_nombre: string;
  partido_ganador_id: number | null;
  partido_siglas: string | null;
  partido_color: string | null;
  anio: number;
  votos_ganador: number;
  porcentaje_ganador: number;
  alternancia_count: number;
  margin: number;
  source: "oficial_municipal" | "legacy_municipal";
  consistency_status:
    | "sin_detalle_seccional"
    | "consistente"
    | "casi_consistente"
    | "inconsistente";
  diff_validos: number | null;
};

type PartyCatalogEntry = {
  id: number | null;
  siglas: string;
  nombre: string;
  color: string;
};

type UnifiedRecord = {
  id: number;
  source: "oficial_municipal" | "legacy_municipal";
  municipio_id: number;
  municipio_nombre: string;
  geo_municipio_id: number | null;
  anio: number;
  winner_siglas: string | null;
  winner_party_id: number | null;
  winner_name: string;
  winner_color: string;
  winner_votes: number;
  winner_pct: number;
  resultados: {
    siglas: string;
    votos: number;
    color: string;
  }[];
  margin: number;
};

type LegacyHeaderRow = {
  id: number;
  municipio_id: number;
  anio: number;
  partido_ganador_id: number | null;
  votos_ganador: number;
  porcentaje_ganador: number;
  municipios:
    | { id: number; nombre: string; geo_municipio_id?: number | null }
    | { id: number; nombre: string; geo_municipio_id?: number | null }[]
    | null;
  partido_ganador:
    | { id: number; siglas: string; nombre: string; color: string }
    | { id: number; siglas: string; nombre: string; color: string }[]
    | null;
};

type LegacyResultRow = {
  historial_id: number;
  votos: number | null;
  partido_id: number | null;
  partido:
    | { id: number; siglas: string; nombre: string; color: string }
    | { id: number; siglas: string; nombre: string; color: string }[]
    | null;
};

type OfficialHeaderRow = {
  id: number;
  municipio_id: number;
  anio: number;
  ganador_siglas: string | null;
  ganador_votacion: number;
  ganador_porcentaje: number;
  margen_votos: number;
  municipios:
    | { id: number; nombre: string; geo_municipio_id?: number | null }
    | { id: number; nombre: string; geo_municipio_id?: number | null }[]
    | null;
};

type OfficialResultRow = {
  historial_municipal_id: number;
  fuerza: string;
  votos: number | null;
};

type SeccionalHeaderRow = {
  id: number;
  anio: number;
  seccion_numero: number;
  casillas: number | null;
  actas_casilla_mec: number | null;
  lista_nominal: number | null;
  num_votos_validos: number | null;
  num_votos_can_nreg: number | null;
  num_votos_nulos: number | null;
  total_votos: number | null;
};

type SeccionalResultRow = {
  historial_seccion_id: number;
  fuerza: string;
  votos: number | null;
};

type EstructuraSeccionRow = {
  id: number;
  numero: number;
  meta: number | null;
  promotores: { nombre: string }[] | null;
};

type CoberturaRow = {
  seccion_id: number;
  compromisos: number;
  meta: number;
  fecha: string;
};

type ObjetivoRow = {
  id: number;
  seccion_id: number;
};

type GlobalObjetivoRow = {
  id: number;
  municipio_id: number;
  prioridad: string;
  estatus: string;
  score_snapshot: number | null;
  anio: number | null;
  municipios:
    | { nombre: string }
    | { nombre: string }[]
    | null;
  secciones:
    | { numero: number | null }
    | { numero: number | null }[]
    | null;
};

type TacticalObjectiveFilters = {
  priority?: string;
  status?: string;
  municipioId?: number;
  year?: number;
};

type PromotorRow = {
  activo: boolean | null;
};

type IncidenciaRow = {
  fecha: string;
  severidad: "baja" | "media" | "alta" | "critica";
  estatus: "abierta" | "en_seguimiento" | "resuelta";
};

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function buildPartyCatalog(data: PartyCatalogEntry[]) {
  const map = new Map<string, PartyCatalogEntry>();
  data.forEach((party) => {
    map.set(party.siglas, party);
  });
  return map;
}

function getPartyMeta(
  catalog: Map<string, PartyCatalogEntry>,
  siglas: string | null
): PartyCatalogEntry {
  if (!siglas) {
    return {
      id: null,
      siglas: "N/A",
      nombre: "N/A",
      color: "#94a3b8",
    };
  }

  return (
    catalog.get(siglas) ?? {
      id: null,
      siglas,
      nombre: siglas,
      color: "#94a3b8",
    }
  );
}

function sortResultados(
  resultados: { siglas: string; votos: number; color: string }[]
) {
  return [...resultados].sort(
    (a, b) => b.votos - a.votos || a.siglas.localeCompare(b.siglas)
  );
}

function mergePreferOfficial(records: UnifiedRecord[]) {
  const merged = new Map<string, UnifiedRecord>();
  for (const record of records) {
    const key = `${record.municipio_id}:${record.anio}`;
    const existing = merged.get(key);
    if (!existing || record.source === "oficial_municipal") {
      merged.set(key, record);
    }
  }
  return Array.from(merged.values());
}

async function loadPartyCatalog(service: ReturnType<typeof createServiceClient>) {
  const { data, error } = await service
    .from("partidos")
    .select("id, siglas, nombre, color");

  if (error) throw new Error(error.message);
  return buildPartyCatalog((data ?? []) as PartyCatalogEntry[]);
}

async function loadLegacyRecords(
  service: ReturnType<typeof createServiceClient>,
  partyCatalog: Map<string, PartyCatalogEntry>,
  filters: { municipioId?: number; year?: number } = {}
): Promise<UnifiedRecord[]> {
  let headerQuery = service
    .from("historial_electoral")
    .select(
      `
      id, municipio_id, anio, partido_ganador_id, votos_ganador, porcentaje_ganador,
      municipios(id, nombre, geo_municipio_id),
      partido_ganador:partidos(id, siglas, nombre, color)
    `
    )
    .order("anio", { ascending: true });

  if (filters.municipioId) headerQuery = headerQuery.eq("municipio_id", filters.municipioId);
  if (filters.year) headerQuery = headerQuery.eq("anio", filters.year);

  const { data: headers, error: headersError } = await headerQuery;
  if (headersError) throw new Error(headersError.message);
  if (!headers || headers.length === 0) return [];

  let resultsQuery = service
    .from("historial_electoral_resultados")
    .select("historial_id, votos, partido_id, partido:partidos(id, siglas, nombre, color)")
    .in(
      "historial_id",
      (headers as LegacyHeaderRow[]).map((header) => header.id)
    );

  const { data: results, error: resultsError } = await resultsQuery;
  if (resultsError) throw new Error(resultsError.message);

  const resultsMap = new Map<number, LegacyResultRow[]>();
  ((results ?? []) as LegacyResultRow[]).forEach((result) => {
    const list = resultsMap.get(result.historial_id) ?? [];
    list.push(result);
    resultsMap.set(result.historial_id, list);
  });

  return (headers as LegacyHeaderRow[]).map((header) => {
    const municipio = normalizeJoin(header.municipios);
    const winnerParty = normalizeJoin(header.partido_ganador);
    const resultados = sortResultados(
      (resultsMap.get(header.id) ?? []).map((result) => {
        const partido = normalizeJoin(result.partido);
        const meta = partido
          ? {
              id: partido.id,
              siglas: partido.siglas,
              nombre: partido.nombre,
              color: partido.color,
            }
          : getPartyMeta(partyCatalog, null);

        return {
          siglas: meta.siglas,
          votos: result.votos ?? 0,
          color: meta.color,
        };
      })
    );

    return {
      id: header.id,
      source: "legacy_municipal",
      municipio_id: header.municipio_id,
      municipio_nombre: municipio?.nombre ?? "N/A",
      geo_municipio_id: municipio?.geo_municipio_id ?? null,
      anio: header.anio,
      winner_siglas: winnerParty?.siglas ?? null,
      winner_party_id: winnerParty?.id ?? header.partido_ganador_id ?? null,
      winner_name: winnerParty?.nombre ?? "N/A",
      winner_color: winnerParty?.color ?? "#94a3b8",
      winner_votes: header.votos_ganador,
      winner_pct: header.porcentaje_ganador,
      resultados,
      margin:
        resultados.length >= 2
          ? Math.max(0, resultados[0].votos - resultados[1].votos)
          : 0,
    } satisfies UnifiedRecord;
  });
}

async function loadOfficialRecords(
  service: ReturnType<typeof createServiceClient>,
  partyCatalog: Map<string, PartyCatalogEntry>,
  filters: { municipioId?: number; year?: number } = {}
): Promise<UnifiedRecord[]> {
  let headerQuery = service
    .from("historial_municipal_oficial")
    .select(
      `
      id, municipio_id, anio, ganador_siglas, ganador_votacion, ganador_porcentaje, margen_votos,
      municipios(id, nombre, geo_municipio_id)
    `
    )
    .order("anio", { ascending: true });

  if (filters.municipioId) headerQuery = headerQuery.eq("municipio_id", filters.municipioId);
  if (filters.year) headerQuery = headerQuery.eq("anio", filters.year);

  const { data: headers, error: headersError } = await headerQuery;
  if (headersError) throw new Error(headersError.message);
  if (!headers || headers.length === 0) return [];

  const { data: results, error: resultsError } = await service
    .from("historial_municipal_oficial_resultados")
    .select("historial_municipal_id, fuerza, votos")
    .in(
      "historial_municipal_id",
      (headers as OfficialHeaderRow[]).map((header) => header.id)
    );

  if (resultsError) throw new Error(resultsError.message);

  const resultsMap = new Map<number, OfficialResultRow[]>();
  ((results ?? []) as OfficialResultRow[]).forEach((result) => {
    const list = resultsMap.get(result.historial_municipal_id) ?? [];
    list.push(result);
    resultsMap.set(result.historial_municipal_id, list);
  });

  return (headers as OfficialHeaderRow[]).map((header) => {
    const municipio = normalizeJoin(header.municipios);
    const winnerParty = getPartyMeta(partyCatalog, header.ganador_siglas);
    const resultados = sortResultados(
      (resultsMap.get(header.id) ?? []).map((result) => {
        const meta = getPartyMeta(partyCatalog, result.fuerza);
        return {
          siglas: meta.siglas,
          votos: result.votos ?? 0,
          color: meta.color,
        };
      })
    );

    return {
      id: header.id,
      source: "oficial_municipal",
      municipio_id: header.municipio_id,
      municipio_nombre: municipio?.nombre ?? "N/A",
      geo_municipio_id: municipio?.geo_municipio_id ?? null,
      anio: header.anio,
      winner_siglas: winnerParty.siglas === "N/A" ? null : winnerParty.siglas,
      winner_party_id: winnerParty.id,
      winner_name: winnerParty.nombre,
      winner_color: winnerParty.color,
      winner_votes: header.ganador_votacion,
      winner_pct: header.ganador_porcentaje,
      resultados,
      margin:
        resultados.length >= 2
          ? Math.max(0, resultados[0].votos - resultados[1].votos)
          : header.margen_votos,
    } satisfies UnifiedRecord;
  });
}

async function loadUnifiedRecords(
  service: ReturnType<typeof createServiceClient>,
  filters: { municipioId?: number; year?: number } = {}
) {
  const partyCatalog = await loadPartyCatalog(service);
  const [legacy, official] = await Promise.all([
    loadLegacyRecords(service, partyCatalog, filters),
    loadOfficialRecords(service, partyCatalog, filters),
  ]);

  return mergePreferOfficial([...legacy, ...official]).sort(
    (a, b) =>
      a.municipio_id - b.municipio_id ||
      a.anio - b.anio ||
      a.source.localeCompare(b.source)
  );
}

async function getSeccionalConsistency(
  service: ReturnType<typeof createServiceClient>,
  municipioId: number,
  anio: number,
  reference: { resultados: { siglas: string; votos: number }[] }
): Promise<{
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
}> {
  const [headerRes, resultRes] = await Promise.all([
    service
      .from("historial_seccion_electoral")
      .select("num_votos_validos, total_votos")
      .eq("municipio_id", municipioId)
      .eq("anio", anio),
    service
      .from("historial_seccion_resultados")
      .select(
        "fuerza, votos, historial_seccion_electoral!inner(municipio_id, anio)"
      )
      .eq("historial_seccion_electoral.municipio_id", municipioId)
      .eq("historial_seccion_electoral.anio", anio),
  ]);

  if (headerRes.error || resultRes.error || !headerRes.data || headerRes.data.length === 0) {
    return {
      status: "sin_detalle_seccional",
      comparedYear: null,
      officialValidos: null,
      seccionalValidos: null,
      diffValidos: null,
      diffTotal: null,
    };
  }

  const validos = headerRes.data.reduce(
    (sum, row) => sum + (row.num_votos_validos ?? 0),
    0
  );
  const officialValidos = reference.resultados.reduce(
    (sum, row) => sum + row.votos,
    0
  );
  const diffValidos = validos - officialValidos;
  const maxDiff = Math.abs(diffValidos);

  return {
    status:
      maxDiff === 0
        ? "consistente"
        : maxDiff <= 5
        ? "casi_consistente"
        : "inconsistente",
    comparedYear: anio,
    officialValidos,
    seccionalValidos: validos,
    diffValidos,
    diffTotal: null,
  };
}

function buildMunicipioGubernaturaTimelineEvent(
  municipioId: number,
  gubernatura: GubernaturaSeccionalDTO | null
): MunicipioTimelineEvent | null {
  if (!gubernatura || gubernatura.rows.length === 0 || !gubernatura.overallWinner) {
    return null;
  }

  const sortedTotals = [...gubernatura.forceTotals].sort(
    (a, b) => b.votos - a.votos || a.fuerza.localeCompare(b.fuerza)
  );
  const winnerSiglas = gubernatura.overallWinner;
  const winnerMeta = getFuerzaCatalogSeed(winnerSiglas);
  const winnerVotes =
    sortedTotals.find((entry) => entry.fuerza === winnerSiglas)?.votos ?? 0;
  const secondVotes =
    sortedTotals.find((entry) => entry.fuerza !== winnerSiglas)?.votos ?? 0;

  return {
    id: 202300000 + municipioId,
    anio: 2023,
    winner: winnerMeta.nombre,
    winnerSiglas,
    winnerColor: winnerMeta.color,
    votos: winnerVotes,
    porcentaje:
      gubernatura.totalValidVotes > 0
        ? Number(((winnerVotes / gubernatura.totalValidVotes) * 100).toFixed(2))
        : 0,
    margin: Math.max(0, winnerVotes - secondVotes),
    source: "gubernatura_seccional",
    electionType: "gubernatura",
    topParties: sortedTotals.slice(0, 3).map((entry) => ({
      siglas: entry.fuerza,
      votes: entry.votos,
      color: getFuerzaCatalogSeed(entry.fuerza).color,
    })),
  };
}

async function loadMunicipioSectionSnapshot(
  service: ReturnType<typeof createServiceClient>,
  municipioId: number,
  preferredYear?: number
): Promise<MunicipioAnalyticsDTO["sections"]> {
  const { data: headers, error: headersError } = await service
    .from("historial_seccion_electoral")
    .select(
      "id, anio, seccion_numero, casillas, actas_casilla_mec, lista_nominal, num_votos_validos, num_votos_can_nreg, num_votos_nulos, total_votos"
    )
    .eq("municipio_id", municipioId)
    .order("anio", { ascending: false })
    .order("seccion_numero", { ascending: true });

  if (headersError) throw new Error(headersError.message);
  if (!headers || headers.length === 0) {
    return {
      year: null,
      availableYears: [],
      totalSections: 0,
      totalValidVotes: 0,
      totalVotes: 0,
      rows: [],
    };
  }

  const availableYears = Array.from(
    new Set((headers as SeccionalHeaderRow[]).map((row) => row.anio))
  ).sort((a, b) => b - a);
  const targetYear =
    preferredYear && availableYears.includes(preferredYear)
      ? preferredYear
      : availableYears[0];

  const selectedHeaders = (headers as SeccionalHeaderRow[]).filter(
    (row) => row.anio === targetYear
  );

  const selectedNumbers = selectedHeaders.map((row) => row.seccion_numero);

  const [
    { data: results, error: resultsError },
    { data: estructura },
    { data: cobertura },
    { data: objetivos },
  ] =
    await Promise.all([
      service
        .from("historial_seccion_resultados")
        .select("historial_seccion_id, fuerza, votos")
        .in(
          "historial_seccion_id",
          selectedHeaders.map((row) => row.id)
        ),
      service
        .from("secciones")
        .select("id, numero, meta, promotores(nombre)")
        .eq("municipio_id", municipioId)
        .in("numero", selectedNumbers),
      service
        .from("compromisos_seccion")
        .select("seccion_id, compromisos, meta, fecha")
        .eq("municipio_id", municipioId)
        .order("fecha", { ascending: false }),
      service
        .from("secciones_objetivo")
        .select("id, seccion_id")
        .eq("municipio_id", municipioId),
    ]);

  if (resultsError) throw new Error(resultsError.message);

  const resultsByHeaderId = new Map<number, SeccionalResultRow[]>();
  ((results ?? []) as SeccionalResultRow[]).forEach((row) => {
    const list = resultsByHeaderId.get(row.historial_seccion_id) ?? [];
    list.push(row);
    resultsByHeaderId.set(row.historial_seccion_id, list);
  });

  const estructuraByNumero = new Map<number, EstructuraSeccionRow>();
  ((estructura ?? []) as EstructuraSeccionRow[]).forEach((row) => {
    estructuraByNumero.set(row.numero, row);
  });

  const coberturaBySeccionId = new Map<number, CoberturaRow>();
  ((cobertura ?? []) as CoberturaRow[]).forEach((row) => {
    if (!coberturaBySeccionId.has(row.seccion_id)) {
      coberturaBySeccionId.set(row.seccion_id, row);
    }
  });

  const objetivoBySeccionId = new Map<number, ObjetivoRow>();
  ((objetivos ?? []) as ObjetivoRow[]).forEach((row) => {
    objetivoBySeccionId.set(row.seccion_id, row);
  });

  const rows = selectedHeaders.map((row) => {
    const sortedResults = sortResultados(
      (resultsByHeaderId.get(row.id) ?? []).map((result) => ({
        siglas: result.fuerza,
        votos: result.votos ?? 0,
        color: "#94a3b8",
      }))
    );
    const estructuraRow = estructuraByNumero.get(row.seccion_numero);
    const coberturaRow =
      estructuraRow?.id != null
        ? coberturaBySeccionId.get(estructuraRow.id)
        : undefined;
    const objetivoRow =
      estructuraRow?.id != null
        ? objetivoBySeccionId.get(estructuraRow.id)
        : undefined;
    const coberturaPct =
      coberturaRow && coberturaRow.meta > 0
        ? (coberturaRow.compromisos / coberturaRow.meta) * 100
        : null;

    return {
      id: row.id,
      anio: row.anio,
      seccionNumero: row.seccion_numero,
      casillas: row.casillas ?? 0,
      actasCasillaMec: row.actas_casilla_mec ?? 0,
      listaNominal: row.lista_nominal ?? null,
      votosValidos: row.num_votos_validos ?? 0,
      votosNulos: row.num_votos_nulos ?? 0,
      votosNoRegistrados: row.num_votos_can_nreg ?? 0,
      totalVotos: row.total_votos ?? 0,
      winnerSiglas: sortedResults[0]?.siglas ?? "N/A",
      winnerVotes: sortedResults[0]?.votos ?? 0,
      margin:
        sortedResults.length >= 2
          ? Math.max(0, sortedResults[0].votos - sortedResults[1].votos)
          : 0,
      promotor: normalizeJoin(estructuraRow?.promotores)?.nombre ?? null,
      coberturaCompromisos: coberturaRow?.compromisos ?? 0,
      coberturaMeta: coberturaRow?.meta ?? estructuraRow?.meta ?? 0,
      coberturaPct,
      ultimoMovimiento: coberturaRow?.fecha ?? null,
      objetivoId: objetivoRow?.id ?? null,
      isObjective: Boolean(objetivoRow),
      topForces: sortedResults.slice(0, 3).map((result) => ({
        siglas: result.siglas,
        votes: result.votos,
      })),
    };
  });

  return {
    year: targetYear,
    availableYears,
    totalSections: rows.length,
    totalValidVotes: rows.reduce((sum, row) => sum + row.votosValidos, 0),
    totalVotes: rows.reduce((sum, row) => sum + row.totalVotos, 0),
    rows,
  };
}

async function loadMunicipioOperationsSummary(
  service: ReturnType<typeof createServiceClient>,
  municipioId: number
): Promise<MunicipioAnalyticsDTO["operations"]> {
  const [
    { data: promotores },
    { data: incidencias },
    { data: cobertura },
    { count: objetivosGuardados },
  ] =
    await Promise.all([
      service.from("promotores").select("activo").eq("municipio_id", municipioId),
      service
        .from("incidencias")
        .select("fecha, severidad, estatus")
        .eq("municipio_id", municipioId)
        .order("fecha", { ascending: false }),
      service
        .from("compromisos_seccion")
        .select("seccion_id, compromisos, meta, fecha")
        .eq("municipio_id", municipioId)
        .order("fecha", { ascending: false }),
      service
        .from("secciones_objetivo")
        .select("*", { count: "exact", head: true })
        .eq("municipio_id", municipioId),
    ]);

  const promotoresRows = (promotores ?? []) as PromotorRow[];
  const incidenciasRows = (incidencias ?? []) as IncidenciaRow[];
  const coberturaRows = (cobertura ?? []) as CoberturaRow[];

  const seenSecciones = new Set<number>();
  let compromisosCapturados = 0;
  let ultimoMovimientoCobertura: string | null = null;
  for (const row of coberturaRows) {
    if (ultimoMovimientoCobertura == null) {
      ultimoMovimientoCobertura = row.fecha;
    }
    if (seenSecciones.has(row.seccion_id)) continue;
    seenSecciones.add(row.seccion_id);
    compromisosCapturados += row.compromisos ?? 0;
  }

  return {
    promotoresTotal: promotoresRows.length,
    promotoresActivos: promotoresRows.filter((row) => row.activo).length,
    incidenciasTotal: incidenciasRows.length,
    incidenciasAbiertas: incidenciasRows.filter(
      (row) => row.estatus !== "resuelta"
    ).length,
    incidenciasCriticas: incidenciasRows.filter(
      (row) => row.severidad === "critica"
    ).length,
    compromisosCapturados,
    seccionesConCobertura: seenSecciones.size,
    objetivosGuardados: objetivosGuardados ?? 0,
    ultimoMovimientoCobertura,
    ultimaIncidencia: incidenciasRows[0]?.fecha ?? null,
  };
}

function buildAlternanciaMap(records: UnifiedRecord[]) {
  const grouped = new Map<number, UnifiedRecord[]>();
  records.forEach((record) => {
    const list = grouped.get(record.municipio_id) ?? [];
    list.push(record);
    grouped.set(record.municipio_id, list);
  });

  const alternanciaMap = new Map<number, number>();
  grouped.forEach((list, municipioId) => {
    const sorted = [...list].sort((a, b) => a.anio - b.anio);
    let changes = 0;
    for (let index = 1; index < sorted.length; index++) {
      if (sorted[index].winner_siglas !== sorted[index - 1].winner_siglas) {
        changes++;
      }
    }
    alternanciaMap.set(municipioId, changes);
  });

  return alternanciaMap;
}

async function loadGlobalTacticalObjectives(
  service: ReturnType<typeof createServiceClient>,
  filters: TacticalObjectiveFilters = {}
): Promise<HistorialAnalyticsDTO["tacticalObjectives"]> {
  const { data, error } = await service
    .from("secciones_objetivo")
    .select(
      "id, municipio_id, prioridad, estatus, score_snapshot, anio, municipios(nombre), secciones(numero)"
    );

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as GlobalObjetivoRow[];
  const filterOptions = {
    priorities: Array.from(new Set(rows.map((row) => row.prioridad))).sort(),
    statuses: Array.from(new Set(rows.map((row) => row.estatus))).sort(),
    years: Array.from(
      new Set(rows.map((row) => row.anio).filter((year): year is number => year != null))
    ).sort((a, b) => b - a),
    municipios: Array.from(
      new Map(
        rows.map((row) => [
          row.municipio_id,
          {
            id: row.municipio_id,
            nombre:
              normalizeJoin(row.municipios)?.nombre ?? `Municipio ${row.municipio_id}`,
          },
        ])
      ).values()
    ).sort((a, b) => a.nombre.localeCompare(b.nombre)),
  };

  const filteredRows = rows.filter((row) => {
    if (filters.priority && row.prioridad !== filters.priority) return false;
    if (filters.status && row.estatus !== filters.status) return false;
    if (filters.municipioId && row.municipio_id !== filters.municipioId) return false;
    if (filters.year && row.anio !== filters.year) return false;
    return true;
  });

  const byMunicipio = new Map<
    number,
    { municipioId: number; nombre: string; total: number; criticas: number }
  >();

  for (const row of filteredRows) {
    const municipio = normalizeJoin(row.municipios);
    const current = byMunicipio.get(row.municipio_id) ?? {
      municipioId: row.municipio_id,
      nombre: municipio?.nombre ?? `Municipio ${row.municipio_id}`,
      total: 0,
      criticas: 0,
    };
    current.total++;
    if (row.prioridad === "Critica") current.criticas++;
    byMunicipio.set(row.municipio_id, current);
  }

  const priorityWeight = (prioridad: string) =>
    prioridad === "Critica"
      ? 4
      : prioridad === "Alta"
      ? 3
      : prioridad === "Media"
      ? 2
      : 1;

  return {
    filters: {
      priority: filters.priority ?? null,
      status: filters.status ?? null,
      municipioId: filters.municipioId ?? null,
      year: filters.year ?? null,
    },
    filterOptions,
    counts: {
      total: filteredRows.length,
      criticas: filteredRows.filter((row) => row.prioridad === "Critica").length,
      altas: filteredRows.filter((row) => row.prioridad === "Alta").length,
      municipios: byMunicipio.size,
      pendientes: filteredRows.filter((row) => row.estatus === "Pendiente").length,
      atendidas: filteredRows.filter((row) => row.estatus === "Atendida").length,
    },
    topMunicipios: Array.from(byMunicipio.values())
      .sort((a, b) => b.total - a.total || b.criticas - a.criticas)
      .slice(0, 8),
    topSecciones: filteredRows
      .map((row) => ({
        id: row.id,
        municipioId: row.municipio_id,
        municipio:
          normalizeJoin(row.municipios)?.nombre ?? `Municipio ${row.municipio_id}`,
        seccionNumero: normalizeJoin(row.secciones)?.numero ?? null,
        prioridad: row.prioridad,
        estatus: row.estatus,
        score: row.score_snapshot,
        anio: row.anio,
      }))
      .sort(
        (a, b) =>
          priorityWeight(b.prioridad) - priorityWeight(a.prioridad) ||
          (b.score ?? 0) - (a.score ?? 0) ||
          a.municipio.localeCompare(b.municipio)
      )
      .slice(0, 12),
  };
}

export async function getHistorialAnalytics(
  filters: TacticalObjectiveFilters = {}
): Promise<HistorialAnalyticsDTO> {
  await assertAdmin();
  const service = createServiceClient();
  const [records, tacticalObjectives] = await Promise.all([
    loadUnifiedRecords(service),
    loadGlobalTacticalObjectives(service, filters),
  ]);

  const partyWins = new Map<
    string,
    { id: number; siglas: string; color: string; wins: number }
  >();
  const years = new Map<number, number>();
  const munData = new Map<
    number,
    { id: number; nombre: string; margins: number[]; winners: string[]; electionYears: number[] }
  >();

  let orphans = 0;
  let winnerMissing = 0;
  let voteMismatch = 0;
  let zeroDetail = 0;
  const samples: HistorialAnalyticsDTO["dataQuality"]["samples"] = [];

  records.forEach((record) => {
    years.set(record.anio, (years.get(record.anio) || 0) + 1);

    if (record.winner_siglas) {
      const current = partyWins.get(record.winner_siglas) ?? {
        id: record.winner_party_id ?? 0,
        siglas: record.winner_siglas,
        color: record.winner_color,
        wins: 0,
      };
      current.wins++;
      partyWins.set(record.winner_siglas, current);
    }

    const currentMun = munData.get(record.municipio_id) ?? {
      id: record.municipio_id,
      nombre: record.municipio_nombre,
      margins: [],
      winners: [],
      electionYears: [],
    };
    currentMun.margins.push(record.margin);
    currentMun.winners.push(record.winner_siglas ?? "N/A");
    currentMun.electionYears.push(record.anio);
    munData.set(record.municipio_id, currentMun);

    if (record.resultados.length === 0) {
      orphans++;
      if (samples.length < 5) {
        samples.push({
          id: record.id,
          municipio: record.municipio_nombre,
          anio: record.anio,
          issue: "Sin desglose relacional",
        });
      }
      return;
    }

    const totalDetailVotes = record.resultados.reduce(
      (sum, result) => sum + result.votos,
      0
    );
    if (totalDetailVotes === 0) {
      zeroDetail++;
      if (samples.length < 5) {
        samples.push({
          id: record.id,
          municipio: record.municipio_nombre,
          anio: record.anio,
          issue: "Suma detallada en cero",
        });
      }
    }

    const winnerInResults = record.resultados.find(
      (result) => result.siglas === record.winner_siglas
    );
    if (!winnerInResults) {
      winnerMissing++;
      if (samples.length < 5) {
        samples.push({
          id: record.id,
          municipio: record.municipio_nombre,
          anio: record.anio,
          issue: "Ganador no hallado en desglose",
        });
      }
    } else if (winnerInResults.votos !== record.winner_votes) {
      voteMismatch++;
      if (samples.length < 5) {
        samples.push({
          id: record.id,
          municipio: record.municipio_nombre,
          anio: record.anio,
          issue: "Inconsistencia de votos",
        });
      }
    }
  });

  const sortedWins = Array.from(partyWins.values()).sort(
    (a, b) => b.wins - a.wins || a.siglas.localeCompare(b.siglas)
  );

  const trendByYear = Array.from(years.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year - b.year);

  const volatileMunicipios = Array.from(munData.values())
    .map((municipio) => {
      const sorted = municipio.winners
        .map((winner, index) => ({ winner, year: municipio.electionYears[index] }))
        .sort((a, b) => a.year - b.year);

      let changes = 0;
      for (let index = 1; index < sorted.length; index++) {
        if (sorted[index].winner !== sorted[index - 1].winner) changes++;
      }

      return {
        id: municipio.id,
        nombre: municipio.nombre,
        changes,
        totalElections: municipio.electionYears.length,
      };
    })
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 5);

  const competitiveMunicipios = Array.from(munData.values())
    .filter((municipio) => municipio.margins.length > 0)
    .map((municipio) => ({
      id: municipio.id,
      nombre: municipio.nombre,
      avgMargin:
        municipio.margins.reduce((sum, margin) => sum + margin, 0) /
        municipio.margins.length,
      elections: municipio.margins.length,
    }))
    .sort((a, b) => a.avgMargin - b.avgMargin)
    .slice(0, 5);

  return {
    kpis: {
      totalRecords: records.length,
      totalMunicipios: munData.size,
      totalActiveYears: years.size,
      mostWinningParty: {
        siglas: sortedWins[0]?.siglas ?? "N/A",
        color: sortedWins[0]?.color ?? "#94a3b8",
        count: sortedWins[0]?.wins ?? 0,
      },
    },
    winsByParty: sortedWins.slice(0, 10),
    trendByYear,
    competitiveMunicipios,
    volatileMunicipios,
    dataQuality: {
      counts: { orphans, winnerMissing, voteMismatch, zeroDetail },
      samples,
    },
    tacticalObjectives,
  };
}

export async function getMunicipioHistorialAnalytics(
  municipioId: number,
  sectionYear?: number,
  options?: { includeGubernatura?: boolean }
): Promise<MunicipioAnalyticsDTO> {
  await assertAdmin();
  const service = createServiceClient();
  const records = (await loadUnifiedRecords(service, { municipioId })).sort(
    (a, b) => a.anio - b.anio
  );

  if (records.length === 0) throw new Error("No se encontraron registros");

  let totalChanges = 0;
  let totalMargin = 0;

  const municipalTimeline: MunicipioTimelineEvent[] = records.map(
    (record, index) => {
      if (
        index > 0 &&
        record.winner_siglas !== records[index - 1].winner_siglas
      ) {
        totalChanges++;
      }

      totalMargin += record.margin;

      return {
        id: record.id,
        anio: record.anio,
        winner: record.winner_name,
        winnerSiglas: record.winner_siglas ?? "N/A",
        winnerColor: record.winner_color,
        votos: record.winner_votes,
        porcentaje: record.winner_pct,
        margin: record.margin,
        source: record.source,
        electionType: "municipal",
        topParties: record.resultados.slice(0, 3).map((result) => ({
          siglas: result.siglas,
          votes: result.votos,
          color: result.color,
        })),
      };
    }
  );

  const sourceSet = new Set(records.map((record) => record.source));
  const summarySource =
    sourceSet.size > 1
      ? "mixto"
      : (records[0]?.source ?? "legacy_municipal");
  const latestRecord = records[records.length - 1];
  const [consistency, sections, operations, gubernatura2023] = await Promise.all([
    latestRecord
      ? getSeccionalConsistency(service, municipioId, latestRecord.anio, {
          resultados: latestRecord.resultados.map((row) => ({
            siglas: row.siglas,
            votos: row.votos,
          })),
        })
        : Promise.resolve({
          status: "sin_detalle_seccional" as const,
          comparedYear: null,
          officialValidos: null,
          seccionalValidos: null,
          diffValidos: null,
          diffTotal: null,
        }),
    loadMunicipioSectionSnapshot(
      service,
      municipioId,
      sectionYear ?? latestRecord?.anio
    ),
    loadMunicipioOperationsSummary(service, municipioId),
    options?.includeGubernatura
      ? getMunicipioGubernaturaSeccional(municipioId)
      : Promise.resolve(null),
  ]);

  return {
    summary: {
      nombre: records[0].municipio_nombre,
      totalElections: records.length,
      lastWinner: records[records.length - 1].winner_siglas ?? "N/A",
      alternationRate: totalChanges / (records.length - 1 || 1),
      avgCompetitiveness: totalMargin / (records.length || 1),
      source: summarySource,
      consistency,
    },
    sections,
    operations,
    gubernatura2023,
    timeline: mergeMunicipioTimelineEvents({
      municipal: municipalTimeline,
      gubernatura2023: buildMunicipioGubernaturaTimelineEvent(
        municipioId,
        gubernatura2023
      ),
    }),
  };
}

// --- Gubernatura Seccional ---

type GubSeccionRow = {
  id: number;
  seccion_numero: number;
  casillas: number | null;
  lista_nominal: number | null;
  num_votos_validos: number | null;
  num_votos_nulos: number | null;
  num_votos_can_nreg: number | null;
  total_votos: number | null;
};

type GubResultadoRow = {
  historial_seccion_gubernatura_id: number;
  fuerza: string;
  votos: number | null;
};

export type GubernaturaSeccionalDTO = {
  year: number;
  totalSections: number;
  totalValidVotes: number;
  totalVotes: number;
  totalListaNominal: number;
  overallWinner: string | null;
  forceTotals: { fuerza: string; votos: number }[];
  rows: {
    id: number;
    seccionNumero: number;
    casillas: number;
    listaNominal: number | null;
    numVotosValidos: number;
    numVotosNulos: number;
    totalVotos: number;
    winnerFuerza: string | null;
    winnerVotos: number;
    margin: number;
    topFuerzas: { fuerza: string; votos: number }[];
  }[];
};

export async function getMunicipioGubernaturaSeccional(
  municipioId: number
): Promise<GubernaturaSeccionalDTO | null> {
  await assertAdmin();
  const service = createServiceClient();

  const { data: headers, error: headersError } = await service
    .from("historial_seccion_gubernatura")
    .select(
      "id, seccion_numero, casillas, lista_nominal, num_votos_validos, num_votos_nulos, num_votos_can_nreg, total_votos"
    )
    .eq("municipio_id", municipioId)
    .eq("anio", 2023)
    .order("seccion_numero", { ascending: true });

  if (headersError) throw new Error(headersError.message);
  if (!headers || headers.length === 0) return null;

  const { data: resultados, error: resultadosError } = await service
    .from("historial_seccion_gubernatura_resultados")
    .select("historial_seccion_gubernatura_id, fuerza, votos")
    .in(
      "historial_seccion_gubernatura_id",
      (headers as GubSeccionRow[]).map((h) => h.id)
    );

  if (resultadosError) throw new Error(resultadosError.message);

  const resultadosByParent = new Map<number, GubResultadoRow[]>();
  ((resultados ?? []) as GubResultadoRow[]).forEach((r) => {
    const list = resultadosByParent.get(r.historial_seccion_gubernatura_id) ?? [];
    list.push(r);
    resultadosByParent.set(r.historial_seccion_gubernatura_id, list);
  });

  const fuerzaTotals = new Map<string, number>();

  const rows = (headers as GubSeccionRow[]).map((header) => {
    const secResultados = [
      ...(resultadosByParent.get(header.id) ?? []),
    ].sort((a, b) => (b.votos ?? 0) - (a.votos ?? 0));

    secResultados.forEach((r) => {
      fuerzaTotals.set(r.fuerza, (fuerzaTotals.get(r.fuerza) ?? 0) + (r.votos ?? 0));
    });

    const winnerVotos = secResultados[0]?.votos ?? 0;
    const margin =
      secResultados.length >= 2
        ? Math.max(0, winnerVotos - (secResultados[1]?.votos ?? 0))
        : 0;

    return {
      id: header.id,
      seccionNumero: header.seccion_numero,
      casillas: header.casillas ?? 0,
      listaNominal: header.lista_nominal ?? null,
      numVotosValidos: header.num_votos_validos ?? 0,
      numVotosNulos: header.num_votos_nulos ?? 0,
      totalVotos: header.total_votos ?? 0,
      winnerFuerza: secResultados[0]?.fuerza ?? null,
      winnerVotos,
      margin,
      topFuerzas: secResultados.slice(0, 3).map((r) => ({
        fuerza: r.fuerza,
        votos: r.votos ?? 0,
      })),
    };
  });

  const overallWinner =
    [...fuerzaTotals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    year: 2023,
    totalSections: rows.length,
    totalValidVotes: rows.reduce((sum, r) => sum + r.numVotosValidos, 0),
    totalVotes: rows.reduce((sum, r) => sum + r.totalVotos, 0),
    totalListaNominal: rows.reduce((sum, r) => sum + (r.listaNominal ?? 0), 0),
    overallWinner,
    forceTotals: [...fuerzaTotals.entries()]
      .map(([fuerza, votos]) => ({ fuerza, votos }))
      .sort((a, b) => b.votos - a.votos || a.fuerza.localeCompare(b.fuerza)),
    rows,
  };
}

export async function getAvailableHistorialYears(): Promise<number[]> {
  await assertAdmin();
  const service = createServiceClient();

  const [legacy, official] = await Promise.all([
    service.from("historial_electoral").select("anio").order("anio", { ascending: false }),
    service
      .from("historial_municipal_oficial")
      .select("anio")
      .order("anio", { ascending: false }),
  ]);

  const yearSet = new Set<number>();
  (legacy.data ?? []).forEach((row) => yearSet.add(row.anio));
  (official.data ?? []).forEach((row) => yearSet.add(row.anio));

  return Array.from(yearSet).sort((a, b) => b - a);
}

export async function getHistorialMapAnalytics(
  year?: number
): Promise<MapAnalyticsDTO[]> {
  await assertAdmin();
  const service = createServiceClient();

  const allRecords = await loadUnifiedRecords(service);
  const alternanciaMap = buildAlternanciaMap(allRecords);
  const filtered = year
    ? allRecords.filter((record) => record.anio === year)
    : allRecords;

  const processed = new Set<number>();
  const sorted = [...filtered].sort(
    (a, b) => b.anio - a.anio || a.municipio_nombre.localeCompare(b.municipio_nombre)
  );
  const recordsForMap = sorted.filter((record) => {
    if (year) return true;
    if (processed.has(record.municipio_id)) return false;
    processed.add(record.municipio_id);
    return true;
  });

  const municipioIds = Array.from(
    new Set(recordsForMap.map((record) => record.municipio_id))
  );
  const years = Array.from(new Set(recordsForMap.map((record) => record.anio)));

  const { data: seccionalHeaders, error: seccionalError } = await service
    .from("historial_seccion_electoral")
    .select("municipio_id, anio, num_votos_validos")
    .in("municipio_id", municipioIds)
    .in("anio", years);

  if (seccionalError) throw new Error(seccionalError.message);

  const seccionalValidosByKey = new Map<string, number>();
  (seccionalHeaders ?? []).forEach((row) => {
    const key = `${row.municipio_id}:${row.anio}`;
    seccionalValidosByKey.set(
      key,
      (seccionalValidosByKey.get(key) || 0) + (row.num_votos_validos ?? 0)
    );
  });

  const mapData: MapAnalyticsDTO[] = [];
  for (const record of recordsForMap) {
    const key = `${record.municipio_id}:${record.anio}`;
    const officialValidos = record.resultados.reduce(
      (sum, result) => sum + result.votos,
      0
    );
    const seccionalValidos = seccionalValidosByKey.get(key);
    const diffValidos =
      seccionalValidos == null ? null : seccionalValidos - officialValidos;
    const consistencyStatus =
      diffValidos == null
        ? "sin_detalle_seccional"
        : diffValidos === 0
        ? "consistente"
        : Math.abs(diffValidos) <= 5
        ? "casi_consistente"
        : "inconsistente";

    mapData.push({
      municipio_id: record.municipio_id,
      geo_municipio_id: record.geo_municipio_id,
      municipio_nombre: record.municipio_nombre,
      partido_ganador_id: record.winner_party_id,
      partido_siglas: record.winner_siglas,
      partido_color: record.winner_color,
      anio: record.anio,
      votos_ganador: record.winner_votes,
      porcentaje_ganador: record.winner_pct,
      alternancia_count: alternanciaMap.get(record.municipio_id) || 0,
      margin: record.margin,
      source: record.source,
      consistency_status: consistencyStatus,
      diff_validos: diffValidos,
    });
  }

  return mapData;
}
