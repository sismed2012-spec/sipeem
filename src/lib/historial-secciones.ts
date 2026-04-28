export const HISTORIAL_SECCION_2024_REQUIRED_HEADERS = [
  "ID_ESTADO",
  "NOMBRE_ESTADO",
  "ID_DISTRITO_LOCAL",
  "CABECERA_DISTRITAL_LOCAL",
  "ID_MUNICIPIO",
  "MUNICIPIO",
  "SECCION",
  "CASILLAS",
  "ACTAS_CASILLA-MEC",
  "NUM_VOTOS_VALIDOS",
  "NUM_VOTOS_CAN_NREG",
  "NUM_VOTOS_NULOS",
  "TOTAL_VOTOS",
  "LISTA_NOMINAL",
] as const;

export const FUERZAS_2024_COLUMNS = [
  "PAN",
  "PRI",
  "PRD",
  "PVEM",
  "PT",
  "MC",
  "MORENA",
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
  "PVEM_PT_MORENA",
  "PVEM_PT",
  "PVEM_MORENA",
  "PT_MORENA",
  "CC_PAN_PRI_PRD_NAEM",
  "CAND_IND1",
  "CAND_IND2",
  "CAND_IND3",
  "CAND_IND4",
  "CAND_IND5",
  "CAND_IND6",
  "CAND_IND7",
  "CAND_IND8",
  "CAND_IND9",
] as const;

export type HistorialSeccionForceEntry = {
  fuerza: string;
  votos: number;
};

export type HistorialSeccionTotals = {
  num_votos_validos: number;
  num_votos_can_nreg: number;
  num_votos_nulos: number;
  total_votos: number;
};

export function normalizeWorksheetText(value: unknown): string {
  return String(value ?? "").trim();
}

export function parseWorksheetNumber(value: unknown): number {
  const raw = normalizeWorksheetText(value);
  if (!raw) return 0;

  const normalized = raw.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildFuerzaEntries(
  row: Record<string, unknown>
): HistorialSeccionForceEntry[] {
  return FUERZAS_2024_COLUMNS.map((fuerza) => ({
    fuerza,
    votos: parseWorksheetNumber(row[fuerza]),
  }))
    .filter((entry) => entry.votos > 0)
    .sort((a, b) => b.votos - a.votos || a.fuerza.localeCompare(b.fuerza));
}

export function isAggregateSeccion(seccionNumero: number): boolean {
  return seccionNumero <= 0;
}

export function validateSeccionTotals(
  totals: HistorialSeccionTotals,
  fuerzas: HistorialSeccionForceEntry[]
): string[] {
  const errors: string[] = [];
  const sumaFuerzas = fuerzas.reduce((sum, item) => sum + item.votos, 0);
  const totalEsperado =
    totals.num_votos_validos +
    totals.num_votos_can_nreg +
    totals.num_votos_nulos;

  if (sumaFuerzas !== totals.num_votos_validos) {
    errors.push(
      `La suma de fuerzas (${sumaFuerzas}) no coincide con NUM_VOTOS_VALIDOS (${totals.num_votos_validos})`
    );
  }

  if (totalEsperado !== totals.total_votos) {
    errors.push(
      `TOTAL_VOTOS (${totals.total_votos}) no coincide con validos + no registrados + nulos (${totalEsperado})`
    );
  }

  return errors;
}

export function normalizeEntityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}
