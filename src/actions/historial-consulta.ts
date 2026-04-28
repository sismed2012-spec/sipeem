"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { aggregatePercentage, type RatioFragment } from "@/lib/pivot-aggregations";
import { SECCION_2018_FORCE_KEYS } from "@/lib/historial-2018";
import { HISTORIAL_SECCION_2021_FORCE_COLUMNS } from "@/lib/historial-secciones-2021";
import { FUERZAS_2024_COLUMNS } from "@/lib/historial-secciones";
import { getUsuarioActual } from "./auth";

const GUBERNATURA_2023_FORCE_KEYS = [
  "PAN",
  "PRI",
  "PRD",
  "PVEM_PT_MORENA",
  "NAEM",
  "PAN_PRI_PRD_NAEM",
  "PAN_PRI_PRD",
  "PAN_PRI_NAEM",
  "PAN_PRD_NAEM",
  "PRI_PRD_NAEM",
  "PAN_PRI",
  "PAN_PRD",
  "PAN_NAEM",
  "PRI_PRD",
  "PRI_NAEM",
  "PRD_NAEM",
] as const;

// ─────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────

export type PivotRowDim = "municipio" | "distrito" | "region" | "seccion";
export type PivotColDim = "anio" | "fuerza";
export type PivotMetric =
  | "votos_validos"
  | "lista_nominal"
  | "participacion"
  | "ganador"
  | "votos_ganador"
  | "porcentaje_ganador"
  | "margen_votos"
  | "margen_porcentual"
  | "votos_fuerza";
export type ElectionType = "municipal" | "seccional" | "gubernatura" | "gubernatura_municipal";

export interface PivotConfig {
  rowDim: PivotRowDim;
  colDim: PivotColDim;
  metric: PivotMetric;
  electionType: ElectionType;
  anios: number[];
  municipioIds: number[];
  distrito?: string;
  region?: string;
  fuerzaFiltro?: string[];
  selectedFuerza?: string;
}

export interface PivotColumn {
  key: string;
  label: string;
}

export interface PivotRow {
  key: string;
  label: string;
  cells: Record<string, number | string | null>;
  meta?: {
    municipioId?: number;
    distrito?: string;
    region?: string;
    seccionNumero?: number;
  };
}

export interface PivotResult {
  columns: PivotColumn[];
  rows: PivotRow[];
  totals: Record<string, number | null>;
  config: PivotConfig;
  meta: {
    years: number[];
    fuerzas: string[];
    truncated: boolean;
    totalRows: number;
  };
}

export interface ConsultaInitialData {
  municipios: { id: number; nombre: string; distrito: string | null; region: string | null }[];
  distritos: string[];
  regiones: string[];
  years: { municipal: number[]; seccional: number[]; gubernatura: number[] };
  fuerzas: { municipal: string[]; seccional: string[]; gubernatura: string[] };
}

// ─────────────────────────────────────────────
// Auth Guard
// ─────────────────────────────────────────────

async function assertDirector() {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No autenticado");
  if (!["director", "admin"].includes(usuario.rol))
    throw new Error("Acceso denegado: se requiere rol director o admin");
}

function sortFuerzasForUI(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const aIsInd = /^CAND_IND\d+$/.test(a);
    const bIsInd = /^CAND_IND\d+$/.test(b);
    if (aIsInd !== bIsInd) return aIsInd ? 1 : -1;
    if (aIsInd && bIsInd) {
      const numA = Number(a.replace("CAND_IND", ""));
      const numB = Number(b.replace("CAND_IND", ""));
      return numA - numB;
    }
    return a.localeCompare(b, "es");
  });
}

// ─────────────────────────────────────────────
// Internal Raw Row Types
// ─────────────────────────────────────────────

type MunRow = {
  hmoId: number;
  municipioId: number;
  municipioNombre: string;
  distrito: string | null;
  region: string | null;
  anio: number;
  ganadorSiglas: string | null;
  votosGanador: number;
  porcentajeGanador: number;
  margenVotos: number;
  margenPorcentual: number;
  participacion: number;
  listaNominal: number;
  votosValidos: number;
  fuerzaMap: Map<string, number>;
};

type SecRow = {
  hseId: string;
  municipioId: number;
  municipioNombre: string;
  distrito: string | null;
  region: string | null;
  seccionNumero: number;
  anio: number;
  votosValidos: number;
  listaNominal: number;
  totalVotos: number;
  fuerzaMap: Map<string, number>;
  synthetic?: boolean;
};

