import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getDemografiaSupabaseConfig } from "./demografia-config";
import type { DemografiaReviewRpcInvoker } from "./demografia-review";

export function createDemografiaReviewServiceInvoker(): DemografiaReviewRpcInvoker {
  const { url, serviceRoleKey } = getDemografiaSupabaseConfig();
  const supabase = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return (functionName, args) => supabase.rpc(functionName, args);
}
