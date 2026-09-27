import { getUsuarioActual } from "@/actions/auth";
import { runAuthenticatedCartografiaRequest } from "@/lib/cartografia-http";
import { createCartografiaServiceInvoker } from "@/lib/cartografia-server";
import { listCartografiaVersions } from "@/lib/cartografia-versionada";

export const dynamic = "force-dynamic";

export async function GET() {
  return runAuthenticatedCartografiaRequest({
    authenticate: getUsuarioActual,
    createInvoker: createCartografiaServiceInvoker,
    execute: listCartografiaVersions,
  });
}