// ─────────────────────────────────────────────
// Generic Pivot Builder
// ─────────────────────────────────────────────

interface FlatEntry {
  rowKey: string;
  rowLabel: string;
  rowMeta: PivotRow["meta"];
  colKey: string;
  colLabel: string;
  numericValue: number | null;
  textValue: string | null;
  ratioPart?: RatioFragment;
}

function buildPivot(
  entries: FlatEntry[],
  isNumeric: boolean,
  colSortFn?: (a: string, b: string) => number
): { columns: PivotColumn[]; rows: PivotRow[]; totals: Record<string, number | null> } {
  const colOrder: string[] = [];
  const colLabels = new Map<string, string>();
  const colSeen = new Set<string>();

  for (const e of entries) {
    if (!colSeen.has(e.colKey)) {
      colSeen.add(e.colKey);
      colOrder.push(e.colKey);
      colLabels.set(e.colKey, e.colLabel);
    }
  }

  if (colSortFn) colOrder.sort(colSortFn);

  // Group by row key (preserve insertion order)
  const rowGroups = new Map<
    string,
    { label: string; meta: PivotRow["meta"]; cells: Map<string, { nums: number[]; texts: string[]; ratios: RatioFragment[] }> }
  >();

  for (const e of entries) {
    if (!rowGroups.has(e.rowKey)) {
      rowGroups.set(e.rowKey, { label: e.rowLabel, meta: e.rowMeta, cells: new Map() });
    }
    const group = rowGroups.get(e.rowKey)!;
    if (!group.cells.has(e.colKey)) group.cells.set(e.colKey, { nums: [], texts: [], ratios: [] });
    const cell = group.cells.get(e.colKey)!;
    if (e.numericValue !== null) cell.nums.push(e.numericValue);
    if (e.textValue) cell.texts.push(e.textValue);
    if (e.ratioPart) cell.ratios.push(e.ratioPart);
  }

  const pivotRows: PivotRow[] = [];
  for (const [rowKey, group] of rowGroups) {
    const cells: Record<string, number | string | null> = {};
    for (const colKey of colOrder) {
      const cell = group.cells.get(colKey);
      if (!cell) {
        cells[colKey] = null;
      } else if (isNumeric) {
        if (cell.ratios.length > 0) {
          cells[colKey] = aggregatePercentage(cell.ratios);
        } else {
          cells[colKey] = cell.nums.length > 0 ? cell.nums.reduce((a, b) => a + b, 0) : null;
        }
      } else {
        if (cell.texts.length === 0) {
          cells[colKey] = null;
        } else {
          const freq = new Map<string, number>();
          for (const t of cell.texts) freq.set(t, (freq.get(t) ?? 0) + 1);
          const best = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
          cells[colKey] = best?.[0] ?? null;
        }
      }
    }
    pivotRows.push({ key: rowKey, label: group.label, meta: group.meta, cells });
  }

  const totals: Record<string, number | null> = {};
  for (const colKey of colOrder) {
    if (isNumeric) {
      const ratioParts = entries.filter(e => e.colKey === colKey && e.ratioPart).map(e => e.ratioPart as RatioFragment);
      if (ratioParts.length > 0) {
        totals[colKey] = aggregatePercentage(ratioParts);
      } else {
        const vals = pivotRows.map(r => r.cells[colKey]).filter((v): v is number => typeof v === "number");
        totals[colKey] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) : null;
      }
    } else {
      totals[colKey] = null;
    }
  }

  return {
    columns: colOrder.map(k => ({ key: k, label: colLabels.get(k)! })),
    rows: pivotRows,
    totals,
  };
}

// ─────────────────────────────────────────────
// Row Key Helpers
// ─────────────────────────────────────────────

function getRowKey(row: MunRow | SecRow, rowDim: PivotRowDim): string {
  if (rowDim === "municipio") return String(row.municipioId);
  if (rowDim === "distrito") return row.distrito ?? "__sin_distrito";
  if (rowDim === "region") return row.region ?? "__sin_region";
  if (rowDim === "seccion" && "seccionNumero" in row) return `${row.municipioId}-${row.seccionNumero}`;
  return String(row.municipioId);
}

function getRowLabel(row: MunRow | SecRow, rowDim: PivotRowDim): string {
  if (rowDim === "municipio") return row.municipioNombre;
  if (rowDim === "distrito") return row.distrito ?? "Sin distrito";
  if (rowDim === "region") return row.region ?? "Sin región";
  if (rowDim === "seccion" && "seccionNumero" in row) return `Sección ${(row as SecRow).seccionNumero}`;
  return row.municipioNombre;
}

