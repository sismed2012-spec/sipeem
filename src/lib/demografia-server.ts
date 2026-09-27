import "server-only";

import { createServiceClient } from "./supabase/service";
import type { DemografiaRpcInvoker } from "./demografia-versionada";

export function createDemografiaServiceInvoker(): DemografiaRpcInvoker {
  const supabase = createServiceClient();
  return (_functionName, args) => supabase.rpc("rpc_demografia_seccion", args);
}
