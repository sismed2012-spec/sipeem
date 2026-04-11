import { getUsuarioActual } from "@/actions/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function CatalogosPage() {
  const usuario = await getUsuarioActual();

  if (!usuario) {
    redirect("/login");
  }

  if (usuario.rol === "operador") {
    redirect("/mapa");
  }

  const catalogs = [
    {
      title: "Municipios",
      description: "Administración de la lista oficial de municipios, colores y secciones base.",
      href: "/admin/catalogos/municipios",
      icon: "M",
      color: "bg-emerald-100 text-emerald-700",
    },
    {
      title: "Partidos Políticos",
      description: "Gestión de emblemas, siglas y colores institucionales de las fuerzas políticas.",
      href: "/admin/catalogos/partidos",
      icon: "P",
      color: "bg-blue-100 text-blue-700",
    },
    {
      title: "Parámetros del Sistema",
      description: "Configuración global de variables, años de elección y metadatos de la plataforma.",
      href: "/admin/catalogos/parametros",
      icon: "S",
      color: "bg-amber-100 text-amber-700",
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header section */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-slate-900 lg:text-4xl">
          Catálogos Base
        </h1>
        <p className="mt-2 text-slate-600">
          Centro de control para la configuración estructural de la plataforma SIPEEM.
        </p>
      </div>

      {/* Grid structure */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {catalogs.map((catalog) => (
          <Card key={catalog.href} className="border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden rounded-2xl">
            <CardHeader className="flex flex-row items-center gap-4 pb-4">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl font-bold text-xl ${catalog.color}`}>
                {catalog.icon}
              </div>
              <CardTitle className="text-xl font-bold text-slate-900">
                {catalog.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-sm text-slate-600 leading-relaxed">
                {catalog.description}
              </p>
              <Link href={catalog.href}>
                <Button className="w-full rounded-xl bg-slate-900 font-bold hover:bg-slate-800">
                  Gestionar catálogo
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Info helper */}
      <div className="rounded-2xl bg-blue-50 border border-blue-100 p-6">
        <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wider">Aviso de integridad</h3>
        <p className="mt-2 text-sm text-blue-700 leading-relaxed">
          Los cambios realizados en estos catálogos afectan de forma global a los módulos de Mapas, Importación y Reportes Históricos. Proceda con precaución al modificar identificadores base.
        </p>
      </div>
    </div>
  );
}
