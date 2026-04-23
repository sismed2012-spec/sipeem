import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "@/actions/auth";

export type AuditAction = "create" | "update" | "delete" | "import" | "upsert";

export type AuditEntity =
  | "usuario"
  | "municipio"
  | "partido"
  | "estrategia"
  | "historial"
  | "planilla"
  | "aspirante"
  | "termometros"
  | "escenarios"
  | "comite"
  | "evento"
  | "incidencia"
  | "compromiso"
  | "competencia";

type LogParams = {
  action: AuditAction;
  entity: AuditEntity;
  entityId?: string | number;
  details?: Record<string, unknown>;
};

/**
 * Registra una acción de admin/director en audit_logs.
 * Fire-and-forget: los errores se suprimen para no interrumpir la operación principal.
 */
export async function logAction(params: LogParams): Promise<void> {
  try {
    const usuario = await getUsuarioActual();
    if (!usuario) return; // No loguear acciones anónimas

    const svc = createServiceClient();
    await svc.from("audit_logs").insert({
      user_id: usuario.id,
      user_email: usuario.email,
      action: params.action,
      entity: params.entity,
      entity_id: params.entityId !== undefined ? String(params.entityId) : null,
      details: params.details ?? null,
    });
  } catch {
    // Silently suppress — audit failure must never break the main operation
  }
}
