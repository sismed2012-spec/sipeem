import { getUsuarioActual } from "@/actions/auth";
import { getConsultaInitialData } from "@/actions/historial-consulta";
import ConsultaAvanzada from "@/components/historial/ConsultaAvanzada";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ConsultaAvanzadaPage() {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (!["director", "admin"].includes(usuario.rol)) redirect("/mapa");

  const initialData = await getConsultaInitialData();

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-col gap-4">
        <Link
          href="/admin/historial"
          className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 transition-colors hover:text-slate-900"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 font-bold transition-colors group-hover:bg-slate-50">
            <ChevronLeft className="h-3 w-3" />
          </div>
          Historial Electoral
        </Link>
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-slate-900 uppercase">
            Consulta Avanzada
          </h1>
          <p className="mt-1 font-medium text-slate-500">
            Tabla dinámica electoral — cruza dimensiones, métricas y años con máximo detalle disponible.
          </p>
        </div>
      </div>

      <ConsultaAvanzada initialData={initialData} />
    </div>
  );
}
