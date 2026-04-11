import { getUsuarioActual } from "@/actions/auth";
import { getPartidoById } from "@/actions/partidos";
import { redirect, notFound } from "next/navigation";
import PartidoForm from "@/components/catalogos/PartidoForm";
import Link from "next/link";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarPartidoPage({ params }: PageProps) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  const { id } = await params;

  let partido;
  try {
    partido = await getPartidoById(id);
  } catch (e) {
    console.error("Error al cargar partido:", e);
    return notFound();
  }

  if (!partido) {
    return notFound();
  }

  return (
    <div className="py-4 lg:py-8 space-y-8 max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500 mb-1">
          <Link href="/admin/catalogos/partidos" className="hover:text-slate-900 transition-colors">Partidos</Link>
          <span>/</span>
          <span className="text-slate-900">Editar Detalle</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
          Gestión Institucional
        </h1>
        <p className="text-slate-500 max-w-2xl">
          Visualización y actualización de la identidad corporativa de {partido.nombre}.
        </p>
      </div>

      <PartidoForm initialData={partido} />
    </div>
  );
}
