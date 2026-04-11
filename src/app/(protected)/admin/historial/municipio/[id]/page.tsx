import { getUsuarioActual } from "@/actions/auth";
import { getMunicipioHistorialAnalytics } from "@/actions/analytics";
import { MunicipioHistoryChart } from "@/components/analytics/MunicipalityCharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  TrendingUp, 
  Users, 
  History, 
  BarChart4, 
  FileText,
  Trophy as TrophyIcon
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function MunicipioAnalyticsPage({ params }: PageProps) {
  // Explicit Auth & Access Control
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.rol === "operador") redirect("/mapa");

  const { id } = await params;
  const data = await getMunicipioHistorialAnalytics(parseInt(id));

  const alternationColor = data.summary.alternationRate > 0.5 ? "text-rose-600" : "text-emerald-600";
  const competitivenessColor = data.summary.avgCompetitiveness < 1000 ? "text-rose-600" : "text-blue-600";

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-7xl mx-auto pb-12">
      {/* breadcrumbs */}
      <div className="flex flex-col gap-4">
        <Link 
          href="/admin/historial" 
          className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
        >
          <div className="h-6 w-6 rounded-full border border-slate-200 flex items-center justify-center group-hover:bg-slate-50 transition-colors font-bold">
            <ChevronLeft className="h-3 w-3" />
          </div>
          Cerrar Perfil Local
        </Link>
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase tracking-tighter">
            Perfil de Inteligencia: {data.summary.nombre}
          </h1>
          <p className="mt-1 text-slate-500 font-medium">
             Análisis detallado de evolución política y comportamiento de voto.
          </p>
        </div>
      </div>

      {/* Summary Row */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-slate-200 bg-white shadow-sm h-32 flex flex-col justify-center px-6 border-b-4 border-b-slate-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Escrutinios</p>
            <div className="text-3xl font-black text-slate-900 leading-none">{data.summary.totalElections}</div>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm h-32 flex flex-col justify-center px-6 border-b-4 border-b-slate-900">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Fuerza Actual</p>
            <div className="text-3xl font-black text-slate-900 leading-none">{data.summary.lastWinner}</div>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm h-32 flex flex-col justify-center px-6 border-b-4 border-b-emerald-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Alternancia</p>
            <div className={`text-3xl font-black ${alternationColor} leading-none`}>{(data.summary.alternationRate * 100).toFixed(0)}%</div>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm h-32 flex flex-col justify-center px-6 border-b-4 border-b-rose-100">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Margen Promedio</p>
            <div className={`text-3xl font-black ${competitivenessColor} leading-none`}>{data.summary.avgCompetitiveness.toLocaleString()} v.</div>
        </Card>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Timeline Visualization */}
        <Card className="lg:col-span-2 border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
            <CardTitle className="text-lg font-black uppercase tracking-tight">Captación de Voto Ganador</CardTitle>
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-slate-400">Rendimiento acumulado de la primera fuerza por año</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <MunicipioHistoryChart data={[...data.timeline].reverse()} />
          </CardContent>
        </Card>

        {/* Executive Interpretation */}
        <Card className="border-none shadow-2xl rounded-2xl overflow-hidden bg-slate-900 text-white">
          <CardHeader className="p-6 border-b border-white/10 bg-slate-800/50">
            <div className="flex items-center gap-2">
               <FileText className="h-4 w-4 text-emerald-400" />
               <CardTitle className="text-sm font-black uppercase tracking-widest italic">Análisis Estratégico</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
             <div className="space-y-6">
               <div className="flex gap-4 items-start">
                  <div className="h-9 w-9 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0 shadow-inner">
                     <TrendingUp className="h-4 w-4 text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400/60 mb-1">Tendencia de Alternancia</p>
                    <p className="text-sm font-medium leading-relaxed opacity-90">
                      {data.summary.alternationRate > 0.4 
                        ? "Alta volatilidad política detectada. El municipio presenta una competencia abierta con cambios frecuentes en la fuerza gobernante." 
                        : "Tendencia a la estabilidad o dominio prolongado. Una o pocas fuerzas políticas mantienen el control histórico."}
                    </p>
                  </div>
               </div>

               <div className="flex gap-4 items-start">
                  <div className="h-9 w-9 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0 shadow-inner">
                     <Users className="h-4 w-4 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-400/60 mb-1">Escenario Competitivo</p>
                    <p className="text-sm font-medium leading-relaxed opacity-90">
                       {data.summary.avgCompetitiveness < 1500 
                        ? "Escenario de alta competencia. Las victorias suelen definirse por márgenes estrechos, indicando un electorado fragmentado o polarizado." 
                        : "Victorias consolidadas. Los ganadores suelen obtener una ventaja clara sobre la segunda fuerza."}
                    </p>
                  </div>
               </div>

               <div className="flex gap-4 items-start">
                  <div className="h-9 w-9 rounded-xl bg-amber-500/20 flex items-center justify-center shrink-0 shadow-inner">
                     <History className="h-4 w-4 text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-amber-400/60 mb-1">Historial Validado</p>
                    <p className="text-sm font-medium leading-relaxed opacity-90 italic">
                       Estado actual encabezado por <span className="font-black text-white">{data.summary.lastWinner}</span>. Se han verificado <span className="font-black text-white">{data.summary.totalElections}</span> escrutinios históricos.
                    </p>
                  </div>
               </div>
             </div>
          </CardContent>
        </Card>
      </div>

      {/* Historical Log Breakdown */}
      <h2 className="text-xl font-black uppercase tracking-tighter text-slate-800 mt-12 flex items-center gap-2">
        <BarChart4 className="h-5 w-5" /> Registro Cronológico Detallado
      </h2>
      
      <div className="grid gap-4 md:grid-cols-2">
        {data.timeline.map((event) => (
           <Card key={event.id} className="border-slate-200 shadow-sm transition-all hover:shadow-md hover:border-slate-300 overflow-hidden bg-white group">
              <CardContent className="p-0">
                <div className="p-5 border-b border-slate-50 flex justify-between items-center group-hover:bg-slate-50/50 transition-colors">
                   <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shadow-lg">
                         {event.anio}
                      </div>
                      <div>
                        <div className="font-black text-slate-950 tracking-tighter uppercase">{event.winnerSiglas}</div>
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{event.winner}</div>
                      </div>
                   </div>
                   <div className="text-right">
                      <div className="text-2xl font-black text-slate-950 tracking-tighter italic leading-none mb-1">{event.votos.toLocaleString()}</div>
                      <Badge className="bg-emerald-50 text-emerald-700 border-none font-black text-[9px] uppercase">{event.porcentaje}%</Badge>
                   </div>
                </div>

                <div className="p-5">
                   <div className="flex justify-between items-center mb-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Distribución del Voto</p>
                      {event.margin > 0 && (
                        <p className="text-[9px] font-black uppercase text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 shadow-sm">Margen: {event.margin.toLocaleString()}</p>
                      )}
                   </div>
                   <div className="space-y-3">
                      {event.topParties.length === 0 ? (
                        <p className="text-[10px] italic text-slate-400 font-medium">Sin desglose relacional</p>
                      ) : (
                        event.topParties.map((p, pIdx) => (
                          <div key={pIdx} className="flex justify-between items-center">
                             <div className="flex items-center gap-2">
                                {pIdx === 0 ? <TrophyIcon className="h-3 w-3 text-amber-500" /> : <div className="h-1 w-1 rounded-full bg-slate-300" />}
                                <span className={`text-[11px] ${pIdx === 0 ? 'font-black text-slate-950' : 'font-bold text-slate-500'} uppercase`}>{p.siglas}</span>
                             </div>
                             <div className={`text-[11px] font-black ${pIdx === 0 ? 'text-slate-950' : 'text-slate-400'}`}>{p.votes.toLocaleString()}</div>
                          </div>
                        ))
                      )}
                   </div>
                </div>
              </CardContent>
           </Card>
        ))}
      </div>
    </div>
  );
}
