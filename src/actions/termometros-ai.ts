"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateAnalysis } from "@/lib/ai";

export async function interpretarTermometros(municipioId: number): Promise<string> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();
  const { data: t, error } = await svc
    .from("termometros")
    .select("term1, term2, term3, term4, term5")
    .eq("municipio_id", municipioId)
    .single();

  if (error || !t) throw new Error("No hay termómetros registrados para este municipio");

  const promedio = (t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5;

  const prompt = `Analiza los siguientes termómetros políticos de un municipio del Estado de México.

Los termómetros miden 5 dimensiones estratégicas clave (cada uno en escala de 0 a 100):
- T1: ${t.term1} — Fortaleza organizacional interna
- T2: ${t.term2} — Competitividad electoral percibida
- T3: ${t.term3} — Presencia territorial y cobertura
- T4: ${t.term4} — Movilización y activismo
- T5: ${t.term5} — Imagen pública del candidato/partido
- Promedio general: ${promedio.toFixed(1)}

Genera un diagnóstico político conciso con:
1. **Diagnóstico global** (1 párrafo): ¿Qué sugiere esta combinación de termómetros?
2. **Fortalezas y debilidades críticas** (máximo 2 de cada una)
3. **Recomendación táctica inmediata** (1 acción concreta para mejorar el indicador más bajo)

Sé específico, usa lenguaje político operativo, máximo 200 palabras. En español.`;

  const diagnostico = await generateAnalysis(prompt);

  await svc
    .from("termometros")
    .update({ diagnostico_ia: diagnostico, diagnostico_at: new Date().toISOString() })
    .eq("municipio_id", municipioId);

  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return diagnostico;
}
