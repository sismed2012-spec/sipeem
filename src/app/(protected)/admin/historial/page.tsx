import { getUsuarioActual } from "@/actions/auth";
import { getHistorialList } from "@/actions/historial";
import { getMunicipios } from "@/actions/municipios";
import { getPartidos } from "@/actions/partidos";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import HistorialFilters from "@/components/historial/HistorialFilters";
import HistorialImportDialog from "@/components/historial/HistorialImportDialog";
import { 
  BarChart2, 
  LineChart, 
  Plus, 
  Settings2 
} from "lucide-react";

type PageProps = {
  searchParams: Promise<{
    q?: string;
    municipioId?: string;
    anio?: string;
    partidoId?: string;
  }>;
};

export default async function HistorialPage({ searchParams }: PageProps) {
  // Access Control
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.rol === "operador") redirect("/mapa");

  const params = await searchParams;
  
  // Data Fetching
  const [historial, municipios, partidos] = await Promise.all([
    getHistorialList({
      search: params.q,
      municipioId: params.municipioId ? parseInt(params.municipioId) : undefined,
      anio: params.anio ? parseInt(params.anio) : undefined,
      partidoGanadorId: params.partidoId ? parseInt(params.partidoId) : undefined,
    }),
    getMunicipios(),
    getPartidos()
  ]);

  const total = historial.length;
  const uniqueYears = Array.from(new Set(historial.map(h => h.anio))).sort((a, b) => b - a);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
            Historial Electoral
          </h1>
          <p className="mt-2 text-slate-600">
            Gestión y análisis de resultados electorales municipales históricos.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/historial/dashboard">
            <Button variant="outline" className="rounded-xl border-slate-200 font-bold hover:bg-slate-50 transition-all shadow-sm">
              <BarChart2 className="mr-2 h-4 w-4 text-emerald-600" /> Inteligencia
            </Button>
          </Link>
          <HistorialImportDialog />
          <Link href="/admin/historial/nuevo">
            <Button className="rounded-xl bg-slate-900 font-bold hover:bg-slate-800 shadow-xl transition-all hover:scale-[1.02] active:scale-[0.98] text-white">
              <Plus className="mr-2 h-4 w-4" /> Nuevo registro
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 shadow-sm transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">Eventos Totales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">{total}</div>
            <p className="text-xs text-slate-500 mt-1 italic">Procesos validados</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">Última Actualización</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-600">{uniqueYears[0] || '—'}</div>
            <p className="text-xs text-slate-500 mt-1 italic">Datos más recientes</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">Cobertura Municipal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-blue-600">
              {new Set(historial.map(h => h.municipio_id)).size}
            </div>
            <p className="text-xs text-slate-500 mt-1 italic">Municipios con historial</p>
          </CardContent>
        </Card>
      </div>

      <HistorialFilters 
        municipios={municipios} 
        partidos={partidos} 
        currentParams={params}
      />

      {/* Main Table */}
      <Card className="border-slate-200 shadow-xl overflow-hidden rounded-2xl md:min-h-96 bg-white/50 backdrop-blur-sm">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center p-24 text-center">
            <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-2xl">🗳️</span>
            </div>
            <p className="text-slate-500 font-bold text-lg">No se hallaron registros</p>
            <p className="text-slate-400 text-sm max-w-xs mt-1">Ajuste los criterios de búsqueda o filtros.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-black text-slate-700 uppercase p-4 text-[11px] tracking-widest border-b-2 border-slate-100">Municipio</TableHead>
                <TableHead className="font-black text-slate-700 uppercase p-4 text-[11px] tracking-widest text-center border-b-2 border-slate-100">Año</TableHead>
                <TableHead className="font-black text-slate-700 uppercase p-4 text-[11px] tracking-widest border-b-2 border-slate-100">Resultado Sectorial</TableHead>
                <TableHead className="font-black text-slate-700 uppercase p-4 text-[11px] tracking-widest text-right border-b-2 border-slate-100">Volumen Voto</TableHead>
                <TableHead className="border-b-2 border-slate-100"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.map((h) => (
                <TableRow key={h.id} className="hover:bg-slate-50/50 transition-colors border-slate-100 group">
                  <TableCell className="p-4">
                    <div className="font-black text-slate-900 leading-tight uppercase tracking-tighter">{h.municipio?.nombre}</div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Entidad Municipal</div>
                  </TableCell>
                  <TableCell className="text-center p-4">
                    <Badge variant="outline" className="bg-white border-slate-200 text-slate-900 font-black px-2 shadow-sm">
                      {h.anio}
                    </Badge>
                  </TableCell>
                  <TableCell className="p-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="h-3 w-3 rounded-full border border-slate-200 shrink-0 shadow-sm"
                        style={{ backgroundColor: h.partido_ganador?.color || '#cbd5e1' }}
                      />
                      <div>
                        <div className="font-black text-slate-800 leading-tight uppercase text-xs">
                          {h.partido_ganador?.siglas}
                        </div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                          {h.partido_ganador?.nombre}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right p-4">
                    <div className="font-black text-slate-950 italic leading-none mb-1">
                      {Number(h.votos_ganador || 0).toLocaleString()}
                    </div>
                    <div className="text-[11px] font-bold text-emerald-600">
                      {h.porcentaje_ganador}% del total
                    </div>
                  </TableCell>
                  <TableCell className="text-right p-4">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/admin/historial/municipio/${h.municipio_id}`}>
                        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 font-black uppercase text-[9px] tracking-widest rounded-lg h-8 px-3 transition-colors">
                          <LineChart className="mr-1 h-3 w-3" /> Análisis
                        </Button>
                      </Link>
                      <Link href={`/admin/historial/${h.id}`}>
                        <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-950 hover:bg-slate-100 font-black uppercase text-[9px] tracking-widest rounded-lg h-8 px-3 transition-colors">
                          <Settings2 className="mr-1 h-3 w-3" /> Ajustes
                        </Button>
                      </Link>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
