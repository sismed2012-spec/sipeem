"use client";

import { MapAnalyticsDTO } from "@/actions/analytics";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MapLegend({
  data,
  className,
}: {
  data: MapAnalyticsDTO[];
  className?: string;
}) {
  // Obtener partidos únicos presentes en la vista actual
  const partiesMap = new Map<string, { siglas: string; color: string; count: number }>();
  let inconsistente = 0;
  let casiConsistente = 0;
  
  data.forEach(d => {
    if (d.partido_siglas) {
      const existing = partiesMap.get(d.partido_siglas);
      if (existing) {
        existing.count++;
      } else {
        partiesMap.set(d.partido_siglas, { 
          siglas: d.partido_siglas, 
          color: d.partido_color || "#94a3b8",
          count: 1
        });
      }
    }
    if (d.consistency_status === "inconsistente") inconsistente++;
    if (d.consistency_status === "casi_consistente") casiConsistente++;
  });

  const parties = Array.from(partiesMap.values()).sort((a, b) => b.count - a.count);

  if (parties.length === 0) return null;

  return (
    <Card
      className={cn(
        "max-w-[220px] rounded-2xl border bg-white/95 p-4 shadow-[0_10px_30px_rgba(0,0,0,0.1)] ring-1 ring-slate-200/50 backdrop-blur-md",
        className
      )}
    >
      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center justify-between">
        Control Político
        <span className="bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded text-[8px]">{data.length} MUN</span>
      </h4>
      <div className="space-y-2.5">
        {parties.map(p => (
          <div key={p.siglas} className="flex items-center gap-3 group cursor-default">
            <div className="relative">
              <div 
                className="w-3.5 h-3.5 rounded-full shadow-sm group-hover:scale-110 transition-transform" 
                style={{ backgroundColor: p.color }}
              />
              <div 
                className="absolute inset-0 w-3.5 h-3.5 rounded-full blur-[4px] opacity-40" 
                style={{ backgroundColor: p.color }}
              />
            </div>
            <span className="text-[11px] font-black text-slate-700 tracking-tight">{p.siglas}</span>
            <div className="ml-auto flex items-baseline gap-1">
              <span className="text-xs font-black text-slate-900 tabular-nums">{p.count}</span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-200" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sin Historial</span>
        </div>
        <div className="mt-2 space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm border border-amber-500" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Casi consistente {casiConsistente > 0 ? `(${casiConsistente})` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-sm border border-rose-600" style={{ borderStyle: "dashed" }} />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Inconsistente {inconsistente > 0 ? `(${inconsistente})` : ""}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
