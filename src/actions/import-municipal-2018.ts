"use server";

import { revalidatePath } from "next/cache";
import { read as xlsxRead, utils as xlsxUtils } from "@e965/xlsx";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  buildMuncand2018Fuerzas,
  calcWinner2018,
  getMuncand2018HeaderErrors,
  normalize2018Text,
  parse2018Number,
} from "@/lib/historial-2018";
import type {
  HistorialMunicipalOficialImportPreviewRow,
  HistorialMunicipalOficialImportResult,
} from "@/lib/types";

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

// ─────────────────────────────────────────────
// Parse
// ─────────────────────────────────────────────

export async function parseMunicipal2018XLSX(formData: FormData): Promise<{
  rows: HistorialMunicipalOficialImportPreviewRow[];
  globalErrors: string[];
}> {
  await assertDirector();

  const file = formData.get("file");
  if (!(file instanceof Blob)) {
    return { rows: [], globalErrors: ["No se recibió un archivo XLSX"] };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const wb = xlsxRead(bytes, { type: "array", raw: false });
  const aoa = xlsxUtils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1,
    defval: null,
    raw: false,
  });

  // Find header row (first row with ID_MUNICIPIO)
  const headerIdx = aoa.findIndex(
    (r) =>
      Array.isArray(r) &&
      r.some((cell) => String(cell ?? "").trim() === "ID_MUNICIPIO") &&
      r.some((cell) => String(cell ?? "").trim() === "MUNICIPIO")
  );

  if (headerIdx === -1) {
    return {
      rows: [],
      globalErrors: [
        'No se encontró la fila de encabezados. Verifique que sea el XLSX MUNCAND 2018 del IEEM.',
      ],
    };
  }

  const rawHeaders = (aoa[headerIdx] ?? []).map((v) => String(v ?? "").trim());
  const headerErrors = getMuncand2018HeaderErrors(rawHeaders);
  if (headerErrors.length > 0) {
    return { rows: [], globalErrors: headerErrors };
  }

  const rows: HistorialMunicipalOficialImportPreviewRow[] = [];

  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const raw = aoa[i] ?? [];
    const row: Record<string, unknown> = {};
    rawHeaders.forEach((h, idx) => { if (h) row[h] = raw[idx] ?? null; });

    const geoId = parse2018Number(row.ID_MUNICIPIO);
    const municipioNombre = normalize2018Text(row.MUNICIPIO);

    // Skip empty or totals rows
    if (!geoId && !municipioNombre) continue;
    if (["TOTALES", "TOTAL", "TOTAL GENERAL"].includes(municipioNombre.toUpperCase())) continue;

    const votosValidos = parse2018Number(row.NUM_VOTOS_VALIDOS);
    const votosNoReg = parse2018Number(row.NUM_VOTOS_CAN_NREG);
    const votosNulos = parse2018Number(row.NUM_VOTOS_NULOS);
    const totalVotos = parse2018Number(row.TOTAL_VOTOS);
    const listaNominal = parse2018Number(row.LISTA_NOMINAL);
    const rutaActa = normalize2018Text(row.RUTA_ACTA) || null;
    const totalSecciones = parse2018Number(row.SECCIONES);
    const totalCasillas = parse2018Number(row.CASILLAS);

    const fuerza_resultados = buildMuncand2018Fuerzas(row);
    const winner = calcWinner2018(fuerza_resultados, votosValidos);

    const participacion =
      listaNominal > 0
        ? Number(((totalVotos / listaNominal) * 100).toFixed(4))
        : 0;

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!geoId) errors.push("ID_MUNICIPIO no válido");
    if (!municipioNombre) errors.push("MUNICIPIO vacío");
    if (votosValidos === 0) warnings.push("NUM_VOTOS_VALIDOS es cero");

    const fuerzaSum = fuerza_resultados.reduce((s, f) => s + f.votos, 0);
    if (votosValidos > 0 && fuerzaSum !== votosValidos) {
      warnings.push(
        `Suma fuerzas (${fuerzaSum.toLocaleString()}) ≠ votos válidos (${votosValidos.toLocaleString()})`
      );
    }

    rows.push({
      row_index: i + 1,
      anio: ANIO,
      municipio_id: null,
      geo_municipio_id: geoId || null,
      municipio_nombre: municipioNombre,
      total_secciones: totalSecciones,
      total_casillas: totalCasillas,
      total_casillas_mec: 0,
      lista_nominal: listaNominal,
      votos_validos: votosValidos,
      votos_no_registrados: votosNoReg,
      votos_nulos: votosNulos,
      total_votos: totalVotos,
      participacion_ciudadana: participacion,
      ganador_siglas: winner.ganador_siglas,
      ganador_votacion: winner.ganador_votacion,
      ganador_porcentaje: winner.ganador_porcentaje,
      segundo_siglas: winner.segundo_siglas,
      segundo_votacion: winner.segundo_votacion,
      segundo_porcentaje: winner.segundo_porcentaje,
      margen_votos: winner.margen_votos,
      margen_porcentual: winner.margen_porcentual,
      ruta_acta: rutaActa,
      fuente: "import_xlsx_2018_ieem_ayun_mex_muncand",
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

// ─────────────────────────────────────────────
// Preview (resolve geo → internal municipio id)
// ─────────────────────────────────────────────

export async function previewMunicipal2018Import(
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
    const updated = { ...row, warnings: [...row.warnings], errors: [...row.errors] };
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
    updated.statusLabel = existingKeys.has(key) ? "Actualización" : "Nuevo registro";
    return updated;
  });
}

// ─────────────────────────────────────────────
// Commit
// ─────────────────────────────────────────────

export async function commitMunicipal2018Import(
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
    fuente: row.fuente ?? "import_xlsx_2018_ieem_ayun_mex_muncand",
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
      result.errors.push({ row: row.row_index, message: `Sin id para municipio ${row.municipio_id}` });
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
