import { notFound } from "next/navigation";
import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/service";
import { getEstructuraMunicipio } from "@/actions/estructura";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import SeccionesPanel from "@/components/estructura/SeccionesPanel";
import PromotoresPanel from "@/components/estructura/PromotoresPanel";
import CoberturaChart from "@/components/estructura/CoberturaChart";
import { ArrowLeft, Map, Users, TrendingUp } from "lucide-react";

type Props = { params: Promise<{ municipioId: string }> };

export default async function EstructuraMunicipioPage({ params }: Props) {
  const { municipioId: municipioIdStr } = await params;
  const municipioId = parseInt(municipioIdStr);
  if (isNaN(municipioId)) notFound();

  const svc = createServiceClient();
  const { data: municipio } = await svc
    .from("municipios")
    .select("id, nombre")
    .eq("id", municipioId)
    .maybeSingle();

  if (!municipio) notFound();

  const { secciones, promotores, compromisos } = await getEstructuraMunicipio(municipioId);

  const totalCompromisos = compromisos.reduce((acc, c) => acc + c.compromisos, 0);
  const totalMeta = compromisos.reduce((acc, c) => acc + c.meta, 0);
  const coberturaPct = totalMeta > 0 ? Math.round((totalCompromisos / totalMeta) * 100) : 0;
  const promotoresActivos = promotores.filter((p) => p.activo).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-violet-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <Link
            href={`/admin/estrategia-municipal/${municipioId}`}
            className="inline-flex items-center gap-2 text-indigo-300 hover:text-white text-xs font-bold uppercase tracking-widest mb-4 transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Volver a ficha municipal
          </Link>
          <div className="flex items-start gap-4">
            <div className="p-3 bg-white/10 rounded-2xl backdrop-blur-sm">
              <Map className="w-7 h-7 text-indigo-200" />
            </div>
            <div>
              <p className="text-indigo-300 text-xs font-bold uppercase tracking-[0.2em] mb-1">Estructura Territorial</p>
              <h1 className="text-3xl font-black tracking-tight">{municipio.nombre}</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-none shadow-sm bg-white p-5">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Secciones</p>
            <p className="text-3xl font-black text-slate-900">{secciones.length}</p>
          </Card>
          <Card className="border-none shadow-sm bg-white p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-3.5 h-3.5 text-indigo-400" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Promotores activos</p>
            </div>
            <p className="text-3xl font-black text-slate-900">{promotoresActivos}</p>
          </Card>
          <Card className="border-none shadow-sm bg-white p-5">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Cobertura global</p>
            </div>
            <p className={`text-3xl font-black ${coberturaPct >= 80 ? "text-emerald-600" : coberturaPct >= 50 ? "text-indigo-600" : "text-amber-600"}`}>
              {coberturaPct}%
            </p>
          </Card>
        </div>

        {/* Gráfica de cobertura */}
        {secciones.length > 0 && (
          <Card className="border-none shadow-sm bg-white p-6">
            <h2 className="text-sm font-black text-slate-500 uppercase tracking-[0.15em] mb-4">Cobertura por sección</h2>
            <CoberturaChart secciones={secciones} compromisos={compromisos} />
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="secciones" className="space-y-4">
          <TabsList className="rounded-2xl p-1.5 bg-white border border-slate-200 shadow-sm">
            <TabsTrigger value="secciones">Secciones ({secciones.length})</TabsTrigger>
            <TabsTrigger value="promotores">Promotores ({promotores.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="secciones">
            <Card className="border-none shadow-sm bg-white p-6">
              <SeccionesPanel municipioId={municipioId} secciones={secciones} />
            </Card>
          </TabsContent>

          <TabsContent value="promotores">
            <Card className="border-none shadow-sm bg-white p-6">
              <PromotoresPanel municipioId={municipioId} promotores={promotores} />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
