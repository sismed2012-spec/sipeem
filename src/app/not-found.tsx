import Link from "next/link";
import { MapPin } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center relative overflow-hidden">
      {/* Fondo decorativo */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-[#009B4D] rounded-full mix-blend-screen filter blur-[120px] opacity-10 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-indigo-600 rounded-full mix-blend-screen filter blur-[120px] opacity-10 pointer-events-none" />

      <div className="relative z-10">
        <div className="inline-flex p-4 bg-slate-800 rounded-2xl mb-6 border border-slate-700">
          <MapPin className="h-8 w-8 text-slate-400" />
        </div>

        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 mb-2">
          SIPEEM · Error 404
        </p>
        <h1 className="text-7xl font-black text-white tracking-tighter mb-4">
          404
        </h1>
        <h2 className="text-xl font-bold text-slate-300 mb-2">
          Página no encontrada
        </h2>
        <p className="text-slate-500 text-sm max-w-sm mb-10 leading-relaxed">
          La ruta que intentas acceder no existe o fue movida a otra ubicación.
        </p>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/mapa"
            className="rounded-xl bg-white px-6 py-2.5 text-sm font-bold text-slate-900 hover:bg-slate-100 transition-colors"
          >
            Ir al inicio
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-slate-700 px-6 py-2.5 text-sm font-bold text-slate-400 hover:bg-slate-800 transition-colors"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
