# Audit Log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar todas las acciones de escritura (create/update/delete/import) realizadas por admin/director en una tabla `audit_logs`, y exponer un visor simple en `/admin/auditoria`.

**Architecture:** Una función `logAction()` en `src/lib/audit.ts` (no es server action — es una utilidad llamada desde dentro de las server actions existentes). Fire-and-forget: si el log falla, no interrumpe la operación principal. Un visor paginated en `/admin/auditoria`.

**Tech Stack:** Supabase service client · Next.js Server Components · Tailwind CSS 4

---

## Context

- Proyecto en `M:/SIPPEEM/sipeem/`
- NO hay git — NO hacer commits
- Leer `AGENTS.md` antes de escribir código Next.js
- Patrón de service client: `import { createServiceClient } from "@/lib/supabase/service"`
- `getUsuarioActual()` retorna `{ id, nombre, email, rol }` — usar `id` y `email` para el log

## File Map

| Archivo | Acción |
|---------|--------|
| `src/lib/audit.ts` | Crear — función `logAction()` |
| `src/actions/usuarios.ts` | Modificar — agregar calls a `logAction` |
| `src/actions/estrategia.ts` | Modificar — agregar calls a `logAction` |
| `src/actions/actores.ts` | Modificar — agregar calls a `logAction` |
| `src/actions/historial.ts` | Modificar — agregar calls a `logAction` |
| `src/app/(protected)/admin/auditoria/page.tsx` | Crear — visor |
| `src/actions/auditoria.ts` | Crear — `getAuditLogs()` |
| `src/components/SidebarNav.tsx` | Modificar — link a auditoria |

---

### Task 1: Tabla en Supabase

- [ ] **Step 1: SQL a ejecutar en Supabase**

Ejecutar en el SQL Editor de Supabase:

```sql
CREATE TABLE public.audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     text NOT NULL,
  user_email  text NOT NULL,
  action      text NOT NULL,   -- 'create' | 'update' | 'delete' | 'import' | 'upsert'
  entity      text NOT NULL,   -- 'usuario' | 'municipio' | 'estrategia' | 'historial' | 'planilla' | etc.
  entity_id   text,            -- id del registro afectado (puede ser número o uuid)
  details     jsonb,           -- info adicional: campos cambiados, conteos, etc.
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Índices para filtrado rápido
CREATE INDEX audit_logs_user_idx ON public.audit_logs (user_id);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity);
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);
```

---

### Task 2: Utilidad `logAction`

**Files:**
- Create: `src/lib/audit.ts`

- [ ] **Step 1: Crear la utilidad**

```typescript
// src/lib/audit.ts
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
  | "compromiso";

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
```

---

### Task 3: Instrumentar acciones existentes

**Files:**
- Modify: `src/actions/usuarios.ts`
- Modify: `src/actions/estrategia.ts`
- Modify: `src/actions/actores.ts`
- Modify: `src/actions/historial.ts`

- [ ] **Step 1: Agregar import en cada archivo**

En cada uno de los 4 archivos, agregar al inicio (después de los otros imports):

```typescript
import { logAction } from "@/lib/audit";
```

- [ ] **Step 2: Instrumentar `src/actions/usuarios.ts`**

Agregar `logAction` DESPUÉS de cada operación exitosa:

En `createUsuario`, después de `revalidatePath`:
```typescript
await logAction({ action: "create", entity: "usuario", entityId: userId, details: { email: data.email, rol: data.rol } });
return { success: true, password: tempPassword };
```

En `updateUsuario`, después de `revalidatePath`:
```typescript
await logAction({ action: "update", entity: "usuario", entityId: id, details: { nombre: data.nombre, rol: data.rol } });
return { success: true };
```

En `deleteUsuario`, después de verificar que auth delete fue exitoso (antes del return):
```typescript
await logAction({ action: "delete", entity: "usuario", entityId: id });
revalidatePath("/admin/usuarios");
return { success: true };
```