function getRowMeta(row: MunRow | SecRow, rowDim: PivotRowDim): PivotRow["meta"] {
  if (rowDim === "municipio") return { municipioId: row.municipioId };
  if (rowDim === "seccion" && "seccionNumero" in row) return { municipioId: row.municipioId, seccionNumero: (row as SecRow).seccionNumero };
  if (rowDim === "distrito") return { distrito: row.distrito ?? undefined };
  if (rowDim === "region") return { region: row.region ?? undefined };
  return {};
}

// ─────────────────────────────────────────────
// Municipal Pivot
// ─────────────────────────────────────────────

async function buildMunicipalPivot(config: PivotConfig): Promise<PivotResult> {
  const service = createServiceClient();

  let hmoQ = service
    .from("historial_municipal_oficial")
    .select("id, municipio_id, anio, ganador_siglas, ganador_votacion, ganador_porcentaje, margen_votos, margen_porcentual, participacion_ciudadana, lista_nominal, votos_validos");

  if (config.anios.length > 0) hmoQ = hmoQ.in("anio", config.anios);
  if (config.municipioIds.length > 0) hmoQ = hmoQ.in("municipio_id", config.municipioIds);

  const { data: hmoData, error: hmoErr } = await hmoQ.order("municipio_id").order("anio");
  if (hmoErr) throw new Error(hmoErr.message);
  if (!hmoData || hmoData.length === 0) return emptyResult(config);

  const hmoIds = hmoData.map(r => r.id as number);
  const municipioIds = [...new Set(hmoData.map(r => r.municipio_id as number))];

  const [munsRes, fuerzasRes] = await Promise.all([
    service.from("municipios").select("id, nombre, distrito, region").in("id", municipioIds),
    (config.colDim === "fuerza" || config.metric === "votos_fuerza")
      ? (() => {
          let q = service
            .from("historial_municipal_oficial_resultados")
            .select("historial_municipal_id, fuerza, votos")
            .in("historial_municipal_id", hmoIds);
          if (config.colDim === "fuerza" && config.fuerzaFiltro && config.fuerzaFiltro.length > 0)
            q = q.in("fuerza", config.fuerzaFiltro);
          if (config.metric === "votos_fuerza" && config.colDim === "anio" && config.selectedFuerza)
            q = q.eq("fuerza", config.selectedFuerza);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (munsRes.error) throw new Error(munsRes.error.message);
  if ("error" in fuerzasRes && fuerzasRes.error) throw new Error((fuerzasRes as { error: { message: string } }).error.message);

  const munMap = new Map((munsRes.data ?? []).map(m => [m.id as number, m]));

  // Build fuerza index: hmoId → Map<fuerza, votos>
  const fuerzaIdx = new Map<number, Map<string, number>>();
  for (const r of (fuerzasRes.data ?? []) as { historial_municipal_id: number; fuerza: string; votos: number }[]) {
    if (!fuerzaIdx.has(r.historial_municipal_id)) fuerzaIdx.set(r.historial_municipal_id, new Map());
    fuerzaIdx.get(r.historial_municipal_id)!.set(r.fuerza, r.votos);
  }

  // Assemble raw rows
  let rawRows: MunRow[] = (hmoData).map(h => {
    const mun = munMap.get(h.municipio_id as number) ?? { id: h.municipio_id, nombre: `Mun ${h.municipio_id}`, distrito: null, region: null };
    return {
      hmoId: h.id as number,
      municipioId: h.municipio_id as number,
      municipioNombre: mun.nombre as string,
      distrito: mun.distrito as string | null,
      region: mun.region as string | null,
      anio: h.anio as number,
      ganadorSiglas: h.ganador_siglas as string | null,
      votosGanador: h.ganador_votacion as number,
      porcentajeGanador: h.ganador_porcentaje as number,
      margenVotos: h.margen_votos as number,
      margenPorcentual: h.margen_porcentual as number,
      participacion: h.participacion_ciudadana as number,
      listaNominal: h.lista_nominal as number,
      votosValidos: h.votos_validos as number,
      fuerzaMap: fuerzaIdx.get(h.id as number) ?? new Map(),
    };
  });

  // Apply group filters
  if (config.distrito) rawRows = rawRows.filter(r => r.distrito === config.distrito);
  if (config.region) rawRows = rawRows.filter(r => r.region === config.region);

  // Flatten to FlatEntry[]
  const entries: FlatEntry[] = [];
  const allFuerzas = new Set<string>();
  const allYears = new Set<number>();

  for (const row of rawRows) {
    allYears.add(row.anio);
    const rk = getRowKey(row, config.rowDim);
    const rl = getRowLabel(row, config.rowDim);
    const rm = getRowMeta(row, config.rowDim);

    if (config.colDim === "fuerza") {
      const multiYear = config.anios.length > 1;
      for (const [fuerza, votos] of row.fuerzaMap) {
        allFuerzas.add(fuerza);
        const colKey = multiYear ? `${fuerza}||${row.anio}` : fuerza;
        const colLabel = multiYear ? `${fuerza} (${row.anio})` : fuerza;
        entries.push({ rowKey: rk, rowLabel: rl, rowMeta: rm, colKey, colLabel, numericValue: votos, textValue: null });
      }
    } else {
      // colDim = anio
      const colKey = String(row.anio);
      const colLabel = String(row.anio);
      let numVal: number | null = null;
      let txtVal: string | null = null;

      switch (config.metric) {
        case "ganador":           txtVal = row.ganadorSiglas; break;
        case "votos_ganador":     numVal = row.votosGanador; break;
        case "porcentaje_ganador": numVal = row.porcentajeGanador; break;
        case "margen_votos":      numVal = row.margenVotos; break;
        case "margen_porcentual": numVal = row.margenPorcentual; break;
        case "participacion":     numVal = row.participacion; break;
        case "lista_nominal":     numVal = row.listaNominal; break;
        case "votos_validos":     numVal = row.votosValidos; break;
        case "votos_fuerza":
          numVal = config.selectedFuerza ? (row.fuerzaMap.get(config.selectedFuerza) ?? null) : null;
          break;
      }
      const ratioPart =
        config.metric === "participacion"
          ? {
              numerator: (row.participacion * row.listaNominal) / 100,
              denominator: row.listaNominal,
            }
          : config.metric === "porcentaje_ganador"
            ? {
                numerator: row.votosGanador,
                denominator: row.votosValidos,
              }
            : config.metric === "margen_porcentual"
              ? {
                  numerator: row.margenVotos,
                  denominator: row.votosValidos,
                }
              : undefined;
      entries.push({ rowKey: rk, rowLabel: rl, rowMeta: rm, colKey, colLabel, numericValue: numVal, textValue: txtVal, ratioPart });
    }
  }

  const isNumeric = config.metric !== "ganador";
  const multiYearFuerza = config.colDim === "fuerza" && config.anios.length > 1;
  const colSortFn = config.colDim === "anio"
    ? (a: string, b: string) => Number(a) - Number(b)
    : multiYearFuerza
      ? (a: string, b: string) => {
          const yearA = Number(a.split("||")[1] ?? 0);
          const yearB = Number(b.split("||")[1] ?? 0);
          return yearA !== yearB ? yearA - yearB : a.localeCompare(b);
        }
      : undefined;

  const { columns, rows, totals } = buildPivot(entries, isNumeric, colSortFn);

  if (config.colDim === "anio") {
    const selectedYears =
      config.anios.length > 0
        ? [...new Set(config.anios)]
        : [...allYears];

    if (
      config.electionType === "seccional" &&
      (config.anios.length === 0 || config.anios.includes(2023)) &&
      !selectedYears.includes(2023)
    ) {
      selectedYears.push(2023);
    }

    const normalizedYears = [...new Set(selectedYears)].sort((a, b) => a - b);
    for (const year of normalizedYears) {
      const key = String(year);
      const hasColumn = columns.some((c) => c.key === key);
      if (!hasColumn) {
        const label =
          year === 2023 && (config.electionType === "seccional" || config.electionType === "gubernatura")
            ? "2023 (Gub.)"
            : key;
        columns.push({ key, label });
        totals[key] = null;
        for (const row of rows) {
          row.cells[key] = null;
        }
      }
    }

    columns.sort((a, b) => Number(a.key) - Number(b.key));
  }

  rows.sort((a, b) => a.label.localeCompare(b.label, "es"));

  return {
    columns,
    rows,
    totals,
    config,
    meta: {
      years: [...allYears].sort((a, b) => a - b),
      fuerzas: [...allFuerzas].sort(),
      truncated: false,
      totalRows: rows.length,
    },
  };
}

// ─────────────────────────────────────────────
// Seccional / Gubernatura Pivot
// ─────────────────────────────────────────────

async function buildSeccionalPivot(config: PivotConfig): Promise<PivotResult> {
  const service = createServiceClient();
  const isOnlyGubernatura = config.electionType === "gubernatura" || config.electionType === "gubernatura_municipal";
  const includeGubernaturaAsTrend =
    config.electionType === "seccional" &&
    (config.anios.length === 0 || config.anios.includes(2023));
  const anios = isOnlyGubernatura ? [2023] : config.anios;

  type SeccionHeader = {
    source: "seccional" | "gubernatura";
    id: number;
    municipio_id: number;
    seccion_numero: number;
    anio: number;
    num_votos_validos: number;
    lista_nominal: number | null;
    total_votos: number;
  };

  const headerRows: SeccionHeader[] = [];

  if (isOnlyGubernatura) {
    let gubQ = service
      .from("historial_seccion_gubernatura")
      .select("id, municipio_id, seccion_numero, anio, num_votos_validos, lista_nominal, total_votos");
    if (config.municipioIds.length > 0) gubQ = gubQ.in("municipio_id", config.municipioIds);
    const { data, error } = await gubQ.order("municipio_id").order("seccion_numero");
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) =>
      headerRows.push({
        source: "gubernatura",
        id: r.id as number,
        municipio_id: r.municipio_id as number,
        seccion_numero: r.seccion_numero as number,
        anio: r.anio as number,
        num_votos_validos: r.num_votos_validos as number,
        lista_nominal: (r.lista_nominal as number | null) ?? null,
        total_votos: r.total_votos as number,
      })
    );
  } else {
    const seccionalYears = anios.filter((y) => y !== 2023);
    let secQ = service
      .from("historial_seccion_electoral")
      .select("id, municipio_id, seccion_numero, anio, num_votos_validos, lista_nominal, total_votos");
    if (seccionalYears.length > 0) secQ = secQ.in("anio", seccionalYears);
    if (config.municipioIds.length > 0) secQ = secQ.in("municipio_id", config.municipioIds);
    const { data: secData, error: secErr } = await secQ.order("municipio_id").order("seccion_numero");
    if (secErr) throw new Error(secErr.message);
    (secData ?? []).forEach((r) =>
      headerRows.push({
        source: "seccional",
        id: r.id as number,
        municipio_id: r.municipio_id as number,
        seccion_numero: r.seccion_numero as number,
        anio: r.anio as number,
        num_votos_validos: r.num_votos_validos as number,
        lista_nominal: (r.lista_nominal as number | null) ?? null,
        total_votos: r.total_votos as number,
      })
    );

    if (includeGubernaturaAsTrend) {
      let gubQ = service
        .from("historial_seccion_gubernatura")
        .select("id, municipio_id, seccion_numero, anio, num_votos_validos, lista_nominal, total_votos")
        .eq("anio", 2023);
      if (config.municipioIds.length > 0) gubQ = gubQ.in("municipio_id", config.municipioIds);
      const { data: gubData, error: gubErr } = await gubQ.order("municipio_id").order("seccion_numero");
      if (gubErr) throw new Error(gubErr.message);
      (gubData ?? []).forEach((r) =>
        headerRows.push({
          source: "gubernatura",
          id: r.id as number,
          municipio_id: r.municipio_id as number,
          seccion_numero: r.seccion_numero as number,
          anio: r.anio as number,
          num_votos_validos: r.num_votos_validos as number,
          lista_nominal: (r.lista_nominal as number | null) ?? null,
          total_votos: r.total_votos as number,
        })
      );
    }
  }

  if (headerRows.length === 0) return emptyResult(config);

  const seccionalIds = headerRows.filter((r) => r.source === "seccional").map((r) => r.id);
  const gubernaturaIds = headerRows.filter((r) => r.source === "gubernatura").map((r) => r.id);
  const municipioIds = [...new Set(headerRows.map(r => r.municipio_id))];

  const needFuerzas = config.colDim === "fuerza" || config.metric === "votos_fuerza" || config.metric === "ganador" || config.metric === "margen_votos";

  const [munsRes, secFuerzasRes, gubFuerzasRes, baseline2024Res] = await Promise.all([
    service.from("municipios").select("id, nombre, distrito, region").in("id", municipioIds),
    needFuerzas && seccionalIds.length > 0
      ? (() => {
          let q = service
            .from("historial_seccion_resultados")
            .select("historial_seccion_id, fuerza, votos")
            .in("historial_seccion_id", seccionalIds);
          if (config.colDim === "fuerza" && config.fuerzaFiltro && config.fuerzaFiltro.length > 0)
            q = q.in("fuerza", config.fuerzaFiltro);
          if (config.metric === "votos_fuerza" && config.colDim === "anio" && config.selectedFuerza)
            q = q.eq("fuerza", config.selectedFuerza);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    needFuerzas && gubernaturaIds.length > 0
      ? (() => {
          let q = service
            .from("historial_seccion_gubernatura_resultados")
            .select("historial_seccion_gubernatura_id, fuerza, votos")
            .in("historial_seccion_gubernatura_id", gubernaturaIds);
          if (config.colDim === "fuerza" && config.fuerzaFiltro && config.fuerzaFiltro.length > 0)
            q = q.in("fuerza", config.fuerzaFiltro);
          if (config.metric === "votos_fuerza" && config.colDim === "anio" && config.selectedFuerza)
            q = q.eq("fuerza", config.selectedFuerza);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
    config.electionType === "seccional" && config.rowDim === "seccion"
      ? (() => {
          let q = service
            .from("historial_seccion_electoral")
            .select("municipio_id, seccion_numero")
            .eq("anio", 2024);
          if (config.municipioIds.length > 0) q = q.in("municipio_id", config.municipioIds);
          return q;
        })()
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (munsRes.error) throw new Error(munsRes.error.message);
  if ("error" in secFuerzasRes && secFuerzasRes.error) throw new Error((secFuerzasRes as { error: { message: string } }).error.message);
  if ("error" in gubFuerzasRes && gubFuerzasRes.error) throw new Error((gubFuerzasRes as { error: { message: string } }).error.message);
  if ("error" in baseline2024Res && baseline2024Res.error) throw new Error((baseline2024Res as { error: { message: string } }).error.message);

  const munMap = new Map((munsRes.data ?? []).map(m => [m.id as number, m]));

  const fuerzaIdx = new Map<string, Map<string, number>>();
  for (const r of (secFuerzasRes.data ?? []) as { historial_seccion_id: number; fuerza: string; votos: number }[]) {
    const fk = `seccional:${r.historial_seccion_id}`;
    if (!fuerzaIdx.has(fk)) fuerzaIdx.set(fk, new Map());
    fuerzaIdx.get(fk)!.set(r.fuerza as string, r.votos as number);
  }
  for (const r of (gubFuerzasRes.data ?? []) as { historial_seccion_gubernatura_id: number; fuerza: string; votos: number }[]) {
    const fk = `gubernatura:${r.historial_seccion_gubernatura_id}`;
    if (!fuerzaIdx.has(fk)) fuerzaIdx.set(fk, new Map());
    fuerzaIdx.get(fk)!.set(r.fuerza as string, r.votos as number);
  }

  let rawRows: SecRow[] = headerRows.map(h => {
    const mun = munMap.get(h.municipio_id) ?? { id: h.municipio_id, nombre: `Mun ${h.municipio_id}`, distrito: null, region: null };
    return {
      hseId: `${h.source}:${h.id}`,
      municipioId: h.municipio_id,
      municipioNombre: mun.nombre as string,
      distrito: mun.distrito as string | null,
      region: mun.region as string | null,
      seccionNumero: h.seccion_numero,
      anio: h.anio,
      votosValidos: h.num_votos_validos,
      listaNominal: h.lista_nominal ?? 0,
      totalVotos: h.total_votos,
      fuerzaMap: fuerzaIdx.get(`${h.source}:${h.id}`) ?? new Map(),
    };
  });

  if (config.distrito) rawRows = rawRows.filter(r => r.distrito === config.distrito);
  if (config.region) rawRows = rawRows.filter(r => r.region === config.region);

  if (config.electionType === "seccional" && config.rowDim === "seccion" && config.colDim === "anio") {
    const baseline = (baseline2024Res.data ?? []) as { municipio_id: number; seccion_numero: number }[];
    const baselineKeys = new Set<string>();
    for (const row of baseline) {
      const mun = munMap.get(row.municipio_id);
      const distrito = (mun?.distrito as string | null) ?? null;
      const region = (mun?.region as string | null) ?? null;
      if (config.distrito && distrito !== config.distrito) continue;
      if (config.region && region !== config.region) continue;
      baselineKeys.add(`${row.municipio_id}-${row.seccion_numero}`);
    }

    const currentKeys = new Set(rawRows.map((r) => `${r.municipioId}-${r.seccionNumero}`));
    const syntheticYear = anios[0] ?? 2024;
    for (const key of baselineKeys) {
      if (currentKeys.has(key)) continue;
      const [municipioIdStr, seccionNumeroStr] = key.split("-");
      const municipioId = Number(municipioIdStr);
      const seccionNumero = Number(seccionNumeroStr);
      const mun = munMap.get(municipioId);
      rawRows.push({
        hseId: `synthetic:${key}`,
        municipioId,
        municipioNombre: (mun?.nombre as string) ?? `Mun ${municipioId}`,
        distrito: (mun?.distrito as string | null) ?? null,
        region: (mun?.region as string | null) ?? null,
        seccionNumero,
        anio: syntheticYear,
        votosValidos: 0,
        listaNominal: 0,
        totalVotos: 0,
        fuerzaMap: new Map(),
        synthetic: true,
      });
    }
  }
  let truncated = false;
  if (config.rowDim === "seccion") {
    const uniqueSectionKeys = new Set<string>();
    for (const row of rawRows) {
      uniqueSectionKeys.add(getRowKey(row, "seccion"));
    }
    truncated = uniqueSectionKeys.size > 200;

    if (truncated) {
      const allowedKeys = new Set<string>();
      for (const row of rawRows) {
        const key = getRowKey(row, "seccion");
        if (!allowedKeys.has(key)) {
          allowedKeys.add(key);
        }
        if (allowedKeys.size >= 200) break;
      }
      rawRows = rawRows.filter((row) => allowedKeys.has(getRowKey(row, "seccion")));
    }
  }

  const entries: FlatEntry[] = [];
  const allFuerzas = new Set<string>();
  const allYears = new Set<number>();
  const hasGubernatura2023 = rawRows.some(
    (r) => r.anio === 2023 && r.hseId.startsWith("gubernatura:")
  );

  for (const row of rawRows) {
    allYears.add(row.anio);
    const rk = getRowKey(row, config.rowDim);
    const rl = getRowLabel(row, config.rowDim);
    const rm = getRowMeta(row, config.rowDim);

    if (config.colDim === "fuerza") {
      const multiYear = anios.length > 1;
      for (const [fuerza, votos] of row.fuerzaMap) {
        allFuerzas.add(fuerza);
        const colKey = multiYear ? `${fuerza}||${row.anio}` : fuerza;
        const colLabel = multiYear ? `${fuerza} (${row.anio})` : fuerza;
        entries.push({ rowKey: rk, rowLabel: rl, rowMeta: rm, colKey, colLabel, numericValue: votos, textValue: null });
      }
    } else {
      const colKey = String(row.anio);
      const colLabel =
        row.anio === 2023 && hasGubernatura2023 ? "2023 (Gub.)" : String(row.anio);
      let numVal: number | null = null;
      let txtVal: string | null = null;

      if (row.synthetic) {
        numVal = null;
      } else if (config.metric === "votos_validos") {
        numVal = row.votosValidos;
      } else if (config.metric === "lista_nominal") {
        numVal = row.listaNominal;
      } else if (config.metric === "participacion") {
        numVal = row.listaNominal > 0 ? Number(((row.totalVotos / row.listaNominal) * 100).toFixed(2)) : null;
      } else if (config.metric === "votos_fuerza" && config.selectedFuerza) {
        numVal = row.fuerzaMap.get(config.selectedFuerza) ?? null;
      } else if (config.metric === "ganador") {
        const sorted = [...row.fuerzaMap.entries()].sort((a, b) => b[1] - a[1]);
        txtVal = sorted[0]?.[0] ?? null;
      } else if (config.metric === "margen_votos") {
        const sorted = [...row.fuerzaMap.entries()].sort((a, b) => b[1] - a[1]);
        numVal = sorted.length >= 2 ? sorted[0][1] - sorted[1][1] : (sorted[0]?.[1] ?? null);
      } else {
        numVal = row.votosValidos;
      }

      const ratioPart =
        config.metric === "participacion" && row.listaNominal > 0
          ? {
              numerator: row.totalVotos,
              denominator: row.listaNominal,
            }
          : undefined;
      entries.push({ rowKey: rk, rowLabel: rl, rowMeta: rm, colKey, colLabel, numericValue: numVal, textValue: txtVal, ratioPart });
    }
  }

  const isNumeric = config.metric !== "ganador";
  const multiYearFuerza = config.colDim === "fuerza" && anios.length > 1;
  const colSortFn = config.colDim === "anio"
    ? (a: string, b: string) => Number(a) - Number(b)
    : multiYearFuerza
      ? (a: string, b: string) => {
          const yearA = Number(a.split("||")[1] ?? 0);
          const yearB = Number(b.split("||")[1] ?? 0);
          return yearA !== yearB ? yearA - yearB : a.localeCompare(b);
        }
      : undefined;

  const { columns, rows, totals } = buildPivot(entries, isNumeric, colSortFn);

  if (config.rowDim !== "seccion") {
    rows.sort((a, b) => a.label.localeCompare(b.label, "es"));
  } else {
    rows.sort((a, b) => {
      const secA = a.meta?.seccionNumero ?? 0;
      const secB = b.meta?.seccionNumero ?? 0;
      if (secA !== secB) return secA - secB;
      return a.label.localeCompare(b.label, "es");
    });
  }

  return {
    columns,
    rows,
    totals,
    config,
    meta: {
      years: [...allYears].sort((a, b) => a - b),
      fuerzas: [...allFuerzas].sort(),
      truncated,
      totalRows: rows.length,
    },
  };
}

// ─────────────────────────────────────────────
// Empty Result Helper
// ─────────────────────────────────────────────

function emptyResult(config: PivotConfig): PivotResult {
  return { columns: [], rows: [], totals: {}, config, meta: { years: [], fuerzas: [], truncated: false, totalRows: 0 } };
}

// ─────────────────────────────────────────────
// Public: getConsultaInitialData
// ─────────────────────────────────────────────

export async function getConsultaInitialData(): Promise<ConsultaInitialData> {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No autenticado");
  if (!["director", "admin"].includes(usuario.rol)) throw new Error("Acceso denegado");

  const service = createServiceClient();

  const [munsRes, munYearsRes, secYearsRes, gubYearsRes, munFuerzasRes, secFuerzasRes, gubFuerzasRes] = await Promise.all([
    service.from("municipios").select("id, nombre, distrito, region").eq("estatus", "activo").order("nombre"),
    service.from("historial_municipal_oficial").select("anio"),
    service.from("historial_seccion_electoral").select("anio"),
    service.from("historial_seccion_gubernatura").select("anio"),
    service.from("historial_municipal_oficial_resultados").select("fuerza"),
    service.from("historial_seccion_resultados").select("fuerza"),
    service.from("historial_seccion_gubernatura_resultados").select("fuerza"),
  ]);

  const municipios = (munsRes.data ?? []) as { id: number; nombre: string; distrito: string | null; region: string | null }[];

  const distritos = [...new Set(municipios.map(m => m.distrito).filter((d): d is string => !!d))].sort();
  const regiones = [...new Set(municipios.map(m => m.region).filter((r): r is string => !!r))].sort();

  const munYears = [...new Set((munYearsRes.data ?? []).map(r => r.anio as number))].sort((a, b) => a - b);
  const secYears = [...new Set([
    ...(secYearsRes.data ?? []).map(r => r.anio as number),
    ...(gubYearsRes.data ?? []).map(r => r.anio as number),
    2023,
  ])].sort((a, b) => a - b);

  const munFuerzas = sortFuerzasForUI([...new Set((munFuerzasRes.data ?? []).map(r => r.fuerza as string))]);
  const seccionalForceCatalog = [
    ...SECCION_2018_FORCE_KEYS,
    ...HISTORIAL_SECCION_2021_FORCE_COLUMNS,
    ...FUERZAS_2024_COLUMNS,
  ];
  const secFuerzas = sortFuerzasForUI([
    ...new Set([
      ...(secFuerzasRes.data ?? []).map(r => r.fuerza as string),
      ...seccionalForceCatalog,
    ]),
  ]);
  const gubFuerzas = sortFuerzasForUI([
    ...new Set([
      ...(gubFuerzasRes.data ?? []).map(r => r.fuerza as string),
      ...GUBERNATURA_2023_FORCE_KEYS,
    ]),
  ]);

  return {
    municipios,
    distritos,
    regiones,
    years: { municipal: munYears, seccional: secYears, gubernatura: [2023] },
    fuerzas: { municipal: munFuerzas, seccional: secFuerzas, gubernatura: gubFuerzas },
  };
}

// ─────────────────────────────────────────────
// Public: getPivotData
// ─────────────────────────────────────────────

export async function getPivotData(config: PivotConfig): Promise<PivotResult> {
  await assertDirector();

  if (config.rowDim === "seccion" && config.municipioIds.length === 0) {
    throw new Error("Para consultas por sección, debes seleccionar al menos un municipio.");
  }

  if (config.electionType === "gubernatura" || config.electionType === "gubernatura_municipal") {
    return buildSeccionalPivot({ ...config, anios: [2023] });
  }

  if (config.electionType === "municipal") {
    return buildMunicipalPivot(config);
  }

  return buildSeccionalPivot(config);
}
