"use client";

import { MapAnalyticsDTO } from "@/actions/analytics";
import { Card } from "@/components/ui/card";
import { Users } from "lucide-react";

interface Props {
  pos: { x: number; y: number };
  municipio: { nombre: string; data?: MapAnalyticsDTO };
  isAnalytic: boolean;
}

export function MapTooltip({ pos, municipio, isAnalytic }: Props) {
  const { data } = municipio;

  return (
    <div 
      className="fixed z-[100] pointer-events-none transition-transform duration-75 ease-out"
      style={{ 
        left: pos.x + 20, 
        top: pos.y + 20,
      }}
    >
      <Card className="bg-slate-900/95 backdrop-blur-xl border-slate-700 shadow-[0_20px_50px_rgba(0,0,0,0.5)] p-4 min-w-[240px] text-white overflow-hidden ring-1 ring-white/20">
        <div className="border-b border-white/10 pb-2 mb-3">
          <h3 className="font-black text-sm uppercase tracking-wider text-indigo-300">{municipio.nombre}</h3>
          {!data && <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Sin datos de historial</p>}
        </div>

        {isAnalytic && data ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-1.5 h-8 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)]" 
                  style={{ backgroundColor: data.partido_color || '#fff' }}
                />
                <div>
                  <div className="text-[9px] text-slate-400 font-black uppercase tracking-[0.2em]">Ganador {data.anio}</div>
                  <div className="text-base font-black text-white">{data.partido_siglas}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-black text-indigo-400 tabular-nums">{data.porcentaje_ganador}%</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-3 border-t border-white/5">
              <div className="flex flex-col gap-0.5">
                <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Votación</span>
                <span className="text-xs font-bold tabular-nums text-slate-200">{data.votos_ganador.toLocaleString()} <span className="text-[8px] text-slate-500 uppercase">votos</span></span>
              </div>
              <div className="flex flex-col text-right gap-0.5">
                <span className="text-[9px] text-slate-500 uppercase font-black tracking-widest">Margen</span>
                <span className="text-xs font-bold tabular-nums text-emerald-400">+{data.margin.toLocaleString()}</span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 pt-1">
              <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 rounded-full" 
                  style={{ width: `${data.porcentaje_ganador}%` }}
                />
              </div>
            </div>

            <p className="text-[9px] text-indigo-300 font-bold flex items-center gap-1.5 bg-indigo-500/10 px-2 py-1 rounded-md border border-indigo-500/20">
              <Users className="w-3 h-3" /> CLIC PARA PERFIL MUNICIPAL
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center py-2">
             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest italic group-hover:not-italic group-hover:text-white transition-colors">
               Operación Territorial SIPEEM
             </p>
          </div>
        )}
      </Card>
    </div>
  );
}
