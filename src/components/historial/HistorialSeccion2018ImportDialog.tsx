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
  commitHistorialSeccion2018Import,
  parseHistorialSeccion2018XLSX,
  previewHistorialSeccion2018Import,
} from "@/actions/import-secciones-2018";
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

export default function HistorialSeccion2018ImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<HistorialSeccionImportPreviewRow[]>([]);
  const [result, setResult] = useState<HistorialSeccionImportResult | null>(null);

  const validRows = previewRows.filter(
    (r) => r.errors.length === 0 && r.status !== "omitido"
  ).length;
  const checksumRows = previewRows.filter((r) => r.status === "omitido").length;

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

      const { rows, globalErrors } = await parseHistorialSeccion2018XLSX(formData);
      if (globalErrors.length > 0) {
        toast.error(globalErrors[0]);
        return;
      }

      const enrichedRows = await previewHistorialSeccion2018Import(rows);
      setPreviewRows(enrichedRows);
      setStep(2);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al procesar el XLSX seccional 2018"
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    setLoading(true);
    try {
      const response = await commitHistorialSeccion2018Import(previewRows);
      setResult(response);
      setStep(3);
      toast.success(
        `Carga seccional 2018 completada: ${response.inserted} creadas, ${response.updated} actualizadas`
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error al guardar la carga seccional 2018"
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
        Importar XLSX 2018 Seccional
      </DialogTrigger>

      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
          <DialogTitle className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
            {step === 1 && "Importar histórico seccional 2018"}
            {step === 2 && "Previsualización seccional 2018"}
            {step === 3 && "Resumen de carga seccional 2018"}
          </DialogTitle>
          <DialogDescription className="font-medium text-slate-500">
            {step === 1 &&
              "Sube el XLSX SEC 2018 del IEEM. Se validan municipios, secciones y totales antes de persistir."}
            {step === 2 &&
              "Revisa el mapeo contra el catálogo interno. Las filas con SECCION 0 son checksum y se omiten."}
            {step === 3 && "Resumen final de secciones insertadas, actualizadas y omitidas."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {step === 1 && (
            <div className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Formato</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">XLSX ancho por sección</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Columnas ID_MUNICIPIO, SECCION, fuerzas 2018 (PAN, PRI, PRD, MORENA, ES, NA, VR, etc.) y totales.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Fuerzas</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">Partidos 2018</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Incluye ES (Encuentro Social), NA (Nueva Alianza), VR, y coaliciones de ese ciclo.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Destino</p>
                  <p className="mt-2 text-sm font-bold text-slate-900">Capa seccional — 2018</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Upsert idempotente en `historial_seccion_electoral` con anio=2018.
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
                  Arrastre o seleccione el XLSX SEC 2018
                </p>
                <p className="text-[10px] text-slate-400 mt-2 font-black tracking-widest uppercase text-center opacity-70">
                  2018_SEE_AYUN_MEX_SEC.xlsx — {">"}6,400 secciones
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-3 text-[11px] font-black uppercase tracking-widest">
                <Badge className="bg-emerald-50 text-emerald-700">Válidas: {validRows}</Badge>
                <Badge className="bg-amber-50 text-amber-700">Checksum: {checksumRows}</Badge>
                <Badge className="bg-slate-100 text-slate-700">Total: {previewRows.length}</Badge>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Municipio / Sección</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Volumen</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Estado</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Observaciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row) => (
                      <TableRow
                        key={`${row.row_index}-${row.seccion_numero}`}
                        className="hover:bg-slate-50 transition-colors align-top"
                      >
                        <TableCell className="p-4">
                          <div className="font-black text-slate-900 tracking-tight">{row.municipio_nombre}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            <Badge variant="outline" className="bg-white border-slate-200 text-[10px] font-black">
                              GEO {row.geo_municipio_id ?? "?"}
                            </Badge>
                            <Badge variant="outline" className="bg-white border-slate-200 text-[10px] font-black">
                              SEC {row.seccion_numero}
                            </Badge>
                            <Badge variant="outline" className="bg-white border-slate-200 text-[10px] font-black">
                              FILA {row.row_index}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="p-4">
                          <div className="font-bold text-slate-700">
                            {row.total_votos.toLocaleString()} votos totales
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                            válidos {row.num_votos_validos.toLocaleString()} · lista {row.lista_nominal?.toLocaleString() ?? "0"}
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
                              <div key={i} className="flex items-center gap-1 text-[10px] text-amber-700 font-black uppercase tracking-tighter italic">
                                <ShieldCheck className="h-3 w-3" /> {msg}
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
            <div className="grid gap-4 md:grid-cols-3 animate-in zoom-in-95 duration-300">
              <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-100 text-center shadow-sm">
                <div className="text-4xl font-black text-emerald-600 mb-1 leading-none">{result.inserted}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Secciones creadas</div>
              </div>
              <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100 text-center shadow-sm">
                <div className="text-4xl font-black text-blue-600 mb-1 leading-none">{result.updated}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-700">Secciones actualizadas</div>
              </div>
              <div className="p-6 rounded-2xl bg-amber-50 border border-amber-100 text-center shadow-sm">
                <div className="text-4xl font-black text-amber-600 mb-1 leading-none">{result.skipped}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-700">Filas omitidas</div>
              </div>

              {result.errors.length > 0 && (
                <div className="md:col-span-3 mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
                  <p className="font-black text-slate-900 uppercase text-[10px] tracking-[0.2em] mb-4 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    Registro de errores
                  </p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                    {result.errors.map((error, i) => (
                      <div key={i} className="p-3 bg-white border border-slate-100 rounded-xl text-[10px] text-red-700 font-bold flex justify-between items-center">
                        <span>{error.message}</span>
                        <Badge variant="secondary" className="text-[10px] bg-red-50 text-red-600 border-none">
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
            <Button variant="ghost" onClick={reset} disabled={loading} className="font-bold text-slate-500 rounded-xl px-6 h-11">
              Cancelar
            </Button>
          )}
          {step === 3 ? (
            <Button onClick={() => setOpen(false)} className="bg-slate-900 rounded-xl font-black px-12 h-11 transition-all shadow-lg active:scale-95 text-white">
              Cerrar y ver resultados
            </Button>
          ) : step === 2 ? (
            <Button
              onClick={handleCommit}
              disabled={loading || validRows === 0}
              className="bg-slate-900 rounded-xl font-black px-12 h-11 transition-all hover:bg-slate-800 shadow-xl active:scale-95 text-white"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
              Confirmar carga seccional 2018
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
