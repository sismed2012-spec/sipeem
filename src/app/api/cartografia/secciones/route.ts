import { getUsuarioActual } from "@/actions/auth";
import { createCartografiaSectionsRoute } from "@/lib/cartografia-http";
import { createCartografiaServiceInvoker } from "@/lib/cartografia-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = createCartografiaSectionsRoute({
  authenticate: getUsuarioActual,
  createInvoker: createCartografiaServiceInvoker,
});
