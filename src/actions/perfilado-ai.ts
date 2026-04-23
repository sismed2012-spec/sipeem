"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateAnalysis } from "@/lib/ai";
import { buscarWeb } from "@/lib/busqueda-web";

export async function perfilarAspirante(id: number, municipioId: number): Promise<string> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();

  const { data: aspirante, error } = await svc
    .from("aspirantes")
    .select("nombre, cargo_aspirado, partido")
    .eq("id", id)
    .eq("municipio_id", municipioId)
    .single();

  if (error || !aspirante) throw new Error("Aspirante no encontrado");

  const query = `${aspirante.nombre} ${aspirante.partido} ${aspirante.cargo_aspirado} Estado de México política`;
  const resultados = await buscarWeb(query);

  const contexto = resultados.length > 0
    ? resultados.map((r, i) => `[${i + 1}] ${r.titulo}\n${r.contenido}`).join("\n\n")
    : "No se encontró información pública relevante.";

  const prompt = `Genera un perfil político breve de ${aspirante.nombre}, aspirante a ${aspirante.cargo_aspirado} por ${aspirante.partido} en el Estado de México.

INFORMACIÓN ENCONTRADA EN BÚSQUEDA WEB:
${contexto}

Genera un perfil con:
1. **Trayectoria conocida**: cargos previos, experiencia política o pública identificada
2. **Vínculos políticos**: partido, alianzas, grupos de poder identificados
3. **Presencia pública**: actividad en redes, menciones en medios
4. **Observaciones estratégicas**: fortalezas o riesgos desde perspectiva electoral

IMPORTANTE: Indica claramente si la información es limitada o no verificada. Solo usa información que aparezca en las fuentes proporcionadas. Máximo 200 palabras. En español.`;

  const perfil = await generateAnalysis(prompt);

  await svc
    .from("aspirantes")
    .update({ perfil_ia: perfil, perfil_at: new Date().toISOString() })
    .eq("id", id)
    .eq("municipio_id", municipioId);

  revalidatePath(`/admin/estrategia-municipal/${municipioId}`);
  return perfil;
}
