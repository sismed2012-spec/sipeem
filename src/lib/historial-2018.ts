import type { HistorialSeccionResultadoPreview } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// MUNCAND 2018 — columnas de candidaturas por ayuntamiento
// Fuente: 2018_SEE_AYUN_MEX_MUNCAND.xlsx (IEEM)
// ─────────────────────────────────────────────────────────────────────────────

export const MUNCAND_2018_REQUIRED_HEADERS = [
  "ID_MUNICIPIO",
  "MUNICIPIO",
  "NUM_VOTOS_VALIDOS",
  "TOTAL_VOTOS",
  "LISTA_NOMINAL",
] as const;

export const MUNCAND_2018_FORCE_KEYS = [
  "PAN",
  "PAN_PRD_MC",
  "PRI",
  "PRD",
  "PT",
  "PT_MORENA_ES",
  "PVEM",
  "MC",
  "NA",
  "MORENA",
  "ES",
  "VR",
  "CAND_IND2",
  "CAND_IND3",
  "CAND_IND4",
  "CAND_IND5",
  "CAND_IND6",
  "CAND_IND7",
  "CAND_IND8",
  "CAND_IND9",
  "CAND_IND10",
  "CAND_IND11",
  "CAND_IND12",
  "CAND_IND13",
  "CAND_IND14",
  "CAND_IND15",
  "CAND_IND16",
  "CAND_IND17",
  "CAND_IND18",
  "CAND_IND19",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// SEC 2018 — columnas por sección
// Fuente: 2018_SEE_AYUN_MEX_SEC.xlsx (IEEM)
// ─────────────────────────────────────────────────────────────────────────────

export const SECCION_2018_REQUIRED_HEADERS = [
  "ID_MUNICIPIO",
  "MUNICIPIO",
  "SECCION",
  "CASILLAS",
  "NUM_VOTOS_VALIDOS",
  "NUM_VOTOS_CAN_NREG",
  "NUM_VOTOS_NULOS",
  "TOTAL_VOTOS",
  "LISTA_NOMINAL",
] as const;

export const SECCION_2018_FORCE_KEYS = [
  "PAN",
  "PRI",
  "PRD",
  "PT",
  "PVEM",
  "MC",
  "NA",
  "MORENA",
  "ES",
  "VR",
  "PAN_PRD_MC",
  "PAN_PRD",
  "PAN_MC",
  "PRD_MC",
  "PT_MORENA_ES",
  "PT_MORENA",
  "PT_ES",
  "MORENA_ES",
  "CAND_IND2",
  "CAND_IND3",
  "CAND_IND4",
  "CAND_IND5",
  "CAND_IND6",
  "CAND_IND7",
  "CAND_IND8",
  "CAND_IND9",
  "CAND_IND10",
  "CAND_IND11",
  "CAND_IND12",
  "CAND_IND13",
  "CAND_IND14",
  "CAND_IND15",
  "CAND_IND16",
  "CAND_IND17",
  "CAND_IND18",
  "CAND_IND19",
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

export function parse2018Number(value: unknown): number {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalize2018Text(value: unknown): string {
  return String(value ?? "").trim();
}

export function buildMuncand2018Fuerzas(
  row: Record<string, unknown>
): HistorialSeccionResultadoPreview[] {
  return MUNCAND_2018_FORCE_KEYS.map((fuerza) => ({
    fuerza,
    votos: parse2018Number(row[fuerza]),
  }))
    .filter((entry) => entry.votos > 0)
    .sort((a, b) => b.votos - a.votos || a.fuerza.localeCompare(b.fuerza));
}

export function buildSeccion2018Fuerzas(
  row: Record<string, unknown>
): HistorialSeccionResultadoPreview[] {
  return SECCION_2018_FORCE_KEYS.map((fuerza) => ({
    fuerza,
    votos: parse2018Number(row[fuerza]),
  }))
    .filter((entry) => entry.votos > 0)
    .sort((a, b) => b.votos - a.votos || a.fuerza.localeCompare(b.fuerza));
}

export function calcWinner2018(
  fuerzas: HistorialSeccionResultadoPreview[],
  votosValidos: number
): {
  ganador_siglas: string | null;
  ganador_votacion: number;
  ganador_porcentaje: number;
  segundo_siglas: string | null;
  segundo_votacion: number;
  segundo_porcentaje: number;
  margen_votos: number;
  margen_porcentual: number;
} {
  const sorted = [...fuerzas].sort((a, b) => b.votos - a.votos);
  const base = votosValidos > 0 ? votosValidos : sorted.reduce((s, f) => s + f.votos, 0);

  const winner = sorted[0];
  const second = sorted[1];

  const winnerVotos = winner?.votos ?? 0;
  const secondVotos = second?.votos ?? 0;
  const winnerPct = base > 0 ? Number(((winnerVotos / base) * 100).toFixed(4)) : 0;
  const secondPct = base > 0 ? Number(((secondVotos / base) * 100).toFixed(4)) : 0;

  return {
    ganador_siglas: winner?.fuerza ?? null,
    ganador_votacion: winnerVotos,
    ganador_porcentaje: winnerPct,
    segundo_siglas: second?.fuerza ?? null,
    segundo_votacion: secondVotos,
    segundo_porcentaje: secondPct,
    margen_votos: winnerVotos - secondVotos,
    margen_porcentual: Number((winnerPct - secondPct).toFixed(4)),
  };
}

export function getMuncand2018HeaderErrors(headers: string[]): string[] {
  return MUNCAND_2018_REQUIRED_HEADERS.filter(
    (h) => !headers.includes(h)
  ).map((h) => `Falta columna requerida: "${h}"`);
}

export function getSeccion2018HeaderErrors(headers: string[]): string[] {
  return SECCION_2018_REQUIRED_HEADERS.filter(
    (h) => !headers.includes(h)
  ).map((h) => `Falta columna requerida: "${h}"`);
}
