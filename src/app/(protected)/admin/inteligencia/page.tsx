import { getSituacionGlobal } from "@/actions/situacion";
import InteligenciaChatShell from "@/components/inteligencia/InteligenciaChatShell";
import { Brain } from "lucide-react";

export default async function InteligenciaPage() {
  const { municipios } = await getSituacionGlobal();

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 to-slate-700 p-6 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-300">
          Inteligencia Operativa
        </p>
        <h1 className="mt-2 flex items-center gap-3 text-3xl font-black tracking-tight">
          <Brain className="h-8 w-8" />
          Inteligencia Electoral
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-300">
          Analisis comparativo cross-municipio con IA y sintesis ejecutivas.
        </p>
      </div>

      <section className="min-h-[640px]">
        <InteligenciaChatShell
          mode="global"
          municipios={municipios.map((municipio) => ({
            id: municipio.id,
            nombre: municipio.nombre,
          }))}
        />
      </section>
    </div>
  );
}
