"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";

export type ProyeccionMunicipio = {
  municipio_id: number;
  nombre: string;
  puntuacion: number;
  nivel: "bajo" | "medio" | "alto" | "muy_alto";
  score_historial: number;
  score_termometros: number;
  score_cobertura: number;
  score_competencia: number;
};

const RIESGO_SCORE: Record<string, number> = {
  critico: 10, alto: 40, medio: 70, bajo: 100,
};

export async function getProyeccionMunicipios(): Promise<ProyeccionMunicipio[]> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();

  const [configRes, mRes, histRes, termRes, cobRes, compRes] = await Promise.all([
    svc.from("configuracion").select("clave, valor").in("clave", [
      "proyeccion_peso_historial",
      "proyeccion_peso_termometros",
      "proyeccion_peso_cobertura",
      "proyeccion_peso_competencia",
    ]),
    svc.from("municipios").select("id, nombre").eq("estatus", "activo"),
    svc.from("historial_electoral").select("municipio_id, anio, partido_ganador_id").order("anio", { ascending: false }),
    svc.from("termometros").select("municipio_id, term1, term2, term3, term4, term5"),
    svc.from("compromisos_seccion").select("municipio_id, compromisos, meta"),
    svc.from("competencia_municipal").select("municipio_id, riesgo_electoral"),
  ]);

  const configMap: Record<string, number> = {};
  for (const c of configRes.data ?? []) configMap[c.clave] = parseInt(c.valor, 10);

  const pHistorial   = configMap["proyeccion_peso_historial"]   ?? 30;
  const pTermometros = configMap["proyeccion_peso_termometros"] ?? 35;
  const pCobertura   = configMap["proyeccion_peso_cobertura"]   ?? 25;
  const pCompetencia = configMap["proyeccion_peso_competencia"] ?? 10;
  const pesoTotal    = pHistorial + pTermometros + pCobertura + pCompetencia;

  const termMap  = new Map((termRes.data ?? []).map((t) => [t.municipio_id, t]));
  const compMap  = new Map((compRes.data ?? []).map((c) => [c.municipio_id, c.riesgo_electoral as string | null]));

  const cobMunicipio: Record<number, { sum: number; count: number }> = {};
  for (const row of cobRes.data ?? []) {
    if (row.meta > 0) {
      if (!cobMunicipio[row.municipio_id]) cobMunicipio[row.municipio_id] = { sum: 0, count: 0 };
      cobMunicipio[row.municipio_id].sum += (row.compromisos / row.meta) * 100;
      cobMunicipio[row.municipio_id].count += 1;
    }
  }

  const histByMunicipio: Record<number, number[]> = {};
  for (const h of histRes.data ?? []) {
    if (!histByMunicipio[h.municipio_id]) histByMunicipio[h.municipio_id] = [];
    if (histByMunicipio[h.municipio_id].length < 2)
      histByMunicipio[h.municipio_id].push(h.partido_ganador_id);
  }

  const results: ProyeccionMunicipio[] = (mRes.data ?? []).map((m) => {
    const hist = histByMunicipio[m.id] ?? [];
    const score_historial = hist.length >= 2 ? 50 : hist.length === 1 ? 40 : 30;

    const t = termMap.get(m.id);
    const score_termometros = t
      ? (t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5
      : 50;

    const cob = cobMunicipio[m.id];
    const score_cobertura = cob ? cob.sum / cob.count : 0;

    const riesgoAdv = compMap.get(m.id) ?? null;
    const score_competencia = riesgoAdv ? (RIESGO_SCORE[riesgoAdv] ?? 50) : 50;

    const puntuacion = Math.round(
      (score_historial   * pHistorial   +
       score_termometros * pTermometros +
       score_cobertura   * pCobertura   +
       score_competencia * pCompetencia) /
      pesoTotal
    );

    const nivel =
      puntuacion >= 75 ? "muy_alto"
      : puntuacion >= 55 ? "alto"
      : puntuacion >= 35 ? "medio"
      : "bajo";

    return {
      municipio_id: m.id,
      nombre: m.nombre,
      puntuacion,
      nivel,
      score_historial: Math.round(score_historial),
      score_termometros: Math.round(score_termometros),
      score_cobertura: Math.round(score_cobertura),
      score_competencia: Math.round(score_competencia),
    };
  });

  return results.sort((a, b) => b.puntuacion - a.puntuacion);
}
