"use server";

import { revalidatePath } from "next/cache";
import { read as xlsxRead, utils as xlsxUtils } from "@e965/xlsx";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isMunicipal2021DataRow,
  MUNICIPAL_2021_COL,
  MUNICIPAL_2021_FORCE_COLUMNS,
  MUNICIPAL_2021_FORCE_KEYS,
  normalizeMunicipal2021WinnerSiglas,
  parseMunicipal2021Number,
  parseMunicipal2021Percentage,
} from "@/lib/historial-municipal-oficial-2021";
import type {
  HistorialMunicipalOficialImportPreviewRow,
  HistorialMunicipalOficialImportResult,
  HistorialSeccionResultadoPreview,
} from "@/lib/types";

const ANIO = 2021;

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

function buildFuerzaResultados(
  row: unknown[]
): HistorialSeccionResultadoPreview[] {
  return MUNICIPAL_2021_FORCE_KEYS.map((fuerza) => ({
    fuerza,
    votos: parseMunicipal2021Number(row[MUNICIPAL_2021_FORCE_COLUMNS[fuerza]]),
  }))
    .filter((entry) => entry.votos > 0)
    .sort((a, b) => b.votos - a.votos || a.fuerza.localeCompare(b.fuerza));
}

export async function parseMunicipalOficial2021XLSX(
  formData: FormData
): Promise<{
  rows: HistorialMunicipalOficialImportPreviewRow[];
  globalErrors: string[];
}> {
  await assertDirector();

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return { rows: [], globalErrors: ["No se recibio un archivo XLSX"] };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const wb = xlsxRead(bytes, { type: "array", raw: false });
  const aoa = xlsxUtils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
    raw: false,
  });

  const headerIdx = aoa.findIndex(
    (r) =>
      Array.isArray(r) &&
      String(r[0] ?? "").trim().toUpperCase() === "ID MUNICIPIO"
  );

  if (headerIdx === -1) {
    return {
      rows: [],
      globalErrors: [
        'No se encontro la fila de encabezados. Verifique que la columna A diga "ID MUNICIPIO".',
      ],
    };
  }

  const rows: HistorialMunicipalOficialImportPreviewRow[] = [];

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i] ?? [];
    if (!isMunicipal2021DataRow(row)) continue;

    const geoId = parseMunicipal2021Number(
      row[MUNICIPAL_2021_COL.GEO_MUNICIPIO_ID]
    );
    const municipioNombre = String(
      row[MUNICIPAL_2021_COL.MUNICIPIO] ?? ""
    ).trim();
    const fuerza_resultados = buildFuerzaResultados(row);

    const votosValidos = parseMunicipal2021Number(
      row[MUNICIPAL_2021_COL.VOTOS_VALIDOS]
    );
    const votosNoReg = parseMunicipal2021Number(
      row[MUNICIPAL_2021_COL.VOTOS_NO_REGISTRADOS]
    );
    const votosNulos = parseMunicipal2021Number(
      row[MUNICIPAL_2021_COL.VOTOS_NULOS]
    );
    const totalVotos = parseMunicipal2021Number(
      row[MUNICIPAL_2021_COL.TOTAL_VOTOS]
    );
    const participacion = parseMunicipal2021Percentage(
      row[MUNICIPAL_2021_COL.PARTICIPACION]
    );

    const ganadorSiglas = normalizeMunicipal2021WinnerSiglas(
      row[MUNICIPAL_2021_COL.GANADOR_SIGLAS]
    );
    const ganadorVotacion = parseMunicipal2021Number(
      row[MUNICIPAL_2021_COL.GANADOR_VOTACION]
    );
    const ganadorPorcentaje = parseMunicipal2021Percentage(
      row[MUNICIPAL_2021_COL.GANADOR_PORCENTAJE]
    );
    const segundoSiglas = normalizeMunicipal2021WinnerSiglas(
      row[MUNICIPAL_2021_COL.SEGUNDO_SIGLAS]
    );
    const segundoVotacion = parseMunicipal2021Number(
      row[MUNICIPAL_2021_COL.SEGUNDO_VOTACION]
    );
    const segundoPorcentaje = parseMunicipal2021Percentage(
      row[MUNICIPAL_2021_COL.SEGUNDO_PORCENTAJE]
    );
    const margenVotos = parseMunicipal2021Number(
      row[MUNICIPAL_2021_COL.MARGEN_VOTOS]
    );
    const margenPorcentual = parseMunicipal2021Percentage(
      row[MUNICIPAL_2021_COL.MARGEN_PORCENTUAL]
    );
    const rutaActa =
      String(row[MUNICIPAL_2021_COL.RUTA_ACTA] ?? "").trim() || null;

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!geoId) errors.push("ID MUNICIPIO no valido");
    if (!municipioNombre) errors.push("MUNICIPIO vacio");

    const fuerzaSum = fuerza_resultados.reduce((sum, force) => sum + force.votos, 0);
    if (votosValidos > 0 && fuerzaSum !== votosValidos) {
      warnings.push(
        `Suma fuerzas (${fuerzaSum.toLocaleString()}) != votos validos (${votosValidos.toLocaleString()})`
      );
    }

    rows.push({
      row_index: i + 1,
      anio: ANIO,
      municipio_id: null,
      geo_municipio_id: geoId || null,
      municipio_nombre: municipioNombre,
      total_secciones: parseMunicipal2021Number(
        row[MUNICIPAL_2021_COL.TOTAL_SECCIONES]
      ),
      total_casillas: parseMunicipal2021Number(
        row[MUNICIPAL_2021_COL.TOTAL_CASILLAS]
      ),
      total_casillas_mec: 0,
      lista_nominal: parseMunicipal2021Number(
        row[MUNICIPAL_2021_COL.LISTA_NOMINAL]
      ),
      votos_validos: votosValidos,
      votos_no_registrados: votosNoReg,
      votos_nulos: votosNulos,
      total_votos: totalVotos,
      participacion_ciudadana: participacion,
      ganador_siglas: ganadorSiglas || null,
      ganador_votacion: ganadorVotacion,
      ganador_porcentaje: ganadorPorcentaje,
      segundo_siglas: segundoSiglas || null,
      segundo_votacion: segundoVotacion,
      segundo_porcentaje: segundoPorcentaje,
      margen_votos: margenVotos,
      margen_porcentual: margenPorcentual,
      ruta_acta: rutaActa,
      fuente: "import_xlsx_2021_ieem_ayun_mex_muncand",
      raw_municipio_nombre: municipioNombre,
      fuerza_resultados,
      status: "pendiente",
      statusLabel: "Pendiente",
      warnings,
      errors,
    });
  }

  return { rows, globalErrors: [] };
}

