import { getUsuarioActual } from "@/actions/auth";
import { getMunicipios } from "@/actions/municipios";
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
import MunicipioSearch from "@/components/catalogos/MunicipioSearch";
import MunicipioSyncButton from "@/components/catalogos/MunicipioSyncButton";

import { Municipio } from "@/lib/types";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function MunicipiosCatalogPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  const { q: searchQuery } = await searchParams;

  // 2. Fetch real data
  let municipios: Municipio[] = [];
  try {
    municipios = await getMunicipios(searchQuery);
  } catch (e) {
    console.error("Error al cargar municipios:", e);
  }

  const total = municipios.length;
  const activos = municipios.filter((m) => m.estatus === "activo").length;
  const inactivos = municipios.filter((m) => m.estatus === "inactivo").length;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-slate-500 mb-2">
          <Link href="/admin/catalogos" className="hover:text-slate-900">Catálogos</Link>
          <span>/</span>
          <span className="text-slate-900">Municipios</span>
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
          Catálogo de Municipios
        </h1>
        <p className="mt-2 text-slate-600">
          Gestión de la división política base y parámetros territoriales del estado.
        </p>
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-500">Resultados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{total}</div>
            <p className="text-xs text-slate-500 mt-1">Municipios encontrados</p>
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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <MunicipioSearch defaultValue={searchQuery} />
        
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
          <MunicipioSyncButton />
          
          <Link href="/admin/catalogos/municipios/nuevo">
            <Button className="w-full md:w-auto rounded-xl bg-slate-900 font-bold hover:bg-slate-800">
              <span className="mr-2">+</span> Agregar municipio
            </Button>
          </Link>
        </div>
      </div>

      {/* Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden rounded-2xl md:min-h-96">
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 text-center">
            <p className="text-slate-400 font-medium">No se encontraron municipios que coincidan con la búsqueda.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest">Nombre</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest">Distrito</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest">Región</TableHead>
                <TableHead className="font-bold text-slate-700 uppercase p-4 text-[11px] tracking-widest">Estatus</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {municipios.map((m) => (
                <TableRow key={m.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-semibold text-slate-900 p-4">{m.nombre}</TableCell>
                  <TableCell className="text-slate-600 p-4">{m.distrito || '—'}</TableCell>
                  <TableCell className="text-slate-600 p-4">{m.region || '—'}</TableCell>
                  <TableCell className="p-4">
                    <Badge 
                      variant="outline" 
                      className={`capitalize font-bold px-3 py-1 ${
                        m.estatus === 'activo' 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
                        : 'bg-amber-50 text-amber-700 border-amber-100'
                      }`}
                    >
                      {m.estatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right p-4">
                    <Link href={`/admin/catalogos/municipios/${m.id}`}>
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-900 font-bold">
                        Ver detalles
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
