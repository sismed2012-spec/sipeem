import { streamText } from "ai";
import { MODEL_ANALISIS } from "@/lib/ai";
import { getUsuarioActual } from "@/actions/auth";

export async function POST(req: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { messages, systemPrompt } = (await req.json()) as {
    messages: { role: "user" | "assistant"; content: string }[];
    systemPrompt?: string;
  };

  const result = streamText({
    model: MODEL_ANALISIS,
    system:
      systemPrompt ??
      "Eres un analista político experto en elecciones municipales del Estado de México.",
    messages,
    maxOutputTokens: 2000,
  });

  return result.toUIMessageStreamResponse();
}
