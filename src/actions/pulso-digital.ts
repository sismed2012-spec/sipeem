"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateAnalysis } from "@/lib/ai";
import { buscarWeb } from "@/lib/busqueda-web";

export type PulsoDigital = {
  id: number;
  municipio_id: number;
  query_usada: string;
  sentimiento: string;
  resumen: string;
  fuentes_count?: number;
  generado_por?: string;
  created_at: string;
};

export async function getPulsoDigital(municipioId: number): Promise<PulsoDigital[]> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("pulso_digital")
    .select("*")
    .eq("municipio_id", municipioId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw new Error(error.message);
  return ((data ?? []) as PulsoDigital[]).map((row) => ({
    ...row,
    fuentes_count: typeof row.fuentes_count === "number" ? row.fuentes_count : 0,
  }));
}

export async function analizarPulsoDigital(
  municipioId: number,
  queryPersonalizada?: string
): Promise<PulsoDigital> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();

  const { data: mun } = await svc
    .from("municipios")
    .select("nombre")
    .eq("id", municipioId)
    .single();

  const nombre = mun?.nombre ?? `Municipio ${municipioId}`;
  const query = queryPersonalizada ?? `${nombre} Estado de México política elecciones candidato 2025 2026`;

  let resultados: Awaited<ReturnType<typeof buscarWeb>>;
  try {
    resultados = await buscarWeb(query);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible consultar fuentes web.";
    throw new Error(message);
  }

  const contexto = resultados
    .map((r, i) => `[${i + 1}] ${r.titulo}\n${r.contenido}`)
    .join("\n\n");

  const prompt = `Analiza las siguientes noticias y menciones web sobre el municipio de ${nombre}, Estado de México:

${contexto}

Genera un análisis de pulso digital con:
1. **Sentimiento general**: clasifica como: muy_positivo, positivo, neutro, negativo, o muy_negativo
2. **Resumen ejecutivo** (2-3 párrafos): ¿Qué se dice del municipio/candidato? ¿Qué temas dominan?
3. **Alertas** (si hay noticias negativas relevantes): mencionar brevemente

Formato de respuesta:
SENTIMIENTO: [clasificación]
---
[resumen y análisis]

Máximo 250 palabras. En español.`;

  let analisis: string;
  try {
    analisis = await generateAnalysis(prompt);
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible generar el análisis con IA.";
    throw new Error(`Pulso Digital no pudo generar análisis: ${message}`);
  }

  const sentimientoMatch = analisis.match(/SENTIMIENTO:\s*(\w+)/i);
  const sentimiento = sentimientoMatch?.[1]?.toLowerCase().replace(/\s+/g, "_") ?? "neutro";
  const resumen = analisis.replace(/SENTIMIENTO:.*\n---\n?/i, "").trim();

  const basePayload = {
    municipio_id: municipioId,
    query_usada: query,
    sentimiento: ["muy_positivo", "positivo", "neutro", "negativo", "muy_negativo"].includes(sentimiento)
      ? sentimiento
      : "neutro",
    resumen,
  };

  let data: PulsoDigital | null = null;
  let error: { message: string } | null = null;

  const withOptionalFields = await svc
    .from("pulso_digital")
    .insert({
      ...basePayload,
      generado_por: usuario.email,
      fuentes_count: resultados.length,
    })
    .select("*")
    .single();

  if (
    withOptionalFields.error?.message.includes("fuentes_count") ||
    withOptionalFields.error?.message.includes("generado_por")
  ) {
    const withoutCount = await svc
      .from("pulso_digital")
      .insert({
        ...basePayload,
        generado_por: usuario.email,
      })
      .select("*")
      .single();

    if (withoutCount.error?.message.includes("generado_por")) {
      const fallback = await svc
        .from("pulso_digital")
        .insert(basePayload)
        .select("*")
        .single();
      data = fallback.data as PulsoDigital | null;
      error = fallback.error ? { message: fallback.error.message } : null;
    } else {
      data = withoutCount.data as PulsoDigital | null;
      error = withoutCount.error ? { message: withoutCount.error.message } : null;
    }
  } else {
    data = withOptionalFields.data as PulsoDigital | null;
    error = withOptionalFields.error ? { message: withOptionalFields.error.message } : null;
  }

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return {
    ...(data as PulsoDigital),
    fuentes_count: typeof data?.fuentes_count === "number" ? data.fuentes_count : resultados.length,
  };
}
