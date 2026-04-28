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

type PartyRow = {
  id: number;
  siglas: string;
  nombre: string;
  color: string;
  estatus: "activo" | "inactivo";
};

type LegacyHeaderRow = {
  id: number;
  municipio_id: number;
  anio: number;
  votos_ganador: number;
  porcentaje_ganador: number;
  fuente?: string | null;
  notas?: string | null;
  municipio:
    | { id: number; nombre: string }
    | { id: number; nombre: string }[]
    | null;
  partido_ganador_data: PartyRow | PartyRow[] | null;
};

type OfficialHeaderRow = {
  id: number;
  municipio_id: number;
  anio: number;
  ganador_siglas: string | null;
  ganador_votacion: number;
  ganador_porcentaje: number;
  fuente?: string | null;
  segundo_siglas?: string | null;
  segundo_votacion?: number | null;
  segundo_porcentaje?: number | null;
  margen_votos?: number | null;
  margen_porcentual?: number | null;
  municipio:
    | { id: number; nombre: string }
    | { id: number; nombre: string }[]
    | null;
};

function normalizeJoin<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function fallbackParty(siglas: string | null): PartyRow {
  return {
    id: 0,
    siglas: siglas ?? "N/A",
    nombre: siglas ?? "N/A",
    color: "#94a3b8",
    estatus: "activo",
  };
}

