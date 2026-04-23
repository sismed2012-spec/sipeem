"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[SIPEEM Error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
      <div className="p-5 bg-red-50 rounded-2xl mb-6 border border-red-100">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>

      <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-1">
        Algo salió mal
      </h2>
      <p className="text-slate-500 text-sm max-w-sm mb-8 leading-relaxed">
        {error.message?.length < 120
          ? error.message
          : "Ocurrió un error inesperado al cargar esta sección."}
      </p>

      <div className="flex items-center gap-3">
        <Button
          onClick={reset}
          className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800 gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Reintentar
        </Button>
        <Link href="/mapa">
          <Button
            variant="outline"
            className="rounded-xl border-slate-200 font-bold gap-2 hover:bg-slate-50"
          >
            <Home className="h-4 w-4" />
            Inicio
          </Button>
        </Link>
      </div>

      {error.digest && (
        <p className="mt-10 text-[10px] font-mono text-slate-300 uppercase tracking-widest">
          ref: {error.digest}
        </p>
      )}
    </div>
  );
}
