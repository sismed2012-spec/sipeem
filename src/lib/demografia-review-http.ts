import {
  DemografiaReviewGatewayError,
  DemografiaReviewInputError,
  getDemografiaReviewQueue,
  parseDemografiaReviewParams,
  type DemografiaReviewRpcInvoker,
} from "./demografia-review";

interface ReviewUser {
  rol?: unknown;
}

interface AuthorizedReviewRequestOptions<T> {
  authenticate: () => Promise<ReviewUser | null>;
  createInvoker: () => DemografiaReviewRpcInvoker;
  execute: (invoke: DemografiaReviewRpcInvoker) => Promise<T>;
  onError?: (error: Error) => void;
}

interface ReviewRouteDependencies {
  authenticate: () => Promise<ReviewUser | null>;
  createInvoker: () => DemografiaReviewRpcInvoker;
  onError?: (error: Error) => void;
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function runAuthorizedDemografiaReviewRequest<T>({
  authenticate,
  createInvoker,
  execute,
  onError = console.error,
}: AuthorizedReviewRequestOptions<T>): Promise<Response> {
  const user = await authenticate();
  if (!user) return privateJson({ error: "No autenticado" }, 401);
  if (user.rol !== "admin" && user.rol !== "director") {
    return privateJson({ error: "No autorizado" }, 403);
  }

  try {
    return privateJson(await execute(createInvoker()));
  } catch (error) {
    if (error instanceof DemografiaReviewInputError) {
      return privateJson({ error: error.message }, error.status);
    }
    if (error instanceof DemografiaReviewGatewayError) {
      onError(error.cause);
      return privateJson({ error: error.message }, error.status);
    }
    const internalError = error instanceof Error
      ? error
      : new Error("Error demografico desconocido");
    onError(internalError);
    return privateJson(
      { error: "Error interno al consultar la revision demografica" },
      500
    );
  }
}

export function createDemografiaReviewRoute({
  authenticate,
  createInvoker,
  onError,
}: ReviewRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    return runAuthorizedDemografiaReviewRequest({
      authenticate,
      createInvoker,
      onError,
      execute: (invoke) => getDemografiaReviewQueue(
        invoke,
        parseDemografiaReviewParams(new URL(request.url).searchParams)
      ),
    });
  };
}
