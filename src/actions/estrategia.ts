"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { EstrategiaMunicipal, StrategicDashboardDTO } from "@/lib/types";
import { getMunicipioHistorialAnalytics } from "./analytics";
import { logAction } from "@/lib/audit";

async function assertAdmin() {
  const usuario = await getUsuarioActual();
  if (!usuario || (usuario.rol !== "director" && usuario.rol !== "admin")) {
    throw new Error("Privilegios insuficientes para acceder al módulo estratégico");
  }
  return usuario;
}

export async function getStrategicOverview(): Promise<StrategicDashboardDTO> {
  await assertAdmin();
  const service = createServiceClient();

  const { data: municipios, error: munError } = await service
    .from("municipios")
    .select(
      "id, nombre, geo_municipio_id, nombre_oficial_geojson, color, sec_inicio, secciones, regidores, distrito, region, estatus"
    )
    .eq("estatus", "activo")
    .order("nombre");

  if (munError) throw new Error(munError.message);

  const { data: estrategias, error: estError } = await service
    .from("estrategia_municipal")
    .select("*");

  if (estError) throw new Error(estError.message);

  const estMap = new Map<number, EstrategiaMunicipal>();
  estrategias?.forEach((e) => estMap.set(e.municipio_id, e as EstrategiaMunicipal));

  const stats = {
    total: municipios.length,
    pending: 0,
    byPriority: { Baja: 0, Media: 0, Alta: 0, Crítica: 0 } as Record<string, number>,
    byRisk: { Bajo: 0, Medio: 0, Alto: 0, Extremo: 0 } as Record<string, number>,
  };

  const resultMuns = municipios.map((m) => {
    const est = estMap.get(m.id) || null;

    if (!est) {
      stats.pending++;
    } else {
      stats.byPriority[est.prioridad] = (stats.byPriority[est.prioridad] || 0) + 1;
      stats.byRisk[est.riesgo] = (stats.byRisk[est.riesgo] || 0) + 1;
    }

    return { ...m, estrategia: est };
  });

  const municipiosConEstrategia: StrategicDashboardDTO["municipios"] = resultMuns;

  return {
    stats,
    municipios: municipiosConEstrategia,
  };
}

export async function getMunicipioStrategicFile(municipioId: number) {
  await assertAdmin();
  const service = createServiceClient();

  const { data: estrategia, error: estError } = await service
    .from("estrategia_municipal")
    .select("*")
    .eq("municipio_id", municipioId)
    .maybeSingle();

  if (estError) throw new Error(estError.message);

  let electoral = null;
  try {
    electoral = await getMunicipioHistorialAnalytics(municipioId);
  } catch {
    electoral = null;
  }

  return {
    estrategia: estrategia as EstrategiaMunicipal | null,
    electoral,
  };
}

export async function upsertMunicipioStrategicFile(data: Partial<EstrategiaMunicipal>) {
  const usuario = await assertAdmin();
  const service = createServiceClient();

  if (!data.municipio_id) throw new Error("municipio_id es obligatorio");

  const payload = {
    municipio_id: data.municipio_id,
    prioridad: data.prioridad ?? "Media",
    riesgo: data.riesgo ?? "Medio",
    oportunidad: data.oportunidad ?? "Baja",
    notas_ejecutivas: data.notas_ejecutivas ?? null,
    notas_operativas: data.notas_operativas ?? null,
    responsable: data.responsable ?? null,
    estatus: data.estatus ?? "Planeación",
    updated_by: usuario.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = await service
    .from("estrategia_municipal")
    .upsert(payload, {
      onConflict: "municipio_id",
    });

  if (error) throw new Error(error.message);

  revalidatePath("/admin/estrategia-municipal");
  revalidatePath(`/admin/estrategia-municipal/${data.municipio_id}`);
  await logAction({
    action: "upsert",
    entity: "estrategia",
    entityId: data.municipio_id,
    details: { prioridad: data.prioridad, riesgo: data.riesgo, estatus: data.estatus },
  });

  return { success: true };
}
