// src/actions/auditoria.ts
"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";

export type AuditLogEntry = {
  id: number;
  user_email: string;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export async function getAuditLogs(page = 0, pageSize = 50): Promise<{
  logs: AuditLogEntry[];
  total: number;
}> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await svc
    .from("audit_logs")
    .select("id, user_email, action, entity, entity_id, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return { logs: (data ?? []) as AuditLogEntry[], total: count ?? 0 };
}
