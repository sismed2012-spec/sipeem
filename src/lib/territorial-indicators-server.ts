import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getDemografiaSupabaseConfig } from "./demografia-config";
import type { TerritorialIndicatorsRpcInvoker } from "./territorial-indicators-versioned";

export function createTerritorialIndicatorsServiceInvoker(): TerritorialIndicatorsRpcInvoker {
  const { url, serviceRoleKey } = getDemografiaSupabaseConfig();
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return (_functionName, args) =>
    supabase.rpc("rpc_indicadores_territoriales", args);
}
