"use client";

import type { ProyeccionMunicipio } from "@/actions/proyeccion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { proyeccion: ProyeccionMunicipio | null };

const NIVEL_COLORS: Record<string, string> = {
  muy_alto: "text-emerald-600",
  alto: "text-blue-600",
  medio: "text-amber-600",
  bajo: "text-rose-600",
};

const NIVEL_LABELS: Record<string, string> = {
  muy_alto: "Muy alto",
  alto: "Alto",
  medio: "Medio",
  bajo: "Bajo",
};

const NIVEL_BG: Record<string, string> = {
  muy_alto: "bg-emerald-500",
  alto: "bg-blue-500",
  medio: "bg-amber-400",
  bajo: "bg-rose-400",
};

function ScoreBar({ label, value, description }: { label: string; value: number; description: string }) {
  const color = value >= 75 ? "bg-emerald-400" : value >= 50 ? "bg-blue-400" : value >= 25 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-slate-700">{label}</span>
        <span className="font-black text-slate-900 tabular-nums">{value}</span>
      </div>
      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <p className="text-[10px] text-slate-400">{description}</p>
    </div>
  );
}

export default function ProyeccionPanel({ proyeccion }: Props) {
  if (!proyeccion) {
    return (
      <Card className="border-slate-200 shadow-md">
        <CardContent className="pt-6">
          <p className="text-sm text-slate-400 italic text-center py-8">
            Sin datos suficientes para calcular proyección. Configure termómetros, historial y competencia.
          </p>
          <p className="text-[10px] text-slate-400 text-center">
            Los pesos de la fórmula se configuran en <strong>Catálogos → Parámetros</strong>.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-slate-200 shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-black text-slate-900">Proyección Electoral</CardTitle>
        <p className="text-sm text-slate-500">Puntuación calculada por fórmula ponderada.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Puntuación principal */}
        <div className="flex items-center gap-6 p-6 rounded-2xl bg-slate-50 border border-slate-100">
          <div className="text-center">
            <div className={`text-6xl font-black tabular-nums ${NIVEL_COLORS[proyeccion.nivel]}`}>
              {proyeccion.puntuacion}
            </div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mt-1">puntuación</div>
          </div>
          <div className="flex-1">
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-xs font-black uppercase tracking-wider ${NIVEL_BG[proyeccion.nivel]}`}>
              <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
              {NIVEL_LABELS[proyeccion.nivel]}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Probabilidad relativa de victoria basada en historial, termómetros, cobertura territorial y análisis de competencia.
            </p>
          </div>
        </div>

        {/* Desglose */}
        <div className="space-y-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Desglose por componente</p>
          <ScoreBar
            label="Historial electoral"
            value={proyeccion.score_historial}
            description="Basado en resultados de los últimos 2 ciclos electorales"
          />
          <ScoreBar
            label="Termómetros políticos"
            value={proyeccion.score_termometros}
            description="Promedio de los 5 termómetros del municipio (0-100)"
          />
          <ScoreBar
            label="Cobertura territorial"
            value={proyeccion.score_cobertura}
            description="Porcentaje promedio de compromisos de voto vs. meta por sección"
          />
          <ScoreBar
            label="Ventaja competitiva"
            value={proyeccion.score_competencia}
            description="Inverso del riesgo electoral del adversario principal"
          />
        </div>

        <p className="text-[10px] text-slate-400 border-t border-slate-100 pt-4">
          Los pesos de cada componente se configuran en <strong className="text-slate-600">Catálogos → Parámetros</strong> (claves: <code>proyeccion_peso_*</code>).
        </p>
      </CardContent>
    </Card>
  );
}
