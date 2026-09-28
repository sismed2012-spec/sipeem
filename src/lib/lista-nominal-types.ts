export type ListaNominalStatus = "AVAILABLE" | "UNAVAILABLE";

export interface ListaNominalCounts {
  men: number;
  women: number;
  nonBinary: number;
  total: number;
}

export interface ListaNominalSeccionResponse {
  sectionId: number;
  versionId: number;
  cutoffDate: string | null;
  source: {
    provider: "INE";
    fileName: string;
    sha256: string;
  } | null;
  status: ListaNominalStatus;
  padron: ListaNominalCounts | null;
  nominal: ListaNominalCounts | null;
  difference: number | null;
  coverage: number | null;
}
