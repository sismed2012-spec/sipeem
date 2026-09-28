import { getUsuarioActual } from "@/actions/auth";
import { createTerritorialIndicatorsRoute } from "@/lib/territorial-indicators-http";
import { createTerritorialIndicatorsServiceInvoker } from "@/lib/territorial-indicators-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = createTerritorialIndicatorsRoute({
  authenticate: getUsuarioActual,
  createInvoker: createTerritorialIndicatorsServiceInvoker,
});
