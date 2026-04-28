"use server";

import { revalidatePath } from "next/cache";
import { read as xlsxRead, utils as xlsxUtils } from "@e965/xlsx";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildFuerzaEntries2021,
  getSeccion2021ActasMec,
  getSeccion2021HeaderErrors,
  normalizeWorksheet2021Text,
  parseWorksheet2021Number,
} from "@/lib/historial-secciones-2021";
import {
  isAggregateSeccion,
  normalizeEntityName,
  validateSeccionTotals,
} from "@/lib/historial-secciones";
import type {
  HistorialSeccionElectoral,
  HistorialSeccionImportPreviewRow,
  HistorialSeccionImportResult,
  HistorialSeccionResultado,
} from "@/lib/types";
import { logAction } from "@/lib/audit";

const ANIO = 2021;

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

  if (!usuario || !["director", "admin"].includes(usuario.rol)) {
    throw new Error("Acceso denegado: se requiere rol director o admin");
  }
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function parseWorkbookRows(fileBytes: Uint8Array): {
  rows: Record<string, unknown>[];
  globalErrors: string[];
} {
  const workbook = xlsxRead(fileBytes, { type: "array", raw: false });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

  const aoa = xlsxUtils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  const headerIndex = aoa.findIndex(
    (row) =>
      Array.isArray(row) &&
      row.some((cell) => String(cell ?? "").trim() === "ID_MUNICIPIO") &&
      row.some((cell) => String(cell ?? "").trim() === "SECCION")
  );

  if (headerIndex === -1) {
    return {
      rows: [],
      globalErrors: [
        "No se encontro la fila de encabezados. Verifique que el archivo sea el XLSX seccional 2021 del IEEM.",
      ],
    };
  }

  const headers = (aoa[headerIndex] ?? []).map((value) =>
    normalizeWorksheet2021Text(value)
  );
  const globalErrors = getSeccion2021HeaderErrors(headers);
  if (globalErrors.length > 0) {
    return { rows: [], globalErrors };
  }

  const rows = aoa
    .slice(headerIndex + 1)
    .map((row) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = row?.[index] ?? null;
      });
      return record;
    })
    .filter((row) => {
      const geoMunicipioId = parseWorksheet2021Number(row.ID_MUNICIPIO);
      const municipioNombre = normalizeWorksheet2021Text(row.MUNICIPIO);
      const seccionRaw = normalizeWorksheet2021Text(row.SECCION);

      if (!geoMunicipioId && !municipioNombre && !seccionRaw) {
        return false;
      }

      const normalizedMunicipio = normalizeEntityName(municipioNombre);
      return !["TOTALES", "TOTAL", "TOTAL GENERAL"].includes(
        normalizedMunicipio
      );
    });

  return { rows, globalErrors: [] };
}

function parsePreviewRow(
  row: Record<string, unknown>,
  rowIndex: number
): HistorialSeccionImportPreviewRow {
  const geoMunicipioId = parseWorksheet2021Number(row.ID_MUNICIPIO);
  const seccionNumero = parseWorksheet2021Number(row.SECCION);
  const fuerzaResultados = buildFuerzaEntries2021(row);

  const previewRow: HistorialSeccionImportPreviewRow = {
    row_index: rowIndex,
    anio: ANIO,
    municipio_id: null,
    seccion_id: null,
    geo_municipio_id: geoMunicipioId || null,
    municipio_nombre: normalizeWorksheet2021Text(row.MUNICIPIO),
    seccion_numero: seccionNumero,
    id_distrito_local: parseWorksheet2021Number(row.ID_DISTRITO_LOCAL) || null,
    cabecera_distrital_local:
      normalizeWorksheet2021Text(row.CABECERA_DISTRITAL_LOCAL) || null,
    casillas: parseWorksheet2021Number(row.CASILLAS),
    actas_casilla_mec: getSeccion2021ActasMec(row),
    num_votos_validos: parseWorksheet2021Number(row.NUM_VOTOS_VALIDOS),
    num_votos_can_nreg: parseWorksheet2021Number(row.NUM_VOTOS_CAN_NREG),
    num_votos_nulos: parseWorksheet2021Number(row.NUM_VOTOS_NULOS),
    total_votos: parseWorksheet2021Number(row.TOTAL_VOTOS),
    lista_nominal: parseWorksheet2021Number(row.LISTA_NOMINAL),
    fuerza_resultados: fuerzaResultados,
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

  if (!normalizeWorksheet2021Text(row.SECCION)) {
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

export async function parseHistorialSeccion2021XLSX(formData: FormData): Promise<{
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

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parseWorkbookRows(bytes);
    if (parsed.globalErrors.length > 0) {
      return { rows: [], globalErrors: parsed.globalErrors };
    }

    return {
      rows: parsed.rows.map((row, index) => parsePreviewRow(row, index + 1)),
      globalErrors: [],
    };
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
}

export async function previewHistorialSeccion2021Import(
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

  const [{ data: municipios, error: municipiosError }, { data: existing }, seccionesIndex] =
    await Promise.all([
      municipioQuery,
      service
        .from("historial_seccion_electoral")
        .select("id, municipio_id, anio, seccion_numero")
        .eq("anio", ANIO),
      loadSeccionesIndex(),
    ]);

  if (municipiosError) {
    throw new Error(municipiosError.message);
  }

  const municipalityByGeoId = new Map<number, MunicipioLookup>();
  ((municipios ?? []) as MunicipioLookup[]).forEach((municipio) => {
    if (municipio.geo_municipio_id !== null) {
      municipalityByGeoId.set(municipio.geo_municipio_id, municipio);
    }
  });

  const existingSet = new Set(
    ((existing ?? []) as HistorialSeccionIdentity[]).map(
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

    const seccion = seccionesIndex.get(`${municipio.id}:${row.seccion_numero}`);
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

export async function commitHistorialSeccion2021Import(
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
    fuente: "import_xlsx_2021_ieem_ayun_mex_sec",
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
            message: `Error limpiando resultados seccionales previos: ${deleteError.message}`,
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

  await logAction({
    action: "import",
    entity: "historial",
    entityId: ANIO,
    details: {
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      source: "xlsx_2021_ieem_ayun_mex_sec",
      scope: "seccional_2021",
    },
  });

  revalidatePath("/admin/historial");
  revalidatePath("/admin/importacion");
  revalidatePath("/admin/historial/dashboard");

  return result;
}
