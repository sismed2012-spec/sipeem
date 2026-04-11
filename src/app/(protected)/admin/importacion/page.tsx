"use client";

import { useState, useTransition } from "react";
import {
  parseHistorialCSV,
  previewHistorialImport,
  commitHistorialImport,
  type HistorialPreviewRow,
  type ImportResult,
} from "@/actions/import";

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: HistorialPreviewRow["status"] }) {
  const map = {
    pendiente: "bg-gray-100 text-gray-600 border border-gray-300",
    nuevo: "bg-emerald-50 text-emerald-700 border border-emerald-300",
    actualizacion: "bg-amber-50 text-amber-700 border border-amber-300",
  } as const;

  const labels = {
    pendiente: "Pendiente",
    nuevo: "Nuevo",
    actualizacion: "Actualización",
  };

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${map[status]}`}
    >
      {labels[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Step = "upload" | "preview" | "done";

export default function ImportacionPage() {
  const [step, setStep] = useState<Step>("upload");
  const [rawCSV, setRawCSV] = useState("");
  const [rows, setRows] = useState<HistorialPreviewRow[]>([]);
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, startTransition] = useTransition();

  // ---- Step 1: parse CSV locally, then hit DB preview ----
  function handleFileDrop(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setRawCSV(ev.target?.result as string);
    reader.readAsText(file);
  }

  function handlePreview() {
    startTransition(async () => {
      // Phase 1: parse locally (no DB)
      const { rows: parsed, globalErrors: ge } =
        await parseHistorialCSV(rawCSV);
      setGlobalErrors(ge);

      if (ge.length > 0 || parsed.length === 0) {
        setRows(parsed);
        setStep("preview");
        return;
      }

      // Phase 2: enrich with live DB lookup → sets real status labels
      const enriched = await previewHistorialImport(parsed);
      setRows(enriched);
      setStep("preview");
    });
  }

  // ---- Step 2: commit ----
  function handleCommit() {
    startTransition(async () => {
      const res = await commitHistorialImport(rows);
      setResult(res);
      setStep("done");
    });
  }

  function handleReset() {
    setStep("upload");
    setRawCSV("");
    setRows([]);
    setGlobalErrors([]);
    setResult(null);
  }

  const validCount = rows.filter((r) => r.errors.length === 0).length;
  const errorCount = rows.filter((r) => r.errors.length > 0).length;

  // ---------------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-5xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">
        Importación de Historial Electoral
      </h1>
      <p className="mb-8 text-sm text-gray-500">
        Solo directores. Carga un CSV con columnas:
        <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-xs">
          municipio_id, anio, partido_ganador, votos, porcentaje,
          desglose_json (opcional)
        </code>
      </p>

      {/* ------------------------------------------------------------------ */}
      {/* STEP: upload                                                         */}
      {/* ------------------------------------------------------------------ */}
      {step === "upload" && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
          <label
            htmlFor="csv-upload"
            className="cursor-pointer text-sm font-medium text-indigo-600 hover:text-indigo-800"
          >
            Seleccionar archivo CSV
          </label>
          <input
            id="csv-upload"
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileDrop}
          />

          {rawCSV && (
            <p className="mt-3 text-xs text-gray-500">
              Archivo cargado ({rawCSV.length.toLocaleString()} bytes)
            </p>
          )}

          <div className="mt-6">
            <button
              id="btn-preview"
              disabled={!rawCSV || isPending}
              onClick={handlePreview}
              className="rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium text-white
                         hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Analizando…" : "Previsualizar"}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP: preview                                                        */}
      {/* ------------------------------------------------------------------ */}
      {step === "preview" && (
        <div>
          {/* Global errors */}
          {globalErrors.length > 0 && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="mb-1 text-sm font-semibold text-red-700">
                Errores en la estructura del archivo:
              </p>
              <ul className="list-disc pl-5 text-sm text-red-600">
                {globalErrors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary */}
          <div className="mb-4 flex gap-4 text-sm">
            <span className="rounded bg-emerald-100 px-3 py-1 text-emerald-800">
              Válidos: {validCount}
            </span>
            <span className="rounded bg-red-100 px-3 py-1 text-red-800">
              Con errores: {errorCount}
            </span>
            <span className="rounded bg-gray-100 px-3 py-1 text-gray-700">
              Total: {rows.length}
            </span>
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Municipio ID</th>
                  <th className="px-4 py-3 text-left">Año</th>
                  <th className="px-4 py-3 text-left">Partido Ganador</th>
                  <th className="px-4 py-3 text-right">Votos</th>
                  <th className="px-4 py-3 text-right">%</th>
                  {/* 
                    FIX #2: Column header says "Estado (verificado)" to make it
                    clear the status was determined by a live DB look‑up, not
                    inferred from CSV content alone.
                  */}
                  <th className="px-4 py-3 text-center">Estado (verificado)</th>
                  <th className="px-4 py-3 text-left">Errores</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={
                      row.errors.length > 0 ? "bg-red-50" : "bg-white"
                    }
                  >
                    <td className="px-4 py-2 text-gray-400">{i + 1}</td>
                    <td className="px-4 py-2 font-mono">{row.municipio_id}</td>
                    <td className="px-4 py-2 font-mono">{row.anio}</td>
                    <td className="px-4 py-2">{row.partido_ganador}</td>
                    <td className="px-4 py-2 text-right font-mono">
                      {row.votos.toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {row.porcentaje.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2 text-center">
                      {/*
                        FIX #2: StatusBadge only shows "Nuevo" or "Actualización"
                        when status has been set by previewHistorialImport (live DB).
                        Rows with validation errors show "Pendiente" (neutral).
                      */}
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-2 text-xs text-red-600">
                      {row.errors.join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button
              id="btn-back"
              onClick={handleReset}
              disabled={isPending}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium
                         text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              ← Volver
            </button>
            <button
              id="btn-commit"
              onClick={handleCommit}
              disabled={validCount === 0 || isPending}
              className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white
                         hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending
                ? "Importando…"
                : `Confirmar importación (${validCount} filas)`}
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* STEP: done                                                           */}
      {/* ------------------------------------------------------------------ */}
      {step === "done" && result && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-8">
          <h2 className="mb-4 text-lg font-semibold text-emerald-800">
            Importación completada
          </h2>
          <dl className="grid grid-cols-3 gap-4 text-center">
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <dt className="text-xs text-gray-500">Insertados</dt>
              <dd className="mt-1 text-2xl font-bold text-emerald-700">
                {result.inserted}
              </dd>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <dt className="text-xs text-gray-500">Actualizados</dt>
              <dd className="mt-1 text-2xl font-bold text-amber-600">
                {result.updated}
              </dd>
            </div>
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <dt className="text-xs text-gray-500">Omitidos (errores)</dt>
              <dd className="mt-1 text-2xl font-bold text-red-600">
                {result.skipped}
              </dd>
            </div>
          </dl>

          {result.errors.length > 0 && (
            <div className="mt-6 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="mb-2 text-sm font-medium text-red-700">
                Errores del servidor:
              </p>
              <ul className="list-disc pl-5 text-sm text-red-600">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    {e.row === -1 ? "General" : `Fila ${e.row}`}: {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            id="btn-nueva-importacion"
            onClick={handleReset}
            className="mt-6 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-medium
                       text-white hover:bg-indigo-700"
          >
            Nueva importación
          </button>
        </div>
      )}
    </div>
  );
}
