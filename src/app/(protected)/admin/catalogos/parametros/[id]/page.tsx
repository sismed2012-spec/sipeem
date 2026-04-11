import { getUsuarioActual } from "@/actions/auth";
import { getParametroById } from "@/actions/parametros";
import { redirect, notFound } from "next/navigation";
import ParametroForm from "@/components/catalogos/ParametroForm";
import Link from "next/link";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarParametroPage({ params }: PageProps) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  const { id } = await params;

  let parametro;
  try {
    parametro = await getParametroById(id);
  } catch (e) {
    console.error("Error al cargar parámetro:", e);
    return notFound();
  }

  if (!parametro) {
    return notFound();
  }

  return (
    <div className="py-4 lg:py-8 space-y-8 max-w-5xl mx-auto animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500 mb-1">
          <Link href="/admin/catalogos/parametros" className="hover:text-slate-900 transition-colors">Parámetros</Link>
          <span>/</span>
          <span className="text-slate-900">Configurar</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
          Ajustar Configuración
        </h1>
        <p className="text-slate-500 max-w-2xl">
          Modificando el valor de <strong>{parametro.clave}</strong>. Los cambios aplicados pueden afectar el comportamiento global del sistema.
        </p>
      </div>

      <ParametroForm initialData={parametro} />
    </div>
  );
}
