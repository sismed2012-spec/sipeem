import { getUsuarioActual } from "@/actions/auth";
import { logout } from "@/actions/auth";
import { redirect } from "next/navigation";

export default async function CampoLayout({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">SIPEEM Campo</p>
          <p className="text-sm font-black">{usuario.nombre}</p>
        </div>
        <form action={logout}>
          <button type="submit" className="text-xs text-slate-400 hover:text-white transition-colors">
            Salir
          </button>
        </form>
      </header>
      <main className="p-4 max-w-lg mx-auto">{children}</main>
    </div>
  );
}
