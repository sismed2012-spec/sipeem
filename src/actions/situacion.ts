// src/actions/situacion.ts
"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { getProyeccionMunicipios } from "./proyeccion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type SituacionMunicipio = {
  id: number;
  nombre: string;
  color: string;
  prioridad: string | null;
  riesgo: string | null;
  estatus: string | null;
  responsable: string | null;
  avgTermometro: number | null;
  aspirantesCount: number;
  planillaCount: number;
  urgencyScore: number; // 0-8: sum of prioridad score (1-4) + riesgo score (1-4)
  proyeccion: number | null;
  proyeccionNivel: "bajo" | "medio" | "alto" | "muy_alto" | null;
};

export type SituacionGlobalDTO = {
  municipios: SituacionMunicipio[];
  kpis: {
    total: number;
    conEstrategia: number;
    enRiesgoAlto: number;
    conAspirantes: number;
  };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const PRIORIDAD_SCORE: Record<string, number> = {
  Crítica: 4, Alta: 3, Media: 2, Baja: 1,
};
const RIESGO_SCORE: Record<string, number> = {
  Extremo: 4, Alto: 3, Medio: 2, Bajo: 1,
};

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------
export async function getSituacionGlobal(): Promise<SituacionGlobalDTO> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    redirect("/login");
  }

  const svc = createServiceClient();

  const [mRes, eRes, tRes, aRes, pRes, proyecciones] = await Promise.all([
    svc.from("municipios").select("id, nombre, color").eq("estatus", "activo").order("nombre"),
    svc.from("estrategia_municipal").select("municipio_id, prioridad, riesgo, estatus, responsable"),
    svc.from("termometros").select("municipio_id, term1, term2, term3, term4, term5"),
    svc.from("aspirantes").select("municipio_id"),
    svc.from("planilla").select("municipio_id"),
    getProyeccionMunicipios().catch(() => []),
  ]);

  const firstError = mRes.error ?? eRes.error ?? tRes.error ?? aRes.error ?? pRes.error;
  if (firstError) throw new Error(firstError.message);

  // Build lookup maps
  const estrategiaMap = new Map((eRes.data ?? []).map((e) => [e.municipio_id, e]));
  const termMap = new Map((tRes.data ?? []).map((t) => [t.municipio_id, t]));
  const proyeccionMap = new Map(proyecciones.map((p) => [p.municipio_id, p]));

  const aspirantesCount: Record<number, number> = {};
  for (const a of aRes.data ?? [])
    aspirantesCount[a.municipio_id] = (aspirantesCount[a.municipio_id] ?? 0) + 1;

  const planillaCount: Record<number, number> = {};
  for (const p of pRes.data ?? [])
    planillaCount[p.municipio_id] = (planillaCount[p.municipio_id] ?? 0) + 1;

  const municipios: SituacionMunicipio[] = (mRes.data ?? []).map((m) => {
    const e = estrategiaMap.get(m.id) ?? null;
    const t = termMap.get(m.id) ?? null;
    const avgTermometro = t
      ? (t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5
      : null;
    const urgencyScore = e
      ? (PRIORIDAD_SCORE[e.prioridad] ?? 0) + (RIESGO_SCORE[e.riesgo] ?? 0)
      : 0;

    const proy = proyeccionMap.get(m.id) ?? null;

    return {
      id: m.id,
      nombre: m.nombre,
      color: m.color,
      prioridad: e?.prioridad ?? null,
      riesgo: e?.riesgo ?? null,
      estatus: e?.estatus ?? null,
      responsable: e?.responsable ?? null,
      avgTermometro,
      aspirantesCount: aspirantesCount[m.id] ?? 0,
      planillaCount: planillaCount[m.id] ?? 0,
      urgencyScore,
      proyeccion: proy?.puntuacion ?? null,
      proyeccionNivel: proy?.nivel ?? null,
    };
  });

  // Sort by urgency desc, then nombre asc
  municipios.sort((a, b) => b.urgencyScore - a.urgencyScore || a.nombre.localeCompare(b.nombre));

  const kpis = {
    total: municipios.length,
    conEstrategia: municipios.filter((m) => m.prioridad !== null).length,
    enRiesgoAlto: municipios.filter((m) => m.riesgo === "Alto" || m.riesgo === "Extremo").length,
    conAspirantes: municipios.filter((m) => m.aspirantesCount > 0).length,
  };

  return { municipios, kpis };
}
