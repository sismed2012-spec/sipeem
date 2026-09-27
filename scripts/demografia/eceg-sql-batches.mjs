import { Buffer } from "node:buffer";

import { hashEcegRecord } from "./eceg-parser.mjs";

const DEFAULT_BATCH_SIZE = 250;
const SOURCE_FRAME_DATE = "2021-01-31";

const CORE_FIELDS = {
  poblacion_poblacion_total: "pobtot",
  poblacion_poblacion_femenina: "pobfem",
  poblacion_poblacion_masculina: "pobmas",
  poblacion_poblacion_de_0_a_14_anos: "pob0_14",
  poblacion_poblacion_de_15_a_64_anos: "pob15_64",
  poblacion_poblacion_de_65_anos_y_mas: "pob65_mas",
  poblacion_poblacion_de_18_anos_y_mas: "p_18ymas",
  caracteristicas_economicas_poblacion_de_12_anos_y_mas_economicamente_activa: "pea",
  caracteristicas_economicas_poblacion_de_12_anos_y_mas_ocupada: "pocupada",
  educacion_poblacion_de_15_anos_y_mas_analfabeta: "p15ym_an",
  educacion_grado_promedio_de_escolaridad: "graproes",
  servicios_de_salud_poblacion_afiliada_a_servicios_de_salud: "pder_ss",
  discapacidad_poblacion_con_discapacidad: "pcon_disc",
  etnicidad_poblacion_de_3_anos_y_mas_que_habla_alguna_lengua_indigena: "p3ym_hli",
  etnicidad_poblacion_que_se_considera_afromexicana_o_afrodescendiente: "pob_afro",
  vivienda_total_de_viviendas_habitadas: "tvivhab",
  vivienda_viviendas_particulares_habitadas_que_disponen_de_agua_entubada_en_el_ambito_de_la_vivienda: "vph_aguadv",
  vivienda_viviendas_particulares_habitadas_que_disponen_de_drenaje: "vph_drenaj",
  vivienda_viviendas_particulares_habitadas_que_disponen_de_energia_electrica: "vph_c_elec",
  vivienda_viviendas_particulares_habitadas_que_disponen_de_telefono_celular: "vph_cel",
  vivienda_viviendas_particulares_habitadas_que_disponen_de_computadora_laptop_o_tablet: "vph_pc",
  vivienda_viviendas_particulares_habitadas_que_disponen_de_internet: "vph_inter",
};

export const ECEG_CORE_INDICATOR_IDS = Object.freeze(Object.keys(CORE_FIELDS));

export function assertEcegCoreIndicators(indicators) {
  const actual = new Set(indicators.map((indicator) => indicator.id));
  const missing = ECEG_CORE_INDICATOR_IDS.filter((id) => !actual.has(id));
  if (missing.length > 0) {
    throw new Error(`Missing ECEG core indicators: ${missing.join(", ")}`);
  }
  return indicators;
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

function assertBatchOptions(options) {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize <= 0) {
    throw new Error("batchSize must be positive");
  }
  if (!/^[0-9a-f]{64}$/u.test(options.sourceHash ?? "")) {
    throw new Error("sourceHash must be a lowercase SHA-256");
  }
  return batchSize;
}

function checksumBatch(descriptor) {
  return hashEcegRecord(descriptor);
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

function buildBatches(rows, options, stage, sqlBuilder, startingSequence) {
  const batchSize = assertBatchOptions(options);
  const batches = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const slice = rows.slice(offset, offset + batchSize);
    const descriptor = {
      stage,
      start: offset + 1,
      end: offset + slice.length,
      rows: slice,
      sourceHash: options.sourceHash,
      ...(options.cartographyVersionId
        ? { cartographyVersionId: options.cartographyVersionId }
        : {}),
    };
    batches.push(finalizeBatch(
      descriptor,
      sqlBuilder,
      startingSequence + batches.length
    ));
  }
  return batches;
}

