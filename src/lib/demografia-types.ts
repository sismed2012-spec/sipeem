export type DemografiaSectionStatus =
  | "COMPLETE"
  | "PARTIAL"
  | "PENDING"
  | "UNAVAILABLE";

export interface DemografiaSeccionResponse {
  sectionId: number;
  versionId: number;
  source: {
    provider: "INEGI";
    datasetKey: string;
    censusYear: number;
  };
  status: DemografiaSectionStatus;
  coverage: {
    includedLocalities: number;
    pendingLocalities: number;
    includedPopulation: number | null;
    pendingPopulationReference: number | null;
    percentage: number | null;
    isAdditive: false;
  };
  indicators: Record<string, number | null>;
}
