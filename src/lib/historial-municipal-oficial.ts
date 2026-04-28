export const MUNICIPAL_OFFICIAL_HEADER_ROW_INDEX = 7;
export const MUNICIPAL_OFFICIAL_FIRST_DATA_ROW_INDEX = 8;

export const MUNICIPAL_OFFICIAL_FORCE_INDEX: Record<string, number> = {
  PAN: 6,
  PRI: 7,
  PRD: 8,
  PVEM: 9,
  PT: 10,
  MC: 11,
  MORENA: 12,
  NAEM: 13,
  PAN_PRI_PRD_NAEM: 14,
  PVEM_PT_MORENA: 15,
  CC_PAN_PRI_PRD_NAEM: 16,
  CAND_IND1: 17,
  CAND_IND2: 18,
  CAND_IND3: 19,
  CAND_IND4: 20,
  CAND_IND5: 21,
  CAND_IND6: 22,
  CAND_IND7: 23,
  CAND_IND8: 24,
  CAND_IND9: 25,
};

export const MUNICIPAL_OFFICIAL_FORCE_KEYS = Object.keys(
  MUNICIPAL_OFFICIAL_FORCE_INDEX
);

export const MUNICIPAL_OFFICIAL_REQUIRED_HEADERS = [
  "ID_MUNICIPIO",
  "MUNICIPIO",
  "TOTAL DE SECCIONES",
  "TOTAL DE CASILLAS",
  "TOTAL CASILLAS-MEC",
  "LISTA NOMINAL",
  "VOTOS VALIDOS",
  "VOTOS NO REGISTRADOS",
  "VOTOS NULOS",
  "TOTAL VOTOS",
  "PARTICIPACIÓN CIUDADANA",
  "SIGLAS",
  "VOTACIÓN",
  "PORCENTAJE",
  "RUTA_ACTA",
] as const;

const WINNER_LABEL_TO_SIGLAS: Record<string, string> = {
  PAN: "PAN",
  PRI: "PRI",
  PRD: "PRD",
  PVEM: "PVEM",
  PT: "PT",
  MC: "MC",
  MORENA: "MORENA",
  NAEM: "NAEM",
  "COALICION PAN-PRI-PRD-NAEM": "PAN_PRI_PRD_NAEM",
  "COALICION PVEM-PT-MORENA": "PVEM_PT_MORENA",
  "CANDIDATURA COMUN PAN-PRI-PRD-NAEM": "CC_PAN_PRI_PRD_NAEM",
  CAND_IND1: "CAND_IND1",
  CAND_IND2: "CAND_IND2",
  CAND_IND3: "CAND_IND3",
  CAND_IND4: "CAND_IND4",
  CAND_IND5: "CAND_IND5",
  CAND_IND6: "CAND_IND6",
  CAND_IND7: "CAND_IND7",
  CAND_IND8: "CAND_IND8",
  CAND_IND9: "CAND_IND9",
};

function normalizeMunicipalEntityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

export type MunicipalOfficialForces = Record<string, number>;

export type MunicipalOfficialParsedRow = {
  geo_municipio_id: number;
  municipio_nombre: string;
  total_secciones: number;
  total_casillas: number;
  total_casillas_mec: number;
  lista_nominal: number;
  votos_validos: number;
  votos_no_registrados: number;
  votos_nulos: number;
  total_votos: number;
  participacion_ciudadana: number;
  ganador_siglas: string | null;
  ganador_votacion: number;
  ganador_porcentaje: number;
  segundo_siglas: string | null;
  segundo_votacion: number;
  segundo_porcentaje: number;
  margen_votos: number;
  margen_porcentual: number;
  ruta_acta: string | null;
  fuerzas: MunicipalOfficialForces;
};

export function parseMunicipalOfficialNumber(value: unknown): number {
  const normalized = String(value ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/%/g, "");
  if (!normalized) return 0;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function isMunicipalOfficialNoteRow(value: unknown): boolean {
  return /^Mediante resoluci/i.test(String(value ?? "").trim());
}

export function isMunicipalOfficialTotalsRow(value: unknown): boolean {
  return normalizeMunicipalEntityName(String(value ?? "")) === "TOTALES";
}

export function pickMunicipalWinnerSiglas(
  fuerzas: Record<string, number>
): string | null {
  const winner = Object.entries(fuerzas)
    .filter(([, votos]) => votos > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];

  return winner?.[0] ?? null;
}

export function normalizeMunicipalWinnerLabel(value: unknown): string | null {
  const normalized = normalizeMunicipalEntityName(String(value ?? ""))
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return null;

  return WINNER_LABEL_TO_SIGLAS[normalized] ?? normalized.replace(/ /g, "_");
}

export function getMunicipalOfficialHeaderErrors(headers: unknown[]): string[] {
  const normalizedHeaders = new Set(
    headers.map((header) => String(header ?? "").trim())
  );

  return MUNICIPAL_OFFICIAL_REQUIRED_HEADERS.filter(
    (header) => !normalizedHeaders.has(header)
  ).map((header) => `Falta columna requerida: "${header}"`);
}

export function buildMunicipalOfficialRow(
  row: unknown[]
): MunicipalOfficialParsedRow {
  const fuerzas: MunicipalOfficialForces = {};
  for (const [fuerza, index] of Object.entries(MUNICIPAL_OFFICIAL_FORCE_INDEX)) {
    fuerzas[fuerza] = parseMunicipalOfficialNumber(row[index]);
  }

  const ganadorSiglas =
    normalizeMunicipalWinnerLabel(row[31]) ?? pickMunicipalWinnerSiglas(fuerzas);
  const segundoSiglas = normalizeMunicipalWinnerLabel(row[34]);

  return {
    geo_municipio_id: parseMunicipalOfficialNumber(row[0]),
    municipio_nombre: String(row[1] ?? "").trim(),
    total_secciones: parseMunicipalOfficialNumber(row[2]),
    total_casillas: parseMunicipalOfficialNumber(row[3]),
    total_casillas_mec: parseMunicipalOfficialNumber(row[4]),
    lista_nominal: parseMunicipalOfficialNumber(row[5]),
    votos_validos: parseMunicipalOfficialNumber(row[26]),
    votos_no_registrados: parseMunicipalOfficialNumber(row[27]),
    votos_nulos: parseMunicipalOfficialNumber(row[28]),
    total_votos: parseMunicipalOfficialNumber(row[29]),
    participacion_ciudadana: parseMunicipalOfficialNumber(row[30]),
    ganador_siglas: ganadorSiglas,
    ganador_votacion: parseMunicipalOfficialNumber(row[32]),
    ganador_porcentaje: parseMunicipalOfficialNumber(row[33]),
    segundo_siglas: segundoSiglas,
    segundo_votacion: parseMunicipalOfficialNumber(row[35]),
    segundo_porcentaje: parseMunicipalOfficialNumber(row[36]),
    margen_votos: parseMunicipalOfficialNumber(row[37]),
    margen_porcentual: parseMunicipalOfficialNumber(row[38]),
    ruta_acta: String(row[39] ?? "").trim() || null,
    fuerzas,
  };
}
