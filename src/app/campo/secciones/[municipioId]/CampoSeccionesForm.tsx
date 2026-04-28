"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { SeccionElectoral } from "@/lib/types";
import { CheckCircle, Loader2 } from "lucide-react";

type Props = {
  municipioId: number;
  secciones: SeccionElectoral[];
  initialCounts: Record<number, number>;
  focusedSeccion?: number | null;
  registrar: (
    municipioId: number,
    seccionId: number,
    compromisos: number,
    meta: number
  ) => Promise<void>;
};

export default function CampoSeccionesForm({
  municipioId,
  secciones,
  initialCounts,
  focusedSeccion = null,
  registrar,
}: Props) {
  const [counts, setCounts] = useState<Record<number, string>>(
    Object.fromEntries(
      secciones.map((section) => [section.id, String(initialCounts[section.id] ?? 0)])
    )
  );
  const [saving, setSaving] = useState<number | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());

  async function handleSave(section: SeccionElectoral) {
    const val = parseInt(counts[section.id] ?? "0", 10);
    if (isNaN(val) || val < 0) {
      toast.error("Valor inválido");
      return;
    }

    setSaving(section.id);
    try {
      const meta = section.lista_nominal
        ? Math.round(section.lista_nominal * 0.3)
        : 50;
      await registrar(municipioId, section.id, val, meta);
      setSaved((prev) => new Set(prev).add(section.id));
      toast.success(`Sección ${section.numero} guardada`);
      setTimeout(() => {
        setSaved((prev) => {
          const next = new Set(prev);
          next.delete(section.id);
          return next;
        });
      }, 2000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-3">
      {secciones.map((section) => {
        const isFocused = focusedSeccion === section.numero;

        return (
          <div
            key={section.id}
            className={`rounded-2xl border bg-white p-4 shadow-sm ${
              isFocused
                ? "border-amber-300 ring-2 ring-amber-100"
                : "border-slate-200"
            }`}
          >
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="text-lg font-black text-slate-900">
                  Sección {section.numero}
                </span>
                {isFocused && (
                  <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                    Objetivo
                  </span>
                )}
                {section.tipo && (
                  <span className="ml-2 text-xs capitalize text-slate-400">
                    {section.tipo}
                  </span>
                )}
              </div>
              {section.lista_nominal && (
                <span className="text-xs text-slate-400">
                  NOM: {section.lista_nominal.toLocaleString("es-MX")}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={counts[section.id] ?? "0"}
                onChange={(event) =>
                  setCounts((prev) => ({
                    ...prev,
                    [section.id]: event.target.value,
                  }))
                }
                className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-center text-2xl font-black text-slate-900 focus:border-indigo-400 focus:outline-none"
                placeholder="0"
              />
              <button
                onClick={() => handleSave(section)}
                disabled={saving === section.id}
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {saving === section.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : saved.has(section.id) ? (
                  <CheckCircle className="h-4 w-4 text-emerald-300" />
                ) : (
                  "Guardar"
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
