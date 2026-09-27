import {
  DemografiaGatewayError,
  DemografiaInputError,
  getVersionedSectionDemographics,
  parseDemografiaSectionParams,
  type DemografiaRpcInvoker,
} from "./demografia-versionada";

interface AuthenticatedDemografiaRequestOptions<T> {
  authenticate: () => Promise<unknown | null>;
  createInvoker: () => DemografiaRpcInvoker;
  execute: (invoke: DemografiaRpcInvoker) => Promise<T>;
  onError?: (error: Error) => void;
}

interface DemografiaRouteDependencies {
  authenticate: () => Promise<unknown | null>;
  createInvoker: () => DemografiaRpcInvoker;
  onError?: (error: Error) => void;
}

interface DemografiaRouteContext {
  params: Promise<{ seccionId: string }>;
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function runAuthenticatedDemografiaRequest<T>({
  authenticate,
  createInvoker,
  execute,
  onError = console.error,
}: AuthenticatedDemografiaRequestOptions<T>): Promise<Response> {
  const user = await authenticate();
  if (!user) return privateJson({ error: "No autenticado" }, 401);

  try {
    return privateJson(await execute(createInvoker()));
  } catch (error) {
    if (error instanceof DemografiaInputError) {
      return privateJson({ error: error.message }, error.status);
    }
    if (error instanceof DemografiaGatewayError) {
      onError(error.cause);
      return privateJson({ error: error.message }, error.status);
    }
    const internalError = error instanceof Error
      ? error
      : new Error("Error demografico desconocido");
    onError(internalError);
    return privateJson({ error: "Error interno al consultar la demografia" }, 500);
  }
}

export function createDemografiaSectionRoute({
  authenticate,
  createInvoker,
  onError,
}: DemografiaRouteDependencies) {
  return async function GET(request: Request, context: DemografiaRouteContext): Promise<Response> {
    return runAuthenticatedDemografiaRequest({
      authenticate,
      createInvoker,
      onError,
      execute: async (invoke) => {
        const { seccionId } = await context.params;
        const input = parseDemografiaSectionParams(
          seccionId,
          new URL(request.url).searchParams
        );
        return getVersionedSectionDemographics(invoke, input);
      },
    });
  };
}
