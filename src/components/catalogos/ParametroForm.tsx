"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createParametro, updateParametro } from "@/actions/parametros";
import { Configuracion } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type ParametroFormProps = {
  initialData?: Configuracion;
};

export default function ParametroForm({ initialData }: ParametroFormProps) {
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
      clave: formData.get("clave") as string,
      valor: formData.get("valor") as string,
      categoria: formData.get("categoria") as string,
      descripcion: formData.get("descripcion") as string,
    };

    try {
      if (isEdit && initialData?.id) {
        await updateParametro(initialData.id, data);
        toast.success("Parámetro actualizado correctamente");
      } else {
        await createParametro(data);
        toast.success("Parámetro creado correctamente");
      }
      router.push("/admin/catalogos/parametros");
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
          {isEdit ? "Configurar Variable" : "Nueva Variable de Sistema"}
        </CardTitle>
        <p className="text-sm text-slate-500 mt-1">
          {isEdit ? `Modificando configuración de ${initialData.clave}` : "Defina una nueva variable global para el comportamiento del sistema."}
        </p>
      </CardHeader>
      <CardContent className="p-6 lg:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="clave" className="font-bold text-slate-700">Clave del Sistema (ID único)</Label>
              <Input
                id="clave"
                name="clave"
                required
                defaultValue={initialData?.clave}
                placeholder="Ej. APP_TITLE_PRIMARY"
                className="rounded-xl border-slate-200 h-11 font-mono uppercase"
              />
              <p className="text-[10px] text-slate-400 uppercase tracking-wider">La clave se normalizará automáticamente (MAYÚSCULAS_CON_GUIONES)</p>
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="valor" className="font-bold text-slate-700">Valor de la Variable</Label>
              <Input
                id="valor"
                name="valor"
                required
                defaultValue={initialData?.valor}
                placeholder="Ej. SIPEEM Guerrero"
                className="rounded-xl border-slate-200 h-11"
              />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="categoria" className="font-bold text-slate-700">Categoría / Grupo</Label>
              <Input
                id="categoria"
                name="categoria"
                required
                defaultValue={initialData?.categoria || "General"}
                placeholder="Ej. Mapas, Seguridad, UI"
                className="rounded-xl border-slate-200 h-11"
              />
            </div>

            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="descripcion" className="font-bold text-slate-700">Descripción (Opcional)</Label>
              <Textarea
                id="descripcion"
                name="descripcion"
                defaultValue={initialData?.descripcion || ""}
                placeholder="Explique para qué se utiliza esta variable..."
                className="rounded-xl border-slate-200 min-h-[100px] resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium animate-in slide-in-from-top-2 duration-300">
              {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-6 border-t border-slate-100">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-slate-900 font-bold hover:bg-slate-800 h-11 transition-all"
            >
              {loading ? "Guardando..." : "Guardar parámetro"}
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
