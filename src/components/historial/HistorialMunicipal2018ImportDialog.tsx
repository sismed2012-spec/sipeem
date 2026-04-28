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
  commitMunicipal2018Import,
  parseMunicipal2018XLSX,
  previewMunicipal2018Import,
} from "@/actions/import-municipal-2018";
import type {
  HistorialMunicipalOficialImportPreviewRow,
  HistorialMunicipalOficialImportResult,
} from "@/lib/types";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Landmark,
} from "lucide-react";

function rowBadgeClass(status: HistorialMunicipalOficialImportPreviewRow["status"]) {
  if (status === "nuevo") return "bg-emerald-50 text-emerald-700";
  if (status === "actualizacion") return "bg-blue-50 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

export default function HistorialMunicipal2018ImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<HistorialMunicipalOficialImportPreviewRow[]>([]);
  const [result, setResult] = useState<HistorialMunicipalOficialImportResult | null>(null);

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

      const { rows, globalErrors } = await parseMunicipal2018XLSX(formData);
      if (globalErrors.length > 0) {
        toast.error(globalErrors[0]);
        return;
      }

      const enrichedRows = await previewMunicipal2018Import(rows);
      setPreviewRows(enrichedRows);
      setStep(2);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al procesar el XLSX municipal 2018"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    setLoading(true);
    try {
      const response = await commitMunicipal2018Import(previewRows);
      setResult(response);
      setStep(3);
      toast.success(
        `Carga 2018 completada: ${response.inserted} creados, ${response.updated} actualizados`
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar la carga 2018"
      );
    } finally {
      setLoading(false);
    }
  }

  const validRows = previewRows.filter((r) => r.errors.length === 0).length;
  const invalidRows = previewRows.length - validRows;

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
        <Landmark className="mr-2 h-4 w-4" />
        Importar XLSX 2018 Municipal
      </DialogTrigger>

      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
          <DialogTitle className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
            {step === 1 && "Importar histórico municipal 2018"}
            {step === 2 && "Previsualización municipal 2018"}
            {step === 3 && "Resumen de carga municipal 2018"}
          </DialogTitle>
          <DialogDescription className="font-medium text-slate-500">
            {step === 1 &&
              "Sube el XLSX MUNCAND 2018 del IEEM. El ganador se calculará automáticamente del máximo de votos por candidatura."}
            {step === 2 &&
              "El IEEM 2018 incluye filas de sub-divisiones administrativas sin municipio en el catálogo interno — se omiten. Se importan los 125 municipios mapeados."}
            {step === 3 && "Resumen final de registros insertados y actualizados en capa municipal oficial."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Formato</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">XLSX ancho por candidatura</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Columnas: ID_MUNICIPIO, MUNICIPIO, fuerzas políticas, totales y lista nominal.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Ganador</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">Calculado de columnas</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Se infiere la sigla ganadora, % y margen desde el máximo de votos entre fuerzas.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Destino</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">Capa municipal oficial — 2018</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Upsert idempotente en `historial_municipal_oficial` con anio=2018.
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
                  Arrastre o seleccione el XLSX MUNCAND 2018
                </p>
                <p className="text-[10px] text-slate-400 mt-2 font-black tracking-widest uppercase text-center opacity-70">
                  2018_SEE_AYUN_MEX_MUNCAND.xlsx
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-[11px] font-black uppercase tracking-widest">
                <Badge className="bg-emerald-50 text-emerald-700">Válidas: {validRows}</Badge>
                {invalidRows > 0 && (
                  <Badge className="bg-amber-50 text-amber-700">Sin mapeo (omitidas): {invalidRows}</Badge>
                )}
                <Badge className="bg-slate-100 text-slate-700">Total: {previewRows.length}</Badge>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Municipio</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Ganador calculado</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Estado</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Observaciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow
                        key={`${row.row_index}-${row.geo_municipio_id}`}
                        className="hover:bg-slate-50 transition-colors align-top"
                      >
                        <TableCell className="p-4">
                          <div className="font-black text-slate-900 tracking-tight">{row.municipio_nombre}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant="outline" className="bg-white border-slate-200 text-[10px] font-black">
                              GEO {row.geo_municipio_id ?? "?"}
                            </Badge>
                            <Badge variant="outline" className="bg-white border-slate-200 text-[10px] font-black">
                              FILA {row.row_index}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="p-4">
                          <div className="font-bold text-slate-700">
                            {row.ganador_siglas ?? "SIN GANADOR"} · {row.ganador_votacion.toLocaleString()} v.
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                            {row.ganador_porcentaje.toFixed(1)}% · margen {row.margen_votos.toLocaleString()} v.
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                            2°: {row.segundo_siglas ?? "—"} · válidos {row.votos_validos.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell className="p-4">
                          <Badge className={`rounded-lg font-black text-[10px] uppercase tracking-tighter px-2 py-1 ${rowBadgeClass(row.status)}`}>
                            {row.statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-4">
                          <div className="space-y-1">
                            {row.errors.map((msg, i) => (
                              <div key={i} className="flex items-center gap-1 text-[10px] text-red-600 font-black uppercase tracking-tighter italic">
                                <AlertCircle className="h-3 w-3" /> {msg}
                              </div>
                            ))}
                            {row.warnings.map((msg, i) => (
                              <div key={i} className="flex items-center gap-1 text-[10px] text-amber-600 font-black uppercase tracking-tighter italic">
                                <AlertCircle className="h-3 w-3" /> {msg}
                              </div>
                            ))}
                            {row.errors.length === 0 && row.warnings.length === 0 && (
                              <div className="text-[10px] text-slate-400 font-bold italic">Válido sin observaciones</div>
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
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-100 text-center shadow-sm">
                <div className="text-4xl font-black text-emerald-600 mb-1 leading-none">{result.inserted}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Creados</div>
              </div>
              <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100 text-center shadow-sm">
                <div className="text-4xl font-black text-blue-600 mb-1 leading-none">{result.updated}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-700">Actualizados</div>
              </div>
              <div className="p-6 rounded-2xl bg-amber-50 border border-amber-100 text-center shadow-sm">
                <div className="text-4xl font-black text-amber-600 mb-1 leading-none">{result.skipped}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-700">Omitidos</div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 items-center justify-between sm:justify-between">
          {(step === 1 || step === 2) && (
            <Button variant="ghost" onClick={reset} disabled={loading} className="font-bold text-slate-500 rounded-xl px-6 h-11">
              Cancelar
            </Button>
          )}
          {step === 3 ? (
            <Button onClick={() => setOpen(false)} className="bg-slate-900 rounded-xl font-black px-12 h-11 transition-all shadow-lg active:scale-95 text-white">
              Cerrar
            </Button>
          ) : step === 2 ? (
            <Button
              onClick={handleCommit}
              disabled={loading || validRows === 0}
              className="bg-slate-900 rounded-xl font-black px-12 h-11 transition-all hover:bg-slate-800 shadow-xl active:scale-95 text-white"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
              Confirmar carga 2018
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
