"use client";

import HistorialImportDialog from "@/components/historial/HistorialImportDialog";
import HistorialMunicipalOficialImportDialog from "@/components/historial/HistorialMunicipalOficialImportDialog";
import HistorialSeccionImportDialog from "@/components/historial/HistorialSeccionImportDialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileSpreadsheet, FileUp, Landmark, Layers3 } from "lucide-react";

export default function ImportacionPage() {
  return (
    <div className="mx-auto max-w-5xl p-8">
      <div className="mb-8">
        <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900">
          Importacion de Historial Electoral
        </h1>
        <p className="text-sm text-slate-500">
          Centro de carga para historico municipal oficial, flujo legacy y
          detalle seccional 2024.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5 mb-8">
        <Card className="border-slate-200 shadow-sm md:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Modos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-slate-900">3</div>
            <p className="mt-1 text-xs text-slate-500 italic">
              Oficial, legacy y seccional
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm md:col-span-2 border-l-4 border-l-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Capa Prioritaria
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-black text-slate-900">XLSX municipal oficial</div>
            <p className="mt-1 text-xs text-slate-500 italic">
              Resumen por ayuntamiento sin repartir coaliciones
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm md:col-span-1 border-l-4 border-l-emerald-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Flujo Legacy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-black text-emerald-600">CSV municipal</div>
            <p className="mt-1 text-xs text-slate-500 italic">
              Compatible con historial agregado actual
            </p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 shadow-sm md:col-span-1 border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Nuevo Flujo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-black text-blue-600">
              XLSX 2024 por seccion
            </div>
            <p className="mt-1 text-xs text-slate-500 italic">
              Valida checksum, mapea `geo_municipio_id` y hace upsert por
              seccion.
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="oficial" className="space-y-6">
        <TabsList
          variant="line"
          className="rounded-2xl border border-slate-200 bg-white p-1"
        >
          <TabsTrigger value="oficial" className="rounded-xl px-4">
            <Landmark className="mr-2 h-4 w-4" />
            Municipal oficial
          </TabsTrigger>
          <TabsTrigger value="municipal" className="rounded-xl px-4">
            <Landmark className="mr-2 h-4 w-4" />
            Municipal legacy
          </TabsTrigger>
          <TabsTrigger value="seccional" className="rounded-xl px-4">
            <Layers3 className="mr-2 h-4 w-4" />
            Seccional 2024
          </TabsTrigger>
        </TabsList>

        <TabsContent value="oficial">
          <Card className="border-slate-200 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tight">
                    Importacion Municipal Oficial
                  </CardTitle>
                  <p className="mt-2 text-sm text-slate-500">
                    Capa prioritaria de resumen municipal por ayuntamiento.
                    Preserva coaliciones y candidaturas comunes tal como vienen
                    en el archivo oficial.
                  </p>
                </div>
                <Badge className="bg-slate-100 text-slate-800">XLSX</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <FileSpreadsheet className="h-5 w-5 text-slate-900" />
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Resumen municipal oficial
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Ganador, segundo lugar, margen, participacion y desglose por
                    candidatura/coalicion.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <Landmark className="h-5 w-5 text-slate-900" />
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Destino
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    `historial_municipal_oficial` y
                    `historial_municipal_oficial_resultados`.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <Layers3 className="h-5 w-5 text-slate-900" />
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Uso recomendado
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Capa superior del mapa, KPIs y resumen municipal antes del
                    drill-down por seccion.
                  </p>
                </div>
              </div>
              <HistorialMunicipalOficialImportDialog />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="municipal">
          <Card className="border-slate-200 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tight">
                    Importacion Municipal Legacy
                  </CardTitle>
                  <p className="mt-2 text-sm text-slate-500">
                    Carga agregados por municipio y anio con ganador, votos,
                    porcentaje y desglose opcional.
                  </p>
                </div>
                <Badge className="bg-emerald-50 text-emerald-700">CSV</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <FileUp className="h-5 w-5 text-emerald-600" />
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Estructura esperada
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    `municipio_id`, `anio`, `partido_ganador`, `votos`,
                    `porcentaje` y `desglose_json` opcional.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <Landmark className="h-5 w-5 text-emerald-600" />
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Destino
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    `historial_electoral` y `historial_electoral_resultados`.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <Layers3 className="h-5 w-5 text-emerald-600" />
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Uso recomendado
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Ajustes manuales, cargas historicas agregadas y correcciones
                    puntuales.
                  </p>
                </div>
              </div>
              <HistorialImportDialog />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seccional">
          <Card className="border-slate-200 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-slate-100 bg-slate-50">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-xl font-black text-slate-900 uppercase tracking-tight">
                    Importacion Oficial 2024 por Seccion
                  </CardTitle>
                  <p className="mt-2 text-sm text-slate-500">
                    Diseñada para el archivo de ayuntamientos por seccion del
                    Estado de Mexico, con control de checksums y mapeo al
                    catalogo interno.
                  </p>
                </div>
                <Badge className="bg-blue-50 text-blue-700">XLSX</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Mapeo
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    `ID_MUNICIPIO` se resuelve contra `geo_municipio_id` y el
                    nombre se usa como validacion secundaria.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <Layers3 className="h-5 w-5 text-blue-600" />
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Reglas
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    `SECCION = 0` se conserva como checksum de control y no se
                    persiste como seccion real.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <Landmark className="h-5 w-5 text-blue-600" />
                  <p className="mt-3 text-sm font-black text-slate-900">
                    Destino
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    `historial_seccion_electoral` y
                    `historial_seccion_resultados`.
                  </p>
                </div>
              </div>
              <HistorialSeccionImportDialog />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
