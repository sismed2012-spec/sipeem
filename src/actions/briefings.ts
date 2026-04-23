"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateAnalysis } from "@/lib/ai";
import { getMunicipioStrategicFile } from "./estrategia";
import { getActoresMunicipio } from "./actores";

export async function generarBriefing(municipioId: number): Promise<number> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const [{ estrategia, electoral }, actores] = await Promise.all([
    getMunicipioStrategicFile(municipioId),
    getActoresMunicipio(municipioId),
  ]);

  const nombre = electoral?.summary?.nombre ?? `Municipio ${municipioId}`;
  const timeline = electoral?.timeline?.slice(0, 3) ?? [];
  const t = actores.termometros;

  const prompt = `Genera un briefing estratégico ejecutivo para el municipio de ${nombre}, Estado de México.

DATOS DISPONIBLES:
- Estrategia: Prioridad ${estrategia?.prioridad ?? "N/D"}, Riesgo ${estrategia?.riesgo ?? "N/D"}, Oportunidad ${estrategia?.oportunidad ?? "N/D"}, Estatus ${estrategia?.estatus ?? "N/D"}
- Historial reciente: ${timeline.map((h) => `${h.anio}: ${h.winnerSiglas} ${h.porcentaje?.toFixed(1) ?? "?"}%`).join(", ") || "Sin datos"}
- Termómetros: ${t ? `T1=${t.term1} T2=${t.term2} T3=${t.term3} T4=${t.term4} T5=${t.term5} (promedio ${((t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5).toFixed(1)})` : "Sin datos"}
- Comité: ${actores.comite ? `${actores.comite.presidente} / ${actores.comite.secretario}` : "Sin registrar"}
- Aspirantes: ${actores.aspirantes.length} registrados
- Planilla: ${actores.planilla.length} integrantes
- Notas ejecutivas: ${estrategia?.notas_ejecutivas ?? "Sin notas"}
- Notas operativas: ${estrategia?.notas_operativas ?? "Sin notas"}

ESTRUCTURA DEL BRIEFING:
1. **Diagnóstico Ejecutivo** (2-3 párrafos): situación actual, fortalezas y vulnerabilidades clave
2. **Análisis de Riesgos** (lista de 3-5 riesgos con impacto estimado)
3. **Oportunidades Identificadas** (lista de 2-4 oportunidades)
4. **Recomendaciones Estratégicas** (3-5 acciones prioritarias concretas)
5. **Indicadores de Alerta** (2-3 señales de peligro a monitorear)

Sé directo, usa lenguaje político profesional, evita generalidades. Máximo 600 palabras en español.`;

  const contenido = await generateAnalysis(prompt);

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("briefings")
    .insert({ municipio_id: municipioId, contenido, generado_por: usuario.email })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return data.id;
}

export async function getBriefingsMunicipio(municipioId: number) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("briefings")
    .select("id, generado_por, created_at")
    .eq("municipio_id", municipioId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getBriefingById(id: number) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("briefings")
    .select("*, municipios(nombre)")
    .eq("id", id)
    .single();

  if (error) throw new Error(error.message);
  return data;
}
