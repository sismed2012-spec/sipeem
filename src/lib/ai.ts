import { generateText } from "ai";

/** Modelo por defecto para análisis político — ruteado vía AI Gateway */
export const MODEL_ANALISIS = "anthropic/claude-sonnet-4.6";

/** Modelo económico para clasificaciones simples */
export const MODEL_RAPIDO = "anthropic/claude-haiku-4.5";

/**
 * Genera texto (non-streaming) para análisis y briefings.
 * El string "provider/model" es ruteado automáticamente por el AI SDK a través del Vercel AI Gateway.
 */
export async function generateAnalysis(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const { text } = await generateText({
    model: MODEL_ANALISIS as any,
    system:
      systemPrompt ??
      "Eres un analista político experto en elecciones municipales del Estado de México. Eres preciso, conciso y objetivo.",
    prompt,
    maxOutputTokens: 1500,
    temperature: 0.3,
  });
  return text;
}
