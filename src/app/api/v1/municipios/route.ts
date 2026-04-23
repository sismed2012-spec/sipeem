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

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("municipios")
    .select("id, nombre, color, estatus")
    .eq("estatus", "activo")
    .order("nombre");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    total: data?.length ?? 0,
    generado_at: new Date().toISOString(),
  });
}
