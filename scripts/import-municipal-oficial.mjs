import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import dotenv from "dotenv";
import { read as xlsxRead, utils as xlsxUtils } from "@e965/xlsx";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const DEFAULT_FILE =
  "C:/Users/NZXT/Downloads/Resultados_definitivos_ayu_candidatura.xlsx";
const ANIO = 2024;

const FORCE_INDEX = {
  PAN: 6,
  PRI: 7,
  PRD: 8,
  PVEM: 9,
  PT: 10,
  MC: 11,
  MORENA: 12,
  NAEM: 13,
  PAN_PRI_PRD_NAEM: 14,
  PVEM_PT_MORENA: 15,
  CC_PAN_PRI_PRD_NAEM: 16,
  CAND_IND1: 17,
  CAND_IND2: 18,
  CAND_IND3: 19,
  CAND_IND4: 20,
  CAND_IND5: 21,
  CAND_IND6: 22,
  CAND_IND7: 23,
  CAND_IND8: 24,
  CAND_IND9: 25,
};

const FORCE_KEYS = Object.keys(FORCE_INDEX);

const WINNER_LABEL_TO_SIGLAS = {
  PAN: "PAN",
  PRI: "PRI",
  PRD: "PRD",
  PVEM: "PVEM",
  PT: "PT",
  MC: "MC",
  MORENA: "MORENA",
  NAEM: "NAEM",
  "COALICION PAN-PRI-PRD-NAEM": "PAN_PRI_PRD_NAEM",
  "COALICION PVEM-PT-MORENA": "PVEM_PT_MORENA",
  "CANDIDATURA COMUN PAN-PRI-PRD-NAEM": "CC_PAN_PRI_PRD_NAEM",
  CAND_IND1: "CAND_IND1",
  CAND_IND2: "CAND_IND2",
  CAND_IND3: "CAND_IND3",
  CAND_IND4: "CAND_IND4",
  CAND_IND5: "CAND_IND5",
  CAND_IND6: "CAND_IND6",
  CAND_IND7: "CAND_IND7",
  CAND_IND8: "CAND_IND8",
  CAND_IND9: "CAND_IND9",
};

function parseArgs(argv) {
  const args = { file: DEFAULT_FILE, dryRun: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--file" && argv[index + 1]) {
      args.file = argv[index + 1];
      index++;
      continue;
    }
    if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }
  return args;
}

function parseNumber(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/,/g, "")
    .replace(/%/g, "");
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function normalizeWinnerLabel(value) {
  const normalized = normalizeText(value).replace(/_/g, " ");
  if (!normalized) return null;
  return WINNER_LABEL_TO_SIGLAS[normalized] ?? normalized.replace(/ /g, "_");
}

function isNoteRow(value) {
  return /^Mediante resoluci/i.test(String(value ?? "").trim());
}

function ensureEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function buildRows(filePath) {
  const workbook = xlsxRead(fs.readFileSync(filePath), {
    type: "buffer",
    raw: false,
  });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsxUtils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });

  const dataRows = [];
  for (let index = 8; index < rows.length; index++) {
    const row = rows[index];
    const municipioNombre = String(row?.[1] ?? "").trim();
    if (!municipioNombre || isNoteRow(municipioNombre)) continue;
    const geoMunicipioId = parseNumber(row[0]);
    if (geoMunicipioId <= 0 || normalizeText(municipioNombre) === "TOTALES") {
      continue;
    }

    const fuerzas = {};
    for (const fuerza of FORCE_KEYS) {
      fuerzas[fuerza] = parseNumber(row[FORCE_INDEX[fuerza]]);
    }

    const fuerzaResultados = FORCE_KEYS.map((fuerza) => ({
      fuerza,
      votos: fuerzas[fuerza],
    }))
      .filter((item) => item.votos > 0)
      .sort((a, b) => b.votos - a.votos || a.fuerza.localeCompare(b.fuerza));

    const votosValidos = parseNumber(row[26]);
    const votosNoRegistrados = parseNumber(row[27]);
    const votosNulos = parseNumber(row[28]);
    const totalVotos = parseNumber(row[29]);

    const sumFuerzas = fuerzaResultados.reduce((sum, item) => sum + item.votos, 0);
    if (sumFuerzas !== votosValidos) {
      throw new Error(
        `Fila ${index + 1}: suma de fuerzas ${sumFuerzas} != votos validos ${votosValidos}`
      );
    }
    if (votosValidos + votosNoRegistrados + votosNulos !== totalVotos) {
      throw new Error(
        `Fila ${index + 1}: total votos inconsistente (${totalVotos})`
      );
    }

    dataRows.push({
      rowIndex: index + 1,
      geo_municipio_id: geoMunicipioId,
      municipio_nombre: municipioNombre,
      total_secciones: parseNumber(row[2]),
      total_casillas: parseNumber(row[3]),
      total_casillas_mec: parseNumber(row[4]),
      lista_nominal: parseNumber(row[5]),
      votos_validos: votosValidos,
      votos_no_registrados: votosNoRegistrados,
      votos_nulos: votosNulos,
      total_votos: totalVotos,
      participacion_ciudadana: parseNumber(row[30]),
      ganador_siglas: normalizeWinnerLabel(row[31]),
      ganador_votacion: parseNumber(row[32]),
      ganador_porcentaje: parseNumber(row[33]),
      segundo_siglas: normalizeWinnerLabel(row[34]),
      segundo_votacion: parseNumber(row[35]),
      segundo_porcentaje: parseNumber(row[36]),
      margen_votos: parseNumber(row[37]),
      margen_porcentual: parseNumber(row[38]),
      ruta_acta: String(row[39] ?? "").trim() || null,
      fuente: "import_xlsx_2024_see_ayun_mex_muncand",
      raw_municipio_nombre: municipioNombre,
      fuerza_resultados: fuerzaResultados,
    });
  }

  return dataRows;
}

