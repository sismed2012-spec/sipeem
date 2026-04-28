"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  confirmGubernaturaSeccionalImport,
  parseGubernaturaSeccionalXlsx,
  previewGubernaturaSeccionalImport,
} from "@/actions/import-gubernatura";
import type {
  GubernaturaSeccionalPreviewRow,
  GubernaturaSeccionalImportResult,
} from "@/lib/types";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
  Vote,
} from "lucide-react";

const PREVIEW_LIMIT = 100;

function statusBadgeClass(status: GubernaturaSeccionalPreviewRow["status"]) {
  if (status === "nuevo") return "bg-emerald-50 text-emerald-700";
  if (status === "actualizacion") return "bg-blue-50 text-blue-700";
  if (status === "omitido") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-600";
}

export default function HistorialGubernaturaSeccionalImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<GubernaturaSeccionalPreviewRow[]>([]);
  const [result, setResult] = useState<GubernaturaSeccionalImportResult | null>(null);

  const totalRows = previewRows.length;
  const validRows = previewRows.filter(
    (r) => r.errors.length === 0 && r.status !== "omitido"
  ).length;
  const errorRows = previewRows.filter((r) => r.errors.length > 0).length;
  const newRows = previewRows.filter((r) => r.status === "nuevo").length;
  const updateRows = previewRows.filter((r) => r.status === "actualizacion").length;

  function reset() {
    setStep(1);
    setPreviewRows([]);
    setResult(null);
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);

      const { rows, globalErrors } = await parseGubernaturaSeccionalXlsx(formData);

      if (globalErrors.length > 0) {
        toast.error(globalErrors[0]);
        return;
      }

      toast.info(`Analizando ${rows.length.toLocaleString()} secciones...`);
      const enriched = await previewGubernaturaSeccionalImport(rows);
      setPreviewRows(enriched);
      setStep(2);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al procesar el archivo"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    try {
      const res = await confirmGubernaturaSeccionalImport(previewRows);
      setResult(res);
      setStep(3);
      toast.success(
        `Gubernatura 2023 importada: ${res.inserted} creadas, ${res.updated} actualizadas`
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar la importación"
      );
    } finally {
      setLoading(false);
    }
  }

  const previewSlice = previewRows.slice(0, PREVIEW_LIMIT);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            className="rounded-xl border-slate-200 font-bold hover:bg-slate-50"
          />
        }
      >
        <Vote className="mr-2 h-4 w-4" />
        Importar Gubernatura 2023
      </DialogTrigger>

      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
          <DialogTitle className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
            {step === 1 && "Importar Gubernatura 2023 por Sección"}
            {step === 2 && "Previsualización — Gubernatura 2023"}
            {step === 3 && "Resultado de Importación — Gubernatura 2023"}
          </DialogTitle>
          <DialogDescription className="font-medium text-slate-500">
            {step === 1 &&
              "Sube el XLSX oficial del IEEM (Resultados Definitivos Gubernatura por Sección). Encabezados detectados automáticamente en la fila 6."}
            {step === 2 &&
              `${totalRows.toLocaleString()} secciones detectadas — mostrando primeras ${Math.min(totalRows, PREVIEW_LIMIT)}. Revisa el mapeo antes de confirmar.`}
            {step === 3 && "Carga finalizada. Los datos están disponibles para análisis."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {/* ── Step 1: Upload ── */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                    Formato
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    XLSX IEEM Gubernatura
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Hoja{" "}
                    <code className="text-[10px] bg-slate-100 px-1 rounded">
                      2023_SEE_GOB_MEX_SEC
                    </code>
                    . Encabezados en fila 6 con{" "}
                    <code className="text-[10px] bg-slate-100 px-1 rounded">
                      ID_MUNICIPIO
                    </code>
                    ,{" "}
                    <code className="text-[10px] bg-slate-100 px-1 rounded">
                      SECCION
                    </code>{" "}
                    y columnas de fuerzas.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                    Cobertura
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    125 municipios · 6,561 secciones
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Fuerzas: PAN, PRI, PRD, PVEM_PT_MORENA, NAEM y 11
                    combinaciones de coalición. Votos anticipados y en prisión
                    se omiten automáticamente.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-2">
                    Persistencia
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    Tablas exclusivas de Gubernatura
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Se almacena en{" "}
                    <code className="text-[10px] bg-slate-100 px-1 rounded">
                      historial_seccion_gubernatura
                    </code>{" "}
                    — separado del historial municipal para evitar
                    contaminación en análisis de consistencia.
                  </p>
                </div>
              </div>

              <div className="relative flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-colors group cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  disabled={loading}
                />
                <div className="h-16 w-16 bg-white rounded-full shadow-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  {loading ? (
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                  ) : (
                    <FileSpreadsheet className="h-8 w-8 text-slate-400" />
                  )}
                </div>
                <p className="font-black text-slate-900 uppercase tracking-widest text-sm text-center">
                  {loading
                    ? "Procesando archivo..."
                    : "Arrastre o seleccione el XLSX de Gubernatura 2023"}
                </p>
                <p className="text-[10px] text-slate-400 mt-2 font-black tracking-widest uppercase text-center opacity-70">
                  Resultados Definitivos Gubernatura 2023 por Sección — IEEM
                </p>
              </div>
            </div>
          )}

          {/* ── Step 2: Preview ── */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-[11px] font-black uppercase tracking-widest">
                <Badge className="bg-emerald-50 text-emerald-700">
                  Nuevas: {newRows.toLocaleString()}
                </Badge>
                <Badge className="bg-blue-50 text-blue-700">
                  Actualizaciones: {updateRows.toLocaleString()}
                </Badge>
                {errorRows > 0 && (
                  <Badge className="bg-rose-50 text-rose-700">
                    Con error: {errorRows.toLocaleString()}
                  </Badge>
                )}
                <Badge className="bg-slate-100 text-slate-700">
                  Total: {totalRows.toLocaleString()}
                </Badge>
              </div>

              {totalRows > PREVIEW_LIMIT && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-100 text-[11px] font-bold text-amber-700">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  Se muestran las primeras {PREVIEW_LIMIT} filas. La carga completa
                  incluye las {totalRows.toLocaleString()} secciones.
                </div>
              )}

              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">
                        Municipio / Sección
                      </TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">
                        Distrito Local
                      </TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">
                        Volumen
                      </TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">
                        Estado
                      </TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">
                        Observaciones
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewSlice.map((row) => (
                      <TableRow
                        key={`${row.row_index}-${row.seccion_numero}`}
                        className="hover:bg-slate-50 transition-colors align-top"
                      >
                        <TableCell className="p-4">
                          <div className="font-black text-slate-900 tracking-tight">
                            {row.municipio_nombre}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            <Badge
                              variant="outline"
                              className="bg-white border-slate-200 text-[9px] font-black"
                            >
                              GEO {row.geo_municipio_id ?? "?"}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="bg-white border-slate-200 text-[9px] font-black"
                            >
                              SEC {row.seccion_numero}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="p-4">
                          {row.id_distrito_local ? (
                            <div className="text-xs font-bold text-slate-700">
                              DL {row.id_distrito_local}
                            </div>
                          ) : null}
                          <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                            {row.cabecera_distrital_local ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="p-4">
                          <div className="font-bold text-slate-700 text-sm">
                            {row.total_votos.toLocaleString()} votos
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                            válidos {row.num_votos_validos.toLocaleString()} ·
                            LN {row.lista_nominal?.toLocaleString() ?? "—"}
                          </div>
                        </TableCell>
                        <TableCell className="p-4">
                          <Badge
                            className={`rounded-lg font-black text-[10px] uppercase px-2 py-1 ${statusBadgeClass(row.status)}`}
                          >
                            {row.statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-4">
                          <div className="space-y-1">
                            {row.errors.map((msg, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-1 text-[10px] text-rose-600 font-black uppercase tracking-tighter italic"
                              >
                                <AlertCircle className="h-3 w-3 shrink-0" />
                                {msg}
                              </div>
                            ))}
                            {row.warnings.map((msg, i) => (
                              <div
                                key={i}
                                className="flex items-center gap-1 text-[10px] text-amber-700 font-black uppercase tracking-tighter italic"
                              >
                                <ShieldCheck className="h-3 w-3 shrink-0" />
                                {msg}
                              </div>
                            ))}
                            {row.errors.length === 0 && row.warnings.length === 0 && (
                              <div className="text-[10px] text-slate-400 font-bold italic">
                                Sin observaciones
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* ── Step 3: Result ── */}
          {step === 3 && result && (
            <div className="grid gap-4 md:grid-cols-3 animate-in zoom-in-95 duration-300">
              <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-100 text-center shadow-sm">
                <div className="text-4xl font-black text-emerald-600 mb-1 leading-none">
                  {result.inserted.toLocaleString()}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                  Secciones creadas
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100 text-center shadow-sm">
                <div className="text-4xl font-black text-blue-600 mb-1 leading-none">
                  {result.updated.toLocaleString()}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                  Secciones actualizadas
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-amber-50 border border-amber-100 text-center shadow-sm">
                <div className="text-4xl font-black text-amber-600 mb-1 leading-none">
                  {result.skipped.toLocaleString()}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                  Filas omitidas
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="md:col-span-3 mt-2 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                  <p className="font-black text-slate-900 uppercase text-[10px] tracking-[0.2em] mb-4 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Errores durante la carga
                  </p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
                    {result.errors.map((err, i) => (
                      <div
                        key={i}
                        className="p-3 bg-white border border-slate-100 rounded-xl text-[10px] text-rose-700 font-bold flex justify-between items-center"
                      >
                        <span>{err.message}</span>
                        <Badge
                          variant="secondary"
                          className="text-[9px] bg-rose-50 text-rose-600 border-none"
                        >
                          {err.row === -1 ? "General" : `Fila ${err.row}`}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 items-center justify-between sm:justify-between">
          {step !== 3 && (
            <Button
              variant="ghost"
              onClick={reset}
              disabled={loading}
              className="font-bold text-slate-500 rounded-xl px-6 h-11"
            >
              Cancelar
            </Button>
          )}
          {step === 3 ? (
            <Button
              onClick={() => setOpen(false)}
              className="bg-slate-900 rounded-xl font-black px-12 h-11 text-white"
            >
              Cerrar
            </Button>
          ) : step === 2 ? (
            <Button
              onClick={handleConfirm}
              disabled={loading || validRows === 0}
              className="bg-slate-900 rounded-xl font-black px-12 h-11 hover:bg-slate-800 shadow-xl active:scale-95 text-white"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-5 w-5 mr-2" />
              )}
              Confirmar carga ({validRows.toLocaleString()} secciones)
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
