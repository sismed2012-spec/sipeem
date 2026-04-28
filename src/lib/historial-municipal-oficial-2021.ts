// 2021 IEEM Ayuntamientos municipal results file
// Header is at row 2 (auto-detected by finding "ID MUNICIPIO")
// Data rows start at row 3; skip rows whose col-0 is not a valid 1-125 integer

export const MUNICIPAL_2021_COL = {
  GEO_MUNICIPIO_ID: 0,
  MUNICIPIO: 1,
  TOTAL_SECCIONES: 2,
  TOTAL_CASILLAS: 3,
  LISTA_NOMINAL: 4,
  VOTOS_VALIDOS: 36,
  VOTOS_NO_REGISTRADOS: 37,
  VOTOS_NULOS: 38,
  TOTAL_VOTOS: 39,
  PARTICIPACION: 40,
  GANADOR_SIGLAS: 41,
  GANADOR_VOTACION: 42,
  GANADOR_PORCENTAJE: 43,
  SEGUNDO_SIGLAS: 44,
  SEGUNDO_VOTACION: 45,
  SEGUNDO_PORCENTAJE: 46,
  MARGEN_VOTOS: 47,
  MARGEN_PORCENTUAL: 48,
  RUTA_ACTA: 49,
} as const;

export const MUNICIPAL_2021_FORCE_COLUMNS: Record<string, number> = {
  PAN: 5,
  PRI: 6,
  PRD: 7,
  PT: 8,
  PVEM: 9,
  MC: 10,
  MORENA: 11,
  NAEM: 12,
  PES: 13,
  RSP: 14,
  FXM: 15,
  PAN_PRI_PRD: 16,
  PAN_PRI: 17,
  PT_MORENA_NAEM: 18,
  PT_MORENA: 19,
  CC_PT_MORENA_NAEM: 20,
  CAND_IND1: 21,
  CAND_IND2: 22,
  CAND_IND3: 23,
  CAND_IND4: 24,
  CAND_IND5: 25,
  CAND_IND6: 26,
  CAND_IND7: 27,
  CAND_IND8: 28,
  CAND_IND9: 29,
  CAND_IND10: 30,
  CAND_IND11: 31,
  CAND_IND12: 32,
  CAND_IND13: 33,
  CAND_IND14: 34,
  CAND_IND15: 35,
};

export const MUNICIPAL_2021_FORCE_KEYS = Object.keys(MUNICIPAL_2021_FORCE_COLUMNS);

export function parseMunicipal2021Number(value: unknown): number {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function parseMunicipal2021Percentage(value: unknown): number {
  // Handles "63.99%" strings
  const raw = String(value ?? "").replace("%", "").replace(",", ".").trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeMunicipal2021WinnerSiglas(raw: unknown): string {
  // "PRI" → "PRI", "PT-MORENA-NAEM" → "PT_MORENA_NAEM", "CAND-IND1" → "CAND_IND1"
  return String(raw ?? "").replace(/-/g, "_").trim().toUpperCase();
}

export function isMunicipal2021DataRow(row: unknown[]): boolean {
  const id = parseInt(String(row[0] ?? "").trim(), 10);
  return Number.isFinite(id) && id >= 1 && id <= 125;
}
