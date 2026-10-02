import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getDemografiaSupabaseConfig } from "./demografia-config";
import type { ListaNominalRpcInvoker } from "./lista-nominal-versionada";

export function createListaNominalServiceInvoker(): ListaNominalRpcInvoker {
  const { url, serviceRoleKey } = getDemografiaSupabaseConfig();
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return (_functionName, args) =>
    supabase.rpc("rpc_lista_nominal_seccion", args);
}
