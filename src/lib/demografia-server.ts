import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getDemografiaSupabaseConfig } from "./demografia-config";
import type { DemografiaRpcInvoker } from "./demografia-versionada";

export function createDemografiaServiceInvoker(): DemografiaRpcInvoker {
  const { url, serviceRoleKey } = getDemografiaSupabaseConfig();
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return (_functionName, args) => supabase.rpc("rpc_demografia_seccion", args);
}
