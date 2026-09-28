import { getUsuarioActual } from "@/actions/auth";
import { createListaNominalSectionRoute } from "@/lib/lista-nominal-http";
import { createListaNominalServiceInvoker } from "@/lib/lista-nominal-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = createListaNominalSectionRoute({
  authenticate: getUsuarioActual,
  createInvoker: createListaNominalServiceInvoker,
});
