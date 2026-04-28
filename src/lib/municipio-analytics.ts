export type MunicipioTimelineEvent = {
  id: number;
  anio: number;
  winner: string;
  winnerSiglas: string;
  winnerColor: string;
  votos: number;
  porcentaje: number;
  margin: number;
  source: "oficial_municipal" | "legacy_municipal" | "gubernatura_seccional";
  electionType: "municipal" | "gubernatura";
  topParties: { siglas: string; votes: number; color: string }[];
};

export function mergeMunicipioTimelineEvents(input: {
  municipal: MunicipioTimelineEvent[];
  gubernatura2023?: MunicipioTimelineEvent | null;
}) {
  return [...input.municipal, ...(input.gubernatura2023 ? [input.gubernatura2023] : [])].sort(
    (a, b) => b.anio - a.anio
  );
}

export function getTimelineSpotlightEvents(events: MunicipioTimelineEvent[]) {
  return [...events].sort((a, b) => b.anio - a.anio);
}
