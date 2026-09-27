import { Buffer } from "node:buffer";

import {
  classifyIterRow,
  hashRecord,
  parseDmsCoordinate,
  parseIterValue,
} from "./iter-parser.mjs";

const DEFAULT_BATCH_SIZE = 250;
const IDENTITY_HEADERS = new Set([
  "ENTIDAD", "NOM_ENT", "MUN", "NOM_MUN", "LOC", "NOM_LOC",
  "LONGITUD", "LATITUD", "ALTITUD",
]);

const CORE_FIELDS = {
  POBTOT: "pobtot",
  POBFEM: "pobfem",
  POBMAS: "pobmas",
  POB0_14: "pob0_14",
  POB15_64: "pob15_64",
  POB65_MAS: "pob65_mas",
  P_18YMAS: "p_18ymas",
  PEA: "pea",
  POCUPADA: "pocupada",
  P15YM_AN: "p15ym_an",
  GRAPROES: "graproes",
  PDER_SS: "pder_ss",
  PCON_DISC: "pcon_disc",
  P3YM_HLI: "p3ym_hli",
  POB_AFRO: "pob_afro",
  TVIVHAB: "tvivhab",
  VPH_AGUADV: "vph_aguadv",
  VPH_DRENAJ: "vph_drenaj",
  VPH_C_ELEC: "vph_c_elec",
  VPH_CEL: "vph_cel",
  VPH_PC: "vph_pc",
  VPH_INTER: "vph_inter",
};

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function checksumBatch(descriptor) {
  return hashRecord(descriptor);
}

function finalizeBatch(descriptor, sqlBuilder, sequence) {
  const checksum = checksumBatch(descriptor);
  const fileName = `${String(sequence).padStart(3, "0")}-${descriptor.stage.toLowerCase()}-${descriptor.start}-${descriptor.end}-${checksum.slice(0, 12)}.sql`;
  return {
    id: `${descriptor.stage}:${descriptor.start}-${descriptor.end}`,
    stage: descriptor.stage,
    start: descriptor.start,
    end: descriptor.end,
    expectedRows: descriptor.rows.length,
    checksum,
    fileName,
    descriptor,
    sql: sqlBuilder(descriptor, checksum),
  };
}

function sourceSql(descriptor) {
  const payload = encodePayload(descriptor.rows[0]);
  return `begin;
with payload as (
  select pg_catalog.convert_from(pg_catalog.decode('${payload}', 'base64'), 'UTF8')::jsonb as value
)
insert into public.demografia_fuentes (
  proveedor, conjunto, anio_censal, clave_entidad, archivo_nombre,
  archivo_sha256, codificaciones, filas_total, columnas_total, metadatos
)
select
  value ->> 'proveedor', value ->> 'conjunto', (value ->> 'anio_censal')::smallint,
  value ->> 'clave_entidad', value ->> 'archivo_nombre', value ->> 'archivo_sha256',
  value -> 'codificaciones', (value ->> 'filas_total')::integer,
  (value ->> 'columnas_total')::smallint, value -> 'metadatos'
from payload
on conflict on constraint demografia_fuentes_identidad_uk do update set
  archivo_nombre = excluded.archivo_nombre,
  codificaciones = excluded.codificaciones,
  filas_total = excluded.filas_total,
  columnas_total = excluded.columnas_total,
  metadatos = excluded.metadatos,
  updated_at = pg_catalog.now();
commit;
`;
}

