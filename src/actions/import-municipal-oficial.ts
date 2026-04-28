"use server";

import { revalidatePath } from "next/cache";
import { read as xlsxRead, utils as xlsxUtils } from "@e965/xlsx";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildMunicipalOfficialRow,
  getMunicipalOfficialHeaderErrors,
  isMunicipalOfficialNoteRow,
  isMunicipalOfficialTotalsRow,
  MUNICIPAL_OFFICIAL_FIRST_DATA_ROW_INDEX,
  MUNICIPAL_OFFICIAL_FORCE_KEYS,
} from "@/lib/historial-municipal-oficial";
import { getAllFuerzas2024CatalogSeeds } from "@/lib/historial-seccion-consolidation";
import type {
  HistorialMunicipalOficialImportPreviewRow,
  HistorialMunicipalOficialImportResult,
  HistorialSeccionResultadoPreview,
} from "@/lib/types";

async function assertDirector() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("No autenticado");

  const { data: usuario } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .single();

  if (!usuario || usuario.rol !== "director") {
    throw new Error("Acceso denegado: se requiere rol director");
  }
}

type MunicipioLookup = {
  id: number;
  nombre: string;
  geo_municipio_id: number | null;
  nombre_oficial_geojson: string | null;
};

type ExistingMunicipalOfficial = {
  id: number;
  municipio_id: number;
  anio: number;
};

function buildPreviewForceRows(
  fuerzas: Record<string, number>
): HistorialSeccionResultadoPreview[] {
  return MUNICIPAL_OFFICIAL_FORCE_KEYS.map((fuerza) => ({
    fuerza,
    votos: fuerzas[fuerza] ?? 0,
  }))
    .filter((entry) => entry.votos > 0)
    .sort((a, b) => b.votos - a.votos || a.fuerza.localeCompare(b.fuerza));
}

function validateMunicipalTotals(params: {
  votos_validos: number;
  votos_no_registrados: number;
  votos_nulos: number;
  total_votos: number;
  fuerza_resultados: HistorialSeccionResultadoPreview[];
}): string[] {
  const errors: string[] = [];
  const sumFuerzas = params.fuerza_resultados.reduce(
    (sum, fuerza) => sum + fuerza.votos,
    0
  );
  if (sumFuerzas !== params.votos_validos) {
    errors.push(
      `La suma de fuerzas (${sumFuerzas}) no coincide con VOTOS VALIDOS (${params.votos_validos})`
    );
  }

  const recomputedTotal =
    params.votos_validos + params.votos_no_registrados + params.votos_nulos;
  if (recomputedTotal !== params.total_votos) {
    errors.push(
      `TOTAL VOTOS (${params.total_votos}) no coincide con validos + no registrados + nulos (${recomputedTotal})`
    );
  }

  return errors;
}

async function ensureFuerzasCatalog() {
  const service = createServiceClient();
  const { error } = await service
    .from("partidos")
    .upsert(getAllFuerzas2024CatalogSeeds(), { onConflict: "siglas" });

  if (error) {
    throw new Error(
      `No se pudo garantizar el catalogo de fuerzas 2024: ${error.message}`
    );
  }
}

