export type Message = { role: "user" | "assistant"; content: string };

export type MunicipioKPIs = {
  nombre: string;
  proyeccion: { puntuacion: number; nivel: string } | null;
  termometros: {
    term1: number;
    term2: number;
    term3: number;
    term4: number;
    term5: number;
  } | null;
  coberturaPromedio: number | null;
  riesgoElectoral: string | null;
  estrategia: { prioridad: string; riesgo: string; estatus: string } | null;
};

export type ActoresData = {
  comite: { presidente: string; secretario: string } | null;
  planilla: { cargo: string; nombre: string; partido: string }[];
  aspirantes: { nombre: string; cargo_aspirado: string; partido: string }[];
};

export type HistorialItem = {
  anio: number;
  winnerSiglas: string;
  porcentaje: number | null;
};
