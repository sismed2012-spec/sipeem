"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { SeccionElectoral } from "@/lib/types";
import { createSeccion, deleteSeccion } from "@/actions/estructura";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

type Props = { municipioId: number; secciones: SeccionElectoral[] };

const TIPO_COLORS: Record<string, string> = {
  urbana: "bg-blue-50 text-blue-700 border-blue-200",
  rural: "bg-emerald-50 text-emerald-700 border-emerald-200",
  mixta: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function SeccionesPanel({ municipioId, secciones }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [tipo, setTipo] = useState<string>("");
  const [formError, setFormError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await createSeccion(municipioId, {
        numero: parseInt(fd.get("numero") as string),
        tipo: (tipo as SeccionElectoral["tipo"]) || null,
        lista_nominal: parseInt(fd.get("lista_nominal") as string) || null,
      });
      toast.success("Sección agregada");
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al agregar");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteSeccion(id, municipioId);
      toast.success("Sección eliminada");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {secciones.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">Sin secciones registradas</p>
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-black text-slate-500 uppercase tracking-widest">Sección</th>
                <th className="text-left px-4 py-2 text-xs font-black text-slate-500 uppercase tracking-widest">Tipo</th>
                <th className="text-right px-4 py-2 text-xs font-black text-slate-500 uppercase tracking-widest">Lista nominal</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {secciones.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-semibold text-slate-900">#{s.numero}</td>
                  <td className="px-4 py-2.5">
                    {s.tipo ? (
                      <Badge variant="outline" className={`text-[9px] font-bold uppercase ${TIPO_COLORS[s.tipo]}`}>
                        {s.tipo}
                      </Badge>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600">
                    {s.lista_nominal ? s.lista_nominal.toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(s.id)}
                      disabled={deletingId === s.id}
                      aria-label="Eliminar sección"
                      className="text-rose-400 hover:text-rose-600 disabled:opacity-40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!showForm ? (
        <Button
          variant="outline" size="sm" onClick={() => setShowForm(true)}
          className="rounded-xl border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 font-semibold gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar sección
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="rounded-2xl border border-slate-200 p-4 space-y-4 bg-slate-50">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Nueva sección</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="numero" className="text-xs font-semibold">Número *</Label>
              <Input id="numero" name="numero" type="number" min="1" required className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v ?? "")}>
                <SelectTrigger className="rounded-xl border-slate-200 text-sm"><SelectValue placeholder="Opcional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="urbana">Urbana</SelectItem>
                  <SelectItem value="rural">Rural</SelectItem>
                  <SelectItem value="mixta">Mixta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lista_nominal" className="text-xs font-semibold">Lista nominal</Label>
              <Input id="lista_nominal" name="lista_nominal" type="number" min="0" placeholder="Electores" className="rounded-xl border-slate-200 text-sm" />
            </div>
          </div>
          {formError && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-medium">{formError}</div>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={adding} size="sm" className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800">
              {adding ? "Agregando..." : "Agregar"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); setFormError(null); }} className="rounded-xl border-slate-200 text-slate-600">
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
