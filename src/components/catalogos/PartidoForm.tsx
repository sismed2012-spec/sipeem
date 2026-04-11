"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPartido, updatePartido } from "@/actions/partidos";
import { Partido } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type PartidoFormProps = {
  initialData?: Partido;
};

export default function PartidoForm({ initialData }: PartidoFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorPreview, setColorPreview] = useState(initialData?.color || "#6b7280");

  const isEdit = !!initialData;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      nombre: formData.get("nombre") as string,
      siglas: formData.get("siglas") as string,
      color: formData.get("color") as string,
      estatus: formData.get("estatus") as "activo" | "inactivo",
    };

    try {
      if (isEdit && initialData?.id) {
        await updatePartido(initialData.id, data);
        toast.success("Partido actualizado correctamente");
      } else {
        await createPartido(data);
        toast.success("Partido registrado correctamente");
      }
      router.push("/admin/catalogos/partidos");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar la solicitud");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-2xl mx-auto border-slate-200 shadow-xl rounded-2xl overflow-hidden">
      <CardHeader className="bg-slate-50 border-b border-slate-100 p-6 lg:p-8">
        <CardTitle className="text-2xl font-black text-slate-900">
          {isEdit ? "Editar Fuerza Política" : "Nuevo Registro"}
        </CardTitle>
        <p className="text-sm text-slate-500 mt-1">
          {isEdit ? `Actualizando identidad de ${initialData.siglas}` : "Defina la identidad base de la fuerza política."}
        </p>
      </CardHeader>
      <CardContent className="p-6 lg:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="nombre" className="font-bold text-slate-700">Nombre Oficial</Label>
              <Input
                id="nombre"
                name="nombre"
                required
                defaultValue={initialData?.nombre}
                placeholder="Ej. Partido Revolucionario Institucional"
                className="rounded-xl border-slate-200 h-11"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="siglas" className="font-bold text-slate-700">Siglas / Acrónimo</Label>
              <Input
                id="siglas"
                name="siglas"
                required
                defaultValue={initialData?.siglas}
                placeholder="Ej. PRI"
                className="rounded-xl border-slate-200 h-11 font-mono uppercase"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="color" className="font-bold text-slate-700 font-mono">Color Representativo (HEX)</Label>
              <div className="flex gap-2">
                <Input
                  id="color"
                  name="color"
                  required
                  defaultValue={initialData?.color || "#6b7280"}
                  onChange={(e) => setColorPreview(e.target.value)}
                  placeholder="#000000"
                  className="rounded-xl border-slate-200 h-11 flex-1 font-mono uppercase"
                />
                <div 
                  className="h-11 w-11 rounded-xl border border-slate-200 shadow-inner"
                  style={{ backgroundColor: colorPreview }}
                />
              </div>
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="estatus" className="font-bold text-slate-700">Estatus Institucional</Label>
              <Select name="estatus" defaultValue={initialData?.estatus || "activo"} required>
                <SelectTrigger className="rounded-xl border-slate-200 h-11">
                  <SelectValue placeholder="Seleccione el estatus" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="activo">Activo (Vigencia oficial)</SelectItem>
                  <SelectItem value="inactivo">Inactivo (Extinto / Sin vigencia)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium animate-in slide-in-from-top-2 duration-300">
              Error: {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-6 border-t border-slate-100">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-slate-900 font-bold hover:bg-slate-800 h-11 transition-all"
            >
              {loading ? "Registrando..." : "Guardar partido"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => router.back()}
              className="rounded-xl border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 h-11 px-6"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
