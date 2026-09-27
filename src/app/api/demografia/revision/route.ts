import { getUsuarioActual } from "@/actions/auth";
import { createDemografiaReviewRoute } from "@/lib/demografia-review-http";
import { createDemografiaReviewServiceInvoker } from "@/lib/demografia-review-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = createDemografiaReviewRoute({
  authenticate: getUsuarioActual,
  createInvoker: createDemografiaReviewServiceInvoker,
});
