"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getUsuarioActual } from "./auth";
import { logAction } from "@/lib/audit";
import {
  HistorialElectoral,
  HistorialResultado,
  HistorialElectoralDetalle,
} from "@/lib/types";

async function assertAdmin() {
  const admin = await getUsuarioActual();
  const allowedRoles = ["director", "admin"];

  if (!admin || !allowedRoles.includes(admin.rol)) {
    throw new Error(
      "Acceso denegado: se requieren privilegios administrativos para esta operación"
    );
  }
}

const HISTORIAL_PAGE_SIZE = 20;

type GetHistorialListFilters = {
  municipioId?: number;
  anio?: number;
  partidoGanadorId?: number;
  search?: string;
  page?: number;
};

export type HistorialListResult = {
  records: HistorialElectoralDetalle[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export async function getHistorialList(
  filters: GetHistorialListFilters = {}
): Promise<HistorialListResult> {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No autenticado");

  const service = createServiceClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = HISTORIAL_PAGE_SIZE;

  let query = service
    .from("historial_electoral")
    .select(`
      *,
      municipio:municipios(id, nombre),
      partido_ganador_data:partidos(*)
    `, { count: "exact" })
    .order("anio", { ascending: false })
    .order("municipio_id", { ascending: true });

  if (filters.municipioId) {
    query = query.eq("municipio_id", filters.municipioId);
  }

  if (filters.anio) {
    query = query.eq("anio", filters.anio);
  }

  if (filters.partidoGanadorId) {
    query = query.eq("partido_ganador_id", filters.partidoGanadorId);
  }

  // Determine search strategy before executing the query.
  const searchTerm = filters.search?.trim();
  let yearHandledInDb = false;
  let textSearchActive = false;

  if (searchTerm && !filters.anio) {
    const maybeYear = parseInt(searchTerm, 10);
    if (!isNaN(maybeYear) && String(maybeYear) === searchTerm) {
      // 4-digit year: resolve entirely in DB, no in-memory pass needed.
      query = query.eq("anio", maybeYear);
      yearHandledInDb = true;
    } else {
      // Partido / municipio text search: handled in-memory after fetching all matches.
      // DB-level .range() is skipped so no results are cut before the filter runs.
      textSearchActive = true;
    }
  }

  // Apply DB-level pagination only when all filtering is DB-native.
  if (!textSearchActive) {
    const from = (page - 1) * pageSize;
    query = query.range(from, from + pageSize - 1);
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  let results = (data ?? []).map((row: any) => ({
    ...row,
    partido_ganador: row.partido_ganador_data,
  })) as HistorialElectoralDetalle[];

  // In-memory filter + local pagination for partido / municipio text searches.
  if (textSearchActive && searchTerm) {
    const s = searchTerm.toLowerCase();
    results = results.filter((h) =>
      (h.municipio?.nombre?.toLowerCase() ?? "").includes(s) ||
      (h.partido_ganador?.nombre?.toLowerCase() ?? "").includes(s) ||
      (h.partido_ganador?.siglas?.toLowerCase() ?? "").includes(s)
    );
    const total = results.length;
    const from = (page - 1) * pageSize;
    return {
      records: results.slice(from, from + pageSize),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  const total = count ?? 0;
  return {
    records: results,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function getHistorialById(id: number | string) {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No autenticado");

  const service = createServiceClient();

  const { data: main, error: mainError } = await service
    .from("historial_electoral")
    .select(`
      *,
      municipio:municipios(id, nombre),
      partido_ganador_data:partidos(*)
    `)
    .eq("id", id)
    .single();

  if (mainError) throw new Error(mainError.message);

  const { data: results, error: resultsError } = await service
    .from("historial_electoral_resultados")
    .select(`
      *,
      partido:partidos(*)
    `)
    .eq("historial_id", id)
    .order("posicion", { ascending: true })
    .order("votos", { ascending: false });

  if (resultsError) throw new Error(resultsError.message);

  return {
    ...main,
    partido_ganador: (main as any).partido_ganador_data,
    resultados: (results ?? []) as (HistorialResultado & {
      partido: HistorialElectoralDetalle["partido_ganador"];
    })[],
  } as HistorialElectoralDetalle;
}

export async function upsertHistorialManual(
  mainData: HistorialElectoral,
  resultados: Partial<HistorialResultado>[]
) {
  await assertAdmin();
  const service = createServiceClient();

  if (!mainData.municipio_id) throw new Error("Municipio requerido");
  if (!mainData.anio) throw new Error("Año requerido");
  if (!mainData.partido_ganador_id) throw new Error("Partido ganador requerido");

  const partidosIds = resultados
    .map((r) => r.partido_id)
    .filter((id): id is number => typeof id === "number" && id > 0);

  if (new Set(partidosIds).size !== partidosIds.length) {
    throw new Error("No puede haber partidos repetidos en los resultados");
  }

  const { data: party, error: partyError } = await service
    .from("partidos")
    .select("siglas")
    .eq("id", mainData.partido_ganador_id)
    .single();

  if (partyError || !party?.siglas) {
    throw new Error("No se pudo resolver la sigla del partido ganador");
  }

  const legacyValue = party.siglas;

  const payloadMain = {
    municipio_id: mainData.municipio_id,
    anio: mainData.anio,
    partido_ganador_id: mainData.partido_ganador_id,
    partido_ganador: legacyValue,
    votos_ganador: mainData.votos_ganador,
    porcentaje_ganador: mainData.porcentaje_ganador,
    fuente: mainData.fuente || null,
    notas: mainData.notas || null,
  };

  let historialId = mainData.id;

  if (historialId) {
    const { error: updateError } = await service
      .from("historial_electoral")
      .update(payloadMain)
      .eq("id", historialId);

    if (updateError) {
      throw new Error(`Error actualizando cabecera: ${updateError.message}`);
    }
  } else {
    const { data: inserted, error: insertError } = await service
      .from("historial_electoral")
      .insert(payloadMain)
      .select("id")
      .single();

    if (insertError) {
      throw new Error(`Error creando cabecera: ${insertError.message}`);
    }

    historialId = inserted.id;
  }

  const { error: deleteError } = await service
    .from("historial_electoral_resultados")
    .delete()
    .eq("historial_id", historialId);

  if (deleteError) {
    throw new Error(
      `Error limpiando resultados previos: ${deleteError.message}`
    );
  }

  const payloadResultados = resultados
    .filter(
      (r): r is Partial<HistorialResultado> & { partido_id: number } =>
        typeof r.partido_id === "number" && r.partido_id > 0
    )
    .filter((r) => Number(r.votos ?? 0) >= 0)
    .map((r, index) => ({
      historial_id: historialId!,
      partido_id: r.partido_id,
      votos: r.votos || 0,
      porcentaje: r.porcentaje || 0,
      posicion: r.posicion || index + 1,
    }));

  if (payloadResultados.length > 0) {
    const { error: bulkError } = await service
      .from("historial_electoral_resultados")
      .insert(payloadResultados);

    if (bulkError) {
      throw new Error(
        `Error indexando resultados de partidos: ${bulkError.message}`
      );
    }
  }

  revalidatePath("/admin/historial");
  revalidatePath("/admin");

  if (mainData.id) {
    revalidatePath(`/admin/historial/${mainData.id}`);
  }

  await logAction({
    action: "upsert",
    entity: "historial",
    entityId: mainData.municipio_id,
    details: { anio: mainData.anio },
  });

  return { success: true, id: historialId };
}