export async function getHistorialList(
  filters: GetHistorialListFilters = {}
): Promise<HistorialListResult> {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No autenticado");

  const service = createServiceClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = HISTORIAL_PAGE_SIZE;

  const [{ data: parties, error: partiesError }, legacyRes, officialRes] =
    await Promise.all([
      service.from("partidos").select("id, siglas, nombre, color, estatus"),
      service
        .from("historial_electoral")
        .select(
          `
          id, municipio_id, anio, votos_ganador, porcentaje_ganador, fuente, notas,
          municipio:municipios(id, nombre),
          partido_ganador_data:partidos(id, siglas, nombre, color, estatus)
        `
        )
        .order("anio", { ascending: false })
        .order("municipio_id", { ascending: true }),
      service
        .from("historial_municipal_oficial")
        .select(
          `
          id, municipio_id, anio, ganador_siglas, ganador_votacion, ganador_porcentaje, fuente,
          segundo_siglas, segundo_votacion, segundo_porcentaje, margen_votos, margen_porcentual,
          municipio:municipios(id, nombre)
        `
        )
        .order("anio", { ascending: false })
        .order("municipio_id", { ascending: true }),
    ]);

  if (partiesError) throw new Error(partiesError.message);
  if (legacyRes.error) throw new Error(legacyRes.error.message);
  if (officialRes.error) throw new Error(officialRes.error.message);

  const partyMap = new Map(
    ((parties ?? []) as PartyRow[]).map((party) => [party.siglas, party])
  );
  const selectedPartyId = filters.partidoGanadorId ?? null;

  const legacyRecords = ((legacyRes.data ?? []) as LegacyHeaderRow[]).map((row) => {
    const municipio = normalizeJoin(row.municipio);
    const partido = normalizeJoin(row.partido_ganador_data);
    return {
      id: row.id,
      municipio_id: row.municipio_id,
      anio: row.anio,
      partido_ganador_id: partido?.id ?? null,
      votos_ganador: row.votos_ganador,
      porcentaje_ganador: row.porcentaje_ganador,
      fuente: row.fuente ?? null,
      notas: row.notas ?? null,
      municipio: municipio ? { nombre: municipio.nombre } : undefined,
      partido_ganador: partido ?? undefined,
      source: "legacy_municipal" as const,
      canEdit: true,
    } satisfies HistorialElectoralDetalle;
  });

  const officialRecords = ((officialRes.data ?? []) as OfficialHeaderRow[]).map((row) => {
    const municipio = normalizeJoin(row.municipio);
    const partido = row.ganador_siglas
      ? partyMap.get(row.ganador_siglas) ?? fallbackParty(row.ganador_siglas)
      : fallbackParty(null);

    const segundoPartido = row.segundo_siglas
      ? partyMap.get(row.segundo_siglas) ?? fallbackParty(row.segundo_siglas)
      : null;

    return {
      id: row.id,
      municipio_id: row.municipio_id,
      anio: row.anio,
      partido_ganador_id: partido.id || null,
      votos_ganador: row.ganador_votacion,
      porcentaje_ganador: row.ganador_porcentaje,
      fuente: row.fuente ?? null,
      notas: "Capa municipal oficial prioritaria",
      municipio: municipio ? { nombre: municipio.nombre } : undefined,
      partido_ganador: partido,
      source: "oficial_municipal" as const,
      canEdit: false,
      segundo_lugar: segundoPartido
        ? {
            siglas: segundoPartido.siglas,
            color: segundoPartido.color,
            votos: row.segundo_votacion ?? 0,
            porcentaje: row.segundo_porcentaje ?? 0,
          }
        : null,
      margen_votos: row.margen_votos ?? null,
      margen_porcentual: row.margen_porcentual ?? null,
    } satisfies HistorialElectoralDetalle;
  });

  const mergedByKey = new Map<string, HistorialElectoralDetalle>();
  [...legacyRecords, ...officialRecords].forEach((record) => {
    const key = `${record.municipio_id}:${record.anio}`;
    const existing = mergedByKey.get(key);
    if (!existing || record.source === "oficial_municipal") {
      mergedByKey.set(key, record);
    }
  });

  // Enrich legacy records with second-place data via bulk fetch
  const legacyIds = Array.from(mergedByKey.values())
    .filter((r) => r.source === "legacy_municipal" && r.segundo_lugar === undefined)
    .map((r) => r.id)
    .filter((id): id is number => typeof id === "number");

  if (legacyIds.length > 0) {
    const { data: segundos } = await service
      .from("historial_electoral_resultados")
      .select("historial_id, votos, porcentaje, partido:partidos(id, siglas, nombre, color)")
      .in("historial_id", legacyIds)
      .eq("posicion", 2);

    if (segundos && segundos.length > 0) {
      const segundoMap = new Map<number, { siglas: string; color: string; votos: number; porcentaje: number }>();
      for (const row of segundos as Array<{
        historial_id: number;
        votos: number;
        porcentaje: number;
        partido: { id: number; siglas: string; color: string } | { id: number; siglas: string; color: string }[] | null;
      }>) {
        const partido = normalizeJoin(row.partido);
        if (partido) {
          segundoMap.set(row.historial_id, {
            siglas: partido.siglas,
            color: partido.color,
            votos: row.votos,
            porcentaje: row.porcentaje,
          });
        }
      }

      for (const [key, record] of mergedByKey) {
        if (record.source === "legacy_municipal" && record.id && segundoMap.has(record.id)) {
          const seg = segundoMap.get(record.id)!;
          mergedByKey.set(key, {
            ...record,
            segundo_lugar: seg,
            margen_votos: record.votos_ganador - seg.votos,
            margen_porcentual: record.porcentaje_ganador - seg.porcentaje,
          });
        }
      }
    }
  }

  let records = Array.from(mergedByKey.values());

  if (filters.municipioId) {
    records = records.filter((record) => record.municipio_id === filters.municipioId);
  }

  if (filters.anio) {
    records = records.filter((record) => record.anio === filters.anio);
  }

  if (selectedPartyId) {
    records = records.filter(
      (record) => record.partido_ganador_id === selectedPartyId
    );
  }

  const searchTerm = filters.search?.trim().toLowerCase();
  if (searchTerm) {
    const maybeYear = parseInt(searchTerm, 10);
    if (!Number.isNaN(maybeYear) && String(maybeYear) === searchTerm) {
      records = records.filter((record) => record.anio === maybeYear);
    } else {
      records = records.filter((record) => {
        const municipio = record.municipio?.nombre?.toLowerCase() ?? "";
        const partidoNombre =
          record.partido_ganador?.nombre?.toLowerCase() ?? "";
        const partidoSiglas =
          record.partido_ganador?.siglas?.toLowerCase() ?? "";
        return (
          municipio.includes(searchTerm) ||
          partidoNombre.includes(searchTerm) ||
          partidoSiglas.includes(searchTerm)
        );
      });
    }
  }

  records.sort(
    (a, b) =>
      b.anio - a.anio ||
      a.municipio_id - b.municipio_id ||
      (a.source === "oficial_municipal" ? -1 : 1)
  );

  const total = records.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * pageSize;

  return {
    records: records.slice(from, from + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
  };
}

export async function getHistorialById(id: number | string) {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No autenticado");

  const service = createServiceClient();

  const { data: main, error: mainError } = await service
    .from("historial_electoral")
    .select(
      `
      *,
      municipio:municipios(id, nombre),
      partido_ganador_data:partidos(*)
    `
    )
    .eq("id", id)
    .single();

  if (mainError) throw new Error(mainError.message);

  const { data: results, error: resultsError } = await service
    .from("historial_electoral_resultados")
    .select(
      `
      *,
      partido:partidos(*)
    `
    )
    .eq("historial_id", id)
    .order("posicion", { ascending: true })
    .order("votos", { ascending: false });

  if (resultsError) throw new Error(resultsError.message);

  const mainRow = main as HistorialElectoralDetalle & {
    partido_ganador_data?: HistorialElectoralDetalle["partido_ganador"];
  };

  return {
    ...mainRow,
    partido_ganador: mainRow.partido_ganador_data,
    source: "legacy_municipal",
    canEdit: true,
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

  const payloadMain = {
    municipio_id: mainData.municipio_id,
    anio: mainData.anio,
    partido_ganador_id: mainData.partido_ganador_id,
    partido_ganador: party.siglas,
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