function sourceSql(descriptor) {
  const payload = encodePayload(descriptor.rows[0]);
  return `begin;
with payload as (
  select pg_catalog.convert_from(
    pg_catalog.decode('${payload}', 'base64'), 'UTF8'
  )::jsonb as value
)
insert into public.demografia_fuentes (
  proveedor, conjunto, anio_censal, clave_entidad, archivo_nombre,
  archivo_sha256, codificaciones, filas_total, columnas_total, metadatos
)
select
  'INEGI', 'CPV2020_ECEG', 2020, '15', value ->> 'archivo_nombre',
  value ->> 'archivo_sha256', value -> 'codificaciones',
  (value ->> 'filas_total')::integer,
  (value ->> 'columnas_total')::smallint,
  value -> 'metadatos'
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

function dataBatchSql(
  descriptor,
  checksum,
  upsertSql,
  payloadRows = descriptor.rows,
  payloadMetadata = {}
) {
  const payload = encodePayload({
    sourceHash: descriptor.sourceHash,
    ...payloadMetadata,
    rows: payloadRows,
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
    and conjunto = 'CPV2020_ECEG'
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
    raise exception 'Batch ${checksum} affected % rows; expected ${descriptor.rows.length}',
      v_affected;
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
    v_source_id, x.mnemonic, x.name, null, x.logical_type,
    x.unit, x.category, x.reserve_rule, x.expose_summary, x.indicator_order
  from pg_catalog.jsonb_to_recordset(v_payload -> 'rows') as x(
    mnemonic text, name text, logical_type text, unit text, category text,
    reserve_rule jsonb, expose_summary boolean, indicator_order smallint
  )
  on conflict on constraint demografia_indicadores_fuente_mnemonico_uk do update set
    nombre = excluded.nombre,
    tipo_logico = excluded.tipo_logico,
    unidad = excluded.unidad,
    categoria = excluded.categoria,
    regla_reserva = excluded.regla_reserva,
    exponer_resumen = excluded.exponer_resumen,
    orden = excluded.orden;`;
  return dataBatchSql(descriptor, checksum, upsert);
}

