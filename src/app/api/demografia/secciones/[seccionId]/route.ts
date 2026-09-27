import { getUsuarioActual } from "@/actions/auth";
import { createDemografiaSectionRoute } from "@/lib/demografia-http";
import { createDemografiaServiceInvoker } from "@/lib/demografia-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = createDemografiaSectionRoute({
  authenticate: getUsuarioActual,
  createInvoker: createDemografiaServiceInvoker,
});
