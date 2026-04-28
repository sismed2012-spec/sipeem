import type { HistorialSeccionResultadoPreview } from "./types";

export const HISTORIAL_SECCION_2021_REQUIRED_HEADERS = [
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

export const HISTORIAL_SECCION_2021_FORCE_COLUMNS = [
  "PAN",
  "PRI",
  "PRD",
  "PVEM",
  "PT",
  "MC",
  "MORENA",
  "NAEM",
  "PES",
  "RSP",
  "FXM",
  "PAN_PRI_PRD",
  "PAN_PRI",
  "PAN_PRD",
  "PRI_PRD",
  "PT_MORENA_NAEM",
  "PT_MORENA",
  "PT_NAEM",
  "MORENA_NAEM",
  "PT_MORENA_NAEM_CC",
  "CAND_IND1",
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
] as const;

export function normalizeWorksheet2021Text(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseWorksheet2021Number(value: unknown): number {
  const raw = normalizeWorksheet2021Text(value);
  if (!raw) return 0;

  const normalized = raw.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildFuerzaEntries2021(
  row: Record<string, unknown>
): HistorialSeccionResultadoPreview[] {
  return HISTORIAL_SECCION_2021_FORCE_COLUMNS.map((fuerza) => ({
    fuerza,
    votos: parseWorksheet2021Number(row[fuerza]),
  }))
    .filter((entry) => entry.votos > 0)
    .sort((a, b) => b.votos - a.votos || a.fuerza.localeCompare(b.fuerza));
}

export function getSeccion2021HeaderErrors(headers: string[]): string[] {
  return HISTORIAL_SECCION_2021_REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  ).map((header) => `Falta columna requerida: "${header}"`);
}

export function getSeccion2021ActasMec(row: Record<string, unknown>): number {
  return parseWorksheet2021Number(
    row["ACTAS_CASILLA-MEC"] ?? row.ACTAS_CASILLA_MEC ?? row.ACTAS_MEC ?? 0
  );
}
