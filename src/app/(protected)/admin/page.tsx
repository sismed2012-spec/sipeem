import Link from "next/link";
import { getUsuarioActual } from "@/actions/auth";
import { redirect } from "next/navigation";

export default async function AdminPage() {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  return (
    <div className="space-y-8">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">
          Administración
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">
          Panel Administrativo
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-slate-200">
          Centro de control para módulos restringidos del sistema SIPEEM.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
            <span className="text-xl font-bold">I</span>
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            Importación electoral
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Carga, valida y confirma historiales electorales mediante archivos CSV.
          </p>

          <div className="mt-6">
            <Link
              href="/admin/importacion"
              className="inline-flex rounded-lg bg-[#009B4D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#007a3c]"
            >
              Abrir módulo
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
            <span className="text-xl font-bold">U</span>
          </div>

          <h2 className="text-xl font-bold text-slate-900">Usuarios y roles</h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Administración de cuentas, perfiles y permisos del sistema.
          </p>

          <div className="mt-6">
            <Link
              href="/admin/usuarios"
              className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Abrir módulo
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <span className="text-xl font-bold">C</span>
          </div>

          <h2 className="text-xl font-bold text-slate-900">Catálogos base</h2>

          <p className="mt-2 text-sm leading-6 text-slate-600">
            Configuración de municipios, partidos y parámetros base del sistema.
          </p>

          <div className="mt-6">
            <Link
              href="/admin/catalogos"
              className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Abrir módulo
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}