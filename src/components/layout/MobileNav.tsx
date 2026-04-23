"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import SidebarNav from "./SidebarNav";
import { logout } from "@/actions/auth";

type MobileNavProps = {
  esAdmin: boolean;
  nombreUsuario: string;
  rolLabel: string;
};

export function MobileNav({ esAdmin, nombreUsuario, rolLabel }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg:hidden inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2.5 text-slate-600 transition hover:bg-slate-50"
        aria-label="Abrir menú"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Drawer */}
          <div className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-950 text-white shadow-2xl">
            {/* Cabecera del drawer */}
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">
                  SIPEEM
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight">
                  Panel Operativo
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Info del usuario */}
            <div className="border-b border-slate-800 px-6 py-4">
              <p className="font-bold text-white">{nombreUsuario}</p>
              <p className="text-sm text-slate-400">{rolLabel}</p>
            </div>

            {/* Navegación — cierra el drawer al tocar un enlace */}
            <div
              className="flex-1 overflow-y-auto"
              onClick={() => setOpen(false)}
            >
              <SidebarNav esAdmin={esAdmin} />
            </div>

            {/* Cerrar sesión */}
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
          </div>
        </>
      )}
    </>
  );
}
