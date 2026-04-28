"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { parseHistorialCSV, previewHistorialImport, commitHistorialImport, HistorialPreviewRow, ImportResult } from "@/actions/import";
import { toast } from "sonner";
import { FileUp, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function HistorialImportDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<HistorialPreviewRow[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const { rows, globalErrors } = await parseHistorialCSV(text);
      
      if (globalErrors.length > 0) {
        toast.error(globalErrors[0]);
        return;
      }

      const enrichedRows = await previewHistorialImport(rows);
      setPreviewRows(enrichedRows);
      setStep(2);
    } catch {
      toast.error("Error al procesar el archivo");
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    setLoading(true);
    try {
      const res = await commitHistorialImport(previewRows);
      setResult(res);
      setStep(3);
      toast.success(`Importación completada: ${res.inserted} creados, ${res.updated} actualizados`);
      
      // HARDENED UI REFRESH
      router.refresh();
    } catch {
      toast.error("Error al guardar los datos");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setStep(1);
    setPreviewRows([]);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(val) => { setOpen(val); if (!val) reset(); }}>
      {/* 
         MANDATORY FIX: Use 'render' instead of 'asChild' for Base UI compatibility. 
         This avoids nesting <button> inside <button> and prevents hydration errors.
      */}
      <DialogTrigger 
        render={
          <Button variant="outline" className="rounded-xl border-slate-200 font-bold hover:bg-slate-50" />
        }
      >
        <FileUp className="mr-2 h-4 w-4" /> Importar CSV
      </DialogTrigger>
      
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0 rounded-2xl border-none shadow-2xl">
        <DialogHeader className="p-6 bg-slate-50 border-b border-slate-100">
          <DialogTitle className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
            {step === 1 && "Importar Historial Electoral"}
            {step === 2 && "Previsualización de Datos"}
            {step === 3 && "Resumen de Importación"}
          </DialogTitle>
          <DialogDescription className="font-medium text-slate-500">
            {step === 1 && "Cargue un archivo CSV para procesar resultados históricos de forma masiva."}
            {step === 2 && "Verifique el estado de los registros antes de confirmar la carga relacional."}
            {step === 3 && "Detalle final de los registros procesados en el sistema."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 bg-white">
          {step === 1 && (
            <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-colors group cursor-pointer relative">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
                disabled={loading}
              />
              <div className="h-16 w-16 bg-white rounded-full shadow-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                {loading ? <Loader2 className="h-8 w-8 animate-spin text-slate-400" /> : <FileUp className="h-8 w-8 text-slate-400" />}
              </div>
              <p className="font-black text-slate-900 uppercase tracking-widest text-sm text-center">Arrastre o seleccione su CSV</p>
              <p className="text-[10px] text-slate-400 mt-2 font-black tracking-widest uppercase text-center opacity-70">municipio_id, anio, partido_ganador, votos, porcentaje</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Municipio / Año</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Ganador</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Estado</TableHead>
                      <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Detalles</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, idx) => (
                      <TableRow key={idx} className="hover:bg-slate-50 transition-colors">
                        <TableCell className="p-4">
                          <div className="font-black text-slate-900 tracking-tight">ID: {row.municipio_id}</div>
                          <Badge variant="outline" className="bg-white border-slate-200 text-[10px] font-black">{row.anio}</Badge>
                        </TableCell>
                        <TableCell className="p-4">
                          <div className="font-bold text-slate-700">{row.partido_ganador}</div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase">{row.votos.toLocaleString()} v.</div>
                        </TableCell>
                        <TableCell className="p-4">
                          <Badge 
                            className={`rounded-lg font-black text-[10px] uppercase tracking-tighter px-2 py-1 ${
                              row.status === 'nuevo' ? 'bg-emerald-50 text-emerald-700' : 
                              row.status === 'actualizacion' ? 'bg-blue-50 text-blue-700' : 
                              'bg-amber-50 text-amber-100'
                            }`}
                          >
                            {row.statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="p-4">
                          {row.errors.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {row.errors.map((err, i) => (
                                <div key={i} className="flex items-center gap-1 text-[10px] text-red-600 font-black uppercase tracking-tighter italic">
                                  <AlertCircle className="h-3 w-3" /> {err}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400 font-bold italic">Válido</div>
                          )}
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
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Auditados y Creados</div>
              </div>
              <div className="p-6 rounded-2xl bg-blue-50 border border-blue-100 text-center shadow-sm">
                <div className="text-4xl font-black text-blue-600 mb-1 leading-none">{result.updated}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-700">Registros Sincronizados</div>
              </div>
              <div className="p-6 rounded-2xl bg-amber-50 border border-amber-100 text-center shadow-sm">
                <div className="text-4xl font-black text-amber-600 mb-1 leading-none">{result.skipped}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-amber-700">Omitidos por Error</div>
              </div>

              {result.errors.length > 0 && (
                <div className="md:col-span-3 mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 overflow-hidden">
                  <p className="font-black text-slate-900 uppercase text-[10px] tracking-[0.2em] mb-4 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-500" /> Registro de Errores Críticos
                  </p>
                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 scrollbar-thin">
                    {result.errors.map((err, i) => (
                      <div key={i} className="p-3 bg-white border border-slate-100 rounded-xl text-[10px] text-red-700 font-bold flex justify-between items-center group">
                        <span>{err.message}</span>
                        <Badge variant="secondary" className="text-[10px] bg-red-50 text-red-600 border-none">Año: {err.row}</Badge>
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
          ) : step === 2 && (
            <Button 
              onClick={handleCommit} 
              disabled={loading || previewRows.some(r => r.errors.length > 0)} 
              className="bg-slate-900 rounded-xl font-black px-12 h-11 transition-all hover:bg-slate-800 shadow-xl active:scale-95 text-white"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <CheckCircle2 className="h-5 w-5 mr-2" />}
              Confirmar Carga Progresiva
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
