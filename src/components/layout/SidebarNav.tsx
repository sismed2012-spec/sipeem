"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Gauge, ClipboardList, Key, Smartphone } from "lucide-react";

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
  const isCampo = pathname.startsWith("/campo");
  const isAdmin = pathname === "/admin";
  const isImportacion = pathname === "/admin/importacion";
  const isUsuarios = pathname.startsWith("/admin/usuarios");
  const isEstrategia = pathname.startsWith("/admin/estrategia-municipal");
  const isCatalogos = pathname.startsWith("/admin/catalogos");
  const isHistorial = pathname.startsWith("/admin/historial");
  const isSituacion = pathname.startsWith("/admin/situacion");
  const isAuditoria = pathname.startsWith("/admin/auditoria");
  const isApiKeys = pathname.startsWith("/admin/api-keys");

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

        <Link href="/campo" className={itemClass(isCampo)}>
          <span className={iconClass(isCampo, "bg-emerald-600/20 text-emerald-300")}>
            <Smartphone className="h-4 w-4" />
          </span>
          Modo Campo
        </Link>

        {esAdmin && (
          <>
            <Link href="/admin/situacion" className={itemClass(isSituacion)}>
              <span
                className={iconClass(isSituacion, "bg-purple-600/20 text-purple-300")}
              >
                <Gauge className="h-4 w-4" />
              </span>
              Sala de Situación
            </Link>

            <Link href="/admin/auditoria" className={itemClass(isAuditoria)}>
              <span
                className={iconClass(isAuditoria, "bg-orange-600/20 text-orange-300")}
              >
                <ClipboardList className="h-4 w-4" />
              </span>
              Auditoría
            </Link>

            <Link href="/admin" className={itemClass(isAdmin)}>
              <span
                className={iconClass(isAdmin, "bg-blue-600/20 text-blue-300")}
              >
                A
              </span>
              Panel administrativo
            </Link>

            <Link href="/admin/estrategia-municipal" className={itemClass(isEstrategia)}>
              <span
                className={iconClass(isEstrategia, "bg-indigo-600/20 text-indigo-300")}
              >
                E
              </span>
              Estrategia municipal
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

            <Link href="/admin/api-keys" className={itemClass(isApiKeys)}>
              <span className={iconClass(isApiKeys, "bg-violet-600/20 text-violet-300")}>
                <Key className="h-4 w-4" />
              </span>
              API Keys
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}