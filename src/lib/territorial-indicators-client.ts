import type {
  TerritorialIndicatorsInput,
  TerritorialIndicatorsResponse,
} from "./territorial-indicators-types";

export function territorialIndicatorsSelectionKey(
  input: TerritorialIndicatorsInput,
): string {
  return [
    input.level,
    input.versionId,
    input.nominalCutId ?? "latest",
    input.demographySourceId ?? "latest",
  ].join(":");
}

export function buildTerritorialIndicatorsUrl(
  input: TerritorialIndicatorsInput,
): string {
  const params = new URLSearchParams({
    level: input.level,
    versionId: String(input.versionId),
  });
  if (input.nominalCutId !== null) {
    params.set("nominalCutId", String(input.nominalCutId));
  }
  if (input.demographySourceId !== null) {
    params.set("demographySourceId", String(input.demographySourceId));
  }
  return `/api/indicadores-territoriales?${params.toString()}`;
}

type FetchTerritorialIndicators = (
  key: string,
  signal: AbortSignal,
  input: TerritorialIndicatorsInput,
) => Promise<TerritorialIndicatorsResponse>;

export function createTerritorialIndicatorsRequestCoordinator(
  fetchIndicators: FetchTerritorialIndicators,
  onValue: (value: TerritorialIndicatorsResponse | null) => void,
  onError: (error: Error) => void = () => {},
) {
  let generation = 0;
  let controller: AbortController | null = null;

  return {
    async select(input: TerritorialIndicatorsInput): Promise<void> {
      generation += 1;
      const selectedGeneration = generation;
      controller?.abort();
      controller = new AbortController();
      const selectedController = controller;
      onValue(null);
      try {
        const value = await fetchIndicators(
          territorialIndicatorsSelectionKey(input),
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
            : new Error("Error desconocido de indicadores territoriales"),
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
