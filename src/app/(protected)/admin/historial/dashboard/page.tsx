import { getUsuarioActual } from "@/actions/auth";
import { getHistorialAnalytics } from "@/actions/analytics";
import { PartyWinsChart, HistoricalTrendChart } from "@/components/analytics/AnalyticsCharts";
import { StatCard } from "@/components/analytics/StatCard";
import TacticalObjectivesDashboard from "@/components/historial/TacticalObjectivesDashboard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
  Trophy,
  Map as MapIcon,
  Calendar,
  Activity,
  AlertTriangle,
  AlertOctagon,
  ChevronLeft,
  ArrowRight,
} from "lucide-react";
import AnomaliasDashboard from "@/components/analytics/AnomaliasDashboard";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

type PageProps = {
  searchParams?: Promise<{
    priority?: string;
    status?: string;
    municipioId?: string;
    year?: string;
  }>;
};

export default async function HistorialDashboardPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.rol === "operador") redirect("/mapa");

  const resolvedSearch = searchParams ? await searchParams : undefined;
  const data = await getHistorialAnalytics({
    priority: resolvedSearch?.priority || undefined,
    status: resolvedSearch?.status || undefined,
    municipioId: resolvedSearch?.municipioId
      ? parseInt(resolvedSearch.municipioId, 10)
      : undefined,
    year: resolvedSearch?.year ? parseInt(resolvedSearch.year, 10) : undefined,
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-700 max-w-7xl mx-auto pb-12">
      <div className="flex flex-col gap-4">
        <Link 
          href="/admin/historial" 
          className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
        >
          <div className="h-6 w-6 rounded-full border border-slate-200 flex items-center justify-center group-hover:bg-slate-50 transition-colors font-bold">
            <ChevronLeft className="h-3 w-3" />
          </div>
          Volver al módulo electoral
        </Link>
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-900 uppercase tracking-tighter">
            Inteligencia Política
          </h1>
          <p className="mt-1 text-slate-500 font-medium">
            Métricas agregadas del comportamiento electoral municipal y auditoría de integridad.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          title="Eventos Registrados" 
          value={data.kpis.totalRecords} 
          sub="Revisiones históricas" 
          icon={Calendar} 
        />
        <StatCard 
          title="Fuerza Hegemónica" 
          value={data.kpis.mostWinningParty.siglas} 
          sub={`${data.kpis.mostWinningParty.count} victorias estatales`}
          icon={Trophy} 
          colorClass="text-emerald-600"
        />
        <StatCard 
          title="Municipios Mapeados" 
          value={data.kpis.totalMunicipios} 
          sub="Cobertura territorial" 
          icon={MapIcon} 
          colorClass="text-blue-600"
        />
        <StatCard 
          title="Años de Datos" 
          value={data.kpis.totalActiveYears} 
          sub="Profundidad histórica" 
          icon={Activity} 
          colorClass="text-amber-600"
        />
      </div>

      <TacticalObjectivesDashboard tacticalObjectives={data.tacticalObjectives} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
            <CardTitle className="text-lg font-black uppercase tracking-tight">Victorias por Partido</CardTitle>
            <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-400">Distribución estatal acumulada</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <PartyWinsChart data={data.winsByParty} />
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xl rounded-2xl overflow-hidden bg-white">
          <CardHeader className="bg-slate-50/50 border-b border-slate-100 p-6">
            <CardTitle className="text-lg font-black uppercase tracking-tight">Cronología Electoral</CardTitle>
            <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-400">Volumen de datos por año</CardDescription>
          </CardHeader>
          <CardContent className="p-6">
            <HistoricalTrendChart data={data.trendByYear} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-slate-200 shadow-lg rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-6 border-b border-slate-100">
            <CardTitle className="text-lg font-black uppercase tracking-tight">Competitividad Crítica</CardTitle>
            <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-400">Márgenes más estrechos (1º vs 2º)</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Municipio</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest p-4 text-right">Margen Promedio</TableHead>
                  <TableHead className="p-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.competitiveMunicipios.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-center p-8 text-slate-400 italic text-xs">Sin datos relacionales suficientes</TableCell></TableRow>
                ) : (
                  data.competitiveMunicipios.map((m) => (
                    <TableRow key={m.id} className="hover:bg-slate-50/50 transition-colors group">
                      <TableCell className="p-4">
                        <div className="font-black text-slate-900 uppercase tracking-tighter">{m.nombre}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">{m.elections} elecciones analizadas</div>
                      </TableCell>
                      <TableCell className="p-4 text-right">
                        <div className="font-black text-rose-600 italic">-{m.avgMargin.toLocaleString()} v.</div>
                      </TableCell>
                      <TableCell className="p-4 text-right">
                         <Link href={`/admin/historial/municipio/${m.id}`}>
                           <ArrowRight className="h-4 w-4 ml-auto text-slate-300 group-hover:text-slate-900 transition-colors" />
                         </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-lg rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-6 border-b border-slate-100">
            <CardTitle className="text-lg font-black uppercase tracking-tight">Alternancia de Poder</CardTitle>
            <CardDescription className="text-xs font-bold uppercase tracking-widest text-slate-400">Municipios con alta volatilidad partidista</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest p-4">Municipio</TableHead>
                  <TableHead className="font-black text-[10px] uppercase tracking-widest p-4 text-right">Transiciones</TableHead>
                  <TableHead className="p-4"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.volatileMunicipios.length === 0 ? (
                   <TableRow><TableCell colSpan={3} className="text-center p-8 text-slate-400 italic text-xs">Sin historial suficiente</TableCell></TableRow>
                ) : (
                  data.volatileMunicipios.map((m) => (
                    <TableRow key={m.id} className="hover:bg-slate-50/50 transition-colors group">
                      <TableCell className="p-4">
                        <div className="font-black text-slate-900 uppercase tracking-tighter">{m.nombre}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase">{m.totalElections} registros histórico</div>
                      </TableCell>
                      <TableCell className="p-4 text-right">
                        <div className="font-black text-blue-600">{m.changes} Cambios</div>
                      </TableCell>
                      <TableCell className="p-4 text-right">
                        <Link href={`/admin/historial/municipio/${m.id}`}>
                           <ArrowRight className="h-4 w-4 ml-auto text-slate-300 group-hover:text-slate-900 transition-colors" />
                         </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <section className="space-y-4">
        <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-2">
          <AlertOctagon className="w-3.5 h-3.5 text-amber-500" /> Detección de Anomalías
        </h2>
        <Suspense fallback={<p className="text-sm text-slate-400">Analizando historial...</p>}>
          <AnomaliasDashboard />
        </Suspense>
      </section>

      <Card className="border-slate-200 bg-slate-50/50 overflow-hidden rounded-2xl shadow-inner border-t-4 border-t-amber-500">
        <CardHeader className="p-6 bg-white/50 border-b border-slate-200">
           <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <CardTitle className="text-lg font-black uppercase tracking-widest text-slate-800">Auditoría Ética del Dato</CardTitle>
           </div>
           <CardDescription className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">Gobernanza e integridad de la información relacional</CardDescription>
        </CardHeader>
        <CardContent className="p-8">
           <div className="grid gap-4 md:grid-cols-4 mb-8">
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Huérfanos Relacionales</div>
                <div className="text-2xl font-black text-slate-900">{data.dataQuality.counts.orphans}</div>
              </div>
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Ganador No Hallado</div>
                <div className="text-2xl font-black text-slate-900">{data.dataQuality.counts.winnerMissing}</div>
              </div>
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Diferencial Voto Tot/Det</div>
                <div className="text-2xl font-black text-slate-900">{data.dataQuality.counts.voteMismatch}</div>
              </div>
              <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Suma Cero en Detalle</div>
                <div className="text-2xl font-black text-slate-900">{data.dataQuality.counts.zeroDetail}</div>
              </div>
           </div>

           {data.dataQuality.samples.length > 0 && (
             <div className="rounded-xl border border-slate-200 bg-white shadow-md overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                <Table>
                  <TableBody>
                    {data.dataQuality.samples.map(s => (
                       <TableRow key={s.id} className="hover:bg-slate-50 transition-colors">
                          <TableCell className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-tighter">{s.municipio}</TableCell>
                          <TableCell className="p-4 text-sm font-black text-slate-900">{s.anio}</TableCell>
                          <TableCell className="p-4">
                             <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 font-bold text-[9px] uppercase px-2 py-0.5 shadow-sm">
                                {s.issue}
                             </Badge>
                          </TableCell>
                          <TableCell className="p-4 text-right">
                             <Link href={`/admin/historial/${s.id}`} className="text-[10px] font-black text-slate-950 uppercase border-b-2 border-slate-950/20 hover:border-slate-950 transition-all">
                                Resolver Inconsistencia
                             </Link>
                          </TableCell>
                       </TableRow>
                    ))}
                  </TableBody>
                </Table>
             </div>
           )}
        </CardContent>
      </Card>
    </div>
  );
}
