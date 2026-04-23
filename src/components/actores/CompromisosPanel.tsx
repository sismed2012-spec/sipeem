"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CompromisoCampana } from "@/lib/types";
import { createCompromiso, updateCompromisoEstatus, deleteCompromiso } from "@/actions/compromisos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, CheckCircle2 } from "lucide-react";

const TEMA_LABELS: Record<CompromisoCampana["tema"], string> = {
  obra: "Obra", servicio: "Servicio", gestion: "Gestión",
  social: "Social", seguridad: "Seguridad", otro: "Otro",
};

const ESTATUS_COLORS: Record<CompromisoCampana["estatus"], string> = {
  pendiente: "bg-slate-100 text-slate-600 border-slate-200",
  en_proceso: "bg-blue-100 text-blue-700 border-blue-200",
  cumplido: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cancelado: "bg-rose-100 text-rose-600 border-rose-200",
};

type Props = { municipioId: number; initialCompromisos: CompromisoCampana[] };

export default function CompromisosPanel({ municipioId, initialCompromisos }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tema, setTema] = useState<CompromisoCampana["tema"]>("obra");

  const counts = {
    total: initialCompromisos.length,
    cumplidos: initialCompromisos.filter((c) => c.estatus === "cumplido").length,
    enProceso: initialCompromisos.filter((c) => c.estatus === "en_proceso").length,
  };

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await createCompromiso(municipioId, {
        titulo: (fd.get("titulo") as string).trim(),
        descripcion: (fd.get("descripcion") as string).trim() || null,
        tema,
        estatus: "pendiente",
        fecha_compromiso: (fd.get("fecha_compromiso") as string) || null,
        fecha_cumplimiento: null,
        responsable: (fd.get("responsable") as string).trim() || null,
      });
      toast.success("Compromiso registrado");
      setShowForm(false);
      setFormError(null);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setAdding(false);
    }
  }

  async function handleEstatusChange(id: number, estatus: CompromisoCampana["estatus"]) {
    setUpdatingId(id);
    const fecha_cumplimiento = estatus === "cumplido" ? new Date().toISOString().slice(0, 10) : null;
    try {
      await updateCompromisoEstatus(id, municipioId, estatus, fecha_cumplimiento);
      toast.success("Estatus actualizado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteCompromiso(id, municipioId);
      toast.success("Compromiso eliminado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {counts.total > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-2">
          <span><strong className="text-slate-900">{counts.total}</strong> total</span>
          <span><strong className="text-emerald-600">{counts.cumplidos}</strong> cumplidos</span>
          <span><strong className="text-blue-600">{counts.enProceso}</strong> en proceso</span>
          <span className="ml-auto font-semibold text-slate-600">
            {Math.round((counts.cumplidos / counts.total) * 100)}% cumplimiento
          </span>
        </div>
      )}

      {initialCompromisos.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-8">Sin compromisos registrados</p>
      ) : (
        <div className="space-y-2">
          {initialCompromisos.map((c) => (
            <div key={c.id} className="rounded-xl border border-slate-200 p-3 bg-white flex items-start gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900">{c.titulo}</span>
                  <Badge variant="outline" className="text-[9px] font-bold uppercase bg-slate-50 border-slate-200 text-slate-500">
                    {TEMA_LABELS[c.tema]}
                  </Badge>
                </div>
                {c.descripcion && <p className="text-xs text-slate-500">{c.descripcion}</p>}
                <div className="flex items-center gap-2">
                  <Select
                    value={c.estatus}
                    onValueChange={(v) => handleEstatusChange(c.id, v as CompromisoCampana["estatus"])}
                    disabled={updatingId === c.id}
                  >
                    <SelectTrigger className="h-6 text-xs rounded-lg border-slate-200 w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendiente">Pendiente</SelectItem>
                      <SelectItem value="en_proceso">En proceso</SelectItem>
                      <SelectItem value="cumplido">Cumplido</SelectItem>
                      <SelectItem value="cancelado">Cancelado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className={`text-[9px] font-black uppercase ${ESTATUS_COLORS[c.estatus]}`}>
                    {c.estatus.replace("_", " ")}
                  </Badge>
                  {c.estatus === "cumplido" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                </div>
              </div>
              <button
                onClick={() => handleDelete(c.id)}
                disabled={deletingId === c.id}
                aria-label="Eliminar compromiso"
                className="text-rose-400 hover:text-rose-600 disabled:opacity-40 mt-0.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <Button
          variant="outline" size="sm" onClick={() => setShowForm(true)}
          className="rounded-xl border-dashed border-slate-300 text-slate-500 hover:border-emerald-300 hover:text-emerald-600 font-semibold gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar compromiso
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="rounded-2xl border border-slate-200 p-4 space-y-4 bg-slate-50">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Nuevo compromiso</h3>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="titulo" className="text-xs font-semibold">Título *</Label>
              <Input id="titulo" name="titulo" required placeholder="Ej. Pavimentación calle 5 de mayo" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Tema *</Label>
              <Select value={tema} onValueChange={(v) => setTema(v as CompromisoCampana["tema"])}>
                <SelectTrigger className="rounded-xl border-slate-200 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TEMA_LABELS) as CompromisoCampana["tema"][]).map((t) => (
                    <SelectItem key={t} value={t}>{TEMA_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fecha_compromiso" className="text-xs font-semibold">Fecha de compromiso</Label>
              <Input id="fecha_compromiso" name="fecha_compromiso" type="date" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="responsable" className="text-xs font-semibold">Responsable</Label>
              <Input id="responsable" name="responsable" placeholder="Nombre o área" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="descripcion" className="text-xs font-semibold">Descripción</Label>
              <Textarea id="descripcion" name="descripcion" rows={2} className="rounded-xl border-slate-200 text-sm resize-none" />
            </div>
          </div>

          {formError && (
            <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs font-medium">
              {formError}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={adding} size="sm" className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800">
              {adding ? "Agregando..." : "Agregar"}
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