function dataBatchSql(descriptor, checksum, upsertSql) {
  const payload = encodePayload({
    sourceHash: descriptor.sourceHash,
    rows: descriptor.rows,
  });
  return `begin;
do $batch$
declare
  v_payload jsonb := pg_catalog.convert_from(
    pg_catalog.decode('${payload}', 'base64'), 'UTF8'
  )::jsonb;
  v_source_id bigint;
  v_batch_id bigint;
  v_affected integer;
begin
  select demografia_fuente_id into strict v_source_id
  from public.demografia_fuentes
  where proveedor = 'INEGI'
    and conjunto = 'CPV2020_ITER'
    and anio_censal = 2020
    and clave_entidad = '15'
    and archivo_sha256 = v_payload ->> 'sourceHash';

  if exists (
    select 1 from public.demografia_cargas_lotes
    where demografia_fuente_id = v_source_id
      and etapa = '${descriptor.stage}'
      and checksum = '${checksum}'
      and estado = 'CONFIRMADO'
  ) then
    raise notice 'DEMOGRAFIA_BATCH_ALREADY_CONFIRMED:${checksum}';
    return;
  end if;

  insert into public.demografia_cargas_lotes (
    demografia_fuente_id, etapa, rango_inicio, rango_fin,
    filas_esperadas, filas_procesadas, checksum, estado, started_at
  ) values (
    v_source_id, '${descriptor.stage}', ${descriptor.start}, ${descriptor.end},
    ${descriptor.rows.length}, 0, '${checksum}', 'EN_PROCESO', pg_catalog.now()
  )
  on conflict on constraint demografia_cargas_lotes_identidad_uk do update set
    filas_procesadas = 0,
    estado = 'EN_PROCESO',
    started_at = pg_catalog.now(),
    completed_at = null,
    error_detalle = null
  where public.demografia_cargas_lotes.estado <> 'CONFIRMADO'
  returning demografia_carga_lote_id into v_batch_id;

${upsertSql}

  get diagnostics v_affected = row_count;
  if v_affected <> ${descriptor.rows.length} then
    raise exception 'Batch ${checksum} affected % rows; expected ${descriptor.rows.length}', v_affected;
  end if;

  update public.demografia_cargas_lotes
  set filas_procesadas = ${descriptor.rows.length},
      estado = 'CONFIRMADO',
      completed_at = pg_catalog.now(),
      error_detalle = null
  where demografia_carga_lote_id = v_batch_id;
end
$batch$;
commit;
`;
}

function indicatorSql(descriptor, checksum) {
  const upsert = `  insert into public.demografia_indicadores (
    demografia_fuente_id, mnemonico, nombre, descripcion, tipo_logico,
    unidad, categoria, regla_reserva, exponer_resumen, orden
  )
  select
    v_source_id, x.mnemonic, x.name, x.description, x.logical_type,
    x.unit, x.category, x.reserve_rule, x.expose_summary, x.indicator_order
  from pg_catalog.jsonb_to_recordset(v_payload -> 'rows') as x(
    mnemonic text, name text, description text, logical_type text,
    unit text, category text, reserve_rule jsonb,
    expose_summary boolean, indicator_order smallint
  )
  on conflict on constraint demografia_indicadores_fuente_mnemonico_uk do update set
    nombre = excluded.nombre,
    descripcion = excluded.descripcion,
    tipo_logico = excluded.tipo_logico,
    unidad = excluded.unidad,
    categoria = excluded.categoria,
    regla_reserva = excluded.regla_reserva,
    exponer_resumen = excluded.exponer_resumen,
    orden = excluded.orden;`;
  return dataBatchSql(descriptor, checksum, upsert);
}

function localitySql(descriptor, checksum) {
  const typedColumns = Object.values(CORE_FIELDS);
  const typedDefinition = typedColumns
    .map((column) => `${column} ${column === "graproes" ? "numeric" : "bigint"}`)
    .join(",\n      ");
  const typedSelect = typedColumns.map((column) => `x.${column}`).join(",\n    ");
  const updateSet = typedColumns.map((column) => `${column} = excluded.${column}`).join(",\n    ");
  const upsert = `  insert into public.demografia_localidades (
    demografia_fuente_id, clave_entidad, clave_municipio, clave_localidad,
    nombre_entidad, nombre_municipio, nombre_localidad,
    longitud, latitud, altitud, geom_punto, fila_origen, registro_sha256,
    ${typedColumns.join(", ")}, indicadores, estados_dato
  )
  select
    v_source_id, x.clave_entidad, x.clave_municipio, x.clave_localidad,
    x.nombre_entidad, x.nombre_municipio, x.nombre_localidad,
    x.longitud, x.latitud, x.altitud,
    extensions.st_setsrid(extensions.st_makepoint(x.longitud::numeric(11, 7), x.latitud::numeric(10, 7)), 4326),
    x.fila_origen, x.registro_sha256,
    ${typedSelect}, x.indicadores, x.estados_dato
  from pg_catalog.jsonb_to_recordset(v_payload -> 'rows') as x(
    clave_entidad text, clave_municipio text, clave_localidad text,
    nombre_entidad text, nombre_municipio text, nombre_localidad text,
    longitud numeric, latitud numeric, altitud integer,
    fila_origen integer, registro_sha256 text,
    ${typedDefinition},
    indicadores jsonb, estados_dato jsonb
  )
  on conflict on constraint demografia_localidades_clave_uk do update set
    nombre_entidad = excluded.nombre_entidad,
    nombre_municipio = excluded.nombre_municipio,
    nombre_localidad = excluded.nombre_localidad,
    longitud = excluded.longitud,
    latitud = excluded.latitud,
    altitud = excluded.altitud,
    geom_punto = excluded.geom_punto,
    fila_origen = excluded.fila_origen,
    registro_sha256 = excluded.registro_sha256,
    ${updateSet},
    indicadores = excluded.indicadores,
    estados_dato = excluded.estados_dato,
    updated_at = pg_catalog.now();`;
  return dataBatchSql(descriptor, checksum, upsert);
}