- [ ] **Step 3: Instrumentar `src/actions/estrategia.ts`**

Leer el archivo para encontrar `upsertMunicipioStrategicFile`. Agregar después del revalidatePath:

```typescript
await logAction({
  action: "upsert",
  entity: "estrategia",
  entityId: data.municipio_id,
  details: { prioridad: data.prioridad, riesgo: data.riesgo, estatus: data.estatus },
});
```

- [ ] **Step 4: Instrumentar `src/actions/actores.ts`**

Agregar en las 6 funciones de escritura (`upsertTermometros`, `upsertEscenarios`, `upsertComite`, `createPlanillaMember`, `deletePlanillaMember`, `createAspirante`, `updateAspirante`, `deleteAspirante`).

Ejemplo para `createPlanillaMember` (después del revalidatePath):
```typescript
await logAction({ action: "create", entity: "planilla", entityId: municipioId, details: { cargo: data.cargo, nombre: data.nombre } });
```

Ejemplo para `deletePlanillaMember` (después del revalidatePath):
```typescript
await logAction({ action: "delete", entity: "planilla", entityId: id });
```

Aplicar el mismo patrón a las demás funciones — ajustar entity y details según corresponda.

- [ ] **Step 5: Instrumentar `src/actions/historial.ts`**

Leer el archivo y buscar `upsertHistorialManual`. Agregar después del revalidatePath:
```typescript
await logAction({
  action: "upsert",
  entity: "historial",
  entityId: mainData.municipio_id,
  details: { anio: mainData.anio, partido_ganador_id: mainData.partido_ganador_id },
});
```

---

### Task 4: Action `getAuditLogs` y página visor

**Files:**
- Create: `src/actions/auditoria.ts`
- Create: `src/app/(protected)/admin/auditoria/page.tsx`

- [ ] **Step 1: Crear action de lectura**

```typescript
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
```

- [ ] **Step 2: Crear página visor**

```tsx
// src/app/(protected)/admin/auditoria/page.tsx
import { getAuditLogs } from "@/actions/auditoria";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  create: "bg-emerald-100 text-emerald-700 border-emerald-200",
  update: "bg-blue-100 text-blue-700 border-blue-200",
  upsert: "bg-indigo-100 text-indigo-700 border-indigo-200",
  delete: "bg-rose-100 text-rose-700 border-rose-200",
  import: "bg-amber-100 text-amber-700 border-amber-200",
};

export default async function AuditoriaPage() {
  const { logs, total } = await getAuditLogs(0, 100);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900 flex items-center gap-3">
            <ClipboardList className="w-8 h-8 text-slate-700" />
            Auditoría del Sistema
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} registros · últimas 100 acciones mostradas
          </p>
        </div>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Usuario</th>
                <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Acción</th>
                <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Entidad</th>
                <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">ID</th>
                <th className="text-left px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Sin registros de auditoría
                  </td>
                </tr>
              )}
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("es-MX", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-medium text-slate-700">
                    {log.user_email}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-black uppercase tracking-wide ${ACTION_COLORS[log.action] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {log.action}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600">{log.entity}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400">{log.entity_id ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-400 max-w-xs truncate">
                    {log.details ? JSON.stringify(log.details) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

### Task 5: Link en Sidebar + verificación

**Files:**
- Modify: `src/components/SidebarNav.tsx`

- [ ] **Step 1: Agregar link al sidebar**

Leer `src/components/SidebarNav.tsx`. Agregar en la sección de links admin:

```tsx
<Link href="/admin/auditoria" className={/* misma clase que otros links */}>
  <ClipboardList className="w-4 h-4" />
  Auditoría
</Link>
```

Agregar import: `import { ClipboardList } from "lucide-react";`

- [ ] **Step 2: Verificar build**

```bash
cd M:/SIPPEEM/sipeem && npm run build 2>&1 | tail -20
```
