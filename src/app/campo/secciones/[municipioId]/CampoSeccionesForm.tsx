"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { SeccionElectoral } from "@/lib/types";
import { Loader2, CheckCircle } from "lucide-react";

type Props = {
  municipioId: number;
  secciones: SeccionElectoral[];
  initialCounts: Record<number, number>;
  registrar: (municipioId: number, seccionId: number, compromisos: number, meta: number) => Promise<void>;
};

export default function CampoSeccionesForm({ municipioId, secciones, initialCounts, registrar }: Props) {
  const [counts, setCounts] = useState<Record<number, string>>(
    Object.fromEntries(secciones.map((s) => [s.id, String(initialCounts[s.id] ?? 0)]))
  );
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());

  async function handleSave(seccion: SeccionElectoral) {
    const val = parseInt(counts[seccion.id] ?? "0", 10);
    if (isNaN(val) || val < 0) {
      toast.error("Valor inválido");
      return;
    }
    setSaving(seccion.id);
    try {
      const meta = seccion.lista_nominal ? Math.round(seccion.lista_nominal * 0.3) : 50;
      await registrar(municipioId, seccion.id, val, meta);
      setSaved((prev) => new Set(prev).add(seccion.id));
      toast.success(`Sección ${seccion.numero} guardada`);
      setTimeout(() => setSaved((prev) => { const s = new Set(prev); s.delete(seccion.id); return s; }), 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      {secciones.map((s) => (
        <div key={s.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="font-black text-slate-900 text-lg">Sección {s.numero}</span>
              {s.tipo && (
                <span className="ml-2 text-xs text-slate-400 capitalize">{s.tipo}</span>
              )}
            </div>
            {s.lista_nominal && (
              <span className="text-xs text-slate-400">NOM: {s.lista_nominal.toLocaleString("es-MX")}</span>
            )}
          </div>
          <div className="flex gap-3 items-center">
            <input
              type="number"
              min={0}
              value={counts[s.id] ?? "0"}
              onChange={(e) => setCounts((prev) => ({ ...prev, [s.id]: e.target.value }))}
              className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-2xl font-black text-slate-900 text-center focus:border-indigo-400 focus:outline-none"
              placeholder="0"
            />
            <button
              onClick={() => handleSave(s)}
              disabled={saving === s.id}
              className="px-4 py-3 rounded-xl bg-indigo-600 text-white font-bold text-sm disabled:opacity-60 flex items-center gap-2"
            >
              {saving === s.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : saved.has(s.id) ? (
                <CheckCircle className="w-4 h-4 text-emerald-300" />
              ) : (
                "Guardar"
              )}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
