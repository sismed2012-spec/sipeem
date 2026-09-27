import { getUsuarioActual } from "@/actions/auth";
import { DemografiaRevisionBoard } from "@/components/demografia/DemografiaRevisionBoard";
import {
  DemografiaReviewInputError,
  getDemografiaReviewQueue,
  parseDemografiaReviewParams,
} from "@/lib/demografia-review";
import { createDemografiaReviewServiceInvoker } from "@/lib/demografia-review-server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toSearchParams(values: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === "string") params.set(key, value);
    else if (Array.isArray(value) && typeof value[0] === "string") {
      params.set(key, value[0]);
    }
  }
  return params;
}

export default async function DemografiaRevisionPage({ searchParams }: PageProps) {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (usuario.rol !== "admin" && usuario.rol !== "director") redirect("/mapa");

  let filters;
  try {
    filters = parseDemografiaReviewParams(toSearchParams(await searchParams));
  } catch (error) {
    if (error instanceof DemografiaReviewInputError) {
      return (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-2xl font-black text-amber-950">Filtro demográfico inválido</h1>
          <p className="mt-2 text-sm text-amber-800">{error.message}</p>
        </div>
      );
    }
    throw error;
  }

  const data = await getDemografiaReviewQueue(
    createDemografiaReviewServiceInvoker(),
    filters
  );

  return (
    <div className="space-y-7 animate-in fade-in duration-500">
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
            Inteligencia territorial · INEGI
          </div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950 lg:text-4xl">
            Revisión demográfica
          </h1>
          <p className="mt-2 max-w-3xl text-slate-600">
            Localidades que requieren comprobación territorial antes de consolidar su relación con las secciones electorales.
          </p>
        </div>
        <p className="max-w-md rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-relaxed text-blue-800">
          Esta etapa es diagnóstica: muestra evidencia y candidatos, pero no modifica correspondencias ni recalcula agregados.
        </p>
      </header>

      <DemografiaRevisionBoard data={data} filters={filters} />
    </div>
  );
}
