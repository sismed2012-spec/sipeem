"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { syncMunicipiosFromGeoJSON } from "@/actions/municipios-sync";
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner"; // Assuming sonner is used, based on standard project patterns

export default function MunicipioSyncButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    processed: number;
    created: number;
    updated: number;
    ambiguous: string[];
  } | null>(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await syncMunicipiosFromGeoJSON();
      setResult(res);
      toast.success("Sincronización completada exitosamente");
    } catch (error: any) {
      console.error(error);
      toast.error("Error en la sincronización: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button 
        onClick={handleSync} 
        disabled={loading}
        variant="outline"
        className="rounded-xl border-slate-200 font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Homologar municipios desde GeoJSON
      </Button>

      {result && (
        <div className="mt-2 p-4 bg-slate-900 text-white rounded-2xl shadow-xl animate-in slide-in-from-top-2 duration-300">
          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-3 flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            Resultado de Homologación
          </h4>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Procesados</div>
              <div className="text-xl font-black">{result.processed}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Actualizados</div>
              <div className="text-xl font-black text-blue-400">{result.updated}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Creados</div>
              <div className="text-xl font-black text-emerald-400">{result.created}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Ambiguos</div>
              <div className="text-xl font-black text-amber-400">{result.ambiguous.length}</div>
            </div>
          </div>
          
          {result.ambiguous.length > 0 && (
            <div className="mt-4 pt-3 border-t border-white/10">
              <p className="text-[9px] text-amber-300 font-bold uppercase flex items-center gap-1.5">
                <AlertCircle className="w-3 h-3" /> Requieren Revisión Manual:
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {result.ambiguous.map((name, i) => (
                  <span key={i} className="text-[8px] bg-white/5 px-1.5 py-0.5 rounded text-slate-300 border border-white/5 italic">
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
