"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import type { SeccionDetalle } from "@/actions/estructura";

export interface ArcGISSeccionProps {
  numero: string | number;
  municipio: string | null;
  dto_local: string | number | null;
  lista_nominal: number | null;
  tipo: string | null;
  municipioId: number | null;
}

interface Props {
  seccion: ArcGISSeccionProps;
  onClose: () => void;
}

export function SeccionPopup({ seccion, onClose }: Props) {
  const [detalle, setDetalle] = useState<SeccionDetalle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!seccion.municipioId) return;
    setLoading(true);
    setError(false);
    import("@/actions/estructura")
      .then(({ getEstructuraBySeccion }) =>
        getEstructuraBySeccion(seccion.municipioId!, Number(seccion.numero))
      )
      .then(setDetalle)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [seccion.municipioId, seccion.numero]);

  const daysSince =
    detalle?.ultimo_evento
      ? Math.floor(
          (Date.now() - new Date(detalle.ultimo_evento).getTime()) / 86_400_000
        )
      : null;

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-64 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden pointer-events-auto">
      <div className="bg-slate-950 px-4 py-2.5 flex items-start justify-between">
        <div>
          <div className="text-white text-[12px] font-bold">
            Sección {seccion.numero}
          </div>
          <div className="text-slate-400 text-[9px] mt-0.5">
            {seccion.municipio}
            {seccion.dto_local != null ? ` · Dto. Local ${seccion.dto_local}` : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors ml-2 mt-0.5 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="p-3 space-y-3">
        <div>
          <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">
            ArcGIS
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <StatCell
              label="Lista nominal"
              value={
                seccion.lista_nominal != null
                  ? seccion.lista_nominal.toLocaleString("es-MX")
                  : "—"
              }
            />
            <StatCell label="Tipo" value={seccion.tipo ?? "—"} />
          </div>
        </div>

        <div>
          <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-1.5">
            Supabase — Estructura
          </div>
          {loading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
            </div>
          )}
          {!loading && (error || !detalle) && (
            <p className="text-[11px] text-slate-400 text-center py-2">
              No disponible
            </p>
          )}
          {!loading && detalle && (
            <>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                <StatCell
                  label="Promotor"
                  value={detalle.promotor ?? "Sin asignar"}
                  highlight={!!detalle.promotor}
                />
                <StatCell
                  label="Compromisos"
                  value={
                    detalle.meta > 0
                      ? `${detalle.compromisos} / ${detalle.meta}`
                      : String(detalle.compromisos)
                  }
                  highlight={detalle.compromisos > 0}
                />
              </div>
              {daysSince != null && (
                <div
                  className={`rounded px-2.5 py-1.5 text-[10px] font-medium ${
                    daysSince > 14
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "bg-emerald-50 text-emerald-800 border border-emerald-200"
                  }`}
                >
                  {daysSince > 14
                    ? `⚠ Último evento hace ${daysSince} días`
                    : `✓ Último evento hace ${daysSince} días`}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded px-2 py-1.5 border ${
        highlight
          ? "bg-emerald-50 border-emerald-200"
          : "bg-slate-50 border-transparent"
      }`}
    >
      <div className={`text-[9px] ${highlight ? "text-emerald-600" : "text-slate-400"}`}>
        {label}
      </div>
      <div
        className={`text-[12px] font-semibold ${
          highlight ? "text-emerald-700" : "text-slate-800"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
