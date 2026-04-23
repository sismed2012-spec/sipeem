import { getStrategicOverview } from "@/actions/estrategia";
import { StrategicOverviewDashboard } from "@/components/estrategia/StrategicScorecard";
import ExportarListaBtn from "@/components/exportacion/ExportarListaBtn";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  BarChart3, 
  ChevronRight, 
  FileText, 
  ShieldAlert, 
  Zap 
} from "lucide-react";
import { cn } from "@/lib/utils";

export default async function EstrategiaOverviewPage() {
  const data = await getStrategicOverview();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* Header */}
      <div className="bg-slate-900 rounded-[2.5rem] p-8 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-xs font-black text-indigo-400 uppercase tracking-[0.3em] mb-3">
             <BarChart3 className="w-4 h-4" /> Inteligencia Operativa
          </div>
          <h1 className="text-4xl font-black tracking-tight">Estrategia Municipal</h1>
          <p className="mt-3 text-slate-400 max-w-2xl text-sm leading-relaxed">
            Consolidado estratégico para la toma de decisiones político-electorales. 
            Priorice la operación basándose en el nivel de riesgo y oportunidad territorial.
          </p>
        </div>
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 blur-[100px] -mr-20 -mt-20" />
      </div>

      {/* Scorecard Dashboard */}
      <StrategicOverviewDashboard stats={data.stats} />

      {/* Listado de Municipios */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
           <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" /> Cobertura Estratégica
           </h2>
           <div className="flex items-center gap-3">
             <ExportarListaBtn />
             <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">
               {data.municipios.length} Municipios Activos
             </span>
           </div>
        </div>

        <Card className="border-slate-200 shadow-xl overflow-hidden rounded-[2rem] bg-white">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-slate-100">
                <TableHead className="font-black text-slate-400 uppercase p-6 text-[10px] tracking-widest">Municipio</TableHead>
                <TableHead className="font-black text-slate-400 uppercase p-6 text-[10px] tracking-widest">Prioridad</TableHead>
                <TableHead className="font-black text-slate-400 uppercase p-6 text-[10px] tracking-widest">Riesgo</TableHead>
                <TableHead className="font-black text-slate-400 uppercase p-6 text-[10px] tracking-widest">Estatus</TableHead>
                <TableHead className="font-black text-slate-400 uppercase p-6 text-[10px] tracking-widest">Responsable</TableHead>
                <TableHead className="text-right p-6"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.municipios.map((m) => {
                const est = m.estrategia;
                return (
                  <TableRow key={m.id} className="hover:bg-slate-50/50 transition-colors border-slate-50 group">
                    <TableCell className="p-6">
                      <div className="font-black text-slate-900">{m.nombre}</div>
                      <div className="text-[9px] text-slate-400 uppercase font-bold mt-1 tracking-tighter">
                        {m.region || 'Sin Región'} • Distrito {m.distrito || 'N/A'}
                      </div>
                    </TableCell>
                    <TableCell className="p-6">
                      {est ? (
                        <Badge className={cn(
                          "rounded-lg font-black uppercase text-[9px] tracking-widest px-2.5 py-1 shadow-sm",
                          est.prioridad === 'Crítica' ? "bg-rose-500 hover:bg-rose-600" :
                          est.prioridad === 'Alta' ? "bg-amber-500 hover:bg-amber-600" :
                          est.prioridad === 'Media' ? "bg-blue-500 hover:bg-blue-600" :
                          "bg-slate-400 hover:bg-slate-500"
                        )}>
                          {est.prioridad}
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-bold italic">Pendiente</span>
                      )}
                    </TableCell>
                    <TableCell className="p-6">
                      {est ? (
                        <div className="flex items-center gap-2">
                           <div className={cn(
                             "w-2 h-2 rounded-full animate-pulse",
                             est.riesgo === 'Extremo' ? "bg-rose-500" :
                             est.riesgo === 'Alto' ? "bg-amber-500" :
                             "bg-slate-200"
                           )} />
                           <span className={cn(
                             "text-[10px] font-bold uppercase",
                             est.riesgo === 'Extremo' ? "text-rose-600" : "text-slate-600"
                           )}>{est.riesgo}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300">•</span>
                      )}
                    </TableCell>
                    <TableCell className="p-6">
                       {est ? (
                         <Badge variant="outline" className="text-[9px] font-black uppercase border-slate-200 text-slate-500 bg-slate-50">
                           {est.estatus}
                         </Badge>
                       ) : (
                         <div className="flex items-center gap-2 text-amber-500">
                           <ShieldAlert className="w-3 h-3" />
                           <span className="text-[9px] font-black uppercase italic">Sin Evaluación</span>
                         </div>
                       )}
                    </TableCell>
                    <TableCell className="p-6">
                       <span className="text-xs font-bold text-slate-500">
                         {est?.responsable || '—'}
                       </span>
                    </TableCell>
                    <TableCell className="text-right p-6">
                      <Link href={`/admin/estrategia-municipal/${m.id}`}>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="font-black text-[10px] uppercase tracking-widest text-indigo-500 hover:bg-indigo-50 rounded-xl"
                        >
                          <FileText className="w-3 h-3 mr-2" />
                          {est ? 'Actualizar Ficha' : 'Crear Ficha'}
                          <ChevronRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}