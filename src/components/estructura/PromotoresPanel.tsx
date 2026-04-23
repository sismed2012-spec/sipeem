"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Promotor } from "@/lib/types";
import { createPromotor, deletePromotor, updatePromotor } from "@/actions/estructura";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Trash2, UserCheck, UserX } from "lucide-react";

type Props = { municipioId: number; promotores: Promotor[] };

export default function PromotoresPanel({ municipioId, promotores }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);
    const fd = new FormData(e.currentTarget);
    const seccionesRaw = (fd.get("secciones_asign") as string).trim();
    const secciones_asign = seccionesRaw
      ? seccionesRaw.split(",").map((s) => parseInt(s.trim())).filter(Boolean)
      : [];
    try {
      await createPromotor(municipioId, {
        nombre: (fd.get("nombre") as string).trim(),
        telefono: (fd.get("telefono") as string).trim() || null,
        secciones_asign,
        meta_compromisos: parseInt(fd.get("meta_compromisos") as string) || 0,
        activo: true,
      });
      toast.success("Promotor registrado");
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setAdding(false);
    }
  }

  async function toggleActivo(p: Promotor) {
    setTogglingId(p.id);
    try {
      await updatePromotor(p.id, municipioId, { activo: !p.activo });
      toast.success(p.activo ? "Promotor desactivado" : "Promotor activado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deletePromotor(id, municipioId);
      toast.success("Promotor eliminado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {promotores.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">Sin promotores registrados</p>
      ) : (
        <div className="space-y-2">
          {promotores.map((p) => (
            <div key={p.id} className={`rounded-xl border p-3 flex items-start gap-3 ${p.activo ? "bg-white border-slate-200" : "bg-slate-50 border-slate-100 opacity-60"}`}>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900">{p.nombre}</span>
                  <Badge variant="outline" className={p.activo ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] font-bold uppercase" : "bg-slate-100 text-slate-500 border-slate-200 text-[9px] font-bold uppercase"}>
                    {p.activo ? "activo" : "inactivo"}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  {p.telefono && <span>{p.telefono}</span>}
                  {p.secciones_asign.length > 0 && (
                    <span>Secciones: {p.secciones_asign.join(", ")}</span>
                  )}
                  <span>Meta: <strong className="text-slate-700">{p.meta_compromisos}</strong></span>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => toggleActivo(p)}
                  disabled={togglingId === p.id}
                  aria-label={p.activo ? "Desactivar" : "Activar"}
                  className="text-slate-400 hover:text-indigo-500 disabled:opacity-40"
                >
                  {p.activo ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  disabled={deletingId === p.id}
                  aria-label="Eliminar promotor"
                  className="text-rose-400 hover:text-rose-600 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <Button
          variant="outline" size="sm" onClick={() => setShowForm(true)}
          className="rounded-xl border-dashed border-slate-300 text-slate-500 hover:border-indigo-300 hover:text-indigo-600 font-semibold gap-2"
        >
          <Plus className="w-3.5 h-3.5" /> Agregar promotor
        </Button>
      ) : (
        <form onSubmit={handleAdd} className="rounded-2xl border border-slate-200 p-4 space-y-4 bg-slate-50">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">Nuevo promotor</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nombre" className="text-xs font-semibold">Nombre *</Label>
              <Input id="nombre" name="nombre" required className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="telefono" className="text-xs font-semibold">Teléfono</Label>
              <Input id="telefono" name="telefono" type="tel" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="secciones_asign" className="text-xs font-semibold">Secciones asignadas</Label>
              <Input id="secciones_asign" name="secciones_asign" placeholder="Ej: 101, 102, 103" className="rounded-xl border-slate-200 text-sm" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="meta_compromisos" className="text-xs font-semibold">Meta de compromisos</Label>
              <Input id="meta_compromisos" name="meta_compromisos" type="number" min="0" defaultValue="0" className="rounded-xl border-slate-200 text-sm" />
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
