"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";

export default function GlobalError({
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
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center">
      <div className="p-4 bg-red-900/40 rounded-full mb-6 border border-red-800">
        <AlertTriangle className="h-8 w-8 text-red-400" />
      </div>
      <h1 className="text-3xl font-black text-white tracking-tight mb-2">
        Error del sistema
      </h1>
      <p className="text-slate-400 text-sm max-w-sm mb-8">
        Ocurrió un error inesperado. Puedes intentar recargar o regresar al inicio.
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={reset}
          className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-100 transition-colors"
        >
          Reintentar
        </button>
        <Link
          href="/login"
          className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-bold text-slate-300 hover:bg-slate-800 transition-colors"
        >
          Volver al inicio
        </Link>
      </div>
      {error.digest && (
        <p className="mt-8 text-[10px] font-mono text-slate-600 uppercase tracking-widest">
          ref: {error.digest}
        </p>
      )}
    </div>
  );
}
