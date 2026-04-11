"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMunicipio, updateMunicipio } from "@/actions/municipios";
import { Municipio } from "@/lib/types";
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

type MunicipioFormProps = {
  initialData?: Municipio;
};

export default function MunicipioForm({ initialData }: MunicipioFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!initialData;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      nombre: formData.get("nombre") as string,
      distrito: formData.get("distrito") as string,
      region: formData.get("region") as string,
      estatus: formData.get("estatus") as "activo" | "inactivo",
    };

    try {
      if (isEdit && initialData?.id) {
        await updateMunicipio(initialData.id, data);
        toast.success("Municipio actualizado correctamente");
      } else {
        await createMunicipio(data);
        toast.success("Municipio creado correctamente");
      }
      router.push("/admin/catalogos/municipios");
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
          {isEdit ? "Editar Municipio" : "Nuevo Registro"}
        </CardTitle>
        <p className="text-sm text-slate-500 mt-1">
          {isEdit ? `Modificando datos de ${initialData.nombre}` : "Configure los parámetros base del nuevo municipio."}
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
                placeholder="Ej. Acapulco de Juárez"
                className="rounded-xl border-slate-200 h-11"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="distrito" className="font-bold text-slate-700">Distrito Electoral</Label>
              <Input
                id="distrito"
                name="distrito"
                defaultValue={initialData?.distrito || ""}
                placeholder="Ej. 04"
                className="rounded-xl border-slate-200 h-11"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="region" className="font-bold text-slate-700">Región Geográfica</Label>
              <Input
                id="region"
                name="region"
                defaultValue={initialData?.region || ""}
                placeholder="Ej. Costa Chica"
                className="rounded-xl border-slate-200 h-11"
              />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="estatus" className="font-bold text-slate-700">Estatus Operativo</Label>
              <Select name="estatus" defaultValue={initialData?.estatus || "activo"} required>
                <SelectTrigger className="rounded-xl border-slate-200 h-11">
                  <SelectValue placeholder="Seleccione el estatus" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="activo">Activo (Visible en plataforma)</SelectItem>
                  <SelectItem value="inactivo">Inactivo (Oculto)</SelectItem>
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
              {loading ? "Guardando..." : "Guardar municipio"}
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
