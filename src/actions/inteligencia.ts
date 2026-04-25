"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { generateText } from "ai";
import { MODEL_RAPIDO } from "@/lib/ai";
import type { Message } from "@/lib/inteligencia-types";

export async function guardarSintesisIA(
  municipioId: number,
  messages: Message[]
): Promise<number> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol))
    redirect("/login");

  const intercambios = messages
    .filter((m) => m.content.trim())
    .map(
      (m) => `${m.role === "user" ? "Analista" : "IA"}: ${m.content}`
    )
    .join("\n\n");

  const { text: contenido } = await generateText({
    model: MODEL_RAPIDO as any,
    system: "Eres un redactor político. Genera un resumen ejecutivo conciso.",
    prompt: `Resume la siguiente conversación de análisis electoral en un briefing ejecutivo claro y estructurado (máximo 300 palabras). Incluye: tema central, hallazgos clave y recomendaciones mencionadas.\n\n${intercambios}`,
    maxOutputTokens: 600,
  });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("briefings")
    .insert({
      municipio_id: municipioId,
      contenido: `[Síntesis de análisis IA]\n\n${contenido}`,
      generado_por: usuario.email,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return data.id;
}