export async function parseHistorialMunicipalOficialXLSX(formData: FormData): Promise<{
  rows: HistorialMunicipalOficialImportPreviewRow[];
  globalErrors: string[];
}> {
  await assertDirector();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { rows: [], globalErrors: ["No se recibio un archivo XLSX"] };
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const workbook = xlsxRead(fileBytes, { type: "array", raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const aoa = xlsxUtils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  const headers = aoa[7] ?? [];
  const globalErrors = getMunicipalOfficialHeaderErrors(headers);
  if (globalErrors.length > 0) {
    return { rows: [], globalErrors };
  }

  const rows: HistorialMunicipalOficialImportPreviewRow[] = [];

  for (
    let index = MUNICIPAL_OFFICIAL_FIRST_DATA_ROW_INDEX;
    index < aoa.length;
    index++
  ) {
    const row = aoa[index] ?? [];
    const municipioNombre = String(row[1] ?? "").trim();

    if (!municipioNombre) continue;
    if (isMunicipalOfficialNoteRow(municipioNombre)) continue;

    const parsed = buildMunicipalOfficialRow(row);
    if (
      parsed.geo_municipio_id <= 0 ||
      isMunicipalOfficialTotalsRow(parsed.municipio_nombre)
    ) {
      continue;
    }

    const fuerza_resultados = buildPreviewForceRows(parsed.fuerzas);
    const errors = validateMunicipalTotals({
      votos_validos: parsed.votos_validos,
      votos_no_registrados: parsed.votos_no_registrados,
      votos_nulos: parsed.votos_nulos,
      total_votos: parsed.total_votos,
      fuerza_resultados,
    });

    if (!parsed.geo_municipio_id) {
      errors.push("ID_MUNICIPIO no valido");
    }

    if (!parsed.municipio_nombre) {
      errors.push("MUNICIPIO vacio");
    }

    rows.push({
      row_index: index + 1,
      anio: 2024,
      municipio_id: null,
      geo_municipio_id: parsed.geo_municipio_id,
      municipio_nombre: parsed.municipio_nombre,
      total_secciones: parsed.total_secciones,
      total_casillas: parsed.total_casillas,
      total_casillas_mec: parsed.total_casillas_mec,
      lista_nominal: parsed.lista_nominal,
      votos_validos: parsed.votos_validos,
      votos_no_registrados: parsed.votos_no_registrados,
      votos_nulos: parsed.votos_nulos,
      total_votos: parsed.total_votos,
      participacion_ciudadana: parsed.participacion_ciudadana,
      ganador_siglas: parsed.ganador_siglas,
      ganador_votacion: parsed.ganador_votacion,
      ganador_porcentaje: parsed.ganador_porcentaje,
      segundo_siglas: parsed.segundo_siglas,
      segundo_votacion: parsed.segundo_votacion,
      segundo_porcentaje: parsed.segundo_porcentaje,
      margen_votos: parsed.margen_votos,
      margen_porcentual: parsed.margen_porcentual,
      ruta_acta: parsed.ruta_acta,
      fuente: "import_xlsx_2024_see_ayun_mex_muncand",
      raw_municipio_nombre: parsed.municipio_nombre,
      fuerza_resultados,
      status: "pendiente",
      statusLabel: "Pendiente",
      warnings: [],
      errors,
    });
  }

  return { rows, globalErrors: [] };
}

export async function previewHistorialMunicipalOficialImport(
  rows: HistorialMunicipalOficialImportPreviewRow[]
): Promise<HistorialMunicipalOficialImportPreviewRow[]> {
  await assertDirector();
  const service = createServiceClient();

  const geoIds = Array.from(
    new Set(rows.map((row) => row.geo_municipio_id).filter(Boolean))
  ) as number[];

  const [municipiosRes, existingRes] = await Promise.all([
    service
      .from("municipios")
      .select("id, nombre, geo_municipio_id, nombre_oficial_geojson")
      .in("geo_municipio_id", geoIds),
    service
      .from("historial_municipal_oficial")
      .select("id, municipio_id, anio")
      .eq("anio", 2024),
  ]);

  if (municipiosRes.error) {
    throw new Error(municipiosRes.error.message);
  }
  if (existingRes.error) {
    throw new Error(existingRes.error.message);
  }

  const municipalityByGeoId = new Map<number, MunicipioLookup>();
  ((municipiosRes.data ?? []) as MunicipioLookup[]).forEach((municipio) => {
    if (municipio.geo_municipio_id !== null) {
      municipalityByGeoId.set(municipio.geo_municipio_id, municipio);
    }
  });

  const existingByKey = new Map<string, ExistingMunicipalOfficial>();
  ((existingRes.data ?? []) as ExistingMunicipalOfficial[]).forEach((row) => {
    existingByKey.set(`${row.municipio_id}:${row.anio}`, row);
  });

  return rows.map((row) => {
    const nextRow: HistorialMunicipalOficialImportPreviewRow = {
      ...row,
      warnings: [...row.warnings],
      errors: [...row.errors],
    };

    const municipio = row.geo_municipio_id
      ? municipalityByGeoId.get(row.geo_municipio_id)
      : null;

    if (!municipio) {
      nextRow.errors.push(
        `No existe municipio con geo_municipio_id ${row.geo_municipio_id}`
      );
      return nextRow;
    }

    nextRow.municipio_id = municipio.id;

    const existing = existingByKey.get(`${municipio.id}:${row.anio}`);
    nextRow.status = existing ? "actualizacion" : "nuevo";
    nextRow.statusLabel = existing ? "Actualizacion" : "Nuevo registro";

    return nextRow;
  });
}

export async function commitHistorialMunicipalOficialImport(
  rows: HistorialMunicipalOficialImportPreviewRow[]
): Promise<HistorialMunicipalOficialImportResult> {
  await assertDirector();
  const service = createServiceClient();
  const result: HistorialMunicipalOficialImportResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  await ensureFuerzasCatalog();

  const validRows = rows.filter(
    (row) => row.errors.length === 0 && row.municipio_id !== null
  );
  result.skipped = rows.length - validRows.length;

  if (validRows.length === 0) {
    return result;
  }

  const payload = validRows.map((row) => ({
    municipio_id: row.municipio_id!,
    geo_municipio_id: row.geo_municipio_id ?? null,
    anio: row.anio,
    total_secciones: row.total_secciones,
    total_casillas: row.total_casillas,
    total_casillas_mec: row.total_casillas_mec,
    lista_nominal: row.lista_nominal,
    votos_validos: row.votos_validos,
    votos_no_registrados: row.votos_no_registrados,
    votos_nulos: row.votos_nulos,
    total_votos: row.total_votos,
    participacion_ciudadana: row.participacion_ciudadana,
    ganador_siglas: row.ganador_siglas ?? null,
    ganador_votacion: row.ganador_votacion,
    ganador_porcentaje: row.ganador_porcentaje,
    segundo_siglas: row.segundo_siglas ?? null,
    segundo_votacion: row.segundo_votacion,
    segundo_porcentaje: row.segundo_porcentaje,
    margen_votos: row.margen_votos,
    margen_porcentual: row.margen_porcentual,
    ruta_acta: row.ruta_acta ?? null,
    fuente: row.fuente ?? "import_xlsx_2024_see_ayun_mex_muncand",
    raw_municipio_nombre: row.raw_municipio_nombre ?? row.municipio_nombre,
  }));

  const { data: insertedRows, error: upsertError } = await service
    .from("historial_municipal_oficial")
    .upsert(payload, { onConflict: "municipio_id,anio" })
    .select("id, municipio_id, anio");

  if (upsertError) {
    throw new Error(upsertError.message);
  }

  const idByKey = new Map<string, number>();
  (insertedRows ?? []).forEach((row) => {
    idByKey.set(`${row.municipio_id}:${row.anio}`, row.id);
  });

  for (const row of validRows) {
    const historialId = idByKey.get(`${row.municipio_id}:${row.anio}`);
    if (!historialId) {
      result.errors.push({
        row: row.row_index,
        message: `No se recibio id para municipio ${row.municipio_id}`,
      });
      result.skipped++;
      continue;
    }

    const { error: deleteError } = await service
      .from("historial_municipal_oficial_resultados")
      .delete()
      .eq("historial_municipal_id", historialId);

    if (deleteError) {
      result.errors.push({
        row: row.row_index,
        message: deleteError.message,
      });
      result.skipped++;
      continue;
    }

    const resultPayload = row.fuerza_resultados.map((fuerza) => ({
      historial_municipal_id: historialId,
      fuerza: fuerza.fuerza,
      votos: fuerza.votos,
    }));

    if (resultPayload.length > 0) {
      const { error: resultInsertError } = await service
        .from("historial_municipal_oficial_resultados")
        .insert(resultPayload);

      if (resultInsertError) {
        result.errors.push({
          row: row.row_index,
          message: resultInsertError.message,
        });
        result.skipped++;
        continue;
      }
    }

    if (row.status === "actualizacion") result.updated++;
    else result.inserted++;
  }

  revalidatePath("/admin/importacion");
  revalidatePath("/admin/historial");
  revalidatePath("/admin/historial/dashboard");
  revalidatePath("/admin/historial/municipio/[id]", "page");
  revalidatePath("/mapa");

  return result;
}
