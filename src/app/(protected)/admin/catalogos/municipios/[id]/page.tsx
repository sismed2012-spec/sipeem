import { getUsuarioActual } from "@/actions/auth";
import { getMunicipioById } from "@/actions/municipios";
import { redirect, notFound } from "next/navigation";
import MunicipioForm from "@/components/catalogos/MunicipioForm";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditarMunicipioPage({ params }: PageProps) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  const { id } = await params;

  let municipio;
  try {
    municipio = await getMunicipioById(id);
  } catch (e) {
    console.error("Error al cargar municipio:", e);
    return notFound();
  }

  if (!municipio) {
    return notFound();
  }

  return (
    <div className="py-4 lg:py-8 space-y-8 max-w-5xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">
          Detalles del Municipio
        </h1>
        <p className="text-slate-500">
          Visualización y actualización de parámetros estructurales para {municipio.nombre}.
        </p>
      </div>

      <MunicipioForm initialData={municipio} />
    </div>
  );
}