async function main() {
  const { file, dryRun } = parseArgs(process.argv.slice(2));
  const supabase = createClient(
    ensureEnv("NEXT_PUBLIC_SUPABASE_URL"),
    ensureEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  if (!fs.existsSync(file)) {
    throw new Error(`No existe el archivo: ${file}`);
  }

  const rows = buildRows(file);
  const geoIds = Array.from(new Set(rows.map((row) => row.geo_municipio_id)));

  const [municipiosRes, partiesRes] = await Promise.all([
    supabase
      .from("municipios")
      .select("id, nombre, geo_municipio_id")
      .in("geo_municipio_id", geoIds),
    supabase.from("partidos").select("siglas, nombre, color, estatus"),
  ]);

  if (municipiosRes.error) throw municipiosRes.error;
  if (partiesRes.error) throw partiesRes.error;

  const municipalityByGeoId = new Map(
    (municipiosRes.data ?? [])
      .filter((row) => row.geo_municipio_id !== null)
      .map((row) => [row.geo_municipio_id, row])
  );

  const missingMunicipios = rows.filter(
    (row) => !municipalityByGeoId.has(row.geo_municipio_id)
  );
  if (missingMunicipios.length > 0) {
    throw new Error(
      `Municipios sin mapeo geo_municipio_id: ${missingMunicipios
        .slice(0, 10)
        .map((row) => `${row.geo_municipio_id}:${row.municipio_nombre}`)
        .join(", ")}`
    );
  }

  const partySiglas = new Set((partiesRes.data ?? []).map((row) => row.siglas));
  const missingParties = FORCE_KEYS.filter((siglas) => !partySiglas.has(siglas));
  if (missingParties.length > 0) {
    const seedPayload = missingParties.map((siglas) => ({
      siglas,
      nombre: siglas,
      color: "#6b7280",
      estatus: "activo",
    }));
    const { error } = await supabase
      .from("partidos")
      .upsert(seedPayload, { onConflict: "siglas" });
    if (error) throw error;
  }

  const headerPayload = rows.map((row) => ({
    municipio_id: municipalityByGeoId.get(row.geo_municipio_id).id,
    geo_municipio_id: row.geo_municipio_id,
    anio: ANIO,
    total_secciones: row.total_secciones,
    total_casillas: row.total_casillas,
    total_casillas_mec: row.total_casillas_mec,
    lista_nominal: row.lista_nominal,
    votos_validos: row.votos_validos,
    votos_no_registrados: row.votos_no_registrados,
    votos_nulos: row.votos_nulos,
    total_votos: row.total_votos,
    participacion_ciudadana: row.participacion_ciudadana,
    ganador_siglas: row.ganador_siglas,
    ganador_votacion: row.ganador_votacion,
    ganador_porcentaje: row.ganador_porcentaje,
    segundo_siglas: row.segundo_siglas,
    segundo_votacion: row.segundo_votacion,
    segundo_porcentaje: row.segundo_porcentaje,
    margen_votos: row.margen_votos,
    margen_porcentual: row.margen_porcentual,
    ruta_acta: row.ruta_acta,
    fuente: row.fuente,
    raw_municipio_nombre: row.raw_municipio_nombre,
  }));

  console.log(
    JSON.stringify(
      {
        file,
        dryRun,
        anio: ANIO,
        rows: rows.length,
        sample: headerPayload.slice(0, 3).map((row) => ({
          municipio_id: row.municipio_id,
          ganador_siglas: row.ganador_siglas,
          ganador_votacion: row.ganador_votacion,
          votos_validos: row.votos_validos,
        })),
      },
      null,
      2
    )
  );

  if (dryRun) return;

  const { data: upserted, error: upsertError } = await supabase
    .from("historial_municipal_oficial")
    .upsert(headerPayload, { onConflict: "municipio_id,anio" })
    .select("id, municipio_id, anio");

  if (upsertError) throw upsertError;

  const idByKey = new Map(
    (upserted ?? []).map((row) => [`${row.municipio_id}:${row.anio}`, row.id])
  );

  const ids = Array.from(idByKey.values());
  if (ids.length > 0) {
    const { error: deleteError } = await supabase
      .from("historial_municipal_oficial_resultados")
      .delete()
      .in("historial_municipal_id", ids);
    if (deleteError) throw deleteError;
  }

  const resultPayload = rows.flatMap((row) => {
    const municipioId = municipalityByGeoId.get(row.geo_municipio_id).id;
    const historialId = idByKey.get(`${municipioId}:${ANIO}`);
    if (!historialId) {
      throw new Error(
        `No se encontró historial_municipal_id para municipio ${municipioId}`
      );
    }
    return row.fuerza_resultados.map((fuerza) => ({
      historial_municipal_id: historialId,
      fuerza: fuerza.fuerza,
      votos: fuerza.votos,
    }));
  });

  if (resultPayload.length > 0) {
    const { error: insertResultsError } = await supabase
      .from("historial_municipal_oficial_resultados")
      .insert(resultPayload);
    if (insertResultsError) throw insertResultsError;
  }

  console.log(
    `Importación municipal oficial completada: ${headerPayload.length} municipios, ${resultPayload.length} resultados`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
