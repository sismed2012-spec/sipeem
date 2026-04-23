"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import type { SeccionElectoral, CompromisoSeccion } from "@/lib/types";

type Props = {
  secciones: SeccionElectoral[];
  compromisos: CompromisoSeccion[];
};

export default function CoberturaChart({ secciones, compromisos }: Props) {
  if (secciones.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400 text-sm italic">
        Sin secciones para graficar
      </div>
    );
  }

  // Latest compromisos entry per seccion_id
  const latestMap = new Map<number, CompromisoSeccion>();
  compromisos.forEach((c) => {
    if (!c.seccion_id) return;
    const existing = latestMap.get(c.seccion_id);
    if (!existing || c.fecha > existing.fecha) latestMap.set(c.seccion_id, c);
  });

  const data = secciones.map((s) => {
    const entry = latestMap.get(s.id);
    const comprometidos = entry?.compromisos ?? 0;
    const meta = entry?.meta ?? 0;
    const pct = meta > 0 ? Math.min(100, Math.round((comprometidos / meta) * 100)) : 0;
    return { name: `§${s.numero}`, pct, comprometidos, meta };
  });

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} unit="%" />
        <Tooltip
          cursor={{ fill: "#f1f5f9" }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const d = payload[0].payload;
            return (
              <div className="bg-white border border-slate-200 rounded-xl p-3 shadow text-xs">
                <div className="font-black text-slate-900 mb-1">Sección {d.name}</div>
                <div className="text-slate-500">{d.comprometidos} / {d.meta} compromisos</div>
                <div className="font-bold text-indigo-600">{d.pct}% cobertura</div>
              </div>
            );
          }}
        />
        <Bar dataKey="pct" radius={[6, 6, 0, 0]} maxBarSize={40}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.pct >= 80 ? "#10b981" : entry.pct >= 50 ? "#6366f1" : entry.pct >= 20 ? "#f59e0b" : "#e2e8f0"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
