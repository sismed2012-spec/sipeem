import { FUERZAS_2024_COLUMNS } from "./historial-secciones";

export type FuerzaCatalogoSeed = {
  siglas: string;
  nombre: string;
  color: string;
  estatus: "activo" | "inactivo";
};

export type MunicipalForceAggregate = {
  fuerza: string;
  votos: number;
};

export type MunicipalHistorialAggregate = {
  municipio_id: number;
  anio: number;
  total_validos: number;
  total_emitidos: number;
  winner_force: string;
  winner_votes: number;
  winner_pct: number;
  resultados: {
    fuerza: string;
    votos: number;
    porcentaje: number;
    posicion: number;
  }[];
};

const FORCE_COLORS: Record<string, string> = {
  PAN: "#1d4ed8",
  PRI: "#dc2626",
  PRD: "#facc15",
  PVEM: "#16a34a",
  PT: "#ef4444",
  MC: "#f97316",
  MORENA: "#7f1d1d",
  NAEM: "#0f766e",
  PAN_PRI_PRD_NAEM: "#475569",
  PAN_PRI_PRD: "#64748b",
  PAN_PRI_NAEM: "#334155",
  PAN_PRD_NAEM: "#0f172a",
  PRI_PRD_NAEM: "#52525b",
  PAN_PRI: "#1e3a8a",
  PAN_PRD: "#1e293b",
  PAN_NAEM: "#155e75",
  PRI_PRD: "#991b1b",
  PRI_NAEM: "#7c2d12",
  PRD_NAEM: "#a16207",
  PVEM_PT_MORENA: "#166534",
  PVEM_PT: "#15803d",
  PVEM_MORENA: "#166534",
  PT_MORENA: "#991b1b",
  CC_PAN_PRI_PRD_NAEM: "#111827",
  CAND_IND1: "#6b7280",
  CAND_IND2: "#6b7280",
  CAND_IND3: "#6b7280",
  CAND_IND4: "#6b7280",
  CAND_IND5: "#6b7280",
  CAND_IND6: "#6b7280",
  CAND_IND7: "#6b7280",
  CAND_IND8: "#6b7280",
  CAND_IND9: "#6b7280",
};

export function getFuerzaDisplayName(siglas: string): string {
  if (/^CAND_IND\d+$/.test(siglas)) {
    const suffix = siglas.replace("CAND_IND", "");
    return `Candidatura Independiente ${suffix}`;
  }

  if (siglas === "CC_PAN_PRI_PRD_NAEM") {
    return "Candidatura Comun PAN + PRI + PRD + NAEM";
  }

  if (siglas.includes("_")) {
    return siglas.split("_").join(" + ");
  }

  return siglas;
}

export function getFuerzaCatalogSeed(siglas: string): FuerzaCatalogoSeed {
  return {
    siglas,
    nombre: getFuerzaDisplayName(siglas),
    color: FORCE_COLORS[siglas] ?? "#6b7280",
    estatus: "activo",
  };
}

export function getAllFuerzas2024CatalogSeeds(): FuerzaCatalogoSeed[] {
  return FUERZAS_2024_COLUMNS.map((siglas) => getFuerzaCatalogSeed(siglas));
}

export function buildMunicipalAggregate(params: {
  municipio_id: number;
  anio: number;
  total_validos: number;
  total_emitidos: number;
  results: MunicipalForceAggregate[];
}): MunicipalHistorialAggregate | null {
  const sorted = [...params.results]
    .filter((entry) => entry.votos > 0)
    .sort((a, b) => b.votos - a.votos || a.fuerza.localeCompare(b.fuerza));

  if (sorted.length === 0 || params.total_validos <= 0) {
    return null;
  }

  const winner = sorted[0];

  return {
    municipio_id: params.municipio_id,
    anio: params.anio,
    total_validos: params.total_validos,
    total_emitidos: params.total_emitidos,
    winner_force: winner.fuerza,
    winner_votes: winner.votos,
    winner_pct: Number(((winner.votos / params.total_validos) * 100).toFixed(2)),
    resultados: sorted.map((entry, index) => ({
      fuerza: entry.fuerza,
      votos: entry.votos,
      porcentaje: Number(((entry.votos / params.total_validos) * 100).toFixed(2)),
      posicion: index + 1,
    })),
  };
}