export function buildSourceBatch(profile) {
  const row = {
    proveedor: "INEGI",
    conjunto: "CPV2020_ITER",
    anio_censal: 2020,
    clave_entidad: "15",
    archivo_nombre: profile.fileName,
    archivo_sha256: profile.sourceHash,
    codificaciones: profile.encodings,
    filas_total: profile.totalRows,
    columnas_total: profile.columnCount,
    metadatos: profile.metadata ?? {},
  };
  return finalizeBatch(
    { stage: "FUENTE", start: 1, end: 1, rows: [row], sourceHash: profile.sourceHash },
    sourceSql,
    1
  );
}

function buildBatches(rows, options, stage, sqlBuilder, startingSequence) {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error("batchSize must be positive");
  const batches = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const slice = rows.slice(offset, offset + batchSize);
    const descriptor = {
      stage,
      start: offset + 1,
      end: offset + slice.length,
      rows: slice,
      sourceHash: options.sourceHash,
    };
    batches.push(finalizeBatch(descriptor, sqlBuilder, startingSequence + batches.length));
  }
  return batches;
}

export function buildIndicatorBatches(indicators, options) {
  const rows = indicators.map((indicator) => ({
    mnemonic: indicator.mnemonic,
    name: indicator.name,
    description: indicator.description,
    logical_type: indicator.logicalType,
    unit: indicator.unit,
    category: indicator.category,
    reserve_rule: indicator.reserveRule,
    expose_summary: indicator.exposeSummary,
    indicator_order: indicator.order,
  }));
  return buildBatches(rows, options, "INDICADORES", indicatorSql, 2);
}

export function buildLocalityBatches(localities, options) {
  return buildBatches(localities, options, "LOCALIDADES", localitySql, 100);
}

export function normalizeLocalityRow(row, headers, sourceRow) {
  if (classifyIterRow(row) !== "LOCALITY") {
    throw new Error("Only real ITER localities can be normalized");
  }
  const normalized = {
    clave_entidad: row.ENTIDAD,
    clave_municipio: row.MUN,
    clave_localidad: row.LOC,
    nombre_entidad: row.NOM_ENT,
    nombre_municipio: row.NOM_MUN,
    nombre_localidad: row.NOM_LOC,
    longitud: Number(parseDmsCoordinate(row.LONGITUD).toFixed(7)),
    latitud: Number(parseDmsCoordinate(row.LATITUD).toFixed(7)),
    altitud: parseIterValue(row.ALTITUD).value,
    fila_origen: sourceRow,
    registro_sha256: hashRecord(row),
    indicadores: {},
    estados_dato: {},
  };

  for (const header of headers) {
    if (IDENTITY_HEADERS.has(header)) continue;
    const parsed = parseIterValue(row[header]);
    const coreField = CORE_FIELDS[header];
    if (coreField) normalized[coreField] = parsed.value;
    else normalized.indicadores[header] = parsed.value;
    if (parsed.status !== "PRESENTE") normalized.estados_dato[header] = parsed.status;
  }
  return normalized;
}
