import { getUsuarioActual } from "@/actions/auth";
import { getUsuarioById } from "@/actions/usuarios";
import { redirect, notFound } from "next/navigation";
import EditarUsuarioForm from "@/components/usuarios/EditarUsuarioForm";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarUsuarioPage({ params }: PageProps) {
  const usuarioLogueado = await getUsuarioActual();

  if (!usuarioLogueado) {
    redirect("/login");
  }

  // Safety check
  if (usuarioLogueado.rol === "operador") {
    redirect("/mapa");
  }

  const { id } = await params;

  let usuarioToEdit;
  try {
    usuarioToEdit = await getUsuarioById(id);
  } catch (e) {
    console.error("Error al cargar usuario:", e);
    return notFound();
  }

  if (!usuarioToEdit) {
    return notFound();
  }

  return (
    <div className="py-4 lg:py-8 space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Modificar Registro
        </h1>
        <p className="text-slate-500">
          Actualice los niveles de acceso o datos de perfil del usuario de forma segura.
        </p>
      </div>

      <EditarUsuarioForm usuario={usuarioToEdit} />
    </div>
  );
}
