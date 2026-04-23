import { getUsuarioActual } from "@/actions/auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await getUsuarioActual();

  if (!usuario || usuario.rol === "operador") {
    redirect("/mapa");
  }

  return <>{children}</>;
}
