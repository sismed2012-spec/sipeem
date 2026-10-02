import type { DemografiaSeccionResponse } from "./demografia-types";

export interface DemografiaSelectionKey {
  sectionId: number;
  versionId: number;
  censusYear: number;
}

export function demographicSelectionKey(input: DemografiaSelectionKey): string {
  return `${input.sectionId}:${input.versionId}:${input.censusYear}`;
}

type FetchDemografia = (
  key: string,
  signal: AbortSignal,
  input: DemografiaSelectionKey
) => Promise<DemografiaSeccionResponse>;

export function createDemografiaRequestCoordinator(
  fetchDemografia: FetchDemografia,
  onValue: (value: DemografiaSeccionResponse | null) => void,
  onError: (error: Error) => void = () => {}
) {
  let generation = 0;
  let controller: AbortController | null = null;

  return {
    async select(input: DemografiaSelectionKey): Promise<void> {
      generation += 1;
      const selectedGeneration = generation;
      controller?.abort();
      controller = new AbortController();
      const selectedController = controller;
      onValue(null);
      try {
        const value = await fetchDemografia(
          demographicSelectionKey(input),
          selectedController.signal,
          input
        );
        if (generation === selectedGeneration && !selectedController.signal.aborted) {
          onValue(value);
        }
      } catch (error) {
        if (generation !== selectedGeneration || selectedController.signal.aborted) return;
        onError(error instanceof Error ? error : new Error("Error demografico desconocido"));
      }
    },
    clear(): void {
      generation += 1;
      controller?.abort();
      controller = null;
      onValue(null);
    },
  };
}
