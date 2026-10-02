import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

const DEFAULT_BATCH_SIZE = 250;
const MAX_BATCH_SIZE = 250;

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function checksumBatch(descriptor) {
  return createHash("sha256").update(JSON.stringify(descriptor)).digest("hex");
}

function finalizeBatch(descriptor, sqlBuilder, sequence) {
  const checksum = checksumBatch(descriptor);
  return {
    id: `${descriptor.stage}:${descriptor.start}-${descriptor.end}`,
    stage: descriptor.stage,
    start: descriptor.start,
    end: descriptor.end,
    expectedRows: descriptor.rows.length,
    checksum,
    fileName: `${String(sequence).padStart(3, "0")}-${descriptor.stage.toLowerCase()}-${descriptor.start}-${descriptor.end}-${checksum.slice(0, 12)}.sql`,
    sql: sqlBuilder(descriptor, checksum),
  };
}

function cutSql(descriptor) {
  const payload = encodePayload(descriptor.rows[0]);
  return `begin;
with payload as (
  select pg_catalog.convert_from(
    pg_catalog.decode('${payload}', 'base64'), 'UTF8'
  )::jsonb as value
)
insert into public.lista_nominal_cortes (
  clave, fecha_corte, clave_entidad, fuente, archivo_nombre,
  archivo_sha256, filas_secciones, padron_total, lista_nominal_total,
  diferencia_total, residentes_extranjero, metadata
)
select
  value ->> 'clave', (value ->> 'fecha_corte')::date,
  value ->> 'clave_entidad', value ->> 'fuente',
  value ->> 'archivo_nombre', value ->> 'archivo_sha256',
  (value ->> 'filas_secciones')::integer,
  (value ->> 'padron_total')::bigint,
  (value ->> 'lista_nominal_total')::bigint,
  (value ->> 'diferencia_total')::bigint,
  value -> 'residentes_extranjero', value -> 'metadata'
from payload
on conflict on constraint lista_nominal_cortes_archivo_sha256_uk do update set
  archivo_nombre = excluded.archivo_nombre,
  filas_secciones = excluded.filas_secciones,
  padron_total = excluded.padron_total,
  lista_nominal_total = excluded.lista_nominal_total,
  diferencia_total = excluded.diferencia_total,
  residentes_extranjero = excluded.residentes_extranjero,
  metadata = excluded.metadata,
  updated_at = pg_catalog.now()
where public.lista_nominal_cortes.estado not in ('PUBLICADO', 'ARCHIVADO');
commit;
`;
}

function normalizedForeignResidents(row) {
  return {
    padronHombres: row.padronHombres,
    padronMujeres: row.padronMujeres,
    padronNoBinario: row.padronNoBinario,
    padronTotal: row.padronTotal,
    listaHombres: row.listaHombres,
    listaMujeres: row.listaMujeres,
    listaNoBinario: row.listaNoBinario,
    listaTotal: row.listaTotal,
    diferencia: row.diferencia,
    cobertura: row.cobertura,
    sourceRow: row.sourceRow,
  };
}

export function buildCutBatch({
  sourceHash,
  fileName,
  cutoffDate,
  profile,
  foreignResidents,
  sheetName = "S",
}) {
  const row = {
    clave: `INE-${cutoffDate}-15-${sourceHash.slice(0, 12)}`,
    fecha_corte: cutoffDate,
    clave_entidad: "15",
    fuente: "INE",
    archivo_nombre: fileName,
    archivo_sha256: sourceHash,
    filas_secciones: profile.sections,
    padron_total: profile.padron,
    lista_nominal_total: profile.nominal,
    diferencia_total: profile.difference,
    residentes_extranjero: normalizedForeignResidents(foreignResidents),
    metadata: { sheetName },
  };
  return finalizeBatch(
    { stage: "CORTE", start: 1, end: 1, rows: [row], sourceHash },
    cutSql,
    1,
  );
}

function normalizeSectionRow(row) {
  return {
    clave_entidad: "15",
    clave_municipio: row.municipioClave,
    municipio_nombre: row.municipioNombre,
    distrito_local: Number(row.distritoLocal),
    distrito_local_nombre: row.distritoLocalNombre,
    distrito_federal: Number(row.distritoFederal),
    distrito_federal_nombre: row.distritoFederalNombre,
    numero_seccion: Number(row.seccion),
    padron_hombres: row.padronHombres,
    padron_mujeres: row.padronMujeres,
    padron_no_binario: row.padronNoBinario,
    padron_total: row.padronTotal,
    lista_hombres: row.listaHombres,
    lista_mujeres: row.listaMujeres,
    lista_no_binario: row.listaNoBinario,
    lista_total: row.listaTotal,
    diferencia: row.diferencia,
    cobertura: row.cobertura,
    fila_origen: row.sourceRow,
    payload_auditoria: {
      distritoFederal: row.distritoFederal,
      distritoLocal: row.distritoLocal,
      municipioClave: row.municipioClave,
      seccion: row.seccion,
    },
  };
}

