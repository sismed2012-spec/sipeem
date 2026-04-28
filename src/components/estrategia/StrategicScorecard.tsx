"use client";

import { Card } from "@/components/ui/card";
import { 
  ShieldAlert, 
  Target, 
  AlertTriangle, 
  Clock 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  stats: {
    total: number;
    pending: number;
    byPriority: Record<string, number>;
    byRisk: Record<string, number>;
  };
}

export function StrategicOverviewDashboard({ stats }: Props) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Total y Pendientes */}
        <Card className="p-4 border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cobertura</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.total}</h3>
              <p className="text-[10px] text-slate-500 mt-1">Municipios Totales</p>
            </div>
            <div className="p-2 bg-slate-100 rounded-lg text-slate-500">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
             <div 
               className="h-full bg-slate-900 transition-all duration-1000" 
               style={{ width: `${((stats.total - stats.pending) / stats.total) * 100}%` }}
             />
          </div>
        </Card>

        <Card className="p-4 border-slate-200 shadow-sm border-l-4 border-l-amber-500">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-amber-600">Pendientes</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.pending}</h3>
              <p className="text-[10px] text-slate-500 mt-1">Sin Ficha Estratégica</p>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <Clock className="w-4 h-4" />
            </div>
          </div>
        </Card>

        {/* Riesgo Extremo */}
        <Card className="p-4 border-slate-200 shadow-sm border-l-4 border-l-rose-500 bg-rose-50/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Foco Rojo</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.byRisk["Extremo"]}</h3>
              <p className="text-[10px] text-slate-500 mt-1">Riesgo Extremo</p>
            </div>
            <div className="p-2 bg-rose-100 rounded-lg text-rose-600">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
        </Card>

        {/* Prioridad Crítica */}
        <Card className="p-4 border-slate-200 shadow-sm border-l-4 border-l-indigo-500 bg-indigo-50/30">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Prioridad</p>
              <h3 className="text-2xl font-black text-slate-900 mt-1">{stats.byPriority["Crítica"]}</h3>
              <p className="text-[10px] text-slate-500 mt-1">Municipios Críticos</p>
            </div>
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
         {/* Distribución de Prioridad */}
         <Card className="p-6 border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Distribución de Prioridad</h4>
            <div className="space-y-4">
               {["Crítica", "Alta", "Media", "Baja"].map((p) => (
                 <div key={p} className="space-y-2">
                    <div className="flex justify-between items-center text-[10px] font-bold">
                       <span className={cn(
                         p === "Crítica" ? "text-rose-600" : p === "Alta" ? "text-amber-600" : "text-slate-500"
                       )}>{p}</span>
                       <span className="text-slate-900 uppercase">{stats.byPriority[p] || 0} MUN</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                       <div 
                         className={cn(
                           "h-full transition-all duration-700",
                           p === "Crítica" ? "bg-rose-500" : p === "Alta" ? "bg-amber-500" : p === "Media" ? "bg-blue-500" : "bg-slate-400"
                         )} 
                         style={{ width: `${((stats.byPriority[p] || 0) / (stats.total - stats.pending || 1)) * 100}%` }}
                       />
                    </div>
                 </div>
               ))}
            </div>
         </Card>

         {/* Distribución de Riesgo */}
         <Card className="p-6 border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Nivel de Riesgo Operativo</h4>
            <div className="grid grid-cols-2 gap-4">
                {Object.entries(stats.byRisk).map(([risk, count]) => (
                  <div key={risk} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 flex items-center justify-between">
                     <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{risk}</p>
                        <p className="text-lg font-black text-slate-900">{count}</p>
                     </div>
                     <div className={cn(
                       "w-2 h-8 rounded-full",
                       risk === "Extremo" ? "bg-rose-500" : risk === "Alto" ? "bg-amber-500" : risk === "Medio" ? "bg-blue-500" : "bg-emerald-500"
                     )} />
                  </div>
                ))}
            </div>
         </Card>
      </div>
    </div>
  );
}
