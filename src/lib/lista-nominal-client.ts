import type { ListaNominalSeccionResponse } from "./lista-nominal-types";

export interface ListaNominalSelectionKey {
  sectionId: number;
  versionId: number;
  cutoffDate: string | null;
}

export function listaNominalSelectionKey(
  input: ListaNominalSelectionKey,
): string {
  return `${input.sectionId}:${input.versionId}:${input.cutoffDate ?? "latest"}`;
}

type FetchListaNominal = (
  key: string,
  signal: AbortSignal,
  input: ListaNominalSelectionKey,
) => Promise<ListaNominalSeccionResponse>;

export function createListaNominalRequestCoordinator(
  fetchListaNominal: FetchListaNominal,
  onValue: (value: ListaNominalSeccionResponse | null) => void,
  onError: (error: Error) => void = () => {},
) {
  let generation = 0;
  let controller: AbortController | null = null;

  return {
    async select(input: ListaNominalSelectionKey): Promise<void> {
      generation += 1;
      const selectedGeneration = generation;
      controller?.abort();
      controller = new AbortController();
      const selectedController = controller;
      onValue(null);
      try {
        const value = await fetchListaNominal(
          listaNominalSelectionKey(input),
          selectedController.signal,
          input,
        );
        if (
          generation === selectedGeneration &&
          !selectedController.signal.aborted
        ) {
          onValue(value);
        }
      } catch (error) {
        if (
          generation !== selectedGeneration ||
          selectedController.signal.aborted
        ) {
          return;
        }
        onError(
          error instanceof Error
            ? error
            : new Error("Error desconocido de lista nominal"),
        );
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
