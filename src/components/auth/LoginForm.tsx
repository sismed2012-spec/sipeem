"use client";

import { useState } from "react";
import { Settings, Check, User, Lock, Zap } from "lucide-react";
import { login } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    const result = await login(formData);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-slate-900 relative overflow-hidden">
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-[#009B4D] rounded-full mix-blend-screen filter blur-[100px] opacity-30 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-[#DA251D] rounded-full mix-blend-screen filter blur-[100px] opacity-30 pointer-events-none" />

      <div className="bg-white p-8 md:p-12 rounded-2xl shadow-2xl w-full max-w-md relative z-10 border-t-[6px] border-[#009B4D]">
        <div className="text-center mb-8">
          <div className="relative flex items-center justify-center w-16 h-16 mx-auto mb-4">
            <Settings className="absolute w-14 h-14 text-[#009B4D] opacity-90" />
            <Check className="absolute w-7 h-7 text-white mt-1" strokeWidth={3} />
          </div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">
            SIPEEM
          </h2>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
            Acceso a Plataforma Operativa
          </p>
        </div>

        <form action={handleSubmit} className="space-y-5">
          <div>
            <Label className="text-sm font-bold text-slate-700">
              Correo Electronico
            </Label>
            <div className="relative mt-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <Input
                type="email"
                name="email"
                placeholder="usuario@sipeem.mx"
                required
                className="pl-10"
              />
            </div>
          </div>

          <div>
            <Label className="text-sm font-bold text-slate-700">
              Contrasena
            </Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <Input
                type="password"
                name="password"
                placeholder="........"
                required
                className="pl-10"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 font-semibold bg-red-50 p-3 rounded-lg border border-red-200">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-[#009B4D] hover:bg-[#007a3c] text-white font-bold py-3.5 text-lg tracking-wide"
          >
            {loading ? "INICIANDO..." : "INICIALIZAR MOTOR"}
            <Zap className="ml-2 h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
