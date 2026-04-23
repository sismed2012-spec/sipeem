import { redirect } from "next/navigation";
import { getUsuarioActual } from "@/actions/auth";
import LoginForm from "@/components/auth/LoginForm";

export default async function LoginPage() {
  const usuario = await getUsuarioActual();

  if (usuario) {
    redirect("/mapa");
  }

  return <LoginForm />;
}
