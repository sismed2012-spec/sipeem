// src/components/situacion/GlobalKPIs.tsx
import type { SituacionGlobalDTO } from "@/actions/situacion";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Users, BarChart3, MapPin } from "lucide-react";

type Props = { kpis: SituacionGlobalDTO["kpis"] };

export default function GlobalKPIs({ kpis }: Props) {
  const pctConEstrategia =
    kpis.total > 0 ? Math.round((kpis.conEstrategia / kpis.total) * 100) : 0;

  const items = [
    {
      label: "Municipios activos",
      value: kpis.total,
      sub: "En el sistema",
      icon: MapPin,
      bg: "bg-slate-50",
      fg: "text-slate-500",
    },
    {
      label: "Con estrategia",
      value: `${pctConEstrategia}%`,
      sub: `${kpis.conEstrategia} de ${kpis.total}`,
      icon: BarChart3,
      bg: "bg-indigo-50",
      fg: "text-indigo-500",
    },
    {
      label: "Riesgo alto / extremo",
      value: kpis.enRiesgoAlto,
      sub: "Requieren atención inmediata",
      icon: AlertTriangle,
      bg: "bg-rose-50",
      fg: "text-rose-500",
    },
    {
      label: "Con aspirantes",
      value: kpis.conAspirantes,
      sub: "Al menos 1 registrado",
      icon: Users,
      bg: "bg-emerald-50",
      fg: "text-emerald-500",
    },
  ] as const;

  return (
    <div className="grid gap-4 md:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label} className="border-slate-200 shadow-sm">
            <CardContent className="p-5 flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${item.bg}`}>
                <Icon className={`w-5 h-5 ${item.fg}`} />
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  {item.label}
                </p>
                <p className="text-2xl font-black text-slate-900">{item.value}</p>
                <p className="text-[10px] text-slate-400">{item.sub}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
