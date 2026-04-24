import { Suspense } from "react";
import { getUsuarioActual } from "@/actions/auth";
import { ElectoralMapContainer } from "@/components/analytics/ElectoralMapContainer";
import { getBaseMapData } from "@/lib/arcgis";

export default async function MapaPage() {
  const usuario = await getUsuarioActual();
  const isAnalytic = usuario?.rol === "admin" || usuario?.rol === "director";

  const geoData = await getBaseMapData();

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-50/50">
      <div className="p-6 border-b bg-white shadow-sm z-10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter flex items-center gap-2">
              Cartografía Territorial
              {isAnalytic && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-100 rounded-full">
                  <div className="w-1 h-1 bg-indigo-500 rounded-full animate-pulse" />
                  <span className="text-[9px] text-indigo-700 uppercase tracking-[0.2em] font-black">
                    IA Analítica Activa
                  </span>
                </div>
              )}
            </h1>
            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-1 opacity-70">
              {isAnalytic
                ? "Inteligencia Política y Visualización de Tendencias Municipales"
                : "Sistema de Información Geográfica SIPEEM"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <Suspense fallback={<MapSkeleton />}>
          <ElectoralMapContainer isAnalytic={isAnalytic} geoData={geoData} />
        </Suspense>
      </div>
    </div>
  );
}

function MapSkeleton() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-12 bg-slate-50">
      <div className="w-full max-w-4xl h-[600px] rounded-[2rem] bg-white shadow-2xl border border-slate-200 animate-pulse flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 bg-slate-100 rounded-full" />
        <div className="h-4 w-48 bg-slate-100 rounded-full" />
        <div className="h-2 w-32 bg-slate-50 rounded-full" />
      </div>
    </div>
  );
}