function sectionSql(descriptor, checksum) {
  const indicatorIds = Object.keys(descriptor.rows[0]?.indicadores ?? {});
  const compactRows = descriptor.rows.map((row) => {
    const rowIndicatorIds = Object.keys(row.indicadores);
    if (
      rowIndicatorIds.length !== indicatorIds.length
      || rowIndicatorIds.some((id, index) => id !== indicatorIds[index])
    ) {
      throw new Error(`Inconsistent ECEG indicator order in section ${row.numero_seccion}`);
    }
    const { indicadores, ...identityAndSummary } = row;
    return {
      ...identityAndSummary,
      indicator_values: indicatorIds.map((id) => indicadores[id]),
    };
  });
  const typedColumns = [...new Set(Object.values(CORE_FIELDS))];
  const typedDefinition = typedColumns
    .map((column) => `${column} ${column === "graproes" ? "numeric" : "bigint"}`)
    .join(",\n      ");
  const typedSelect = typedColumns.map((column) => `x.${column}`).join(",\n    ");
  const typedUpdate = typedColumns
    .map((column) => `${column} = excluded.${column}`)
    .join(",\n    ");
  const upsert = `  insert into public.demografia_eceg_secciones (
    demografia_fuente_id, clave_entidad, nombre_entidad,
    numero_distrito_federal, grupo_complejidad,
    clave_municipio, nombre_municipio, numero_seccion,
    marco_cartografico_fecha, filas_origen, registro_sha256,
    ${typedColumns.join(", ")}, indicadores, estados_dato
  )
  select
    v_source_id, x.clave_entidad, x.nombre_entidad,
    x.numero_distrito_federal, x.grupo_complejidad,
    x.clave_municipio, x.nombre_municipio, x.numero_seccion,
    x.marco_cartografico_fecha, x.filas_origen, x.registro_sha256,
    ${typedSelect}, packed.indicadores, x.estados_dato
  from pg_catalog.jsonb_to_recordset(v_payload -> 'rows') as x(
    clave_entidad text, nombre_entidad text,
    numero_distrito_federal text, grupo_complejidad text,
    clave_municipio text, nombre_municipio text, numero_seccion text,
    marco_cartografico_fecha date, filas_origen jsonb, registro_sha256 text,
    ${typedDefinition},
    indicator_values jsonb, estados_dato jsonb
  )
  cross join lateral (
    select pg_catalog.jsonb_object_agg(
      indicator_id.value,
      indicator_value.value
      order by indicator_id.ordinality
    ) as indicadores
    from pg_catalog.jsonb_array_elements_text(
      v_payload -> 'indicatorIds'
    ) with ordinality as indicator_id(value, ordinality)
    join pg_catalog.jsonb_array_elements(
      x.indicator_values
    ) with ordinality as indicator_value(value, ordinality)
      using (ordinality)
  ) packed
  where pg_catalog.jsonb_array_length(x.indicator_values)
    = pg_catalog.jsonb_array_length(v_payload -> 'indicatorIds')
  on conflict on constraint demografia_eceg_secciones_clave_uk do update set
    nombre_entidad = excluded.nombre_entidad,
    numero_distrito_federal = excluded.numero_distrito_federal,
    grupo_complejidad = excluded.grupo_complejidad,
    clave_municipio = excluded.clave_municipio,
    nombre_municipio = excluded.nombre_municipio,
    marco_cartografico_fecha = excluded.marco_cartografico_fecha,
    filas_origen = excluded.filas_origen,
    registro_sha256 = excluded.registro_sha256,
    ${typedUpdate},
    indicadores = excluded.indicadores,
    estados_dato = excluded.estados_dato,
    updated_at = pg_catalog.now();`;
  return dataBatchSql(
    descriptor,
    checksum,
    upsert,
    compactRows,
    { indicatorIds }
  );
}

function correspondenceSql(descriptor, checksum) {
  const version = descriptor.cartographyVersionId;
  const upsert = `  insert into public.demografia_eceg_correspondencias (
    demografia_fuente_id, demografia_eceg_seccion_id,
    cartografia_version_id, cartografia_seccion_id, seccion_id,
    metodo, estado, confianza, evidencia, advertencias, publicada_at
  )
  select
    v_source_id,
    source.demografia_eceg_seccion_id,
    ${version},
    c.cartografia_seccion_id,
    c.seccion_id,
    case when c.cartografia_seccion_id is null then 'SIN_MATCH'
      else 'CLAVE_NUMERICA' end,
    case when c.cartografia_seccion_id is null then 'SIN_EQUIVALENCIA'
      else 'VINCULO_HISTORICO' end,
    case when c.cartografia_seccion_id is null then 0 else 1 end,
    pg_catalog.jsonb_build_object(
      'sourceFrameDate', '${SOURCE_FRAME_DATE}',
      'sourceSection', x.numero_seccion,
      'matchRule', 'ENTITY_AND_NUMERIC_SECTION'
    ),
    case when c.cartografia_seccion_id is null
      then pg_catalog.jsonb_build_array('Sin sección numérica equivalente en la versión destino')
      else pg_catalog.jsonb_build_array('Dato histórico sobre marco INE enero 2021; no implica igualdad geométrica')
    end,
    null
  from pg_catalog.jsonb_to_recordset(v_payload -> 'rows') as x(
    clave_entidad text, numero_seccion text
  )
  join public.demografia_eceg_secciones source
    on source.demografia_fuente_id = v_source_id
   and source.clave_entidad = x.clave_entidad
   and source.numero_seccion = x.numero_seccion
  left join public.cartografia_secciones c
    on c.cartografia_version_id = ${version}
   and c.clave_entidad = x.clave_entidad
   and c.numero = x.numero_seccion::integer
  on conflict on constraint demografia_eceg_correspondencias_identidad_uk do update set
    cartografia_seccion_id = excluded.cartografia_seccion_id,
    seccion_id = excluded.seccion_id,
    metodo = excluded.metodo,
    estado = excluded.estado,
    confianza = excluded.confianza,
    evidencia = excluded.evidencia,
    advertencias = excluded.advertencias,
    publicada_at = null,
    updated_at = pg_catalog.now();`;
  return dataBatchSql(descriptor, checksum, upsert);
}

