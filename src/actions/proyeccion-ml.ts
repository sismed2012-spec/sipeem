"use server";

import * as ss from "simple-statistics";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { redirect } from "next/navigation";

export type ProyeccionMLMunicipio = {
  municipio_id: number;
  nombre: string;
  margen_tendencia: number;
  r_squared: number;
  score_combinado: number;
  confianza: "baja" | "media" | "alta";
};

export async function getProyeccionML(): Promise<ProyeccionMLMunicipio[]> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["director", "admin"].includes(usuario.rol)) redirect("/login");

  const svc = createServiceClient();

  const [mRes, histRes, termRes] = await Promise.all([
    svc.from("municipios").select("id, nombre").eq("estatus", "activo"),
    svc.from("historial_electoral")
      .select("municipio_id, anio, porcentaje_ganador")
      .order("anio"),
    svc.from("termometros").select("municipio_id, term1, term2, term3, term4, term5"),
  ]);

  const termMap = new Map((termRes.data ?? []).map((t) => [t.municipio_id, t]));

  const histByMunicipio = new Map<number, { anio: number; pct: number }[]>();
  for (const row of histRes.data ?? []) {
    if (!histByMunicipio.has(row.municipio_id))
      histByMunicipio.set(row.municipio_id, []);
    histByMunicipio.get(row.municipio_id)!.push({ anio: row.anio, pct: row.porcentaje_ganador });
  }

  const results: ProyeccionMLMunicipio[] = (mRes.data ?? []).map((m) => {
    const hist = histByMunicipio.get(m.id) ?? [];
    const t = termMap.get(m.id);

    let margen_tendencia = 0;
    let r_squared = 0;
    let confianza: "baja" | "media" | "alta" = "baja";

    if (hist.length >= 3) {
      const points: [number, number][] = hist.map((h) => [h.anio, h.pct]);
      try {
        const regression = ss.linearRegression(points);
        const line = ss.linearRegressionLine(regression);

        const lastAnio = Math.max(...hist.map((h) => h.anio));
        const proyectedPct = line(lastAnio + 3);
        margen_tendencia = Math.max(0, Math.min(100, proyectedPct));

        r_squared = ss.rSquared(points, line);
        r_squared = Math.max(0, Math.min(1, r_squared));

        confianza =
          hist.length >= 5 && r_squared > 0.6
            ? "alta"
            : hist.length >= 3 && r_squared > 0.3
            ? "media"
            : "baja";
      } catch {
        margen_tendencia = ss.mean(hist.map((h) => h.pct));
      }
    } else if (hist.length > 0) {
      margen_tendencia = ss.mean(hist.map((h) => h.pct));
    }

    const avgTerm = t
      ? (t.term1 + t.term2 + t.term3 + t.term4 + t.term5) / 5
      : 50;

    const score_combinado = Math.round(margen_tendencia * 0.6 + avgTerm * 0.4);

    return {
      municipio_id: m.id,
      nombre: m.nombre,
      margen_tendencia: Math.round(margen_tendencia * 10) / 10,
      r_squared: Math.round(r_squared * 100) / 100,
      score_combinado: Math.min(100, Math.max(0, score_combinado)),
      confianza,
    };
  });

  return results.sort((a, b) => b.score_combinado - a.score_combinado);
}
