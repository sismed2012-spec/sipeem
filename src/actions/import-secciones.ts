"use server";

import { revalidatePath } from "next/cache";
import { read as xlsxRead, utils as xlsxUtils } from "@e965/xlsx";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildFuerzaEntries,
  HISTORIAL_SECCION_2024_REQUIRED_HEADERS,
  isAggregateSeccion,
  normalizeEntityName,
  normalizeWorksheetText,
  parseWorksheetNumber,
  validateSeccionTotals,
} from "@/lib/historial-secciones";
import {
  buildMunicipalAggregate,
  getAllFuerzas2024CatalogSeeds,
} from "@/lib/historial-seccion-consolidation";
import type {
  HistorialSeccionElectoral,
  HistorialSeccionImportPreviewRow,
  HistorialSeccionImportResult,
  HistorialSeccionResultado,
} from "@/lib/types";
import { logAction } from "@/lib/audit";

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

type SeccionLookup = {
  id: number;
  municipio_id: number;
  numero: number;
};

type HistorialSeccionIdentity = {
  id: number;
  municipio_id: number;
  anio: number;
  seccion_numero: number;
};

type HistorialSeccionAggregateRow = {
  municipio_id: number;
  num_votos_validos: number | null;
  total_votos: number | null;
};

type HistorialSeccionResultadoAggregateRow = {
  historial_seccion_electoral:
    | { municipio_id: number }
    | { municipio_id: number }[]
    | null;
  fuerza: string;
  votos: number | null;
};

type PartidoLookup = {
  id: number;
  siglas: string;
  nombre: string;
};

function normalizeRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const chunk = data ?? [];
    rows.push(...chunk);

    if (chunk.length < pageSize) {
      break;
    }
  }

  return rows;
}

function getHeaderErrors(headers: string[]): string[] {
  return HISTORIAL_SECCION_2024_REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header)
  ).map((header) => `Falta columna requerida: "${header}"`);
}

function parseWorkbookRows(fileBytes: Uint8Array): Record<string, unknown>[] {
  const workbook = xlsxRead(fileBytes, {
    type: "array",
    raw: false,
  });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

  return xlsxUtils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: null,
    raw: false,
  });
}

function parsePreviewRow(
  row: Record<string, unknown>,
  rowIndex: number
): HistorialSeccionImportPreviewRow {
  const geoMunicipioId = parseWorksheetNumber(row.ID_MUNICIPIO);
  const seccionRaw = normalizeWorksheetText(row.SECCION);
  const seccionNumero = parseWorksheetNumber(row.SECCION);
  const fuerzas = buildFuerzaEntries(row);

  const previewRow: HistorialSeccionImportPreviewRow = {
    row_index: rowIndex,
    anio: 2024,
    municipio_id: null,
    seccion_id: null,
    geo_municipio_id: geoMunicipioId || null,
    municipio_nombre: normalizeWorksheetText(row.MUNICIPIO),
    seccion_numero: seccionNumero,
    id_distrito_local: parseWorksheetNumber(row.ID_DISTRITO_LOCAL) || null,
    cabecera_distrital_local: normalizeWorksheetText(
      row.CABECERA_DISTRITAL_LOCAL
    ),
    casillas: parseWorksheetNumber(row.CASILLAS),
    actas_casilla_mec: parseWorksheetNumber(row["ACTAS_CASILLA-MEC"]),
    num_votos_validos: parseWorksheetNumber(row.NUM_VOTOS_VALIDOS),
    num_votos_can_nreg: parseWorksheetNumber(row.NUM_VOTOS_CAN_NREG),
    num_votos_nulos: parseWorksheetNumber(row.NUM_VOTOS_NULOS),
    total_votos: parseWorksheetNumber(row.TOTAL_VOTOS),
    lista_nominal: parseWorksheetNumber(row.LISTA_NOMINAL),
    fuerza_resultados: fuerzas,
    status: "pendiente",
    statusLabel: "Pendiente",
    warnings: [],
    errors: [],
  };

  if (!previewRow.geo_municipio_id) {
    previewRow.errors.push("ID_MUNICIPIO no valido");
  }

  if (!previewRow.municipio_nombre) {
    previewRow.errors.push("MUNICIPIO vacio");
  }

  if (!seccionRaw || Number.isNaN(Number(seccionRaw))) {
    previewRow.errors.push("SECCION no valida");
  }

  if (isAggregateSeccion(previewRow.seccion_numero)) {
    previewRow.warnings.push(
      "Fila agregada de SECCION 0: se usara para validacion, no para persistencia"
    );
  }

  previewRow.errors.push(
    ...validateSeccionTotals(
      {
        num_votos_validos: previewRow.num_votos_validos,
        num_votos_can_nreg: previewRow.num_votos_can_nreg,
        num_votos_nulos: previewRow.num_votos_nulos,
        total_votos: previewRow.total_votos,
      },
      previewRow.fuerza_resultados
    )
  );

  return previewRow;
}

