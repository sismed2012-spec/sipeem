import {
  CartografiaGatewayError,
  CartografiaInputError,
  getVersionedSections,
  parseViewportParams,
  type CartografiaRpcInvoker,
} from "./cartografia-versionada";

interface CartografiaRouteDependencies {
  authenticate: () => Promise<unknown | null>;
  createInvoker: () => CartografiaRpcInvoker;
  onError?: (error: Error) => void;
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export function createCartografiaSectionsRoute({
  authenticate,
  createInvoker,
  onError = console.error,
}: CartografiaRouteDependencies) {
  return async function GET(request: Request): Promise<Response> {
    const user = await authenticate();
    if (!user) return privateJson({ error: "No autenticado" }, 401);

    try {
      const input = parseViewportParams(new URL(request.url).searchParams);
      return privateJson(await getVersionedSections(createInvoker(), input));
    } catch (error) {
      if (error instanceof CartografiaInputError) {
        return privateJson({ error: error.message }, error.status);
      }
      if (error instanceof CartografiaGatewayError) {
        onError(error.cause);
        return privateJson({ error: error.message }, error.status);
      }
      const internalError =
        error instanceof Error
          ? error
          : new Error("Error cartografico desconocido");
      onError(internalError);
      return privateJson(
        { error: "Error interno al consultar la cartografia" },
        500
      );
    }
  };
}
