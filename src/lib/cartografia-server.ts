import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getDemografiaSupabaseConfig } from "./demografia-config";
import type { CartografiaRpcInvoker } from "./cartografia-versionada";

export function createCartografiaServiceInvoker(): CartografiaRpcInvoker {
  const { url, serviceRoleKey } = getDemografiaSupabaseConfig();
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return (functionName, args) => supabase.rpc(functionName, args);
}
