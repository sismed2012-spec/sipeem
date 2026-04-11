import { getUsuarioActual } from "@/actions/auth";
import { redirect } from "next/navigation";
import PartidoForm from "@/components/catalogos/PartidoForm";
import Link from "next/link";

export default async function NuevoPartidoPage() {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  return (
    <div className="py-4 lg:py-8 space-y-8 max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500 mb-1">
          <Link href="/admin/catalogos/partidos" className="hover:text-slate-900 transition-colors">Partidos</Link>
          <span>/</span>
          <span className="text-slate-900">Nuevo</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
          Registro de Partido
        </h1>
        <p className="text-slate-500 max-w-2xl">
          Introduzca la denominación, siglas y color representativo para la nueva fuerza política en el sistema.
        </p>
      </div>

      <PartidoForm />
    </div>
  );
}