export function buildEcegSourceBatch(profile) {
  const row = {
    archivo_nombre: profile.fileName,
    archivo_sha256: profile.sourceHash,
    codificaciones: { workbook: "xlsx" },
    filas_total: profile.sectionCount,
    columnas_total: profile.indicatorCount,
    metadatos: {
      sourceFrameDate: SOURCE_FRAME_DATE,
      zipSha256: profile.zipHash,
      workbookSha256: profile.sourceHash,
      sheetSchemas: profile.sheetSchemas,
      grain: "SECCION",
    },
  };
  return finalizeBatch(
    { stage: "FUENTE", start: 1, end: 1, rows: [row], sourceHash: profile.sourceHash },
    sourceSql,
    1
  );
}

export function buildEcegIndicatorBatches(indicators, options) {
  const rows = indicators.map((indicator, index) => {
    const isAverage = /^Promedio\b/iu.test(indicator.officialHeader);
    const isRatio = /^Relación\b/iu.test(indicator.officialHeader);
    return {
      mnemonic: indicator.id.toUpperCase(),
      name: indicator.officialHeader,
      logical_type: isAverage || isRatio ? "DECIMAL" : "ENTERO",
      unit: isAverage ? "PROMEDIO" : isRatio ? "RAZON" : "CONTEO",
      category: indicator.theme,
      reserve_rule: { reserved: "*", absent: "BLANK" },
      expose_summary: Object.hasOwn(CORE_FIELDS, indicator.id),
      indicator_order: index,
    };
  });
  return buildBatches(rows, options, "INDICADORES", indicatorSql, 2);
}

export function normalizeEcegSection(section) {
  const normalized = {
    clave_entidad: section.geography.entityCode,
    nombre_entidad: section.geography.entityName,
    numero_distrito_federal: section.geography.district,
    grupo_complejidad: section.geography.complexityGroup,
    clave_municipio: section.geography.municipalityCode,
    nombre_municipio: section.geography.municipalityName,
    numero_seccion: section.geography.sectionNumber,
    marco_cartografico_fecha: SOURCE_FRAME_DATE,
    filas_origen: section.rowNumbers,
    registro_sha256: section.recordHash,
    indicadores: {},
    estados_dato: {},
  };
  for (const [indicatorId, cell] of Object.entries(section.indicators)) {
    const mnemonic = indicatorId.toUpperCase();
    normalized.indicadores[mnemonic] = cell.value;
    if (cell.status !== "PRESENTE") {
      normalized.estados_dato[mnemonic] = cell.status;
    }
    const coreField = CORE_FIELDS[indicatorId];
    if (coreField) normalized[coreField] = cell.value;
  }
  return normalized;
}

export function buildEcegSectionBatches(sections, options) {
  return buildBatches(sections, options, "SECCIONES_ECEG", sectionSql, 100);
}

export function buildEcegCorrespondenceBatches(sections, options) {
  if (
    !Number.isSafeInteger(options.cartographyVersionId)
    || options.cartographyVersionId <= 0
  ) {
    throw new Error("cartographyVersionId must be a positive integer");
  }
  const rows = sections.map(({ clave_entidad, numero_seccion }) => ({
    clave_entidad,
    numero_seccion,
  }));
  return buildBatches(
    rows,
    options,
    "CORRESPONDENCIAS_ECEG",
    correspondenceSql,
    200
  );
}
