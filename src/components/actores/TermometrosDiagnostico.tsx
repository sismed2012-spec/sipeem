"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { interpretarTermometros } from "@/actions/termometros-ai";
import type { Termometros } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, Loader2, Brain } from "lucide-react";
import { toast } from "sonner";

type Props = {
  municipioId: number;
  termometros: Termometros | null;
};

export default function TermometrosDiagnostico({ municipioId, termometros }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [diagnosticoLocal, setDiagnosticoLocal] = useState<string | null>(
    termometros?.diagnostico_ia ?? null
  );

  async function handleInterpretar() {
    setLoading(true);
    try {
      const resultado = await interpretarTermometros(municipioId);
      setDiagnosticoLocal(resultado);
      toast.success("Diagnóstico generado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al interpretar");
    } finally {
      setLoading(false);
    }
  }

  if (!termometros) {
    return (
      <p className="text-xs text-slate-400 italic mt-4">
        Guarda los termómetros primero para generar un diagnóstico.
      </p>
    );
  }

  return (
    <div className="space-y-3 mt-6 pt-6 border-t border-slate-100">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Brain className="w-3.5 h-3.5 text-indigo-500" /> Diagnóstico IA
        </h3>
        <Button
          onClick={handleInterpretar}
          disabled={loading}
          size="sm"
          variant="outline"
          className="rounded-xl border-indigo-200 text-indigo-600 hover:bg-indigo-50 gap-2 font-semibold"
        >
          {loading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando...</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5" /> {diagnosticoLocal ? "Regenerar" : "Generar diagnóstico"}</>
          )}
        </Button>
      </div>

      {diagnosticoLocal ? (
        <Card className="border-indigo-100 bg-indigo-50/30">
          <CardContent className="p-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
            {diagnosticoLocal}
            {termometros.diagnostico_at && (
              <p className="text-[10px] text-slate-400 mt-3 italic">
                Generado:{" "}
                {new Date(termometros.diagnostico_at).toLocaleString("es-MX", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-slate-400 italic">
          Haz clic en &quot;Generar diagnóstico&quot; para que la IA interprete los termómetros actuales.
        </p>
      )}
    </div>
  );
}
