"use server";

import { revalidatePath } from "next/cache";
import { read as xlsxRead, utils as xlsxUtils } from "@e965/xlsx";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  GubernaturaSeccionalPreviewRow,
  GubernaturaSeccionalImportResult,
} from "@/lib/types";

// Fuerzas presentes en el archivo IEEM Gubernatura 2023
const GUBERNATURA_FUERZAS = [
  "PAN",
  "PRI",
  "PRD",
  "PVEM_PT_MORENA",
  "NAEM",
  "PAN_PRI_PRD_NAEM",
  "PAN_PRI_PRD",
  "PAN_PRI_NAEM",
  "PAN_PRD_NAEM",
  "PRI_PRD_NAEM",
  "PAN_PRI",
  "PAN_PRD",
  "PAN_NAEM",
  "PRI_PRD",
  "PRI_NAEM",
  "PRD_NAEM",
] as const;

const REQUIRED_HEADERS = [
  "ID_MUNICIPIO",
  "MUNICIPIO",
  "SECCION",
  "CASILLAS",
  "NUM_VOTOS_VALIDOS",
  "NUM_VOTOS_CAN_NREG",
  "NUM_VOTOS_NULOS",
  "TOTAL_VOTOS",
  "LISTA_NOMINAL",
];

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

function toInt(value: unknown): number {
  const n = parseInt(String(value ?? "0"), 10);
  return Number.isNaN(n) ? 0 : n;
}

function toStr(value: unknown): string {
  return String(value ?? "").trim();
}

// ─── Parse ───────────────────────────────────────────────────────────────────

export async function parseGubernaturaSeccionalXlsx(
  formData: FormData
): Promise<{ rows: GubernaturaSeccionalPreviewRow[]; globalErrors: string[] }> {
  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return { rows: [], globalErrors: ["No se recibió archivo"] };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const workbook = xlsxRead(bytes, { type: "array", raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], globalErrors: ["El archivo no tiene hojas"] };
  }

  // The IEEM format has 5 title rows; headers are on row 6 (index 5)
  const raw = xlsxUtils.sheet_to_json<(string | number | null)[]>(
    workbook.Sheets[sheetName],
    { header: 1, defval: null, raw: false }
  );

  // Locate header row (first row that contains "ID_MUNICIPIO")
  const headerRowIndex = raw.findIndex(
    (row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() === "ID_MUNICIPIO")
  );

  if (headerRowIndex === -1) {
    return {
      rows: [],
      globalErrors: [
        "No se encontró la fila de encabezados. Verifique que el archivo sea el XLSX oficial de Gubernatura del IEEM.",
      ],
    };
  }

  const headers = (raw[headerRowIndex] as (string | null)[]).map((h) =>
    String(h ?? "").trim()
  );

  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return {
      rows: [],
      globalErrors: [`Columnas requeridas faltantes: ${missing.join(", ")}`],
    };
  }

  const idx = (name: string) => headers.indexOf(name);

  const dataRows = raw.slice(headerRowIndex + 1);
  const rows: GubernaturaSeccionalPreviewRow[] = [];

  dataRows.forEach((rawRow, i) => {
    const row = rawRow as (string | number | null)[];
    const geoMunicipioId = toInt(row[idx("ID_MUNICIPIO")]);

    // Skip special rows (voto anticipado, prisión preventiva)
    if (geoMunicipioId === 0) return;

    const seccionNumero = toInt(row[idx("SECCION")]);
    const numVotosValidos = toInt(row[idx("NUM_VOTOS_VALIDOS")]);
    const numVotosCanNreg = toInt(row[idx("NUM_VOTOS_CAN_NREG")]);
    const numVotosNulos = toInt(row[idx("NUM_VOTOS_NULOS")]);
    const totalVotos = toInt(row[idx("TOTAL_VOTOS")]);
    const listaNominal = toInt(row[idx("LISTA_NOMINAL")]) || null;
    const casillas = toInt(row[idx("CASILLAS")]);
    const municipioNombre = toStr(row[idx("MUNICIPIO")]);
    const idDistritoLocal = toInt(row[idx("ID_DISTRITO_LOCAL")]) || null;
    const cabeceraDistritalLocal = toStr(row[idx("CABECERA_DISTRITAL_LOCAL")]) || null;

    // Extract fuerza results — only include fuerzas with votes > 0
    const fuerzaResultados = GUBERNATURA_FUERZAS.map((fuerza) => ({
      fuerza,
      votos: toInt(row[idx(fuerza)]),
    })).filter((f) => f.votos > 0);

    const errors: string[] = [];
    const warnings: string[] = [];

    if (!geoMunicipioId) errors.push("ID_MUNICIPIO no válido");
    if (!seccionNumero) errors.push("SECCION no válida");

    // Validate: sum of fuerzas should equal NUM_VOTOS_VALIDOS
    const fuerzaSum = fuerzaResultados.reduce((s, f) => s + f.votos, 0);
    if (fuerzaSum !== numVotosValidos && numVotosValidos > 0) {
      warnings.push(
        `Suma fuerzas (${fuerzaSum.toLocaleString()}) ≠ votos válidos (${numVotosValidos.toLocaleString()})`
      );
    }

    rows.push({
      row_index: headerRowIndex + 1 + i + 1, // 1-based, relative to full file
      anio: 2023,
      geo_municipio_id: geoMunicipioId || null,
      municipio_id: null,
      municipio_nombre: municipioNombre || null,
      seccion_numero: seccionNumero,
      id_distrito_local: idDistritoLocal,
      cabecera_distrital_local: cabeceraDistritalLocal,
      casillas,
      num_votos_validos: numVotosValidos,
      num_votos_can_nreg: numVotosCanNreg,
      num_votos_nulos: numVotosNulos,
      total_votos: totalVotos,
      lista_nominal: listaNominal,
      fuerza_resultados: fuerzaResultados,
      status: "pendiente",
      statusLabel: "Pendiente",
      warnings,
      errors,
    });
  });

  return { rows, globalErrors: [] };
}

