"use server";

import { read as xlsxRead, utils as xlsxUtils } from "@e965/xlsx";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Auth guard — only directors may run imports
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ParsedHistorialRow = {
  municipio_id: number;
  anio: number;
  partido_ganador: string;
  votos: number;
  porcentaje: number;
  desglose: { p: string; v: number }[];
};

export type PreviewStatus = "pendiente" | "nuevo" | "actualizacion";

export type HistorialPreviewRow = ParsedHistorialRow & {
  status: PreviewStatus;
  statusLabel: string;
  errors: string[];
};

export type ImportResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

type HistorialResultadoImportPayload = {
  historial_id: number;
  partido_id: number;
  votos: number;
  porcentaje: number;
  posicion: number;
};

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------

export async function parseHistorialCSV(raw: string): Promise<{
  rows: HistorialPreviewRow[];
  globalErrors: string[];
}> {
  const globalErrors: string[] = [];
  const cleaned = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  if (!cleaned.trim()) {
    return { rows: [], globalErrors: ["El archivo está vacío."] };
  }

  let matrix: string[][];
  try {
    const workbook = xlsxRead(cleaned, { type: "string", raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    matrix = xlsxUtils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
    });
  } catch (e) {
    return {
      rows: [],
      globalErrors: [`Error al interpretar el CSV: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (matrix.length < 2) {
    return { rows: [], globalErrors: ["El archivo no tiene filas de datos."] };
  }

  const header = matrix[0].map((h) => String(h).toLowerCase().trim());
  const required = ["municipio_id", "anio", "partido_ganador", "votos", "porcentaje"];

  for (const col of required) {
    if (!header.includes(col)) globalErrors.push(`Falta columna: "${col}"`);
  }

  if (globalErrors.length > 0) return { rows: [], globalErrors };

  const idx = (name: string) => header.indexOf(name);
  const desgloseIdx = idx("desglose_json");
  const rows: HistorialPreviewRow[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const cols = matrix[i];
    const rowErrors: string[] = [];

    const municipio_id = parseInt(String(cols[idx("municipio_id")] ?? ""), 10);
    const anio = parseInt(String(cols[idx("anio")] ?? ""), 10);
    const partido_ganador = String(cols[idx("partido_ganador")] ?? "").trim();
    const votos = parseInt(String(cols[idx("votos")] ?? ""), 10);
    const porcentaje = parseFloat(String(cols[idx("porcentaje")] ?? ""));

    let desglose: { p: string; v: number }[] = [];
    if (desgloseIdx !== -1) {
      const raw_desglose = String(cols[desgloseIdx] ?? "").trim();
      if (raw_desglose) {
        try {
          desglose = JSON.parse(raw_desglose);
        } catch {
          rowErrors.push("desglose_json inválido");
        }
      }
    }

    if (isNaN(municipio_id)) rowErrors.push("municipio_id inválido");
    if (isNaN(anio)) rowErrors.push("anio inválido");
    if (!partido_ganador) rowErrors.push("partido_ganador vacío");

    rows.push({
      municipio_id,
      anio,
      partido_ganador,
      votos,
      porcentaje,
      desglose,
      status: "pendiente",
      statusLabel: "Pendiente",
      errors: rowErrors,
    });
  }

  return { rows, globalErrors };
}

// ---------------------------------------------------------------------------
// Preview & Commit (Relational)
// ---------------------------------------------------------------------------

export async function previewHistorialImport(rows: HistorialPreviewRow[]): Promise<HistorialPreviewRow[]> {
  await assertDirector();
  const service = createServiceClient();

  const validRows = rows.filter((r) => r.errors.length === 0);
  if (validRows.length === 0) return rows;

  // 1. Batch lookup municipalities
  const { data: municipalities } = await service.from("municipios").select("id");
  const munSet = new Set<number>(municipalities?.map(m => m.id) ?? []);

  // 2. Batch lookup existing elections
  const { data: existing } = await service
    .from("historial_electoral")
    .select("municipio_id, anio")
    .in("municipio_id", validRows.map((r) => r.municipio_id));

  const existingSet = new Set<string>((existing ?? []).map((r) => `${r.municipio_id}:${r.anio}`));

  // 3. Batch lookup parties
  const { data: parties } = await service.from("partidos").select("id, nombre, siglas");
  const partyMap = new Map<string, number>();
  parties?.forEach(p => {
    partyMap.set(p.siglas.toUpperCase(), p.id);
    partyMap.set(p.nombre.toUpperCase(), p.id);
  });

  return rows.map((row) => {
    const rowErrors = [...row.errors];
    
    // Check municipality existence
    if (!munSet.has(row.municipio_id)) {
      rowErrors.push(`ID de municipio "${row.municipio_id}" no existe en la base de datos`);
    }

    if (rowErrors.length === 0) {
      if (!partyMap.has(row.partido_ganador.toUpperCase())) {
        rowErrors.push(`Partido "${row.partido_ganador}" no reconocido`);
      }
      row.desglose.forEach(d => {
        if (!partyMap.has(d.p.toUpperCase())) {
          rowErrors.push(`Partido detalle "${d.p}" no reconocido`);
        }
      });
    }

    if (rowErrors.length > 0) {
      return { ...row, status: "pendiente", statusLabel: "Con errores", errors: rowErrors };
    }

    const key = `${row.municipio_id}:${row.anio}`;
    const found = existingSet.has(key);
    return {
      ...row,
      status: found ? "actualizacion" : "nuevo",
      statusLabel: found ? "Actualización" : "Nuevo registro",
      errors: rowErrors
    };
  });
}

export async function commitHistorialImport(rows: HistorialPreviewRow[]): Promise<ImportResult> {
  await assertDirector();
  const service = createServiceClient();

  const result: ImportResult = { inserted: 0, updated: 0, skipped: 0, errors: [] };
  
  // Preliminary filtering
  const processableRows = rows.filter((r) => r.errors.length === 0);
  result.skipped = rows.length - processableRows.length;

  if (processableRows.length === 0) return result;

  // 1. Map Partidos
  const { data: parties } = await service.from("partidos").select("id, nombre, siglas");
  const partyMap = new Map<string, number>();
  parties?.forEach(p => {
    partyMap.set(p.siglas.toUpperCase(), p.id);
    partyMap.set(p.nombre.toUpperCase(), p.id);
  });

  // 2. Resolve IDs & Secondary Validation (Municipios)
  const { data: municipalities } = await service.from("municipios").select("id");
  const munSet = new Set<number>(municipalities?.map(m => m.id) ?? []);

  const validRows = processableRows.filter(row => {
    if (!munSet.has(row.municipio_id)) {
      result.errors.push({ row: row.anio, message: `Municipio ${row.municipio_id} no válido` });
      result.skipped++;
      return false;
    }
    return true;
  });

  if (validRows.length === 0) return result;

  // 3. Prepare Main Payload
  const payloadMain = validRows.map(row => ({
    municipio_id: row.municipio_id,
    anio: row.anio,
    partido_ganador_id: partyMap.get(row.partido_ganador.toUpperCase()),
    partido_ganador: row.partido_ganador, // Legacy compatibility
    votos_ganador: row.votos,
    porcentaje_ganador: row.porcentaje,
  }));

  // 4. Upsert Main Records
  const { data: insertedMain, error: mainError } = await service
    .from("historial_electoral")
    .upsert(payloadMain, { onConflict: "municipio_id,anio" })
    .select("id, municipio_id, anio");

  if (mainError) {
    result.errors.push({ row: -1, message: `Error crítico en upsert: ${mainError.message}` });
    return result;
  }

  // 5. Relational Breakdown Processing (Wrapped in try/catch per row)
  const idLookup = new Map<string, number>();
  insertedMain.forEach(r => idLookup.set(`${r.municipio_id}:${r.anio}`, r.id));

  for (const row of validRows) {
    const dbId = idLookup.get(`${row.municipio_id}:${row.anio}`);
    if (!dbId) {
      result.errors.push({ row: row.anio, message: "ID no retornado después del upsert" });
      result.skipped++;
      continue;
    }

    try {
      // Clear old results
      const { error: delError } = await service.from("historial_electoral_resultados").delete().eq("historial_id", dbId);
      if (delError) throw new Error(`Fallo limpieza: ${delError.message}`);

      // Insert new results
      if (row.desglose.length > 0) {
        // Sort descending by votes so posicion=1 always goes to the leading party.
        const sortedDesglose = [...row.desglose].sort((a, b) => (b.v || 0) - (a.v || 0));
        const totalVotos = sortedDesglose.reduce((sum, d) => sum + (d.v || 0), 0);

        const payloadDetails: HistorialResultadoImportPayload[] = sortedDesglose
          .map((d, index) => {
            const pId = partyMap.get(d.p.toUpperCase());
            if (!pId) return null;
            return {
              historial_id: dbId,
              partido_id: pId,
              votos: d.v,
              porcentaje: totalVotos > 0
                ? parseFloat(((d.v / totalVotos) * 100).toFixed(2))
                : 0,
              posicion: index + 1,
            };
          })
          .filter(
            (detail): detail is HistorialResultadoImportPayload =>
              detail !== null
          );

        if (payloadDetails.length > 0) {
          const { error: insError } = await service
            .from("historial_electoral_resultados")
            .insert(payloadDetails);
          if (insError) throw new Error(`Fallo inserción detalle: ${insError.message}`);
        }
      }

      // Success accounting
      if (row.status === "nuevo") result.inserted++;
      else result.updated++;

    } catch (err) {
      result.errors.push({ 
        row: row.anio, 
        message: `Error procesando detalles para ${row.municipio_id}/${row.anio}: ${err instanceof Error ? err.message : String(err)}` 
      });
      result.skipped++;
    }
  }

  revalidatePath("/admin/historial");
  return result;
}
