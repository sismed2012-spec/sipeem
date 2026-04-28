"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Globe, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import type { PulsoDigital } from "@/actions/pulso-digital";
import { analizarPulsoDigital } from "@/actions/pulso-digital";

const SENTIMIENTO_COLORS: Record<string, string> = {
  muy_positivo: "bg-emerald-100 text-emerald-700 border-emerald-200",
  positivo: "bg-green-100 text-green-700 border-green-200",
  neutro: "bg-slate-100 text-slate-600 border-slate-200",
  negativo: "bg-orange-100 text-orange-700 border-orange-200",
  muy_negativo: "bg-red-100 text-red-700 border-red-200",
};

type Props = {
  municipioId: number;
  initialPulso: PulsoDigital[];
};

export default function PulsoDigitalPanel({ municipioId, initialPulso }: Props) {
  const [pulso, setPulso] = useState<PulsoDigital[]>(initialPulso);
  const [analizando, setAnalizando] = useState(false);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleAnalizar() {
    setAnalizando(true);
    setError(null);
    try {
      const nuevo = await analizarPulsoDigital(municipioId, query.trim() || undefined);
      setPulso((prev) => [nuevo, ...prev].slice(0, 5));
      setExpandedId(nuevo.id);
      toast.success("Análisis de pulso digital generado");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al analizar";
      setError(message);
      toast.error(message);
    } finally {
      setAnalizando(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 shadow-md">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-500" />
            Pulso Digital
          </CardTitle>
          <p className="text-sm text-slate-500">
            Busca menciones públicas del municipio en la web y analiza el sentimiento con IA.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Query personalizada (opcional)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="rounded-xl border-slate-200 flex-1"
              disabled={analizando}
            />
            <Button
              onClick={handleAnalizar}
              disabled={analizando}
              className="rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold text-xs gap-2 whitespace-nowrap"
            >
              {analizando ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Analizando...</>
              ) : (
                <><Globe className="w-3.5 h-3.5" /> Analizar ahora</>
              )}
            </Button>
          </div>
          <p className="text-[10px] text-slate-400">
            Requiere <code className="bg-slate-100 px-1 rounded">TAVILY_API_KEY</code> en el entorno.
          </p>
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {pulso.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-6">
          Sin análisis previos. Presiona &quot;Analizar ahora&quot; para comenzar.
        </p>
      ) : (
        <div className="space-y-3">
          {pulso.map((p) => (
            <Card key={p.id} className="border-slate-200 shadow-sm overflow-hidden">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={`text-[9px] font-black uppercase ${SENTIMIENTO_COLORS[p.sentimiento] ?? SENTIMIENTO_COLORS.neutro}`}
                    >
                      {p.sentimiento.replace("_", " ")}
                    </Badge>
                    <span className="text-[10px] text-slate-400">
                      {new Date(p.created_at).toLocaleString("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      · {p.fuentes_count ?? 0} fuente{(p.fuentes_count ?? 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}
                    className="text-slate-400 hover:text-slate-700 flex-shrink-0"
                    aria-label="Expandir análisis"
                  >
                    {expandedId === p.id ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {expandedId === p.id && (
                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {p.resumen}
                  </div>
                )}

                {expandedId !== p.id && (
                  <p className="text-xs text-slate-600 line-clamp-2">{p.resumen}</p>
                )}

                <p className="text-[10px] text-slate-400 italic truncate">
                  Query: {p.query_usada}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
