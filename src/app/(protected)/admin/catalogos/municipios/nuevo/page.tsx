import { getUsuarioActual } from "@/actions/auth";
import { redirect } from "next/navigation";
import MunicipioForm from "@/components/catalogos/MunicipioForm";

export default async function NuevoMunicipioPage() {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  return (
    <div className="py-4 lg:py-8 space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Nuevo Municipio
        </h1>
        <p className="text-slate-500">
          Ingrese los datos base para registrar una nueva demarcación territorial en el sistema.
        </p>
      </div>

      <MunicipioForm />
    </div>
  );
}
