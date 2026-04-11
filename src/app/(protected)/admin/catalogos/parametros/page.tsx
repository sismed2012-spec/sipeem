import { getUsuarioActual } from "@/actions/auth";
import { getParametros } from "@/actions/parametros";
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
import ParametroSearch from "@/components/catalogos/ParametroSearch";
import { Configuracion } from "@/lib/types";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ParametrosCatalogPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  const { q: searchQuery } = await searchParams;

  // Fetch real data
  let parametros: Configuracion[] = [];
  try {
    parametros = await getParametros(searchQuery);
  } catch (e) {
    console.error("Error al cargar parámetros:", e);
  }

  const total = parametros.length;
  const categories = Array.from(new Set(parametros.map((p) => p.categoria))).length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500 mb-2">
          <Link href="/admin/catalogos" className="hover:text-slate-900 transition-colors">Catálogos</Link>
          <span>/</span>
          <span className="text-slate-900">Parámetros del Sistema</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
          Configuración Global
        </h1>
        <p className="mt-2 text-slate-600">
          Control de variables operativas, flags de funcionalidad y metadatos de la plataforma.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-slate-200 shadow-sm transition-all hover:bg-slate-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Variables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{total}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Categorías</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{categories}</div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Estado</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-tighter border border-emerald-100">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Sincronizado
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm relative overflow-hidden group cursor-help">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Entorno</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-400 group-hover:text-amber-600 transition-colors uppercase tracking-tighter">
              DEV / PRE
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <ParametroSearch defaultValue={searchQuery} />
        <Link href="/admin/catalogos/parametros/nuevo">
          <Button className="w-full md:w-auto rounded-xl bg-slate-900 font-bold hover:bg-slate-800 transition-all">
            <span className="mr-2">+</span> Nueva variable
          </Button>
        </Link>
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden rounded-2xl md:min-h-96">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center">
            <p className="text-slate-400 font-medium">No se encontraron parámetros que coincidan con la búsqueda.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest">Clave</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest">Valor</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest">Categoría</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest">Descripción</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parametros.map((p) => (
                <TableRow key={p.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="p-4">
                    <code className="text-[11px] font-black text-blue-800 bg-blue-50 px-2 py-1 rounded-md tracking-tight uppercase">
                      {p.clave}
                    </code>
                  </TableCell>
                  <TableCell className="text-slate-900 font-semibold p-4 max-w-[200px] truncate" title={p.valor}>
                    {p.valor}
                  </TableCell>
                  <TableCell className="p-4">
                    <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-bold text-[10px] uppercase">
                      {p.categoria}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[11px] text-slate-500 p-4 max-w-[250px] truncate italic" title={p.descripcion || ""}>
                    {p.descripcion || "Sin descripción"}
                  </TableCell>
                  <TableCell className="text-right p-4">
                    <Link href={`/admin/catalogos/parametros/${p.id}`}>
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-900 font-bold">
                        Configurar
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
