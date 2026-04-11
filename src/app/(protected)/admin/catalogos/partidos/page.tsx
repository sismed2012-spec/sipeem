import { getUsuarioActual } from "@/actions/auth";
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
import PartidoSearch from "@/components/catalogos/PartidoSearch";
import { Partido } from "@/lib/types";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function PartidosCatalogPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  const { q: searchQuery } = await searchParams;

  // Fetch real data
  let partidos: Partido[] = [];
  try {
    partidos = await getPartidos(searchQuery);
  } catch (e) {
    console.error("Error al cargar partidos:", e);
  }

  const total = partidos.length;
  const activos = partidos.filter((p) => p.estatus === "activo").length;
  const inactivos = partidos.filter((p) => p.estatus === "inactivo").length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500 mb-2">
          <Link href="/admin/catalogos" className="hover:text-slate-900">Catálogos</Link>
          <span>/</span>
          <span className="text-slate-900">Partidos Políticos</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
          Fuerzas Políticas
        </h1>
        <p className="mt-2 text-slate-600">
          Identificación visual y registro institucional de partidos y coaliciones.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 shadow-sm transition-all hover:bg-slate-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Encontrados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{total}</div>
            <p className="text-xs text-slate-500 mt-1">Registros en el catálogo</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Activos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">{activos}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm border-l-4 border-l-amber-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Inactivos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{inactivos}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <PartidoSearch defaultValue={searchQuery} />
        <Link href="/admin/catalogos/partidos/nuevo">
          <Button className="w-full md:w-auto rounded-xl bg-slate-900 font-bold hover:bg-slate-800 transition-all">
            <span className="mr-2">+</span> Agregar partido
          </Button>
        </Link>
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden rounded-2xl md:min-h-96">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center">
            <p className="text-slate-400 font-medium">No se encontraron fuerzas políticas con esos criterios.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest">Identidad</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest text-center">Siglas</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest text-center">Color Base</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest">Estatus</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partidos.map((p) => (
                <TableRow key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-semibold text-slate-900 p-4">{p.nombre}</TableCell>
                  <TableCell className="text-center p-4">
                    <Badge variant="outline" className="font-mono font-bold border-slate-200 bg-white">
                      {p.siglas}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center p-4">
                    <div className="flex justify-center">
                      <div 
                        className="h-6 w-12 rounded-lg border border-slate-200 shadow-sm"
                        style={{ backgroundColor: p.color }}
                        title={p.color}
                      />
                    </div>
                  </TableCell>
                  <TableCell className="p-4">
                    <Badge 
                      variant="outline" 
                      className={`capitalize font-bold px-3 py-1 ${
                        p.estatus === 'activo' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                        : 'bg-amber-50 text-amber-700 border-amber-100'
                      }`}
                    >
                      {p.estatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right p-4">
                    <Link href={`/admin/catalogos/partidos/${p.id}`}>
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-900 font-bold">
                        Editar
                      </Button>
                    </Link>
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
