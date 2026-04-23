// src/components/actores/IncidenciasPanel.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Incidencia } from "@/lib/types";
import { createIncidencia, updateIncidenciaEstatus, deleteIncidencia } from "@/actions/incidencias";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, AlertTriangle } from "lucide-react";

const SEVERIDAD_COLORS: Record<Incidencia["severidad"], string> = {
  baja: "bg-slate-100 text-slate-600 border-slate-200",
  media: "bg-amber-100 text-amber-700 border-amber-200",
  alta: "bg-orange-100 text-orange-700 border-orange-200",
  critica: "bg-red-100 text-red-700 border-red-200",
};

const ESTATUS_COLORS: Record<Incidencia["estatus"], string> = {
  abierta: "bg-rose-100 text-rose-700 border-rose-200",
  en_seguimiento: "bg-amber-100 text-amber-700 border-amber-200",
  resuelta: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const TIPO_LABELS: Record<Incidencia["tipo"], string> = {
  violencia: "Violencia", acarreo: "Acarreo", compra_voto: "Compra de voto",
  propaganda_ilegal: "Prop. ilegal", otro: "Otro",
};

type Props = { municipioId: number; initialIncidencias: Incidencia[] };

export default function IncidenciasPanel({ municipioId, initialIncidencias }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [tipo, setTipo] = useState<Incidencia["tipo"]>("otro");
  const [severidad, setSeveridad] = useState<Incidencia["severidad"]>("media");

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await createIncidencia(municipioId, {
        tipo,
        descripcion: (fd.get("descripcion") as string).trim(),
        severidad,
        estatus: "abierta",
        fecha: fd.get("fecha") as string,
        reportado_por: (fd.get("reportado_por") as string).trim() || null,
        notas: (fd.get("notas") as string).trim() || null,
      });
      toast.success("Incidencia registrada");
      setShowForm(false);
      setFormError(null);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setAdding(false);
    }
  }

  async function handleEstatusChange(id: number, estatus: Incidencia["estatus"]) {
    setUpdatingId(id);
    try {
      await updateIncidenciaEstatus(id, municipioId, estatus);
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
      await deleteIncidencia(id, municipioId);
      toast.success("Incidencia eliminada");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {initialIncidencias.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-8">Sin incidencias registradas</p>
      ) : (
        <div className="space-y-3">
          {initialIncidencias.map((inc) => (
            <div key={inc.id} className="rounded-2xl border border-slate-200 p-4 bg-white space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[9px] font-black uppercase ${SEVERIDAD_COLORS[inc.severidad]}`}>
                      {inc.severidad}
                    </Badge>
                    <span className="text-xs font-semibold text-slate-700">{TIPO_LABELS[inc.tipo]}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(inc.fecha + "T12:00:00").toLocaleDateString("es-MX", { dateStyle: "medium" })}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800">{inc.descripcion}</p>
                  {inc.reportado_por && (
                    <p className="text-xs text-slate-400">Reportado por: {inc.reportado_por}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(inc.id)}
                  disabled={deletingId === inc.id}
                  aria-label="Eliminar incidencia"
                  className="text-rose-400 hover:text-rose-600 disabled:opacity-40 mt-0.5 flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Estatus:</span>
                <Select
                  value={inc.estatus}
                  onValueChange={(v) => handleEstatusChange(inc.id, (v ?? "abierta") as Incidencia["estatus"])}
                  disabled={updatingId === inc.id}
                >
                  <SelectTrigger className="h-6 text-xs rounded-lg border-slate-200 w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="abierta">Abierta</SelectItem>
                    <SelectItem value="en_seguimiento">En seguimiento</SelectItem>
                    <SelectItem value="resuelta">Resuelta</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="outline" className={`text-[9px] font-black uppercase ${ESTATUS_COLORS[inc.estatus]}`}>
                  {inc.estatus.replace("_", " ")}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <Button variant="outline" size="sm" onClick={() => setShowForm(true)}
          className="rounded-xl border-dashed border-slate-300 text-slate-500 hover:border-rose-300 hover:text-rose-600 font-semibold gap-2">
          <Plus className="w-3.5 h-3.5" /> Registrar incidencia
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="rounded-2xl border border-slate-200 p-4 space-y-4 bg-slate-50">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" /> Nueva incidencia
          </h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Tipo *</Label>
              <Select value={tipo} onValueChange={(v) => setTipo((v ?? "otro") as Incidencia["tipo"])}>
                <SelectTrigger className="rounded-xl border-slate-200 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TIPO_LABELS) as Incidencia["tipo"][]).map((t) => (
                    <SelectItem key={t} value={t}>{TIPO_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs font-semibold">Severidad *</Label>
              <Select value={severidad} onValueChange={(v) => setSeveridad((v ?? "media") as Incidencia["severidad"])}>
                <SelectTrigger className="rounded-xl border-slate-200 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baja">Baja</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fecha" className="text-xs font-semibold">Fecha *</Label>
              <Input id="fecha" name="fecha" type="date" required className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="reportado_por" className="text-xs font-semibold">Reportado por</Label>
              <Input id="reportado_por" name="reportado_por" placeholder="Nombre o área" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="descripcion" className="text-xs font-semibold">Descripción *</Label>
              <Textarea id="descripcion" name="descripcion" required rows={2} className="rounded-xl border-slate-200 text-sm resize-none" />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="notas" className="text-xs font-semibold">Notas adicionales</Label>
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
              {adding ? "Registrando..." : "Registrar"}
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
