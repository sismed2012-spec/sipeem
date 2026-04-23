import { getUsuarioActual, logout } from "@/actions/auth";
import SidebarNav from "@/components/layout/SidebarNav";
import { MobileNav } from "@/components/layout/MobileNav";
import { redirect } from "next/navigation";

type ProtectedLayoutProps = {
  children: React.ReactNode;
};

function getRolLabel(rol?: string | null) {
  if (!rol) return "Sin rol";

  const map: Record<string, string> = {
    director: "Director",
    admin: "Administrador",
    operador: "Operador",
  };

  return map[rol] ?? rol;
}

export default async function ProtectedLayout({
  children,
}: ProtectedLayoutProps) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  const esAdmin = usuario.rol !== "operador";

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="flex min-h-screen">
        {/* Sidebar desktop */}
        <aside className="hidden w-80 shrink-0 border-r border-slate-800 bg-slate-950 text-white lg:flex lg:flex-col">
          <div className="border-b border-slate-800 px-6 py-6">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
              SIPEEM
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight">
              Panel Operativo
            </h1>
          </div>

          <div className="border-b border-slate-800 px-6 py-6">
            <p className="text-xl font-bold text-white">
              {usuario.nombre ?? usuario.email ?? "Usuario"}
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Rol: {getRolLabel(usuario.rol)}
            </p>
          </div>

          <SidebarNav esAdmin={esAdmin} />

          <div className="border-t border-slate-800 p-4">
            <form action={logout}>
              <button
                type="submit"
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-700"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </aside>

        {/* Main */}
        <div className="flex min-h-screen flex-1 flex-col">
          {/* Topbar */}
          <header className="border-b border-slate-200 bg-white px-4 py-4 lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.25em] text-slate-500">
                  SIPEEM
                </p>
                <h2 className="text-xl font-black tracking-tight text-slate-900 lg:text-3xl">
                  Plataforma Operativa
                </h2>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-right">
                  <p className="text-sm font-semibold text-slate-800 lg:text-xl">
                    {usuario.nombre ?? usuario.email ?? "Usuario"}
                  </p>
                  <p className="text-xs text-slate-500 lg:text-sm">
                    {getRolLabel(usuario.rol)}
                  </p>
                </div>

                <MobileNav
                  esAdmin={esAdmin}
                  nombreUsuario={usuario.nombre ?? usuario.email ?? "Usuario"}
                  rolLabel={getRolLabel(usuario.rol)}
                />
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}