function sectionSql(descriptor, checksum) {
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
  v_corte_id bigint;
  v_estado text;
  v_affected integer;
begin
  select lista_nominal_corte_id, estado
  into strict v_corte_id, v_estado
  from public.lista_nominal_cortes
  where archivo_sha256 = v_payload ->> 'sourceHash';

  if v_estado in ('PUBLICADO', 'ARCHIVADO') then
    raise exception 'El corte nominal % es inmutable porque está %', v_corte_id, v_estado;
  end if;

  insert into public.lista_nominal_secciones (
    lista_nominal_corte_id, clave_entidad, clave_municipio,
    municipio_nombre, distrito_local, distrito_local_nombre,
    distrito_federal, distrito_federal_nombre, numero_seccion,
    padron_hombres, padron_mujeres, padron_no_binario, padron_total,
    lista_hombres, lista_mujeres, lista_no_binario, lista_total,
    diferencia, cobertura, fila_origen, payload_auditoria
  )
  select
    v_corte_id, x.clave_entidad, x.clave_municipio,
    x.municipio_nombre, x.distrito_local, x.distrito_local_nombre,
    x.distrito_federal, x.distrito_federal_nombre, x.numero_seccion,
    x.padron_hombres, x.padron_mujeres, x.padron_no_binario, x.padron_total,
    x.lista_hombres, x.lista_mujeres, x.lista_no_binario, x.lista_total,
    x.diferencia, x.cobertura, x.fila_origen, x.payload_auditoria
  from pg_catalog.jsonb_to_recordset(v_payload -> 'rows') as x(
    clave_entidad text, clave_municipio text, municipio_nombre text,
    distrito_local integer, distrito_local_nombre text,
    distrito_federal integer, distrito_federal_nombre text,
    numero_seccion integer,
    padron_hombres integer, padron_mujeres integer, padron_no_binario integer,
    padron_total integer, lista_hombres integer, lista_mujeres integer,
    lista_no_binario integer, lista_total integer, diferencia integer,
    cobertura double precision, fila_origen integer, payload_auditoria jsonb
  )
  on conflict on constraint lista_nominal_secciones_corte_entidad_numero_uk
  do update set
    clave_municipio = excluded.clave_municipio,
    municipio_nombre = excluded.municipio_nombre,
    distrito_local = excluded.distrito_local,
    distrito_local_nombre = excluded.distrito_local_nombre,
    distrito_federal = excluded.distrito_federal,
    distrito_federal_nombre = excluded.distrito_federal_nombre,
    padron_hombres = excluded.padron_hombres,
    padron_mujeres = excluded.padron_mujeres,
    padron_no_binario = excluded.padron_no_binario,
    padron_total = excluded.padron_total,
    lista_hombres = excluded.lista_hombres,
    lista_mujeres = excluded.lista_mujeres,
    lista_no_binario = excluded.lista_no_binario,
    lista_total = excluded.lista_total,
    diferencia = excluded.diferencia,
    cobertura = excluded.cobertura,
    fila_origen = excluded.fila_origen,
    payload_auditoria = excluded.payload_auditoria,
    updated_at = pg_catalog.now();

  get diagnostics v_affected = row_count;
  if v_affected <> ${descriptor.rows.length} then
    raise exception 'Lote ${checksum} afectó % filas; se esperaban ${descriptor.rows.length}',
      v_affected;
  end if;
end
$batch$;
commit;
`;
}

export function buildSectionBatches(rows, options) {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error("batchSize must be an integer between 1 and 250");
  }
  const batches = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const slice = rows.slice(offset, offset + batchSize).map(normalizeSectionRow);
    const descriptor = {
      stage: "SECCIONES",
      start: offset + 1,
      end: offset + slice.length,
      rows: slice,
      sourceHash: options.sourceHash,
    };
    batches.push(finalizeBatch(descriptor, sectionSql, batches.length + 2));
  }
  return batches;
}

function publishSql(descriptor) {
  return `begin;
do $publish$
declare
  v_corte_id bigint;
  v_estado text;
  v_esperadas integer;
  v_secciones integer;
  v_correspondencias integer;
begin
  select lista_nominal_corte_id, estado, filas_secciones
  into strict v_corte_id, v_estado, v_esperadas
  from public.lista_nominal_cortes
  where archivo_sha256 = '${descriptor.sourceHash}';

  if v_estado <> 'VALIDADO' then
    raise exception 'El corte debe estar VALIDADO antes de publicar; estado actual: %', v_estado;
  end if;

  select pg_catalog.count(*)::integer into v_secciones
  from public.lista_nominal_secciones
  where lista_nominal_corte_id = v_corte_id;
  if v_secciones <> v_esperadas then
    raise exception 'El corte tiene % secciones; se esperaban %', v_secciones, v_esperadas;
  end if;

  select pg_catalog.count(*)::integer into v_correspondencias
  from public.lista_nominal_correspondencias
  where lista_nominal_corte_id = v_corte_id
    and cartografia_version_id = ${descriptor.cartographyVersionId};
  if v_correspondencias <> v_esperadas then
    raise exception 'La versión cartográfica ${descriptor.cartographyVersionId} tiene % correspondencias; se esperaban %',
      v_correspondencias, v_esperadas;
  end if;

  update public.lista_nominal_cortes
  set estado = 'PUBLICADO', publicado_at = pg_catalog.now()
  where lista_nominal_corte_id = v_corte_id;
end
$publish$;
commit;
`;
}

export function buildPublishBatch({ sourceHash, cartographyVersionId }) {
  if (!Number.isSafeInteger(cartographyVersionId) || cartographyVersionId <= 0) {
    throw new Error("cartographyVersionId must be a positive integer");
  }
  const descriptor = {
    stage: "PUBLICACION",
    start: 1,
    end: 1,
    rows: [{ sourceHash, cartographyVersionId }],
    sourceHash,
    cartographyVersionId,
  };
  return finalizeBatch(descriptor, publishSql, 999);
}