async function loadSeccionesIndex(): Promise<Map<string, SeccionLookup>> {
  const service = createServiceClient();
  const { data, error } = await service
    .from("secciones")
    .select("id, municipio_id, numero");

  if (error) {
    return new Map();
  }

  return new Map(
    ((data ?? []) as SeccionLookup[]).map((row) => [
      `${row.municipio_id}:${row.numero}`,
      row,
    ])
  );
}

async function ensureFuerzas2024Catalog() {
  const service = createServiceClient();
  const seeds = getAllFuerzas2024CatalogSeeds();
  const { error } = await service.from("partidos").upsert(seeds, {
    onConflict: "siglas",
  });

  if (error) {
    throw new Error(`No se pudo garantizar el catalogo de fuerzas 2024: ${error.message}`);
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function consolidateMunicipalHistoryForYear(anio: number) {
  const service = createServiceClient();

  await ensureFuerzas2024Catalog();

  const [headerRows, resultRows, { data: partidos, error: partiesError }] =
    await Promise.all([
      fetchAllRows<HistorialSeccionAggregateRow>((from, to) =>
        service
          .from("historial_seccion_electoral")
          .select("municipio_id, num_votos_validos, total_votos")
          .eq("anio", anio)
          .range(from, to)
      ),
      fetchAllRows<HistorialSeccionResultadoAggregateRow>((from, to) =>
        service
          .from("historial_seccion_resultados")
          .select(
            "fuerza, votos, historial_seccion_electoral!inner(municipio_id)"
          )
          .eq("historial_seccion_electoral.anio", anio)
          .range(from, to)
      ),
      service.from("partidos").select("id, siglas, nombre"),
    ]);

  if (partiesError) {
    throw new Error(`Error leyendo catalogo de partidos: ${partiesError.message}`);
  }

  const totalsByMunicipio = new Map<
    number,
    { total_validos: number; total_emitidos: number }
  >();
  headerRows.forEach((row) => {
    const current = totalsByMunicipio.get(row.municipio_id) ?? {
      total_validos: 0,
      total_emitidos: 0,
    };
    current.total_validos += row.num_votos_validos ?? 0;
    current.total_emitidos += row.total_votos ?? 0;
    totalsByMunicipio.set(row.municipio_id, current);
  });

  const resultsByMunicipio = new Map<number, Map<string, number>>();
  resultRows.forEach((row) => {
    const parent = normalizeRelation(row.historial_seccion_electoral);
    const municipioId = parent?.municipio_id;
    if (!municipioId) return;

    const municipioResults = resultsByMunicipio.get(municipioId) ?? new Map();
    municipioResults.set(
      row.fuerza,
      (municipioResults.get(row.fuerza) ?? 0) + (row.votos ?? 0)
    );
    resultsByMunicipio.set(municipioId, municipioResults);
  });

  const partyBySigla = new Map<string, PartidoLookup>();
  ((partidos ?? []) as PartidoLookup[]).forEach((party) => {
    partyBySigla.set(party.siglas.toUpperCase(), party);
    partyBySigla.set(party.nombre.toUpperCase(), party);
  });

  const aggregates = Array.from(resultsByMunicipio.entries())
    .map(([municipio_id, forceMap]) =>
      buildMunicipalAggregate({
        municipio_id,
        anio,
        total_validos: totalsByMunicipio.get(municipio_id)?.total_validos ?? 0,
        total_emitidos: totalsByMunicipio.get(municipio_id)?.total_emitidos ?? 0,
        results: Array.from(forceMap.entries()).map(([fuerza, votos]) => ({
          fuerza,
          votos,
        })),
      })
    )
    .filter((aggregate): aggregate is NonNullable<typeof aggregate> => aggregate !== null);

  if (aggregates.length === 0) {
    return { upserted: 0 };
  }

  const mainPayload = aggregates.map((aggregate) => ({
    municipio_id: aggregate.municipio_id,
    anio: aggregate.anio,
    partido_ganador_id:
      partyBySigla.get(aggregate.winner_force.toUpperCase())?.id ?? null,
    partido_ganador: aggregate.winner_force,
    votos_ganador: aggregate.winner_votes,
    porcentaje_ganador: aggregate.winner_pct,
    fuente: "consolidado_desde_historial_seccion_2024",
    notas: `Consolidado automatico desde historial seccional ${aggregate.anio}`,
  }));

  const { data: upsertedMain, error: upsertMainError } = await service
    .from("historial_electoral")
    .upsert(mainPayload, { onConflict: "municipio_id,anio" })
    .select("id, municipio_id, anio");

  if (upsertMainError) {
    throw new Error(`Error consolidando cabeceras municipales: ${upsertMainError.message}`);
  }

  const historialIdByKey = new Map(
    (upsertedMain ?? []).map((row) => [`${row.municipio_id}:${row.anio}`, row.id])
  );

  const touchedIds = Array.from(historialIdByKey.values());
  if (touchedIds.length > 0) {
    const { error: deleteError } = await service
      .from("historial_electoral_resultados")
      .delete()
      .in("historial_id", touchedIds);

    if (deleteError) {
      throw new Error(`Error limpiando resultados municipales previos: ${deleteError.message}`);
    }
  }

  const detailPayload = aggregates.flatMap((aggregate) => {
    const historialId = historialIdByKey.get(
      `${aggregate.municipio_id}:${aggregate.anio}`
    );
    if (!historialId) return [];

    return aggregate.resultados.flatMap((resultado) => {
      const partidoId =
        partyBySigla.get(resultado.fuerza.toUpperCase())?.id ?? null;
      if (!partidoId) return [];

      return {
        historial_id: historialId,
        partido_id: partidoId,
        votos: resultado.votos,
        porcentaje: resultado.porcentaje,
        posicion: resultado.posicion,
      };
    });
  });

  if (detailPayload.length > 0) {
    for (const detailChunk of chunkArray(detailPayload, 1000)) {
      const { error: detailError } = await service
        .from("historial_electoral_resultados")
        .insert(detailChunk);

      if (detailError) {
        throw new Error(`Error consolidando resultados municipales: ${detailError.message}`);
      }
    }
  }

  return { upserted: aggregates.length };
}

export async function rebuildHistorialMunicipal2024FromSecciones() {
  await assertDirector();

  const consolidation = await consolidateMunicipalHistoryForYear(2024);

  await logAction({
    action: "upsert",
    entity: "historial",
    entityId: 2024,
    details: {
      scope: "rebuild_from_secciones_2024",
      upserted: consolidation.upserted,
    },
  });

  revalidatePath("/admin/historial");
  revalidatePath("/admin/historial/dashboard");

  return consolidation;
}

export async function parseHistorialSeccion2024XLSX(formData: FormData): Promise<{
  rows: HistorialSeccionImportPreviewRow[];
  globalErrors: string[];
}> {
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return {
      rows: [],
      globalErrors: ["No se recibio ningun archivo XLSX valido."],
    };
  }

  if (file.size === 0) {
    return { rows: [], globalErrors: ["El archivo esta vacio."] };
  }

  let rows: Record<string, unknown>[];
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    rows = parseWorkbookRows(bytes);
  } catch (error) {
    return {
      rows: [],
      globalErrors: [
        `No se pudo leer el archivo XLSX: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
    };
  }

  if (rows.length === 0) {
    return { rows: [], globalErrors: ["El archivo no contiene filas de datos."] };
  }

  const headers = Object.keys(rows[0] ?? {});
  const globalErrors = getHeaderErrors(headers);
  if (globalErrors.length > 0) {
    return { rows: [], globalErrors };
  }

  return {
    rows: rows.map((row, index) => parsePreviewRow(row, index + 2)),
    globalErrors: [],
  };
}

export async function previewHistorialSeccion2024Import(
  rows: HistorialSeccionImportPreviewRow[]
): Promise<HistorialSeccionImportPreviewRow[]> {
  await assertDirector();

  const service = createServiceClient();
  const municipiosGeoIds = Array.from(
    new Set(
      rows
        .map((row) => row.geo_municipio_id)
        .filter((id): id is number => typeof id === "number" && id > 0)
    )
  );

  const municipioQuery =
    municipiosGeoIds.length > 0
      ? service
          .from("municipios")
          .select("id, nombre, geo_municipio_id, nombre_oficial_geojson")
          .in("geo_municipio_id", municipiosGeoIds)
      : Promise.resolve({ data: [], error: null });

  const [{ data: municipios }, { data: existingHistorial }, seccionesIndex] =
    await Promise.all([
      municipioQuery,
      service
        .from("historial_seccion_electoral")
        .select("id, municipio_id, anio, seccion_numero")
        .eq("anio", 2024),
      loadSeccionesIndex(),
    ]);

  const municipalityByGeoId = new Map<number, MunicipioLookup>();
  ((municipios ?? []) as MunicipioLookup[]).forEach((municipio) => {
    if (municipio.geo_municipio_id !== null) {
      municipalityByGeoId.set(municipio.geo_municipio_id, municipio);
    }
  });

  const existingSet = new Set(
    ((existingHistorial ?? []) as HistorialSeccionIdentity[]).map(
      (row) => `${row.anio}:${row.municipio_id}:${row.seccion_numero}`
    )
  );

  return rows.map((row) => {
    const nextRow: HistorialSeccionImportPreviewRow = {
      ...row,
      errors: [...row.errors],
      warnings: [...row.warnings],
    };

    if (isAggregateSeccion(row.seccion_numero)) {
      nextRow.status = "omitido";
      nextRow.statusLabel = "Checksum";
      return nextRow;
    }

    const municipio = row.geo_municipio_id
      ? municipalityByGeoId.get(row.geo_municipio_id)
      : null;

    if (!municipio) {
      nextRow.errors.push(
        `No existe municipio con geo_municipio_id ${row.geo_municipio_id}`
      );
      nextRow.status = "pendiente";
      nextRow.statusLabel = "Con errores";
      return nextRow;
    }

    nextRow.municipio_id = municipio.id;

    const excelName = normalizeEntityName(row.municipio_nombre);
    const dbNames = [
      municipio.nombre,
      municipio.nombre_oficial_geojson ?? "",
    ].map(normalizeEntityName);

    if (!dbNames.includes(excelName)) {
      nextRow.warnings.push(
        `Nombre de municipio no coincide exactamente con catalogo interno: "${row.municipio_nombre}" vs "${municipio.nombre}"`
      );
    }

    const seccion = seccionesIndex.get(
      `${municipio.id}:${row.seccion_numero}`
    );

    if (seccion) {
      nextRow.seccion_id = seccion.id;
    } else {
      nextRow.warnings.push(
        `La seccion ${row.seccion_numero} no existe en el catalogo operativo`
      );
    }

    const existingKey = `${row.anio}:${municipio.id}:${row.seccion_numero}`;
    nextRow.status = existingSet.has(existingKey) ? "actualizacion" : "nuevo";
    nextRow.statusLabel =
      nextRow.status === "actualizacion" ? "Actualizacion" : "Nuevo registro";

    if (nextRow.errors.length > 0) {
      nextRow.status = "pendiente";
      nextRow.statusLabel = "Con errores";
    }

    return nextRow;
  });
}

export async function commitHistorialSeccion2024Import(
  rows: HistorialSeccionImportPreviewRow[]
): Promise<HistorialSeccionImportResult> {
  await assertDirector();

  const service = createServiceClient();
  const result: HistorialSeccionImportResult = {
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };

  const processableRows = rows.filter(
    (row) => !isAggregateSeccion(row.seccion_numero) && row.errors.length === 0
  );

  result.skipped = rows.length - processableRows.length;

  if (processableRows.length === 0) {
    return result;
  }

  const payloadMain: Omit<
    HistorialSeccionElectoral,
    "id" | "created_at" | "updated_at"
  >[] = processableRows.map((row) => ({
    anio: row.anio,
    municipio_id: row.municipio_id as number,
    seccion_numero: row.seccion_numero,
    seccion_id: row.seccion_id,
    geo_municipio_id: row.geo_municipio_id,
    id_distrito_local: row.id_distrito_local,
    cabecera_distrital_local: row.cabecera_distrital_local || null,
    casillas: row.casillas,
    actas_casilla_mec: row.actas_casilla_mec,
    num_votos_validos: row.num_votos_validos,
    num_votos_can_nreg: row.num_votos_can_nreg,
    num_votos_nulos: row.num_votos_nulos,
    total_votos: row.total_votos,
    lista_nominal: row.lista_nominal,
    fuente: "import_xlsx_2024_see_ayun_mex_sec",
    raw_municipio_nombre: row.municipio_nombre,
  }));

  const upsertedRows: HistorialSeccionIdentity[] = [];

  for (const payloadChunk of chunkArray(payloadMain, 500)) {
    const { data: chunkRows, error: upsertError } = await service
      .from("historial_seccion_electoral")
      .upsert(payloadChunk, { onConflict: "anio,municipio_id,seccion_numero" })
      .select("id, municipio_id, anio, seccion_numero");

    if (upsertError) {
      return {
        ...result,
        errors: [
          {
            row: -1,
            message: `Error critico al guardar historial por seccion: ${upsertError.message}`,
          },
        ],
      };
    }

    upsertedRows.push(...((chunkRows ?? []) as HistorialSeccionIdentity[]));
  }

  const upsertedLookup = new Map(
    upsertedRows.map((row) => [
      `${row.anio}:${row.municipio_id}:${row.seccion_numero}`,
      row.id,
    ])
  );

  const touchedIds = Array.from(upsertedLookup.values()).filter(
    (id): id is number => typeof id === "number" && Number.isInteger(id) && id > 0
  );

  for (const idsChunk of chunkArray(touchedIds, 500)) {
    const { error: deleteError } = await service
      .from("historial_seccion_resultados")
      .delete()
      .in("historial_seccion_id", idsChunk);

    if (deleteError) {
      return {
        ...result,
        errors: [
          {
            row: -1,
            message: `Error limpiando resultados seccionales previos: ${deleteError.message} (chunk=${idsChunk[0]}-${idsChunk[idsChunk.length - 1]})`,
          },
        ],
      };
    }
  }

  const detailPayload: Omit<HistorialSeccionResultado, "id" | "created_at">[] =
    [];

  for (const row of processableRows) {
    const historialSeccionId = upsertedLookup.get(
      `${row.anio}:${row.municipio_id}:${row.seccion_numero}`
    );

    if (!historialSeccionId) {
      result.errors.push({
        row: row.row_index,
        message: "No se obtuvo ID despues del upsert seccional",
      });
      result.skipped += 1;
      continue;
    }

    row.fuerza_resultados.forEach((force) => {
      detailPayload.push({
        historial_seccion_id: historialSeccionId,
        fuerza: force.fuerza,
        votos: force.votos,
      });
    });

    if (row.status === "actualizacion") {
      result.updated += 1;
    } else {
      result.inserted += 1;
    }
  }

  if (detailPayload.length > 0) {
    for (const detailChunk of chunkArray(detailPayload, 1000)) {
      const { error: detailError } = await service
        .from("historial_seccion_resultados")
        .insert(detailChunk);

      if (detailError) {
        result.errors.push({
          row: -1,
          message: `Error insertando resultados seccionales: ${detailError.message}`,
        });
        break;
      }
    }
  }

  await consolidateMunicipalHistoryForYear(2024);

  await logAction({
    action: "import",
    entity: "historial",
    entityId: 2024,
    details: {
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      source: "xlsx_2024_see_ayun_mex_sec",
      scope: "seccional_2024",
    },
  });

  revalidatePath("/admin/historial");
  revalidatePath("/admin/importacion");
  revalidatePath("/admin/historial/dashboard");

  return result;
}
