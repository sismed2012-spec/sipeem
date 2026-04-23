// src/components/actores/AgendaPanel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventoCampana } from "@/lib/types";
import { createEvento, deleteEvento } from "@/actions/agenda";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Calendar } from "lucide-react";

const TIPO_LABELS: Record<EventoCampana["tipo"], string> = {
  mitin: "Mitin", recorrido: "Recorrido", reunion: "Reunión", visita: "Visita", otro: "Otro",
};

type Props = { municipioId: number; initialEventos: EventoCampana[] };

export default function AgendaPanel({ municipioId, initialEventos }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<EventoCampana["tipo"]>("mitin");

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await createEvento(municipioId, {
        titulo: (fd.get("titulo") as string).trim(),
        tipo,
        fecha: fd.get("fecha") as string,
        hora_inicio: (fd.get("hora_inicio") as string) || null,
        hora_fin: (fd.get("hora_fin") as string) || null,
        ubicacion: (fd.get("ubicacion") as string).trim() || null,
        aforo_estimado: fd.get("aforo_estimado") ? parseInt(fd.get("aforo_estimado") as string, 10) : null,
        aforo_real: null,
        responsable: (fd.get("responsable") as string).trim() || null,
        notas: (fd.get("notas") as string).trim() || null,
      });
      toast.success("Evento agregado");
      setShowForm(false);
      setFormError(null);
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
      await deleteEvento(id, municipioId);
      toast.success("Evento eliminado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {initialEventos.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-8">Sin eventos registrados</p>
      ) : (
        <div className="rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Título</th>
                <th className="text-left px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Ubicación</th>
                <th className="text-center px-4 py-2.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Aforo</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialEventos.map((ev) => (
                <tr key={ev.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                    {new Date(ev.fecha + "T12:00:00").toLocaleDateString("es-MX", { dateStyle: "medium" })}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-indigo-600">{TIPO_LABELS[ev.tipo]}</td>
                  <td className="px-4 py-2.5 font-semibold text-slate-900">{ev.titulo}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{ev.ubicacion ?? "—"}</td>
                  <td className="px-4 py-2.5 text-xs text-center text-slate-500">{ev.aforo_estimado ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => handleDelete(ev.id)}
                      disabled={deletingId === ev.id}
                      aria-label="Eliminar evento"
                      className="text-rose-400 hover:text-rose-600 disabled:opacity-40 transition-colors"
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
          <Plus className="w-3.5 h-3.5" /> Agregar evento
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="rounded-2xl border border-slate-200 p-4 space-y-4 bg-slate-50">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" /> Nuevo evento
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="titulo" className="text-xs font-semibold">Título *</Label>
              <Input id="titulo" name="titulo" required placeholder="Ej. Mitin plaza central" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo((v ?? "mitin") as EventoCampana["tipo"])}>
                <SelectTrigger className="rounded-xl border-slate-200 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABELS) as EventoCampana["tipo"][]).map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fecha" className="text-xs font-semibold">Fecha *</Label>
              <Input id="fecha" name="fecha" type="date" required className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ubicacion" className="text-xs font-semibold">Ubicación</Label>
              <Input id="ubicacion" name="ubicacion" placeholder="Ej. Plaza municipal" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="aforo_estimado" className="text-xs font-semibold">Aforo estimado</Label>
              <Input id="aforo_estimado" name="aforo_estimado" type="number" min={0} placeholder="500" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="responsable" className="text-xs font-semibold">Responsable</Label>
              <Input id="responsable" name="responsable" placeholder="Nombre del responsable" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="notas" className="text-xs font-semibold">Notas</Label>
              <Textarea id="notas" name="notas" rows={2} className="rounded-xl border-slate-200 text-sm resize-none" />
            </div>
          </div>
          {formError && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-medium">
              {formError}
            </div>
          )}
          <div className="flex gap-2">
            <Button type="submit" disabled={adding} size="sm" className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800">
              {adding ? "Agregando..." : "Agregar evento"}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setShowForm(false); setFormError(null); }} className="rounded-xl border-slate-200 font-semibold text-slate-600">
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
