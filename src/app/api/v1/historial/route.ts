import { NextRequest, NextResponse } from "next/server";
import { validarApiKey } from "@/lib/api-keys";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(req: NextRequest) {
  const apiKey =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!apiKey || !(await validarApiKey(apiKey))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const municipioId = searchParams.get("municipio_id");
  const anio = searchParams.get("anio");

  const svc = createServiceClient();
  let query = svc
    .from("historial_electoral")
    .select("municipio_id, anio, porcentaje_ganador, municipios(nombre)")
    .order("anio", { ascending: false })
    .limit(500);

  if (municipioId) query = query.eq("municipio_id", parseInt(municipioId, 10));
  if (anio) query = query.eq("anio", parseInt(anio, 10));

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    total: data?.length ?? 0,
    filtros: { municipio_id: municipioId, anio },
    generado_at: new Date().toISOString(),
  });
}
