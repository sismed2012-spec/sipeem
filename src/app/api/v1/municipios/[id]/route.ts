import { NextRequest, NextResponse } from "next/server";
import { validarApiKey } from "@/lib/api-keys";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const apiKey =
    req.headers.get("x-api-key") ??
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (!apiKey || !(await validarApiKey(apiKey))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const municipioId = parseInt(id, 10);
  if (isNaN(municipioId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const svc = createServiceClient();
  const [munRes, termRes, aspRes] = await Promise.all([
    svc.from("municipios").select("*").eq("id", municipioId).single(),
    svc
      .from("termometros")
      .select("term1, term2, term3, term4, term5")
      .eq("municipio_id", municipioId)
      .maybeSingle(),
    svc
      .from("aspirantes")
      .select("nombre, cargo_aspirado, partido")
      .eq("municipio_id", municipioId),
  ]);

  if (munRes.error || !munRes.data) {
    return NextResponse.json({ error: "Municipio no encontrado" }, { status: 404 });
  }

  const t = termRes.data;
  const avg_termometro = t
    ? Math.round((t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5)
    : null;

  return NextResponse.json({
    data: {
      ...munRes.data,
      termometros: termRes.data ?? null,
      avg_termometro,
      aspirantes: aspRes.data ?? [],
    },
    generado_at: new Date().toISOString(),
  });
}
