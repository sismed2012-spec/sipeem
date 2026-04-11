import { getUsuarioActual } from "@/actions/auth";
import { getMunicipios } from "@/actions/municipios";
import { getPartidos } from "@/actions/partidos";
import { getHistorialById } from "@/actions/historial";
import { redirect, notFound } from "next/navigation";
import HistorialForm from "@/components/historial/HistorialForm";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarHistorialPage({ params }: PageProps) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  const { id } = await params;

  // Prefetch everything needed for the relational form
  let historial;
  try {
    historial = await getHistorialById(id);
  } catch (e) {
    console.error("Error al cargar historial:", e);
    return notFound();
  }

  if (!historial) {
    return notFound();
  }

  const [municipios, partidos] = await Promise.all([
    getMunicipios(),
    getPartidos()
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      {/* breadcrumbs */}
      <div className="flex items-center gap-2">
        <Link 
          href="/admin/historial" 
          className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
        >
          <div className="h-6 w-6 rounded-full border border-slate-200 flex items-center justify-center group-hover:bg-slate-50 transition-colors font-bold">
            <ChevronLeft className="h-3 w-3" />
          </div>
          Regresar al listado
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl uppercase tracking-tighter">
          Administrar Evento Electoral
        </h1>
        <p className="text-slate-500 font-medium">
          Ajuste de resultados oficiales y desgloses de participación para {historial.municipio?.nombre} ({historial.anio}).
        </p>
      </div>

      <HistorialForm 
        initialData={historial} 
        municipios={municipios} 
        partidos={partidos} 
      />
    </div>
  );
}
