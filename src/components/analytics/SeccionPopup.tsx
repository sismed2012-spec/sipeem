"use client";

import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import type { SeccionDetalle } from "@/actions/estructura";

export interface ArcGISSeccionProps {
  numero: string | number;
  municipio: string | null;
  municipioClave: string | number | null;
  dto_federal: string | number | null;
  dto_local: string | number | null;
  tipo: string | null;
  control: string | number | null;
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

  const effectiveTipo = detalle?.tipo ?? seccion.tipo ?? "-";
  const effectiveListaNominal = detalle?.lista_nominal ?? null;

  return (
    <div className="absolute inset-x-3 bottom-[14.5rem] z-30 w-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl pointer-events-auto 2xl:top-4 2xl:left-[calc(50%+10rem)] 2xl:bottom-auto 2xl:w-64 2xl:rounded-xl">
      <div className="flex items-start justify-between bg-slate-950 px-4 py-2.5">
        <div>
          <div className="text-[12px] font-bold text-white">
            Seccion {seccion.numero}
          </div>
          <div className="mt-0.5 text-[9px] text-slate-400">
            {seccion.municipio ?? "Municipio sin resolver"}
            {seccion.dto_local != null ? ` · Dto. Local ${seccion.dto_local}` : ""}
          </div>
        </div>
        <button
          onClick={onClose}
          className="ml-2 mt-0.5 shrink-0 text-slate-400 transition-colors hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-3 p-3">
        <div>
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
            Cartografia base
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <StatCell label="Mun. clave" value={seccion.municipioClave ?? "-"} />
            <StatCell label="Dto. fed." value={seccion.dto_federal ?? "-"} />
            <StatCell label="Dto. local" value={seccion.dto_local ?? "-"} />
            <StatCell label="Control" value={seccion.control ?? "-"} />
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">
            Supabase - Estructura
          </div>
          {loading && (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
            </div>
          )}
          {!loading && (error || !detalle) && (
            <p className="py-2 text-center text-[11px] text-slate-400">
              No disponible
            </p>
          )}
          {!loading && detalle && (
            <>
              <div className="mb-2 grid grid-cols-2 gap-1.5">
                <StatCell
                  label="Lista nominal"
                  value={
                    effectiveListaNominal != null
                      ? effectiveListaNominal.toLocaleString("es-MX")
                      : "-"
                  }
                />
                <StatCell label="Tipo" value={effectiveTipo} />
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
                  className={`rounded border px-2.5 py-1.5 text-[10px] font-medium ${
                    daysSince > 14
                      ? "border-amber-200 bg-amber-50 text-amber-800"
                      : "border-emerald-200 bg-emerald-50 text-emerald-800"
                  }`}
                >
                  {daysSince > 14
                    ? `Ultimo evento hace ${daysSince} dias`
                    : `Ultimo evento hace ${daysSince} dias`}
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
      className={`rounded border px-2 py-1.5 ${
        highlight
          ? "border-emerald-200 bg-emerald-50"
          : "border-transparent bg-slate-50"
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
