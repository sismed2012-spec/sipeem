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
  commitHistorialSeccion2021Import,
  parseHistorialSeccion2021XLSX,
  previewHistorialSeccion2021Import,
} from "@/actions/import-secciones-2021";
import type {
  HistorialSeccionImportPreviewRow,
  HistorialSeccionImportResult,
} from "@/lib/types";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  ShieldCheck,
} from "lucide-react";

function rowBadgeClass(status: HistorialSeccionImportPreviewRow["status"]) {
  if (status === "nuevo") return "bg-emerald-50 text-emerald-700";
  if (status === "actualizacion") return "bg-blue-50 text-blue-700";
  if (status === "omitido") return "bg-amber-50 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

export default function HistorialSeccion2021ImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<
    HistorialSeccionImportPreviewRow[]
  >([]);
  const [result, setResult] = useState<HistorialSeccionImportResult | null>(
    null
  );

  const validRows = previewRows.filter(
    (row) => row.errors.length === 0 && row.status !== "omitido"
  ).length;
  const checksumRows = previewRows.filter(
    (row) => row.status === "omitido"
  ).length;

  function reset() {
    setStep(1);
    setPreviewRows([]);
    setResult(null);
  }

  async function handleFileUpload(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);

      const { rows, globalErrors } = await parseHistorialSeccion2021XLSX(
        formData
      );

      if (globalErrors.length > 0) {
        toast.error(globalErrors[0]);
        return;
      }

      const enrichedRows = await previewHistorialSeccion2021Import(rows);
      setPreviewRows(enrichedRows);
      setStep(2);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Error al procesar el XLSX seccional 2021"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    setLoading(true);
    try {
      const response = await commitHistorialSeccion2021Import(previewRows);
      setResult(response);
      setStep(3);
      toast.success(
        `Carga seccional 2021 completada: ${response.inserted} creados, ${response.updated} actualizados`
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar la carga"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
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
        <FileSpreadsheet className="mr-2 h-4 w-4" />
        Importar Secciones 2021
      </DialogTrigger>

      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
          <DialogTitle className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
            {step === 1 && "Importar Historico 2021 por Seccion"}
            {step === 2 && "Previsualizacion de Carga Seccional 2021"}
            {step === 3 && "Resumen de Carga Seccional 2021"}
          </DialogTitle>
          <DialogDescription className="font-medium text-slate-500">
            {step === 1 &&
              "Sube el XLSX oficial por seccion 2021. Se validan municipios, secciones y totales antes de persistir."}
            {step === 2 &&
              "Revisa el mapeo contra el catalogo interno. Las filas con SECCION 0 se marcan como checksum y no se guardan."}
            {step === 3 &&
              "Resumen final de filas insertadas, actualizadas y omitidas durante la carga seccional 2021."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Formato
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-900">
                    XLSX oficial por seccion 2021
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Hoja esperada con columnas como `ID_MUNICIPIO`, `SECCION`,
                    `NUM_VOTOS_VALIDOS`, `TOTAL_VOTOS` y fuerzas electorales
                    2021.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Validacion
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-900">
                    Municipio, seccion y checksum
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Se resuelve `geo_municipio_id`, se detecta `SECCION = 0` y
                    se compara suma de fuerzas contra votos validos.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    Persistencia
                  </p>
                  <p className="mt-2 text-sm font-bold text-slate-900">
                    Upsert idempotente 2021
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    La clave es `anio + municipio + seccion`. Reimportar
                    actualiza sin duplicar detalle.
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-colors group cursor-pointer relative">
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
                  Arrastre o seleccione su XLSX 2021
                </p>
                <p className="text-[10px] text-slate-400 mt-2 font-black tracking-widest uppercase text-center opacity-70">
                  Historico electoral por seccion, ayuntamientos, Estado de
                  Mexico
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-[11px] font-black uppercase tracking-widest">
                <Badge className="bg-emerald-50 text-emerald-700">
                  Validas: {validRows}
                </Badge>
                <Badge className="bg-amber-50 text-amber-700">
                  Checksum: {checksumRows}
                </Badge>
                <Badge className="bg-slate-100 text-slate-700">
                  Total: {previewRows.length}
                </Badge>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">
                        Municipio / Seccion
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
                    {previewRows.map((row) => (
                      <TableRow
                        key={`${row.row_index}-${row.seccion_numero}`}
                        className="hover:bg-slate-50 transition-colors align-top"
                      >
                        <TableCell className="p-4">
                          <div className="font-black text-slate-900 tracking-tight">
                            {row.municipio_nombre}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge
                              variant="outline"
                              className="bg-white border-slate-200 text-[10px] font-black"
                            >
                              GEO {row.geo_municipio_id ?? "?"}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="bg-white border-slate-200 text-[10px] font-black"
                            >
                              SECCION {row.seccion_numero}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="bg-white border-slate-200 text-[10px] font-black"
                            >
                              FILA {row.row_index}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="p-4">
                          <div className="font-bold text-slate-700">
                            {row.total_votos.toLocaleString()} votos totales
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                            validos {row.num_votos_validos.toLocaleString()} ·
                            lista {row.lista_nominal?.toLocaleString() ?? "0"}
                          </div>
                        </TableCell>
                        <TableCell className="p-4">
                          <Badge
                            className={`rounded-lg font-black text-[10px] uppercase tracking-tighter px-2 py-1 ${rowBadgeClass(
                              row.status
                            )}`}
                          >
                            {row.statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-4">
                          <div className="space-y-1">
                            {row.errors.map((message, index) => (
                              <div
                                key={`error-${index}`}
                                className="flex items-center gap-1 text-[10px] text-red-600 font-black uppercase tracking-tighter italic"
                              >
                                <AlertCircle className="h-3 w-3" />
                                {message}
                              </div>
                            ))}
                            {row.warnings.map((message, index) => (
                              <div
                                key={`warning-${index}`}
                                className="flex items-center gap-1 text-[10px] text-amber-700 font-black uppercase tracking-tighter italic"
                              >
                                <ShieldCheck className="h-3 w-3" />
                                {message}
                              </div>
                            ))}
                            {row.errors.length === 0 &&
                              row.warnings.length === 0 && (
                                <div className="text-[10px] text-slate-400 font-bold italic">
                                  Valido sin observaciones
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

          {step === 3 && result && (
            <div className="grid gap-4 md:grid-cols-3 animate-in zoom-in-95 duration-300">
              <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-100 text-center shadow-sm">
                <div className="text-4xl font-black text-emerald-600 mb-1 leading-none">
                  {result.inserted}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">
                  Secciones creadas
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100 text-center shadow-sm">
                <div className="text-4xl font-black text-blue-600 mb-1 leading-none">
                  {result.updated}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-700">
                  Secciones actualizadas
                </div>
              </div>
              <div className="p-6 rounded-2xl bg-amber-50 border border-amber-100 text-center shadow-sm">
                <div className="text-4xl font-black text-amber-600 mb-1 leading-none">
                  {result.skipped}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-700">
                  Filas omitidas
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="md:col-span-3 mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
                  <p className="font-black text-slate-900 uppercase text-[10px] tracking-[0.2em] mb-4 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Registro de errores criticos
                  </p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                    {result.errors.map((error, index) => (
                      <div
                        key={index}
                        className="p-3 bg-white border border-slate-100 rounded-xl text-[10px] text-red-700 font-bold flex justify-between items-center"
                      >
                        <span>{error.message}</span>
                        <Badge
                          variant="secondary"
                          className="text-[10px] bg-red-50 text-red-600 border-none"
                        >
                          {error.row === -1 ? "General" : `Fila ${error.row}`}
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
          {(step === 1 || step === 2) && (
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
              className="bg-slate-900 rounded-xl font-black px-12 h-11 transition-all shadow-lg active:scale-95 text-white"
            >
              Cerrar y ver resultados
            </Button>
          ) : step === 2 ? (
            <Button
              onClick={handleCommit}
              disabled={loading || validRows === 0}
              className="bg-slate-900 rounded-xl font-black px-12 h-11 transition-all hover:bg-slate-800 shadow-xl active:scale-95 text-white"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="h-5 w-5 mr-2" />
              )}
              Confirmar carga seccional 2021
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
