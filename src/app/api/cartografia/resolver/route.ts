import { getUsuarioActual } from "@/actions/auth";
import { runAuthenticatedCartografiaRequest } from "@/lib/cartografia-http";
import { createCartografiaServiceInvoker } from "@/lib/cartografia-server";
import {
  parseResolverParams,
  resolveVersionedTerritory,
} from "@/lib/cartografia-versionada";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runAuthenticatedCartografiaRequest({
    authenticate: getUsuarioActual,
    createInvoker: createCartografiaServiceInvoker,
    execute: (invoke) =>
      resolveVersionedTerritory(
        invoke,
        parseResolverParams(new URL(request.url).searchParams)
      ),
  });
}

