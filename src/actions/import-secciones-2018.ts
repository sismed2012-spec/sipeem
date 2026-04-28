"use server";

import { revalidatePath } from "next/cache";
import { read as xlsxRead, utils as xlsxUtils } from "@e965/xlsx";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildSeccion2018Fuerzas,
  getSeccion2018HeaderErrors,
  normalize2018Text,
  parse2018Number,
} from "@/lib/historial-2018";
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

const ANIO = 2018;

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
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

type MunicipioLookup = {
  id: number;
  nombre: string;
  geo_municipio_id: number | null;
  nombre_oficial_geojson: string | null;
};

type SeccionLookup = { id: number; municipio_id: number; numero: number };

type HistorialSeccionIdentity = {
  id: number;
  municipio_id: number;
  anio: number;
  seccion_numero: number;
};

// ─────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────

export async function parseHistorialSeccion2018XLSX(
  formData: FormData
): Promise<{ rows: HistorialSeccionImportPreviewRow[]; globalErrors: string[] }> {
  await assertDirector();

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { rows: [], globalErrors: ["No se recibió ningún archivo XLSX válido."] };
  }
  if (file.size === 0) {
    return { rows: [], globalErrors: ["El archivo está vacío."] };
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const wb = xlsxRead(bytes, { type: "array", raw: false });
    const aoa = xlsxUtils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
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
          "No se encontró la fila de encabezados. Verifique que sea el XLSX seccional 2018 del IEEM.",
        ],
      };
    }

    const rawHeaders = (aoa[headerIndex] ?? []).map((v) => String(v ?? "").trim());
    const headerErrors = getSeccion2018HeaderErrors(rawHeaders);
    if (headerErrors.length > 0) {
      return { rows: [], globalErrors: headerErrors };
    }

    const dataRows = aoa
      .slice(headerIndex + 1)
      .map((row) => {
        const record: Record<string, unknown> = {};
        rawHeaders.forEach((h, idx) => { if (h) record[h] = row?.[idx] ?? null; });
        return record;
      })
      .filter((row) => {
        const geoId = parse2018Number(row.ID_MUNICIPIO);
        const municipioNombre = normalize2018Text(row.MUNICIPIO);
        const seccionRaw = normalize2018Text(row.SECCION);
        if (!geoId && !municipioNombre && !seccionRaw) return false;
        return !["TOTALES", "TOTAL", "TOTAL GENERAL"].includes(
          normalizeEntityName(municipioNombre)
        );
      });

    const rows: HistorialSeccionImportPreviewRow[] = dataRows.map((row, idx) => {
      const geoMunicipioId = parse2018Number(row.ID_MUNICIPIO) || null;
      const seccionNumero = parse2018Number(row.SECCION);
      const fuerzaResultados = buildSeccion2018Fuerzas(row);

      const previewRow: HistorialSeccionImportPreviewRow = {
        row_index: idx + 1,
        anio: ANIO,
        municipio_id: null,
        seccion_id: null,
        geo_municipio_id: geoMunicipioId,
        municipio_nombre: normalize2018Text(row.MUNICIPIO),
        seccion_numero: seccionNumero,
        id_distrito_local: parse2018Number(row.ID_DISTRITO_LOCAL) || null,
        cabecera_distrital_local: normalize2018Text(row.CABECERA_DISTRITAL_LOCAL) || null,
        casillas: parse2018Number(row.CASILLAS),
        actas_casilla_mec: 0,
        num_votos_validos: parse2018Number(row.NUM_VOTOS_VALIDOS),
        num_votos_can_nreg: parse2018Number(row.NUM_VOTOS_CAN_NREG),
        num_votos_nulos: parse2018Number(row.NUM_VOTOS_NULOS),
        total_votos: parse2018Number(row.TOTAL_VOTOS),
        lista_nominal: parse2018Number(row.LISTA_NOMINAL),
        fuerza_resultados: fuerzaResultados,
        status: "pendiente",
        statusLabel: "Pendiente",
        warnings: [],
        errors: [],
      };

      if (!previewRow.geo_municipio_id) previewRow.errors.push("ID_MUNICIPIO no válido");
      if (!previewRow.municipio_nombre) previewRow.errors.push("MUNICIPIO vacío");
      if (!seccionNumero && seccionNumero !== 0) previewRow.errors.push("SECCION no válida");

      if (isAggregateSeccion(previewRow.seccion_numero)) {
        previewRow.warnings.push(
          "Fila agregada SECCION 0: se usará para validación, no para persistencia"
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
    });

    return { rows, globalErrors: [] };
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

// ─────────────────────────────────────────────
// Preview (resolve geo → internal municipio id)
// ─────────────────────────────────────────────

export async function previewHistorialSeccion2018Import(
  rows: HistorialSeccionImportPreviewRow[]
): Promise<HistorialSeccionImportPreviewRow[]> {
  await assertDirector();
  const service = createServiceClient();

  const geoIds = Array.from(
    new Set(rows.map((r) => r.geo_municipio_id).filter((id): id is number => typeof id === "number" && id > 0))
  );

  const municipioQuery =
    geoIds.length > 0
      ? service
          .from("municipios")
          .select("id, nombre, geo_municipio_id, nombre_oficial_geojson")
          .in("geo_municipio_id", geoIds)
      : Promise.resolve({ data: [], error: null });

  const [{ data: municipios, error: municipiosError }, { data: existing }, seccionesRaw] =
    await Promise.all([
      municipioQuery,
      service
        .from("historial_seccion_electoral")
        .select("id, municipio_id, anio, seccion_numero")
        .eq("anio", ANIO),
      service.from("secciones").select("id, municipio_id, numero"),
    ]);

  if (municipiosError) throw new Error(municipiosError.message);

  const munByGeoId = new Map<number, MunicipioLookup>();
  ((municipios ?? []) as MunicipioLookup[]).forEach((m) => {
    if (m.geo_municipio_id !== null) munByGeoId.set(m.geo_municipio_id, m);
  });

  const existingSet = new Set(
    ((existing ?? []) as HistorialSeccionIdentity[]).map(
      (r) => `${r.anio}:${r.municipio_id}:${r.seccion_numero}`
    )
  );

  const seccionesIndex = new Map(
    ((seccionesRaw.data ?? []) as SeccionLookup[]).map((r) => [`${r.municipio_id}:${r.numero}`, r])
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

    const municipio = row.geo_municipio_id ? munByGeoId.get(row.geo_municipio_id) : null;
    if (!municipio) {
      nextRow.errors.push(`No existe municipio con geo_municipio_id ${row.geo_municipio_id}`);
      nextRow.status = "pendiente";
      nextRow.statusLabel = "Con errores";
      return nextRow;
    }

    nextRow.municipio_id = municipio.id;

    const excelName = normalizeEntityName(row.municipio_nombre);
    const dbNames = [municipio.nombre, municipio.nombre_oficial_geojson ?? ""].map(normalizeEntityName);
    if (!dbNames.includes(excelName)) {
      nextRow.warnings.push(
        `Nombre no coincide con catálogo: "${row.municipio_nombre}" vs "${municipio.nombre}"`
      );
    }

    const seccion = seccionesIndex.get(`${municipio.id}:${row.seccion_numero}`);
    if (seccion) {
      nextRow.seccion_id = seccion.id;
    } else {
      nextRow.warnings.push(`Sección ${row.seccion_numero} no existe en el catálogo operativo`);
    }

    const key = `${row.anio}:${municipio.id}:${row.seccion_numero}`;
    nextRow.status = existingSet.has(key) ? "actualizacion" : "nuevo";
    nextRow.statusLabel = nextRow.status === "actualizacion" ? "Actualización" : "Nuevo registro";

    if (nextRow.errors.length > 0) {
      nextRow.status = "pendiente";
      nextRow.statusLabel = "Con errores";
    }

    return nextRow;
  });
}

// ─────────────────────────────────────────────
// Commit
// ─────────────────────────────────────────────

export async function commitHistorialSeccion2018Import(
  rows: HistorialSeccionImportPreviewRow[]
): Promise<HistorialSeccionImportResult> {
  await assertDirector();
  const service = createServiceClient();

  const result: HistorialSeccionImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };

  const processableRows = rows.filter(
    (r) => !isAggregateSeccion(r.seccion_numero) && r.errors.length === 0
  );

  result.skipped = rows.length - processableRows.length;
  if (processableRows.length === 0) return result;

  const payloadMain: Omit<HistorialSeccionElectoral, "id" | "created_at" | "updated_at">[] =
    processableRows.map((row) => ({
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
      fuente: "import_xlsx_2018_ieem_ayun_mex_sec",
      raw_municipio_nombre: row.municipio_nombre,
    }));

  const upsertedRows: HistorialSeccionIdentity[] = [];

  for (const chunk of chunkArray(payloadMain, 500)) {
    const { data: chunkRows, error: upsertError } = await service
      .from("historial_seccion_electoral")
      .upsert(chunk, { onConflict: "anio,municipio_id,seccion_numero" })
      .select("id, municipio_id, anio, seccion_numero");

    if (upsertError) {
      return {
        ...result,
        errors: [{ row: -1, message: `Error al guardar historial seccional: ${upsertError.message}` }],
      };
    }
    upsertedRows.push(...((chunkRows ?? []) as HistorialSeccionIdentity[]));
  }

  const upsertedLookup = new Map(
    upsertedRows.map((r) => [`${r.anio}:${r.municipio_id}:${r.seccion_numero}`, r.id])
  );

  const touchedIds = Array.from(upsertedLookup.values()).filter(
    (id): id is number => typeof id === "number" && id > 0
  );

  for (const chunk of chunkArray(touchedIds, 500)) {
    const { error: deleteError } = await service
      .from("historial_seccion_resultados")
      .delete()
      .in("historial_seccion_id", chunk);

    if (deleteError) {
      return {
        ...result,
        errors: [{ row: -1, message: `Error limpiando resultados previos: ${deleteError.message}` }],
      };
    }
  }

  const detailPayload: Omit<HistorialSeccionResultado, "id" | "created_at">[] = [];

  for (const row of processableRows) {
    const historialSeccionId = upsertedLookup.get(
      `${row.anio}:${row.municipio_id}:${row.seccion_numero}`
    );

    if (!historialSeccionId) {
      result.errors.push({ row: row.row_index, message: "No se obtuvo ID tras el upsert seccional" });
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

    if (row.status === "actualizacion") result.updated++;
    else result.inserted++;
  }

  for (const chunk of chunkArray(detailPayload, 1000)) {
    const { error: insErr } = await service
      .from("historial_seccion_resultados")
      .insert(chunk);

    if (insErr) {
      return {
        ...result,
        errors: [{ row: -1, message: `Error insertando resultados seccionales: ${insErr.message}` }],
      };
    }
  }

  await logAction({
    action: "import",
    entity: "historial",
    entityId: 0,
    details: { anio: ANIO, inserted: result.inserted, updated: result.updated },
  });

  revalidatePath("/admin/historial");
  revalidatePath("/admin/historial/dashboard");
  return result;
}
