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
  const municipioIdValue = municipioId ? parseInt(municipioId, 10) : undefined;
  const anioValue = anio ? parseInt(anio, 10) : undefined;

  const [legacyRes, officialRes] = await Promise.all([
    svc
      .from("historial_electoral")
      .select(
        "id, municipio_id, anio, porcentaje_ganador, votos_ganador, municipios(nombre), partidos!partido_ganador_id(siglas)"
      )
      .order("anio", { ascending: false })
      .limit(500)
      .match({
        ...(municipioIdValue ? { municipio_id: municipioIdValue } : {}),
        ...(anioValue ? { anio: anioValue } : {}),
      }),
    svc
      .from("historial_municipal_oficial")
      .select(
        "id, municipio_id, anio, ganador_porcentaje, ganador_votacion, ganador_siglas, municipios(nombre)"
      )
      .order("anio", { ascending: false })
      .limit(500)
      .match({
        ...(municipioIdValue ? { municipio_id: municipioIdValue } : {}),
        ...(anioValue ? { anio: anioValue } : {}),
      }),
  ]);

  if (legacyRes.error) {
    return NextResponse.json({ error: legacyRes.error.message }, { status: 500 });
  }
  if (officialRes.error) {
    return NextResponse.json({ error: officialRes.error.message }, { status: 500 });
  }

  const merged = new Map<string, Record<string, unknown>>();

  (legacyRes.data ?? []).forEach((row) => {
    const legacyPartySiglas = Array.isArray(row.partidos)
      ? row.partidos[0]?.siglas ?? null
      : (row.partidos as { siglas?: string } | null)?.siglas ?? null;

    merged.set(`${row.municipio_id}:${row.anio}`, {
      municipio_id: row.municipio_id,
      anio: row.anio,
      porcentaje_ganador: row.porcentaje_ganador,
      votos_ganador: row.votos_ganador,
      ganador_siglas: legacyPartySiglas,
      municipios: row.municipios,
      source: "legacy_municipal",
    });
  });

  (officialRes.data ?? []).forEach((row) => {
    merged.set(`${row.municipio_id}:${row.anio}`, {
      municipio_id: row.municipio_id,
      anio: row.anio,
      porcentaje_ganador: row.ganador_porcentaje,
      votos_ganador: row.ganador_votacion,
      ganador_siglas: row.ganador_siglas,
      municipios: row.municipios,
      source: "oficial_municipal",
    });
  });

  const data = Array.from(merged.values()).sort(
    (a, b) => Number(b.anio) - Number(a.anio)
  );

  return NextResponse.json({
    data,
    total: data?.length ?? 0,
    filtros: { municipio_id: municipioId, anio },
    generado_at: new Date().toISOString(),
  });
}
