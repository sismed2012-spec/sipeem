import { getUsuarioActual } from "@/actions/auth";
import { getUsuarios } from "@/actions/usuarios";
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
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type PageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function UsuariosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const usuarioLogueado = await getUsuarioActual();

  // 1. Session and role validation
  if (!usuarioLogueado) {
    redirect("/login");
  }

  if (usuarioLogueado.rol === "operador") {
    redirect("/mapa");
  }

  // 2. Real Data fetching
  let usuariosList: any[] = [];
  try {
    usuariosList = await getUsuarios();
  } catch (e) {
    console.error("Error al cargar usuarios:", e);
  }

  // Helper for role badges
  const rolColorMap: Record<string, string> = {
    director: "bg-purple-100 text-purple-700 border-purple-200",
    admin: "bg-blue-100 text-blue-700 border-blue-200",
    operador: "bg-slate-100 text-slate-700 border-slate-200",
  };

  // Stats always reflect the full list regardless of search
  const totalUsers = usuariosList.length;
  const adminUsers = usuariosList.filter((u) => u.rol === "director" || u.rol === "admin").length;
  const operadorUsers = usuariosList.filter((u) => u.rol === "operador").length;

  // Server-side filtering by name or email
  const q = params.q?.trim().toLowerCase() ?? "";
  const filtered = q
    ? usuariosList.filter(
        (u) =>
          u.nombre?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q)
      )
    : usuariosList;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header section */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
          Usuarios y Roles
        </h1>
        <p className="mt-2 text-slate-600">
          Administración centralizada de accesos, perfiles y permisos del sistema SIPEEM.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              Total Usuarios
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-900">{totalUsers}</div>
            <p className="text-xs text-slate-500 mt-1">Usuarios registrados en plataforma</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              Operadores
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-600">{operadorUsers}</div>
            <p className="text-xs text-slate-500 mt-1">Personal operativo de campo</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">
              Personal Administrativo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{adminUsers}</div>
            <p className="text-xs text-slate-500 mt-1">Usuarios con privilegios de gestión</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Action Bar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <form action="/admin/usuarios" method="get" className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 pointer-events-none" />
          <Input
            name="q"
            placeholder="Buscar por nombre o email..."
            defaultValue={params.q ?? ""}
            className="pl-10 rounded-xl border-slate-200 bg-white"
          />
        </form>
        <Link href="/admin/usuarios/nuevo">
          <Button className="w-full md:w-auto rounded-xl bg-slate-900 font-bold hover:bg-slate-800">
            <span className="mr-2">+</span> Nuevo usuario
          </Button>
        </Link>
      </div>

      {/* Users Table */}
      <Card className="border-slate-200 shadow-sm overflow-hidden rounded-2xl md:min-h-96">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
            <p>{q ? `Sin resultados para "${params.q}"` : "No se encontraron usuarios registrados."}</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="font-bold text-slate-700">Nombre</TableHead>
                <TableHead className="font-bold text-slate-700">Email</TableHead>
                <TableHead className="font-bold text-slate-700">Rol</TableHead>
                <TableHead className="text-center font-bold text-slate-700">Registro</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => (
                <TableRow key={u.id} className="hover:bg-slate-50/50 transition-colors">
                  <TableCell className="font-semibold text-slate-900">{u.nombre}</TableCell>
                  <TableCell className="text-slate-600">{u.email}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`capitalize font-semibold ${rolColorMap[u.rol.toLowerCase()] || ""}`}
                    >
                      {u.rol}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-xs text-slate-400">
                    {new Date(u.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link href={`/admin/usuarios/${u.id}`}>
                      <Button variant="ghost" size="sm" className="text-slate-400 hover:text-slate-900">
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
