"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";

type TipoIncidencia = "violencia" | "acarreo" | "compra_voto" | "propaganda_ilegal" | "otro";
type SeveridadIncidencia = "baja" | "media" | "alta" | "critica";

type Props = {
  municipioId: number;
  crearIncidencia: (
    municipioId: number,
    data: { tipo: TipoIncidencia; descripcion: string; severidad: SeveridadIncidencia }
  ) => Promise<void>;
};

const TIPOS: { value: TipoIncidencia; label: string }[] = [
  { value: "violencia", label: "Violencia" },
  { value: "acarreo", label: "Acarreo" },
  { value: "compra_voto", label: "Compra de voto" },
  { value: "propaganda_ilegal", label: "Propaganda ilegal" },
  { value: "otro", label: "Otro" },
];

const SEVERIDADES: { value: SeveridadIncidencia; label: string; color: string }[] = [
  { value: "baja", label: "Baja", color: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "media", label: "Media", color: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "alta", label: "Alta", color: "bg-orange-100 text-orange-700 border-orange-200" },
  { value: "critica", label: "Crítica", color: "bg-red-100 text-red-700 border-red-200" },
];

export default function CampoIncidenciasForm({ municipioId, crearIncidencia }: Props) {
  const [tipo, setTipo] = useState<TipoIncidencia>("otro");
  const [descripcion, setDescripcion] = useState("");
  const [severidad, setSeveridad] = useState<SeveridadIncidencia>("media");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descripcion.trim()) {
      toast.error("La descripción es requerida");
      return;
    }
    setEnviando(true);
    try {
      await crearIncidencia(municipioId, { tipo, descripcion: descripcion.trim(), severidad });
      toast.success("Incidencia reportada");
      setDescripcion("");
      setTipo("otro");
      setSeveridad("media");
      setEnviado(true);
      setTimeout(() => setEnviado(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al reportar");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {enviado && (
        <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm font-semibold text-emerald-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> Incidencia registrada exitosamente.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTipo(t.value)}
                className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                  tipo === t.value
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Severidad</label>
          <div className="grid grid-cols-2 gap-2">
            {SEVERIDADES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSeveridad(s.value)}
                className={`px-3 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
                  severidad === s.value
                    ? `${s.color} border-current scale-[1.02]`
                    : "bg-white text-slate-400 border-slate-200"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-slate-500">Descripción</label>
          <textarea
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={4}
            placeholder="Describe lo observado con el mayor detalle posible..."
            className="w-full rounded-xl border-2 border-slate-200 px-4 py-3 text-sm focus:border-indigo-400 focus:outline-none resize-none"
            required
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={enviando}
        className="w-full py-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-black text-base disabled:opacity-60 flex items-center justify-center gap-2 transition-colors"
      >
        {enviando ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Reportando...</>
        ) : (
          <><AlertTriangle className="w-5 h-5" /> Reportar incidencia</>
        )}
      </button>
    </form>
  );
}
