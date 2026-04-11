"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type SidebarNavProps = {
  esAdmin: boolean;
};

function itemClass(active: boolean) {
  return active
    ? "flex items-center rounded-xl px-4 py-3 text-sm font-semibold bg-slate-800 text-white shadow-sm"
    : "flex items-center rounded-xl px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 hover:text-white";
}

function iconClass(active: boolean, activeColors: string) {
  return active
    ? `mr-3 inline-flex h-8 w-8 items-center justify-center rounded-lg ${activeColors}`
    : "mr-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400";
}

export default function SidebarNav({ esAdmin }: SidebarNavProps) {
  const pathname = usePathname();

  const isMapa = pathname === "/mapa";
  const isAdmin = pathname === "/admin";
  const isImportacion = pathname === "/admin/importacion";
  const isUsuarios = pathname.startsWith("/admin/usuarios");
  const isCatalogos = pathname.startsWith("/admin/catalogos");
  const isHistorial = pathname.startsWith("/admin/historial");

  return (
    <nav className="flex-1 px-4 py-6">
      <div className="space-y-2">
        <Link href="/mapa" className={itemClass(isMapa)}>
          <span
            className={iconClass(isMapa, "bg-emerald-600/20 text-emerald-300")}
          >
            M
          </span>
          Inicio / Mapa
        </Link>

        {esAdmin && (
          <>
            <Link href="/admin" className={itemClass(isAdmin)}>
              <span
                className={iconClass(isAdmin, "bg-blue-600/20 text-blue-300")}
              >
                A
              </span>
              Panel administrativo
            </Link>

            <Link
              href="/admin/catalogos"
              className={itemClass(isCatalogos)}
            >
              <span
                className={iconClass(
                  isCatalogos,
                  "bg-amber-600/20 text-amber-500"
                )}
              >
                C
              </span>
              Catálogos base
            </Link>

            <Link
              href="/admin/historial"
              className={itemClass(isHistorial)}
            >
              <span
                className={iconClass(
                  isHistorial,
                  "bg-rose-600/20 text-rose-300"
                )}
              >
                H
              </span>
              Historial / resultados
            </Link>

            <Link
              href="/admin/importacion"
              className={itemClass(isImportacion)}
            >
              <span
                className={iconClass(
                  isImportacion,
                  "bg-cyan-600/20 text-cyan-300"
                )}
              >
                I
              </span>
              Importación electoral
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}