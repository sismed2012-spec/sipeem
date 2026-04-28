"use client";

import { useState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import type { MapAnalyticsDTO } from "@/actions/analytics";
import type { EstructuraResumen } from "@/actions/estructura";

export interface ArcGISMunicipioProps {
  nombre: string;
  cvegeo: string | null;
  entidad: string | number | null;
  municipio_clave: string | number | null;
  control: string | number | null;
  properties: Record<string, unknown>;
}

interface Props {
  arcgis: ArcGISMunicipioProps;
  electoralData: MapAnalyticsDTO | null;
  municipioId: number | null;
  onClose: () => void;
  onVerSecciones: () => void;
}

type Tab = "cartografia" | "electoral" | "estructura";

export function MunicipioPopup({
  arcgis,
  electoralData,
  municipioId,
  onClose,
  onVerSecciones,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("cartografia");
  const [estructura, setEstructura] = useState<EstructuraResumen | null>(null);
  const [estructuraLoading, setEstructuraLoading] = useState(false);
  const [estructuraError, setEstructuraError] = useState(false);

  useEffect(() => {
    if (tab !== "estructura" || !municipioId || estructura) return;
    setEstructuraLoading(true);
    setEstructuraError(false);
    import("@/actions/estructura")
      .then(({ getEstructuraResumenByMunicipio }) =>
        getEstructuraResumenByMunicipio(municipioId)
      )
      .then(setEstructura)
      .catch(() => setEstructuraError(true))
      .finally(() => setEstructuraLoading(false));
  }, [tab, municipioId, estructura]);

  const TAB_LABELS: Record<Tab, string> = {
    cartografia: "Cartografia",
    electoral: "Electoral",
    estructura: "Estructura",
  };

  return (
    <div className="absolute inset-x-3 bottom-3 z-30 w-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl pointer-events-auto 2xl:top-4 2xl:left-1/2 2xl:bottom-auto 2xl:w-72 2xl:-translate-x-1/2 2xl:rounded-xl">
      <div className="flex items-start justify-between bg-slate-900 px-4 py-3">
        <div>
          <div className="text-[13px] font-bold leading-tight text-white">
            {arcgis.nombre}
          </div>
          {arcgis.cvegeo && (
            <div className="mt-0.5 text-[10px] text-slate-400">
              Geo ID: {arcgis.cvegeo}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="ml-2 mt-0.5 shrink-0 text-slate-400 transition-colors hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex border-b border-slate-100">
        {(["cartografia", "electoral", "estructura"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${
              tab === t
                ? "border-b-2 border-blue-500 text-blue-600"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="p-3">
        {tab === "cartografia" && (
          <CartografiaTab
            arcgis={arcgis}
            electoralData={electoralData}
            onVerSecciones={onVerSecciones}
            onFichaCompleta={() => {
              if (electoralData?.municipio_id) {
                router.push(`/admin/historial/municipio/${electoralData.municipio_id}`);
              }
            }}
          />
        )}
        {tab === "electoral" && <ElectoralTab data={electoralData} />}
        {tab === "estructura" && (
          <EstructuraTab
            data={estructura}
            loading={estructuraLoading}
            error={estructuraError}
          />
        )}
      </div>
    </div>
  );
}

function CartografiaTab({
  arcgis,
  electoralData,
  onVerSecciones,
  onFichaCompleta,
}: {
  arcgis: ArcGISMunicipioProps;
  electoralData: MapAnalyticsDTO | null;
  onVerSecciones: () => void;
  onFichaCompleta: () => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
        Cartografia base
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <StatCell label="Entidad" value={arcgis.entidad ?? "-"} />
        <StatCell label="Clave mun." value={arcgis.municipio_clave ?? "-"} />
        <StatCell label="Geo ID" value={arcgis.cvegeo ?? "-"} />
        <StatCell label="Control" value={arcgis.control ?? "-"} />
      </div>

      {electoralData ? (
        <div className="mb-3 rounded-lg border border-indigo-100 bg-indigo-50/80 px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-widest text-indigo-600">
            Ultimo corte electoral
          </div>
          <div className="mt-1 flex items-end justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold text-slate-800">
                {electoralData.partido_siglas ?? "Sin ganador"}
              </div>
              <div className="text-[10px] text-slate-500">
                {electoralData.anio} ·{" "}
                {electoralData.votos_ganador.toLocaleString("es-MX")} votos
              </div>
            </div>
            <div className="text-right text-[16px] font-black text-indigo-600">
              {electoralData.porcentaje_ganador.toFixed(1)}%
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
          Esta capa ArcGIS solo expone claves territoriales. El detalle electoral
          aparece cuando existe historial asociado al municipio.
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onVerSecciones}
          className="flex-1 rounded-md bg-blue-500 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-blue-600"
        >
          Ver secciones
        </button>
        <button
          onClick={onFichaCompleta}
          disabled={!electoralData?.municipio_id}
          className="flex-1 rounded-md bg-slate-100 py-1.5 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Ficha completa -&gt;
        </button>
      </div>
    </div>
  );
}

function ElectoralTab({ data }: { data: MapAnalyticsDTO | null }) {
  if (!data) {
    return (
      <p className="py-4 text-center text-[11px] text-slate-400">
        Sin datos electorales para este municipio.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
        Ultimo resultado registrado
      </div>
      {data.partido_siglas && (
        <StatRow
          label="Partido ganador"
          value={
            <span
              className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white"
              style={{ backgroundColor: data.partido_color ?? "#64748b" }}
            >
              {data.partido_siglas}
            </span>
          }
        />
      )}
      <StatRow label="Ano" value={data.anio} />
      <StatRow label="% obtenido" value={`${data.porcentaje_ganador.toFixed(1)}%`} />
      <StatRow
        label="Fuente"
        value={
          <span className="text-[10px] font-bold uppercase">
            {data.source === "oficial_municipal"
              ? "Oficial municipal"
              : "Legacy municipal"}
          </span>
        }
      />
      <StatRow
        label="Consistencia"
        value={
          <span
            className={`text-[10px] font-bold uppercase ${
              data.consistency_status === "consistente"
                ? "text-emerald-700"
                : data.consistency_status === "casi_consistente"
                  ? "text-amber-700"
                  : data.consistency_status === "inconsistente"
                    ? "text-rose-700"
                    : "text-slate-500"
            }`}
          >
            {data.consistency_status === "consistente"
              ? "Consistente"
              : data.consistency_status === "casi_consistente"
                ? "Casi consistente"
                : data.consistency_status === "inconsistente"
                  ? "Inconsistente"
                  : "Sin detalle"}
            {data.diff_validos !== null
              ? ` (${data.diff_validos > 0 ? "+" : ""}${data.diff_validos})`
              : ""}
          </span>
        }
      />
      <StatRow label="Votos" value={data.votos_ganador.toLocaleString("es-MX")} />
      {data.alternancia_count > 0 && (
        <StatRow label="Alternancias" value={data.alternancia_count} />
      )}
    </div>
  );
}

function EstructuraTab({
  data,
  loading,
  error,
}: {
  data: EstructuraResumen | null;
  loading: boolean;
  error: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="py-4 text-center text-[11px] text-slate-400">
        Sin resumen estructural disponible.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-slate-400">
        Operacion territorial
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <StatCell label="Promotores" value={data.promotores} />
        <StatCell label="Secciones" value={data.secciones_total} />
        <StatCell label="Compromisos" value={data.compromisos} />
        <StatCell
          label="Ultimo evento"
          value={data.ultimo_evento ? formatShortDate(data.ultimo_evento) : "-"}
        />
      </div>
    </div>
  );
}

function StatRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-2">
      <span className="text-[10px] font-medium text-slate-500">{label}</span>
      <span className="text-[11px] font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function StatCell({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded border border-transparent bg-slate-50 px-2 py-1.5">
      <div className="text-[9px] text-slate-400">{label}</div>
      <div className="text-[12px] font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  });
}
