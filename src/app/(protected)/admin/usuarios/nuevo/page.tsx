import { getUsuarioActual } from "@/actions/auth";
import { redirect } from "next/navigation";
import NuevoUsuarioForm from "@/components/usuarios/NuevoUsuarioForm";

export default async function NuevoUsuarioPage() {
  const usuarioLogueado = await getUsuarioActual();

  if (!usuarioLogueado) {
    redirect("/login");
  }

  // Same safety check as the listing page
  if (usuarioLogueado.rol === "operador") {
    redirect("/mapa");
  }

  return (
    <div className="py-4 lg:py-8 space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Aprovisionamiento de Usuario
        </h1>
        <p className="text-slate-500">
          Gestione la creación de nuevas identidades digitales con enlace automático a Supabase Auth.
        </p>
      </div>

      <NuevoUsuarioForm />
    </div>
  );
}
