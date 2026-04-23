"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPlanillaMember, deletePlanillaMember } from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { Planilla } from "@/lib/types";
import { Plus, Trash2 } from "lucide-react";

type Props = {
  municipioId: number;
  initialData: Planilla[];
};

export default function PlanillaPanel({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      cargo: fd.get("cargo") as string,
      nombre: fd.get("nombre") as string,
      partido: fd.get("partido") as string,
    };

    try {
      await createPlanillaMember(municipioId, data);
      toast.success("Integrante agregado");
      (e.target as HTMLFormElement).reset();
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
      await deletePlanillaMember(id, municipioId);
      toast.success("Integrante eliminado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-slate-200 shadow-md overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-xl font-black text-slate-900">Planilla</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              Integrantes de la planilla de candidatos.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800 text-xs gap-2"
          >
            <Plus className="w-4 h-4" />
            Agregar
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {initialData.length === 0 ? (
            <div className="px-6 py-10 text-center text-slate-400 text-sm font-medium italic">
              Sin integrantes registrados.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Cargo
                  </TableHead>
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Nombre
                  </TableHead>
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Partido
                  </TableHead>
                  <TableHead className="p-4 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialData.map((p) => (
                  <TableRow key={p.id} className="border-slate-50 hover:bg-slate-50/50">
                    <TableCell className="p-4 text-sm font-bold text-slate-700">
                      {p.cargo}
                    </TableCell>
                    <TableCell className="p-4 text-sm text-slate-900">{p.nombre}</TableCell>
                    <TableCell className="p-4 text-sm text-slate-500">{p.partido}</TableCell>
                    <TableCell className="p-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === p.id}
                        onClick={() => handleDelete(p.id)}
                        aria-label="Eliminar integrante"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card className="border-indigo-100 shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Nuevo integrante
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="cargo">Cargo</Label>
                  <Input
                    id="cargo"
                    name="cargo"
                    required
                    placeholder="Ej. Presidente"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="nombre">Nombre</Label>
                  <Input
                    id="nombre"
                    name="nombre"
                    required
                    placeholder="Nombre completo"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="partido">Partido</Label>
                  <Input
                    id="partido"
                    name="partido"
                    required
                    placeholder="Siglas del partido"
                    className="rounded-xl border-slate-200"
                  />
                </div>
              </div>

              {formError && (
                <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
                  {formError}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="submit"
                  disabled={adding}
                  className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800"
                >
                  {adding ? "Agregando..." : "Agregar integrante"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowForm(false); setFormError(null); }}
                  className="rounded-xl border-slate-200"
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