export async function previewMunicipalOficial2021Import(
  rows: HistorialMunicipalOficialImportPreviewRow[]
): Promise<HistorialMunicipalOficialImportPreviewRow[]> {
  await assertDirector();
  const service = createServiceClient();

  const geoIds = Array.from(
    new Set(rows.map((r) => r.geo_municipio_id).filter(Boolean))
  ) as number[];

  const [municipiosRes, existingRes] = await Promise.all([
    service
      .from("municipios")
      .select("id, nombre, geo_municipio_id, nombre_oficial_geojson")
      .in("geo_municipio_id", geoIds),
    service
      .from("historial_municipal_oficial")
      .select("id, municipio_id, anio")
      .eq("anio", ANIO),
  ]);

  if (municipiosRes.error) throw new Error(municipiosRes.error.message);
  if (existingRes.error) throw new Error(existingRes.error.message);

  const munByGeoId = new Map<number, { id: number; nombre: string }>();
  (municipiosRes.data ?? []).forEach((m) => {
    if (m.geo_municipio_id !== null) munByGeoId.set(m.geo_municipio_id, m);
  });

  const existingKeys = new Set(
    (existingRes.data ?? []).map((r) => `${r.municipio_id}:${r.anio}`)
  );

  return rows.map((row) => {
    const updated = {
      ...row,
      warnings: [...row.warnings],
      errors: [...row.errors],
    };
    const mun = row.geo_municipio_id ? munByGeoId.get(row.geo_municipio_id) : null;

    if (!mun) {
      updated.errors.push(
        `No existe municipio con geo_municipio_id ${row.geo_municipio_id}`
      );
      return updated;
    }

    updated.municipio_id = mun.id;
    const key = `${mun.id}:${row.anio}`;
    updated.status = existingKeys.has(key) ? "actualizacion" : "nuevo";
    updated.statusLabel = existingKeys.has(key)
      ? "Actualizacion"
      : "Nuevo registro";
    return updated;
  });
}

export async function confirmMunicipalOficial2021Import(
  rows: HistorialMunicipalOficialImportPreviewRow[]
): Promise<HistorialMunicipalOficialImportResult> {
  await assertDirector();
  const service = createServiceClient();

  const validRows = rows.filter(
    (r) => r.errors.length === 0 && r.municipio_id !== null
  );
  const result: HistorialMunicipalOficialImportResult = {
    inserted: 0,
    updated: 0,
    skipped: rows.length - validRows.length,
    errors: [],
  };

  if (validRows.length === 0) return result;

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
    fuente: row.fuente ?? "import_xlsx_2021_ieem_ayun_mex_muncand",
    raw_municipio_nombre: row.raw_municipio_nombre ?? row.municipio_nombre,
  }));

  const { data: upserted, error: upsertError } = await service
    .from("historial_municipal_oficial")
    .upsert(payload, { onConflict: "municipio_id,anio" })
    .select("id, municipio_id, anio");

  if (upsertError) throw new Error(upsertError.message);

  const idByKey = new Map<string, number>();
  (upserted ?? []).forEach((r) => idByKey.set(`${r.municipio_id}:${r.anio}`, r.id));

  for (const row of validRows) {
    const historialId = idByKey.get(`${row.municipio_id}:${row.anio}`);
    if (!historialId) {
      result.errors.push({
        row: row.row_index,
        message: `Sin id para municipio ${row.municipio_id}`,
      });
      result.skipped++;
      continue;
    }

    await service
      .from("historial_municipal_oficial_resultados")
      .delete()
      .eq("historial_municipal_id", historialId);

    if (row.fuerza_resultados.length > 0) {
      const { error: insErr } = await service
        .from("historial_municipal_oficial_resultados")
        .insert(
          row.fuerza_resultados.map((f) => ({
            historial_municipal_id: historialId,
            fuerza: f.fuerza,
            votos: f.votos,
          }))
        );

      if (insErr) {
        result.errors.push({ row: row.row_index, message: insErr.message });
        result.skipped++;
        continue;
      }
    }

    if (row.status === "actualizacion") result.updated++;
    else result.inserted++;
  }

  revalidatePath("/admin/historial");
  revalidatePath("/admin/historial/dashboard");
  revalidatePath("/mapa");
  return result;
}
