"use client";

import { useId } from "react";
import { Globe2, Loader2, RefreshCw } from "lucide-react";

import type { CartografiaVersion } from "@/lib/cartografia-versionada";
import { cn } from "@/lib/utils";

interface Props {
  versions: CartografiaVersion[];
  selectedVersionId: number | null;
  loading: boolean;
  error: string | null;
  onChange: (versionId: number) => void;
  onRetry: () => void;
  className?: string;
}

function statusLabel(version: CartografiaVersion): string {
  if (version.isDefault) return "Vigente";
  if (version.state.toUpperCase() === "ARCHIVADA") return "Histórica";
  if (version.state.toUpperCase() === "VALIDADA") return "Validada";
  return "Publicada";
}

export function CartografiaVersionSelector({
  versions,
  selectedVersionId,
  loading,
  error,
  onChange,
  onRetry,
  className,
}: Props) {
  const controlId = useId();
  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? null;
  const sectionCount = selectedVersion?.counts.SECCION;

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur-sm",
        className
      )}
    >
      <label
        htmlFor={controlId}
        className="mb-2 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-500"
      >
        <Globe2 className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
        Cartografía INE
        {loading && (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin" aria-label="Cargando" />
        )}
      </label>

      <select
        id={controlId}
        aria-label="Versión de cartografía INE"
        value={selectedVersionId ?? ""}
        disabled={loading || versions.length === 0}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {versions.length === 0 && (
          <option value="">{loading ? "Cargando versiones…" : "Sin versiones disponibles"}</option>
        )}
        {versions.map((version) => (
          <option key={version.id} value={version.id}>
            {version.name} — {statusLabel(version)}
          </option>
        ))}
      </select>

      {selectedVersion && (
        <p className="mt-2 text-[10px] font-medium text-slate-500">
          Corte {selectedVersion.cutoffDate ?? "sin fecha"}
          {typeof sectionCount === "number" && (
            <> · {new Intl.NumberFormat("es-MX").format(sectionCount)} secciones</>
          )}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[10px] text-amber-900"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-1.5 inline-flex items-center gap-1 font-black text-amber-950 underline decoration-amber-400 underline-offset-2"
          >
            <RefreshCw className="h-3 w-3" aria-hidden />
            Reintentar
          </button>
        </div>
      )}
    </div>
  );
}
