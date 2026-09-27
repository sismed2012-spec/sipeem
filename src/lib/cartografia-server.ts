import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getCartografiaSupabaseConfig } from "./cartografia-config";
import type { CartografiaRpcInvoker } from "./cartografia-versionada";

export function createCartografiaServiceInvoker(): CartografiaRpcInvoker {
  const { url, serviceRoleKey } = getCartografiaSupabaseConfig();
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return (functionName, args) => supabase.rpc(functionName, args);
}

