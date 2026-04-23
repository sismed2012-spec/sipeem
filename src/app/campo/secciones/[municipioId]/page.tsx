import { getSeccionesMunicipioCampo, registrarCompromisoCampo } from "@/actions/campo";
import { createServiceClient } from "@/lib/supabase/service";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import CampoSeccionesForm from "./CampoSeccionesForm";

type Props = { params: Promise<{ municipioId: string }> };

export default async function CampoSeccionesPage({ params }: Props) {
  const { municipioId } = await params;
  const id = parseInt(municipioId, 10);
  if (isNaN(id)) return notFound();

  const svc = createServiceClient();
  const { data: mun } = await svc.from("municipios").select("nombre").eq("id", id).single();
  const nombre = mun?.nombre ?? `Municipio ${id}`;

  const { secciones, compromisos } = await getSeccionesMunicipioCampo(id);

  // Latest compromisos per seccion
  const latestBySeccion = new Map<number, number>();
  for (const c of compromisos) {
    if (c.seccion_id && !latestBySeccion.has(c.seccion_id)) {
      latestBySeccion.set(c.seccion_id, c.compromisos);
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href="/campo"
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 font-semibold"
      >
        <ChevronLeft className="w-3 h-3" /> Regresar
      </Link>

      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Compromisos por Sección</p>
        <h1 className="text-xl font-black text-slate-900">{nombre}</h1>
      </div>

      {secciones.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">
          No hay secciones registradas para este municipio.
        </p>
      ) : (
        <CampoSeccionesForm
          municipioId={id}
          secciones={secciones}
          initialCounts={Object.fromEntries(latestBySeccion)}
          registrar={registrarCompromisoCampo}
        />
      )}
    </div>
  );
}
