import {
  CartografiaGatewayError,
  CartografiaInputError,
  type CartografiaRpcInvoker,
} from "./cartografia-versionada";

interface AuthenticatedCartografiaRequestOptions<T> {
  authenticate: () => Promise<unknown | null>;
  createInvoker: () => CartografiaRpcInvoker;
  execute: (invoke: CartografiaRpcInvoker) => Promise<T>;
  onError?: (error: Error) => void;
}

function privateJson(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function runAuthenticatedCartografiaRequest<T>({
  authenticate,
  createInvoker,
  execute,
  onError = console.error,
}: AuthenticatedCartografiaRequestOptions<T>): Promise<Response> {
  const user = await authenticate();
  if (!user) {
    return privateJson({ error: "No autenticado" }, 401);
  }

  try {
    const result = await execute(createInvoker());
    return privateJson(result);
  } catch (error) {
    if (error instanceof CartografiaInputError) {
      return privateJson({ error: error.message }, error.status);
    }
    if (error instanceof CartografiaGatewayError) {
      onError(error.cause);
      return privateJson({ error: error.message }, error.status);
    }

    const internalError =
      error instanceof Error ? error : new Error("Error cartografico desconocido");
    onError(internalError);
    return privateJson({ error: "Error interno al consultar la cartografia" }, 500);
  }
}

