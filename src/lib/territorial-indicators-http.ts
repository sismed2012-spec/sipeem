import {
  TerritorialIndicatorsGatewayError,
  TerritorialIndicatorsInputError,
  getTerritorialIndicators,
  parseTerritorialIndicatorParams,
  type TerritorialIndicatorsRpcInvoker,
} from "./territorial-indicators-versioned";

interface AuthenticatedTerritorialIndicatorsRequestOptions<T> {
  authenticate: () => Promise<unknown | null>;
  createInvoker: () => TerritorialIndicatorsRpcInvoker;
  execute: (invoke: TerritorialIndicatorsRpcInvoker) => Promise<T>;
  onError?: (error: Error) => void;
}

interface TerritorialIndicatorsRouteDependencies {
  authenticate: () => Promise<unknown | null>;
  createInvoker: () => TerritorialIndicatorsRpcInvoker;
  onError?: (error: Error) => void;
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function runAuthenticatedTerritorialIndicatorsRequest<T>({
  authenticate,
  createInvoker,
  execute,
  onError = console.error,
}: AuthenticatedTerritorialIndicatorsRequestOptions<T>): Promise<Response> {
  const user = await authenticate();
  if (!user) return privateJson({ error: "No autenticado" }, 401);

  try {
    return privateJson(await execute(createInvoker()));
  } catch (error) {
    if (error instanceof TerritorialIndicatorsInputError) {
      return privateJson({ error: error.message }, error.status);
    }
    if (error instanceof TerritorialIndicatorsGatewayError) {
      onError(error.cause);
      return privateJson({ error: error.message }, error.status);
    }
    onError(error instanceof Error ? error : new Error("Error desconocido"));
    return privateJson(
      { error: "Error interno al consultar indicadores territoriales" },
      500,
    );
  }
}

export function createTerritorialIndicatorsRoute({
  authenticate,
  createInvoker,
  onError,
}: TerritorialIndicatorsRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    return runAuthenticatedTerritorialIndicatorsRequest({
      authenticate,
      createInvoker,
      onError,
      execute: (invoke) =>
        getTerritorialIndicators(
          invoke,
          parseTerritorialIndicatorParams(new URL(request.url).searchParams),
        ),
    });
  };
}
