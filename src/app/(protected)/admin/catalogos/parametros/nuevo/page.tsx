import { getUsuarioActual } from "@/actions/auth";
import { redirect } from "next/navigation";
import ParametroForm from "@/components/catalogos/ParametroForm";
import Link from "next/link";

export default async function NuevoParametroPage() {
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
          <Link href="/admin/catalogos/parametros" className="hover:text-slate-900 transition-colors">Parámetros</Link>
          <span>/</span>
          <span className="text-slate-900">Nueva Variable</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
          Configurar Parámetro
        </h1>
        <p className="text-slate-500 max-w-2xl">
          Defina una nueva variable global. Asegúrese de que el nombre de la clave sea descriptivo y único.
        </p>
      </div>

      <ParametroForm />
    </div>
  );
}
