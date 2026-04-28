"use server";

import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";
import { generateAnalysis } from "@/lib/ai";

export type AnomaliaDetectada = {
  municipio_id: number;
  municipio_nombre: string;
  tipo: "salto_participacion" | "margen_extremo" | "alternancia_rapida" | "volatilidad_alta";
  descripcion: string;
  severidad: "media" | "alta" | "critica";
  anio_referencia: number;
  valor_observado: number;
  valor_esperado: number;
};

export type ReporteAnomalias = {
  anomalias: AnomaliaDetectada[];
  interpretacion_ia: string;
  generado_at: string;
};

type HistorialAnomaliaRow = {
  municipio_id: number;
  anio: number;
  porcentaje_ganador: number;
  municipios: { nombre: string }[] | null;
};

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

export async function detectarAnomalias(): Promise<ReporteAnomalias> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();

  const { data: historial, error } = await svc
    .from("historial_electoral")
    .select("municipio_id, anio, porcentaje_ganador, municipios(nombre)")
    .order("municipio_id")
    .order("anio");

  if (error) throw new Error(error.message);

  // Group by municipio
  const byMunicipio = new Map<number, { nombre: string; records: { anio: number; pct: number }[] }>();
  for (const row of (historial ?? []) as HistorialAnomaliaRow[]) {
    if (!byMunicipio.has(row.municipio_id)) {
      byMunicipio.set(row.municipio_id, {
        nombre:
          normalizeJoin(row.municipios)?.nombre ??
          `Municipio ${row.municipio_id}`,
        records: [],
      });
    }
    byMunicipio.get(row.municipio_id)!.records.push({ anio: row.anio, pct: row.porcentaje_ganador });
  }

  const anomalias: AnomaliaDetectada[] = [];

  for (const [municipio_id, { nombre, records }] of byMunicipio) {
    if (records.length < 2) continue;

    const pcts = records.map((r) => r.pct);
    const mean = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const variance = pcts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pcts.length;
    const stddev = Math.sqrt(variance);

    // Detect extreme margins (>2.5 stddev from mean)
    for (const record of records) {
      const zScore = stddev > 0 ? Math.abs(record.pct - mean) / stddev : 0;
      if (zScore > 2.5) {
        anomalias.push({
          municipio_id,
          municipio_nombre: nombre,
          tipo: "margen_extremo",
          descripcion: `Porcentaje ganador ${record.pct.toFixed(1)}% en ${record.anio} es ${zScore.toFixed(1)} desviaciones estándar de la media (${mean.toFixed(1)}%)`,
          severidad: zScore > 3.5 ? "critica" : "alta",
          anio_referencia: record.anio,
          valor_observado: record.pct,
          valor_esperado: mean,
        });
      }
    }

    // Detect extremely competitive last election
    if (records.length >= 4) {
      const lastPct = records[records.length - 1].pct;
      if (lastPct < 35) {
        anomalias.push({
          municipio_id,
          municipio_nombre: nombre,
          tipo: "margen_extremo",
          descripcion: `Última elección ganada con solo ${lastPct.toFixed(1)}% — municipio extremadamente competitivo`,
          severidad: lastPct < 30 ? "critica" : "alta",
          anio_referencia: records[records.length - 1].anio,
          valor_observado: lastPct,
          valor_esperado: mean,
        });
      }
    }
  }

  // Sort by severidad
  const order: Record<string, number> = { critica: 0, alta: 1, media: 2 };
  anomalias.sort((a, b) => order[a.severidad] - order[b.severidad]);

  // AI interpretation of top anomalies
  let interpretacion_ia = "Sin anomalías significativas detectadas en el historial electoral.";
  if (anomalias.length > 0) {
    const top5 = anomalias.slice(0, 5);
    const prompt = `Analiza las siguientes anomalías detectadas en el historial electoral del Estado de México:

${top5.map((a, i) => `${i + 1}. [${a.severidad.toUpperCase()}] ${a.municipio_nombre}: ${a.descripcion}`).join("\n")}

Genera una interpretación estratégica breve (máximo 150 palabras) que explique:
- ¿Qué patrones generales revelan estas anomalías?
- ¿Cuáles representan mayor riesgo o oportunidad?
- 1-2 recomendaciones de monitoreo

En español, tono analítico.`;

    interpretacion_ia = await generateAnalysis(prompt);
  }

  return {
    anomalias,
    interpretacion_ia,
    generado_at: new Date().toISOString(),
  };
}
