import { streamText } from "ai";
import { MODEL_ANALISIS } from "@/lib/ai";
import { getUsuarioActual } from "@/actions/auth";
import { getSituacionGlobal } from "@/actions/situacion";

export async function POST(req: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, municipioIds } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    municipioIds?: number[];
  };

  const { municipios } = await getSituacionGlobal();

  const scope =
    municipioIds?.length
      ? municipios.filter((m) => municipioIds.includes(m.id))
      : municipios.slice(0, 8);

  const contexto = scope
    .map(
      (m) =>
        `- ${m.nombre}: proyección=${m.proyeccion ?? "N/D"}/100 nivel=${
          m.proyeccionNivel ?? "?"
        } ` +
        `termómetro=${m.avgTermometro?.toFixed(1) ?? "N/D"} ` +
        `prioridad=${m.prioridad ?? "N/D"} riesgo=${m.riesgo ?? "N/D"} ` +
        `aspirantes=${m.aspirantesCount} planilla=${m.planillaCount}`
    )
    .join("\n");

  const systemPrompt = `Eres un analista político estratégico experto en elecciones municipales del Estado de México.
Tienes acceso a los datos de los siguientes municipios del sistema SIPEEM:

${contexto}

Para preguntas sobre municipios no incluidos en la lista, indica que no tienes datos cargados para ese municipio.
Responde siempre en español. Sé conciso y estratégicamente útil. Usa Markdown para respuestas largas.`;

  const result = streamText({
    model: MODEL_ANALISIS as any,
    system: systemPrompt,
    messages: messages.slice(-8),
    maxOutputTokens: 1500,
  });

  return result.toUIMessageStreamResponse();
}
