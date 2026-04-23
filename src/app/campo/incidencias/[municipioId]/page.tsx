import { createServiceClient } from "@/lib/supabase/service";
import { crearIncidenciaCampo } from "@/actions/campo";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import CampoIncidenciasForm from "./CampoIncidenciasForm";

type Props = { params: Promise<{ municipioId: string }> };

export default async function CampoIncidenciasPage({ params }: Props) {
  const { municipioId } = await params;
  const id = parseInt(municipioId, 10);
  if (isNaN(id)) return notFound();

  const svc = createServiceClient();
  const { data: mun } = await svc.from("municipios").select("nombre").eq("id", id).single();
  const nombre = mun?.nombre ?? `Municipio ${id}`;

  return (
    <div className="space-y-4">
      <Link
        href="/campo"
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 font-semibold"
      >
        <ChevronLeft className="w-3 h-3" /> Regresar
      </Link>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Reportar Incidencia</p>
        <h1 className="text-xl font-black text-slate-900">{nombre}</h1>
      </div>

      <CampoIncidenciasForm municipioId={id} crearIncidencia={crearIncidenciaCampo} />
    </div>
  );
}
