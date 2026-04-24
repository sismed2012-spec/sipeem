"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import type { MapAnalyticsDTO } from "@/actions/analytics";
import type { EstructuraResumen } from "@/actions/estructura";

export interface ArcGISMunicipioProps {
  nombre: string;
  cvegeo: string | null;
  dto_federal: string | number | null;
  dto_local: string | number | null;
  lista_nominal: number | null;
  num_secciones: number | null;
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
    cartografia: "Cartografía",
    electoral: "Electoral",
    estructura: "Estructura",
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 w-72 bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden pointer-events-auto">
      <div className="bg-slate-900 px-4 py-3 flex items-start justify-between">
        <div>
          <div className="text-white text-[13px] font-bold leading-tight">
            {arcgis.nombre}
          </div>
          {arcgis.cvegeo && (
            <div className="text-slate-400 text-[10px] mt-0.5">
              CVEGEO: {arcgis.cvegeo}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white transition-colors ml-2 mt-0.5 shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex border-b border-slate-100">
        {(["cartografia", "electoral", "estructura"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-[11px] font-semibold transition-colors ${
              tab === t
                ? "text-blue-600 border-b-2 border-blue-500"
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
  onVerSecciones,
  onFichaCompleta,
}: {
  arcgis: ArcGISMunicipioProps;
  onVerSecciones: () => void;
  onFichaCompleta: () => void;
}) {
  return (
    <div>
      <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-2">
        Datos ArcGIS
      </div>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <StatCell
          label="Dto. Federal"
          value={arcgis.dto_federal != null ? `D. ${arcgis.dto_federal}` : "—"}
        />
        <StatCell
          label="Dto. Local"
          value={arcgis.dto_local != null ? `D. ${arcgis.dto_local}` : "—"}
        />
        <StatCell label="Secciones" value={arcgis.num_secciones ?? "—"} />
        <StatCell
          label="Lista nominal"
          value={
            arcgis.lista_nominal != null
              ? arcgis.lista_nominal.toLocaleString("es-MX")
              : "—"
          }
        />
      </div>
      <div className="flex gap-2">
        <button
          onClick={onVerSecciones}
          className="flex-1 bg-blue-500 text-white rounded-md py-1.5 text-[11px] font-semibold hover:bg-blue-600 transition-colors"
        >
          Ver secciones
        </button>
        <button
          onClick={onFichaCompleta}
          className="flex-1 bg-slate-100 text-slate-600 rounded-md py-1.5 text-[11px] font-semibold hover:bg-slate-200 transition-colors"
        >
          Ficha completa →
        </button>
      </div>
    </div>
  );
}

function ElectoralTab({ data }: { data: MapAnalyticsDTO | null }) {
  if (!data) {
    return (
      <p className="text-[11px] text-slate-400 text-center py-4">
        Sin datos electorales para este municipio.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-2">
        Último resultado registrado
      </div>
      {data.partido_siglas && (
        <StatRow
          label="Partido ganador"
          value={
            <span
              className="font-bold px-1.5 py-0.5 rounded text-white text-[11px]"
              style={{ backgroundColor: data.partido_color ?? "#64748b" }}
            >
              {data.partido_siglas}
            </span>
          }
        />
      )}
      <StatRow label="Año" value={data.anio} />
      <StatRow label="% obtenido" value={`${data.porcentaje_ganador.toFixed(1)}%`} />
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
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }
  if (error || !data) {
    return (
      <p className="text-[11px] text-slate-400 text-center py-4">No disponible</p>
    );
  }
  return (
    <div>
      <div className="text-[9px] text-slate-400 uppercase tracking-widest font-bold mb-2">
        Estructura de campo
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <StatCell label="Promotores" value={data.promotores} />
        <StatCell label="Secciones" value={data.secciones_total} />
        <StatCell label="Compromisos" value={data.compromisos} />
        {data.ultimo_evento && (
          <StatCell label="Último evento" value={data.ultimo_evento} />
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-slate-50 rounded px-2 py-1.5">
      <div className="text-[9px] text-slate-400">{label}</div>
      <div className="text-[12px] font-semibold text-slate-800">{value ?? "—"}</div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1 border-b border-slate-50 last:border-0">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className="text-[11px] font-semibold text-slate-800">{value}</span>
    </div>
  );
}
