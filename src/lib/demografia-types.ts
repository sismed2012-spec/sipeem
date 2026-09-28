export type DemografiaSectionStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "PENDING"
  | "UNAVAILABLE";

export type DemografiaSourceGrain = "SECCION" | "LOCALIDAD";

export interface DemografiaSeccionResponse {
  sectionId: number;
  versionId: number;
  source: {
    provider: "INEGI";
    datasetKey: string;
    censusYear: number;
    sourceGrain: DemografiaSourceGrain | null;
    sourceFrameDate: string | null;
    mappingMethod: string | null;
    mappingStatus: string | null;
    warnings: string[];
  };
  status: DemografiaSectionStatus;
  coverage: {
    includedLocalities: number | null;
    pendingLocalities: number | null;
    includedPopulation: number | null;
    pendingPopulationReference: number | null;
    percentage: number | null;
    isAdditive: false;
  };
  indicators: Record<string, number | null>;
}
