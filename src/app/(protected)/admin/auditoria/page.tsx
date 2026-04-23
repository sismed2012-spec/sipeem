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