// ─── Preview ─────────────────────────────────────────────────────────────────

export async function previewGubernaturaSeccionalImport(
  rows: GubernaturaSeccionalPreviewRow[]
): Promise<GubernaturaSeccionalPreviewRow[]> {
  await assertDirector();
  const service = createServiceClient();

  const geoIds = Array.from(
    new Set(rows.map((r) => r.geo_municipio_id).filter((id): id is number => id !== null))
  );

  const [municipiosRes, existingRes] = await Promise.all([
    service
      .from("municipios")
      .select("id, nombre, geo_municipio_id")
      .in("geo_municipio_id", geoIds),
    service
      .from("historial_seccion_gubernatura")
      .select("municipio_id, seccion_numero, anio")
      .eq("anio", 2023),
  ]);

  if (municipiosRes.error) throw new Error(municipiosRes.error.message);

  const munByGeoId = new Map<number, { id: number; nombre: string }>();
  (municipiosRes.data ?? []).forEach((m) => {
    if (m.geo_municipio_id !== null) munByGeoId.set(m.geo_municipio_id, m);
  });

  const existingKeys = new Set(
    (existingRes.data ?? []).map((r) => `${r.municipio_id}:${r.seccion_numero}`)
  );

  return rows.map((row) => {
    const updated = { ...row };

    if (row.geo_municipio_id) {
      const mun = munByGeoId.get(row.geo_municipio_id);
      if (mun) {
        updated.municipio_id = mun.id;
      } else {
        updated.errors = [
          ...updated.errors,
          `No existe municipio con geo_municipio_id ${row.geo_municipio_id}`,
        ];
      }
    }

    if (updated.errors.length === 0 && updated.municipio_id !== null) {
      const key = `${updated.municipio_id}:${updated.seccion_numero}`;
      if (existingKeys.has(key)) {
        updated.status = "actualizacion";
        updated.statusLabel = "Actualización";
      } else {
        updated.status = "nuevo";
        updated.statusLabel = "Nuevo";
      }
    } else if (updated.errors.length > 0) {
      updated.status = "omitido";
      updated.statusLabel = "Omitido";
    }

    return updated;
  });
}

// ─── Confirm ─────────────────────────────────────────────────────────────────

const BATCH_SIZE = 400;

export async function confirmGubernaturaSeccionalImport(
  rows: GubernaturaSeccionalPreviewRow[]
): Promise<GubernaturaSeccionalImportResult> {
  await assertDirector();
  const service = createServiceClient();

  const validRows = rows.filter(
    (r) => r.errors.length === 0 && r.municipio_id !== null && r.seccion_numero > 0
  );

  const result: GubernaturaSeccionalImportResult = {
    inserted: 0,
    updated: 0,
    skipped: rows.length - validRows.length,
    errors: [],
  };

  // Process in batches to respect Supabase limits
  for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
    const batch = validRows.slice(i, i + BATCH_SIZE);

    const headerPayload = batch.map((row) => ({
      anio: row.anio,
      municipio_id: row.municipio_id!,
      geo_municipio_id: row.geo_municipio_id,
      seccion_numero: row.seccion_numero,
      id_distrito_local: row.id_distrito_local,
      cabecera_distrital_local: row.cabecera_distrital_local,
      casillas: row.casillas,
      num_votos_validos: row.num_votos_validos,
      num_votos_can_nreg: row.num_votos_can_nreg,
      num_votos_nulos: row.num_votos_nulos,
      total_votos: row.total_votos,
      lista_nominal: row.lista_nominal,
      raw_municipio_nombre: row.municipio_nombre,
      fuente: "import_xlsx_gubernatura_2023_ieem",
    }));

    const { data: upserted, error: upsertError } = await service
      .from("historial_seccion_gubernatura")
      .upsert(headerPayload, {
        onConflict: "anio,municipio_id,seccion_numero",
        ignoreDuplicates: false,
      })
      .select("id, municipio_id, seccion_numero");

    if (upsertError) {
      result.errors.push({ row: -1, message: upsertError.message });
      continue;
    }

    // Build a map from (municipio_id:seccion_numero) → id for resultados insert
    const idMap = new Map<string, number>();
    (upserted ?? []).forEach((r) => {
      idMap.set(`${r.municipio_id}:${r.seccion_numero}`, r.id);
    });

    // Count inserts vs updates
    batch.forEach((row) => {
      if (row.status === "nuevo") result.inserted++;
      else result.updated++;
    });

    // Delete existing resultados for upserted headers, then re-insert
    const parentIds = Array.from(idMap.values());
    if (parentIds.length > 0) {
      await service
        .from("historial_seccion_gubernatura_resultados")
        .delete()
        .in("historial_seccion_gubernatura_id", parentIds);

      const resultadosPayload = batch.flatMap((row) => {
        const parentId = idMap.get(`${row.municipio_id}:${row.seccion_numero}`);
        if (!parentId) return [];
        return row.fuerza_resultados.map((f) => ({
          historial_seccion_gubernatura_id: parentId,
          fuerza: f.fuerza,
          votos: f.votos,
        }));
      });

      if (resultadosPayload.length > 0) {
        const { error: resError } = await service
          .from("historial_seccion_gubernatura_resultados")
          .insert(resultadosPayload);

        if (resError) {
          result.errors.push({ row: -1, message: `Resultados: ${resError.message}` });
        }
      }
    }
  }

  revalidatePath("/admin/historial");
  return result;
}
