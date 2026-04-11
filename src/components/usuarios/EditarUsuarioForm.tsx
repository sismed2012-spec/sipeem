"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUsuario } from "@/actions/usuarios";
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

type EditarUsuarioFormProps = {
  usuario: {
    id: string;
    nombre: string;
    email: string;
    rol: string;
  };
};

export default function EditarUsuarioForm({ usuario }: EditarUsuarioFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      nombre: formData.get("nombre") as string,
      rol: formData.get("rol") as string,
    };

    try {
      await updateUsuario(usuario.id, data);
      toast.success("Usuario actualizado correctamente");
      router.push("/admin/usuarios");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="max-w-2xl mx-auto border-slate-200 shadow-md">
      <CardHeader>
        <CardTitle className="text-2xl font-black text-slate-900">Editar Perfil</CardTitle>
        <p className="text-sm text-slate-500">Actualización de atributos para {usuario.email}.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-slate-400">Identificador (Email)</Label>
              <Input
                id="email"
                defaultValue={usuario.email}
                disabled
                className="rounded-xl border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="nombre">Nombre completo</Label>
              <Input
                id="nombre"
                name="nombre"
                required
                defaultValue={usuario.nombre}
                placeholder="Ej. Juan Pérez"
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rol">Rol de sistema</Label>
              <Select name="rol" defaultValue={usuario.rol} required>
                <SelectTrigger className="rounded-xl border-slate-200">
                  <SelectValue placeholder="Seleccione un rol" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="director">Director (Acceso total)</SelectItem>
                  <SelectItem value="admin">Administrador (Gestión base)</SelectItem>
                  <SelectItem value="operador">Operador (Uso de campo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-sm font-medium">
              Error: {error}
            </div>
          )}

          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-slate-900 font-bold hover:bg-slate-800"
            >
              {loading ? "Actualizando..." : "Guardar cambios"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={loading}
              onClick={() => router.back()}
              className="rounded-xl border-slate-200 font-semibold text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
