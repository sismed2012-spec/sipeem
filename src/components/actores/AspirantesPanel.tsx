"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAspirante,
  updateAspirante,
  deleteAspirante,
} from "@/actions/actores";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import type { Aspirante } from "@/lib/types";
import { Plus, Trash2, Pencil, X, Check, Brain, Loader2 } from "lucide-react";
import { perfilarAspirante } from "@/actions/perfilado-ai";

type Props = {
  municipioId: number;
  initialData: Aspirante[];
};

type EditState = {
  id: number;
  nombre: string;
  cargo_aspirado: string;
  partido: string;
  fecha_nacimiento: string;
  telefono: string;
  email: string;
  notas: string;
};

export default function AspirantesPanel({ municipioId, initialData }: Props) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [perfilandoId, setPerfilandoId] = useState<number | null>(null);
  const [perfilesLocales, setPerfilesLocales] = useState<Record<number, string>>({});
  const [expandedPerfilId, setExpandedPerfilId] = useState<number | null>(null);

  function startEdit(a: Aspirante) {
    setEditError(null);
    setEditState({
      id: a.id,
      nombre: a.nombre,
      cargo_aspirado: a.cargo_aspirado,
      partido: a.partido,
      fecha_nacimiento: a.fecha_nacimiento ?? "",
      telefono: a.telefono ?? "",
      email: a.email ?? "",
      notas: a.notas ?? "",
    });
  }

  async function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editState) return;
    setSaving(true);

    const fd = new FormData(e.currentTarget);
    const data = {
      nombre: fd.get("nombre") as string,
      cargo_aspirado: fd.get("cargo_aspirado") as string,
      partido: fd.get("partido") as string,
      fecha_nacimiento: (fd.get("fecha_nacimiento") as string) || null,
      telefono: (fd.get("telefono") as string) || null,
      email: (fd.get("email") as string) || null,
      notas: (fd.get("notas") as string) || null,
    };

    try {
      await updateAspirante(editState.id, municipioId, data);
      toast.success("Aspirante actualizado");
      setEditError(null);
      setEditState(null);
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setFormError(null);

    const fd = new FormData(e.currentTarget);
    const data = {
      nombre: fd.get("nombre_new") as string,
      cargo_aspirado: fd.get("cargo_aspirado_new") as string,
      partido: fd.get("partido_new") as string,
      fecha_nacimiento: (fd.get("fecha_nacimiento_new") as string) || null,
      telefono: (fd.get("telefono_new") as string) || null,
      email: (fd.get("email_new") as string) || null,
      notas: (fd.get("notas_new") as string) || null,
    };

    try {
      await createAspirante(municipioId, data);
      toast.success("Aspirante registrado");
      (e.target as HTMLFormElement).reset();
      setShowForm(false);
      router.refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al registrar");
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await deleteAspirante(id, municipioId);
      toast.success("Aspirante eliminado");
      if (editState?.id === id) setEditState(null);
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
            <CardTitle className="text-xl font-black text-slate-900">Aspirantes</CardTitle>
            <p className="text-sm text-slate-500 mt-1">Registro de aspirantes políticos.</p>
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
              Sin aspirantes registrados.
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-slate-100">
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Nombre
                  </TableHead>
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Cargo aspirado
                  </TableHead>
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Partido
                  </TableHead>
                  <TableHead className="font-black text-slate-400 uppercase text-[10px] tracking-widest p-4">
                    Contacto
                  </TableHead>
                  <TableHead className="p-4 text-right" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {initialData.map((a) =>
                  editState?.id === a.id ? (
                    <TableRow key={a.id} className="bg-slate-50 border-slate-100">
                      <TableCell colSpan={5} className="p-4">
                        <form onSubmit={handleSaveEdit} className="space-y-3">
                          <div className="grid gap-3 sm:grid-cols-3">
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Nombre</Label>
                              <Input
                                name="nombre"
                                defaultValue={editState.nombre}
                                required
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Cargo aspirado</Label>
                              <Input
                                name="cargo_aspirado"
                                defaultValue={editState.cargo_aspirado}
                                required
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Partido</Label>
                              <Input
                                name="partido"
                                defaultValue={editState.partido}
                                required
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Fecha nacimiento</Label>
                              <Input
                                name="fecha_nacimiento"
                                type="date"
                                defaultValue={editState.fecha_nacimiento}
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Teléfono</Label>
                              <Input
                                name="telefono"
                                defaultValue={editState.telefono}
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs">Email</Label>
                              <Input
                                name="email"
                                type="email"
                                defaultValue={editState.email}
                                className="rounded-xl border-slate-200 h-8 text-sm"
                              />
                            </div>
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="text-xs">Notas</Label>
                            <Textarea
                              name="notas"
                              rows={2}
                              defaultValue={editState.notas}
                              className="rounded-xl border-slate-200 text-sm resize-none"
                            />
                          </div>
                          {editError && (
                            <div role="alert" className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
                              {editError}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Button
                              type="submit"
                              disabled={saving}
                              size="sm"
                              className="rounded-xl bg-slate-900 font-bold text-xs gap-1.5"
                            >
                              <Check className="w-3 h-3" />
                              {saving ? "Guardando..." : "Guardar"}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setEditState(null)}
                              className="rounded-xl border-slate-200 text-xs gap-1.5"
                            >
                              <X className="w-3 h-3" /> Cancelar
                            </Button>
                          </div>
                        </form>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={a.id} className="border-slate-50 hover:bg-slate-50/50">
                      <TableCell className="p-4 text-sm font-bold text-slate-900">
                        {a.nombre}
                      </TableCell>
                      <TableCell className="p-4 text-sm text-slate-700">
                        {a.cargo_aspirado}
                      </TableCell>
                      <TableCell className="p-4 text-sm text-slate-500">{a.partido}</TableCell>
                      <TableCell className="p-4 text-xs text-slate-400 space-y-0.5">
                        {a.telefono && <div>{a.telefono}</div>}
                        {a.email && <div>{a.email}</div>}
                        {!a.telefono && !a.email && <span className="italic">—</span>}
                      </TableCell>
                      <TableCell className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              setPerfilandoId(a.id);
                              try {
                                const perfil = await perfilarAspirante(a.id, municipioId);
                                setPerfilesLocales((prev) => ({ ...prev, [a.id]: perfil }));
                                setExpandedPerfilId(a.id);
                                toast.success("Perfil generado");
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : "Error al perfilar");
                              } finally {
                                setPerfilandoId(null);
                              }
                            }}
                            disabled={perfilandoId !== null}
                            aria-label="Perfilar con IA"
                            className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl disabled:opacity-30"
                          >
                            {perfilandoId === a.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Brain className="w-4 h-4" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => startEdit(a)}
                            disabled={editState !== null && editState.id !== a.id}
                            aria-label="Editar aspirante"
                            className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 rounded-xl disabled:opacity-30"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={deletingId === a.id}
                            onClick={() => handleDelete(a.id)}
                            aria-label="Eliminar aspirante"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        {(perfilesLocales[a.id] || a.perfil_ia) && (
                          <div className="mt-2 text-left">
                            <button
                              onClick={() => setExpandedPerfilId(expandedPerfilId === a.id ? null : a.id)}
                              className="text-[10px] text-indigo-500 hover:text-indigo-700 font-semibold"
                            >
                              {expandedPerfilId === a.id ? "Ocultar perfil" : "Ver perfil IA"}
                            </button>
                            {expandedPerfilId === a.id && (
                              <div className="mt-1 p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-xs text-slate-700 leading-relaxed text-left whitespace-pre-wrap">
                                {perfilesLocales[a.id] ?? a.perfil_ia}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card className="border-indigo-100 shadow-md">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">Nuevo aspirante</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdd} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="nombre_new">Nombre</Label>
                  <Input
                    id="nombre_new"
                    name="nombre_new"
                    required
                    placeholder="Nombre completo"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cargo_aspirado_new">Cargo aspirado</Label>
                  <Input
                    id="cargo_aspirado_new"
                    name="cargo_aspirado_new"
                    required
                    placeholder="Ej. Presidente Municipal"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="partido_new">Partido</Label>
                  <Input
                    id="partido_new"
                    name="partido_new"
                    required
                    placeholder="Siglas del partido"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="fecha_nacimiento_new">Fecha nacimiento (opcional)</Label>
                  <Input
                    id="fecha_nacimiento_new"
                    name="fecha_nacimiento_new"
                    type="date"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="telefono_new">Teléfono (opcional)</Label>
                  <Input
                    id="telefono_new"
                    name="telefono_new"
                    placeholder="Ej. 722 123 4567"
                    className="rounded-xl border-slate-200"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email_new">Email (opcional)</Label>
                  <Input
                    id="email_new"
                    name="email_new"
                    type="email"
                    placeholder="correo@ejemplo.com"
                    className="rounded-xl border-slate-200"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="notas_new">Notas (opcional)</Label>
                <Textarea
                  id="notas_new"
                  name="notas_new"
                  rows={2}
                  placeholder="Observaciones relevantes..."
                  className="rounded-xl border-slate-200 resize-none"
                />
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
                  {adding ? "Registrando..." : "Registrar aspirante"}
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
