import { streamText } from "ai";
import { MODEL_ANALISIS } from "@/lib/ai";
import { getUsuarioActual } from "@/actions/auth";
import { getMunicipioStrategicFile } from "@/actions/estrategia";
import { getActoresMunicipio } from "@/actions/actores";
import { createServiceClient } from "@/lib/supabase/service";

export async function POST(req: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { municipioId, messages } = (await req.json()) as {
    municipioId: number;
    messages: { role: "user" | "assistant"; content: string }[];
  };

  const svc = createServiceClient();

  const [[{ estrategia, electoral }, actores], cobRes, compRes, histRes] =
    await Promise.all([
      Promise.all([
        getMunicipioStrategicFile(municipioId),
        getActoresMunicipio(municipioId),
      ]),
      svc
        .from("compromisos_seccion")
        .select("compromisos,meta")
        .eq("municipio_id", municipioId),
      svc
        .from("competencia_municipal")
        .select("riesgo_electoral")
        .eq("municipio_id", municipioId)
        .maybeSingle(),
      svc
        .from("historial_electoral")
        .select("partido_ganador_id")
        .eq("municipio_id", municipioId)
        .order("anio", { ascending: false })
        .limit(2),
    ]);

  const nombre = electoral?.summary?.nombre ?? `Municipio ${municipioId}`;
  const timeline = electoral?.timeline?.slice(0, 3) ?? [];
  const t = actores.termometros;

  // Cobertura de secciones
  const cobRows = cobRes.data ?? [];
  const withMeta = cobRows.filter((r: { meta: number }) => r.meta > 0);
  const coberturaPromedio =
    withMeta.length > 0
      ? withMeta.reduce(
          (acc: number, r: { compromisos: number; meta: number }) =>
            acc + (r.compromisos / r.meta) * 100,
          0
        ) / withMeta.length
      : null;

  // Proyección inline (misma lógica que proyeccion.ts pero sin cargar los 125 municipios)
  const histCount = histRes.data?.length ?? 0;
  const score_historial = histCount >= 2 ? 50 : histCount === 1 ? 40 : 30;
  const score_termometros = t
    ? (t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5
    : 50;
  const score_cobertura = coberturaPromedio ?? 0;
  const RIESGO_SCORE: Record<string, number> = {
    critico: 10,
    alto: 40,
    medio: 70,
    bajo: 100,
  };
  const score_competencia =
    RIESGO_SCORE[compRes.data?.riesgo_electoral ?? ""] ?? 50;
  const puntuacion = Math.round(
    (score_historial * 30 +
      score_termometros * 35 +
      score_cobertura * 25 +
      score_competencia * 10) /
      100
  );
  const nivel =
    puntuacion >= 75
      ? "muy_alto"
      : puntuacion >= 55
      ? "alto"
      : puntuacion >= 35
      ? "medio"
      : "bajo";

  const systemPrompt = `Eres un analista político estratégico experto en elecciones municipales del Estado de México.
Estás analizando el municipio de ${nombre}.

## DATOS DEL MUNICIPIO

### Estrategia actual
${
  estrategia
    ? `- Prioridad: ${estrategia.prioridad}
- Riesgo político: ${estrategia.riesgo}
- Oportunidad: ${estrategia.oportunidad}
- Estatus: ${estrategia.estatus}
- Responsable: ${estrategia.responsable ?? "No asignado"}
- Notas ejecutivas: ${estrategia.notas_ejecutivas ?? "Sin notas"}
- Notas operativas: ${estrategia.notas_operativas ?? "Sin notas"}`
    : "Sin ficha estratégica registrada."
}

### Historial electoral reciente
${
  timeline.length > 0
    ? timeline
        .map(
          (h) =>
            `- ${h.anio}: Ganó ${h.winnerSiglas} con ${
              h.porcentaje?.toFixed(1) ?? "?"
            }% (margen: ${h.margin?.toLocaleString() ?? "?"} votos)`
        )
        .join("\n")
    : "Sin historial electoral disponible."
}

### Termómetros políticos (escala 0 a 100)
${
  t
    ? `T1=${t.term1} T2=${t.term2} T3=${t.term3} T4=${t.term4} T5=${t.term5}
Promedio: ${((t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5).toFixed(1)}`
    : "Sin termómetros registrados."
}

### Comité municipal
${
  actores.comite
    ? `Presidente: ${actores.comite.presidente} | Secretario: ${actores.comite.secretario} | Inaugurado: ${actores.comite.inaugurado ? "Sí" : "No"}`
    : "Sin comité registrado."
}

### Aspirantes registrados (${actores.aspirantes.length})
${
  actores.aspirantes
    .slice(0, 5)
    .map((a) => `- ${a.nombre} (${a.cargo_aspirado}, ${a.partido})`)
    .join("\n") || "Ninguno."
}

### Planilla de candidatos (${actores.planilla.length} integrantes)
${
  actores.planilla
    .slice(0, 5)
    .map((p) => `- ${p.cargo}: ${p.nombre} (${p.partido})`)
    .join("\n") || "Sin planilla registrada."
}

### Proyección electoral
Puntuación: ${puntuacion}/100 — Nivel: ${nivel}
Scores parciales: Historial=${score_historial} Termómetros=${score_termometros.toFixed(
  1
)} Cobertura=${score_cobertura.toFixed(1)} Competencia=${score_competencia}

### Cobertura de secciones
${
  coberturaPromedio !== null
    ? `Promedio: ${coberturaPromedio.toFixed(1)}% compromisos vs meta (${
        withMeta.length
      } secciones con meta asignada)`
    : "Sin datos de cobertura."
}

### Riesgo de competencia
${compRes.data?.riesgo_electoral ?? "Sin clasificar"}

## INSTRUCCIONES
- Responde SIEMPRE en español
- Sé conciso y estratégicamente útil
- Basa tus análisis en los datos anteriores
- Si no hay datos suficientes en alguna área, indícalo
- Usa formato Markdown para respuestas largas`;

  const result = streamText({
    model: MODEL_ANALISIS as any,
    system: systemPrompt,
    messages: messages.slice(-8),
    maxOutputTokens: 1500,
  });

  return result.toUIMessageStreamResponse();
}
