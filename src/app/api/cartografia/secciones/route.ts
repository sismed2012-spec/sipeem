import { getUsuarioActual } from "@/actions/auth";
import { runAuthenticatedCartografiaRequest } from "@/lib/cartografia-http";
import { createCartografiaServiceInvoker } from "@/lib/cartografia-server";
import {
  getVersionedSections,
  parseViewportParams,
} from "@/lib/cartografia-versionada";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return runAuthenticatedCartografiaRequest({
    authenticate: getUsuarioActual,
    createInvoker: createCartografiaServiceInvoker,
    execute: (invoke) =>
      getVersionedSections(
        invoke,
        parseViewportParams(new URL(request.url).searchParams)
      ),
  });
}
