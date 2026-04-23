import { detectarAnomalias } from "@/actions/anomalias";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertOctagon, Brain } from "lucide-react";
import Link from "next/link";

const SEVERIDAD_COLORS: Record<string, string> = {
  critica: "bg-red-100 text-red-700 border-red-200",
  alta: "bg-orange-100 text-orange-700 border-orange-200",
  media: "bg-amber-100 text-amber-700 border-amber-200",
};

export default async function AnomaliasDashboard() {
  const { anomalias, interpretacion_ia, generado_at } = await detectarAnomalias();

  return (
    <div className="space-y-4">
      {/* AI interpretation */}
      <Card className="border-indigo-100 bg-indigo-50/30">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold text-indigo-700 flex items-center gap-2">
            <Brain className="w-4 h-4" /> Interpretación IA
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-700 leading-relaxed">
          {interpretacion_ia}
        </CardContent>
      </Card>

      {/* Anomalies list */}
      {anomalias.length === 0 ? (
        <p className="text-sm text-slate-400 italic text-center py-4">
          Sin anomalías significativas detectadas.
        </p>
      ) : (
        <div className="space-y-2">
          {anomalias.slice(0, 10).map((a, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white">
              <AlertOctagon className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="outline"
                    className={`text-[9px] font-black uppercase ${SEVERIDAD_COLORS[a.severidad]}`}
                  >
                    {a.severidad}
                  </Badge>
                  <Link
                    href={`/admin/historial/municipio/${a.municipio_id}`}
                    className="text-sm font-semibold text-indigo-600 hover:underline"
                  >
                    {a.municipio_nombre}
                  </Link>
                  <span className="text-xs text-slate-400">— {a.anio_referencia}</span>
                </div>
                <p className="text-xs text-slate-600">{a.descripcion}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-400 text-right">
        Análisis generado:{" "}
        {new Date(generado_at).toLocaleString("es-MX", {
          dateStyle: "short",
          timeStyle: "short",
        })}
      </p>
    </div>
  );
}
