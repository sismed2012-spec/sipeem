"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createUsuario } from "@/actions/usuarios";
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
export default function NuevoUsuarioForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ password: string } | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const data = {
      nombre: formData.get("nombre") as string,
      email: formData.get("email") as string,
      rol: formData.get("rol") as string,
    };

    try {
      const res = await createUsuario(data);
      if (res.success && res.password) {
        setSuccessData({ password: res.password });
      } else {
        setError(res.error || "Error desconocido");
      }
    } catch {
      setError("Error de conexión con el servidor");
    } finally {
      setLoading(false);
    }
  }

  if (successData) {
    return (
      <Card className="max-w-xl mx-auto border-emerald-200 bg-emerald-50 shadow-lg animate-in zoom-in duration-300">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-emerald-500 flex items-center justify-center text-white text-xl font-bold">
              ✓
            </div>
            <CardTitle className="text-emerald-900">Usuario Creado</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-emerald-800">
            El usuario ha sido aprovisionado correctamente en la plataforma SIPEEM y Supabase Auth.
          </p>

          <div className="rounded-xl border border-emerald-200 bg-white p-6 space-y-4">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-slate-500">Contraseña temporal</Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-slate-100 p-3 rounded-lg text-xl font-mono font-bold text-slate-900 select-all">
                  {successData.password}
                </code>
              </div>
            </div>
            <p className="text-xs text-amber-600 font-semibold bg-amber-50 p-3 rounded-lg border border-amber-100">
              IMPORTANTE: Esta contraseña solo se muestra una vez. Por favor, cópiela y entréguela al usuario de forma segura.
            </p>
          </div>

          <Button 
            className="w-full bg-emerald-600 hover:bg-emerald-700 font-bold"
            onClick={() => router.push("/admin/usuarios")}
          >
            Regresar al listado
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto border-slate-200 shadow-md">
      <CardHeader>
        <CardTitle className="text-2xl font-black text-slate-900">Nuevo Usuario</CardTitle>
        <p className="text-sm text-slate-500">Complete los datos para crear una nueva identidad operativa.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="nombre">Nombre completo</Label>
              <Input
                id="nombre"
                name="nombre"
                required
                placeholder="Ej. Juan Pérez"
                className="rounded-xl border-slate-200"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                placeholder="usuario@ejemplo.com"
                className="rounded-xl border-slate-200"
              />
              <p className="text-[10px] text-slate-400">
                Se usará como nombre de usuario para el inicio de sesión.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="rol">Rol de sistema</Label>
              <Select name="rol" defaultValue="operador" required>
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
              {loading ? "Creando..." : "Crear y generar contraseña"}
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
