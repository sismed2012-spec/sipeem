"use server";

import * as XLSX from "@e965/xlsx";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";

export async function exportMunicipiosExcel(): Promise<string> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();

  const [mRes, eRes, tRes, aRes, pRes] = await Promise.all([
    svc.from("municipios").select("id, nombre, distrito, region").eq("estatus", "activo").order("nombre"),
    svc.from("estrategia_municipal").select("municipio_id, prioridad, riesgo, oportunidad, estatus, responsable"),
    svc.from("termometros").select("municipio_id, term1, term2, term3, term4, term5"),
    svc.from("aspirantes").select("municipio_id"),
    svc.from("planilla").select("municipio_id"),
  ]);

  const eMap = new Map((eRes.data ?? []).map((e) => [e.municipio_id, e]));
  const tMap = new Map((tRes.data ?? []).map((t) => [t.municipio_id, t]));
  const aspCount: Record<number, number> = {};
  for (const a of aRes.data ?? []) aspCount[a.municipio_id] = (aspCount[a.municipio_id] ?? 0) + 1;
  const planCount: Record<number, number> = {};
  for (const p of pRes.data ?? []) planCount[p.municipio_id] = (planCount[p.municipio_id] ?? 0) + 1;

  const rows = (mRes.data ?? []).map((m) => {
    const e = eMap.get(m.id);
    const t = tMap.get(m.id);
    return {
      "Municipio": m.nombre,
      "Distrito": m.distrito ?? "",
      "Región": m.region ?? "",
      "Prioridad": e?.prioridad ?? "Sin ficha",
      "Riesgo": e?.riesgo ?? "Sin ficha",
      "Oportunidad": e?.oportunidad ?? "",
      "Estatus": e?.estatus ?? "",
      "Responsable": e?.responsable ?? "",
      "Fortaleza organizacional interna": t?.term1 ?? "",
      "Competitividad electoral percibida": t?.term2 ?? "",
      "Presencia territorial y cobertura": t?.term3 ?? "",
      "Movilización y activismo": t?.term4 ?? "",
      "Imagen pública candidato/partido": t?.term5 ?? "",
      "Promedio Termómetros": t ? ((t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5).toFixed(1) : "",
      "Aspirantes": aspCount[m.id] ?? 0,
      "Planilla": planCount[m.id] ?? 0,
    };
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Municipios");

  const buf = XLSX.write(wb, { bookType: "xlsx", type: "base64" }) as string;
  return buf;
}
