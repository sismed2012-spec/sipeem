import {
  ListaNominalGatewayError,
  ListaNominalInputError,
  getVersionedNominalList,
  parseListaNominalSectionParams,
  type ListaNominalRpcInvoker,
} from "./lista-nominal-versionada";

interface AuthenticatedListaNominalRequestOptions<T> {
  authenticate: () => Promise<unknown | null>;
  createInvoker: () => ListaNominalRpcInvoker;
  execute: (invoke: ListaNominalRpcInvoker) => Promise<T>;
  onError?: (error: Error) => void;
}

interface ListaNominalRouteDependencies {
  authenticate: () => Promise<unknown | null>;
  createInvoker: () => ListaNominalRpcInvoker;
  onError?: (error: Error) => void;
}

interface ListaNominalRouteContext {
  params: Promise<{ seccionId: string }>;
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function runAuthenticatedListaNominalRequest<T>({
  authenticate,
  createInvoker,
  execute,
  onError = console.error,
}: AuthenticatedListaNominalRequestOptions<T>): Promise<Response> {
  const user = await authenticate();
  if (!user) return privateJson({ error: "No autenticado" }, 401);

  try {
    return privateJson(await execute(createInvoker()));
  } catch (error) {
    if (error instanceof ListaNominalInputError) {
      return privateJson({ error: error.message }, error.status);
    }
    if (error instanceof ListaNominalGatewayError) {
      onError(error.cause);
      return privateJson({ error: error.message }, error.status);
    }
    const internalError =
      error instanceof Error
        ? error
        : new Error("Error desconocido de lista nominal");
    onError(internalError);
    return privateJson(
      { error: "Error interno al consultar la lista nominal" },
      500,
    );
  }
}

export function createListaNominalSectionRoute({
  authenticate,
  createInvoker,
  onError,
}: ListaNominalRouteDependencies) {
  return async function GET(
    request: Request,
    context: ListaNominalRouteContext,
  ): Promise<Response> {
    return runAuthenticatedListaNominalRequest({
      authenticate,
      createInvoker,
      onError,
      execute: async (invoke) => {
        const { seccionId } = await context.params;
        const input = parseListaNominalSectionParams(
          seccionId,
          new URL(request.url).searchParams,
        );
        return getVersionedNominalList(invoke, input);
      },
    });
  };
}
