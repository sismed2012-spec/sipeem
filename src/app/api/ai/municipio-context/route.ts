import { streamText } from "ai";
import { MODEL_ANALISIS } from "@/lib/ai";
import { getUsuarioActual } from "@/actions/auth";
import { getMunicipioStrategicFile } from "@/actions/estrategia";
import { getActoresMunicipio } from "@/actions/actores";

export async function POST(req: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { municipioId, messages } = (await req.json()) as {
    municipioId: number;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const [{ estrategia, electoral }, actores] = await Promise.all([
    getMunicipioStrategicFile(municipioId),
    getActoresMunicipio(municipioId),
  ]);

  const nombre = electoral?.summary?.nombre ?? `Municipio ${municipioId}`;
  const timeline = electoral?.timeline?.slice(0, 3) ?? [];
  const t = actores.termometros;

  const systemPrompt = `Eres un analista político estratégico experto en elecciones municipales del Estado de México.
Estás analizando el municipio de ${nombre}.

## DATOS DEL MUNICIPIO

### Estrategia actual
${estrategia ? `- Prioridad: ${estrategia.prioridad}
- Riesgo político: ${estrategia.riesgo}
- Oportunidad: ${estrategia.oportunidad}
- Estatus: ${estrategia.estatus}
- Responsable: ${estrategia.responsable ?? "No asignado"}
- Notas ejecutivas: ${estrategia.notas_ejecutivas ?? "Sin notas"}
- Notas operativas: ${estrategia.notas_operativas ?? "Sin notas"}` : "Sin ficha estratégica registrada."}

### Historial electoral reciente
${timeline.length > 0 ? timeline.map((h) =>
  `- ${h.anio}: Ganó ${h.winnerSiglas} con ${h.porcentaje?.toFixed(1) ?? "?"}% (margen: ${h.margin?.toLocaleString() ?? "?"} votos)`
).join("\n") : "Sin historial electoral disponible."}

### Termómetros políticos (escala 0 a 100)
${t ? `T1=${t.term1} T2=${t.term2} T3=${t.term3} T4=${t.term4} T5=${t.term5}
Promedio: ${((t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5).toFixed(1)}` : "Sin termómetros registrados."}

### Comité municipal
${actores.comite ? `Presidente: ${actores.comite.presidente} | Secretario: ${actores.comite.secretario} | Inaugurado: ${actores.comite.inaugurado ? "Sí" : "No"}` : "Sin comité registrado."}

### Aspirantes registrados (${actores.aspirantes.length})
${actores.aspirantes.slice(0, 5).map((a) =>
  `- ${a.nombre} (${a.cargo_aspirado}, ${a.partido})`
).join("\n") || "Ninguno."}

### Planilla de candidatos (${actores.planilla.length} integrantes)
${actores.planilla.slice(0, 5).map((p) => `- ${p.cargo}: ${p.nombre} (${p.partido})`).join("\n") || "Sin planilla registrada."}

## INSTRUCCIONES
- Responde SIEMPRE en español
- Sé conciso y estratégicamente útil
- Basa tus análisis en los datos anteriores
- Si no hay datos suficientes en alguna área, indícalo
- Usa formato Markdown para respuestas largas`;

  const result = streamText({
    model: MODEL_ANALISIS as any,
    system: systemPrompt,
    messages,
    maxOutputTokens: 1500,
  });

  return result.toUIMessageStreamResponse();
}
