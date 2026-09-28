import { createHash } from "node:crypto";

function exactMatch(source, candidate) {
  return (
    candidate.claveEntidad === source.claveEntidad &&
    candidate.claveMunicipio === source.claveMunicipio &&
    candidate.numeroSeccion === source.numeroSeccion
  );
}

export function classifyExactCandidates(source, candidates) {
  const exact = candidates.filter((candidate) => exactMatch(source, candidate));
  if (exact.length === 0) {
    return { state: "PENDIENTE", candidate: null, candidateCount: 0 };
  }
  if (exact.length === 1) {
    return { state: "VINCULADA", candidate: exact[0], candidateCount: 1 };
  }
  return { state: "AMBIGUA", candidate: null, candidateCount: exact.length };
}

function crosswalkSql({ sourceHash, cartographyVersionId, expectedRows }) {
  return `begin;
do $crosswalk$
declare
  v_corte_id bigint;
  v_estado text;
  v_esperadas integer;
  v_affected integer;
  v_evaluaciones integer;
  v_ambiguas integer;
begin
  select lista_nominal_corte_id, estado, filas_secciones
  into strict v_corte_id, v_estado, v_esperadas
  from public.lista_nominal_cortes
  where archivo_sha256 = '${sourceHash}';

  if v_estado not in ('RECIBIDO', 'VALIDADO') then
    raise exception 'El corte nominal % no admite correspondencias en estado %',
      v_corte_id, v_estado;
  end if;
  if v_esperadas <> ${expectedRows} then
    raise exception 'El corte declara % filas; se esperaban ${expectedRows}', v_esperadas;
  end if;

  with resolved as (
    select
      n.lista_nominal_corte_id,
      n.lista_nominal_seccion_id,
      pg_catalog.count(c.cartografia_seccion_id)::integer as candidate_count,
      pg_catalog.min(c.cartografia_seccion_id) as cartografia_seccion_id,
      pg_catalog.min(c.seccion_id) as seccion_id,
      pg_catalog.min(c.municipio_id) as municipio_id
    from public.lista_nominal_secciones n
    left join lateral (
      select
        cs.cartografia_seccion_id,
        cs.seccion_id,
        cs.municipio_id
      from public.cartografia_secciones cs
      join public.cartografia_municipios cm
        on cm.cartografia_municipio_id = cs.cartografia_municipio_id
       and cm.cartografia_version_id = cs.cartografia_version_id
       and cm.municipio_id = cs.municipio_id
      where cs.cartografia_version_id = ${cartographyVersionId}
        and cs.clave_entidad = n.clave_entidad
        and cm.clave_entidad = n.clave_entidad
        and cm.clave_municipio = n.clave_municipio
        and cs.numero = n.numero_seccion
    ) c on true
    where n.lista_nominal_corte_id = v_corte_id
    group by n.lista_nominal_corte_id, n.lista_nominal_seccion_id
  )
  insert into public.lista_nominal_correspondencias (
    lista_nominal_corte_id, lista_nominal_seccion_id,
    cartografia_version_id, cartografia_seccion_id,
    seccion_id, municipio_id, estado, motivo, metadata
  )
  select
    lista_nominal_corte_id,
    lista_nominal_seccion_id,
    ${cartographyVersionId},
    case when candidate_count = 1 then cartografia_seccion_id end,
    case when candidate_count = 1 then seccion_id end,
    case when candidate_count = 1 then municipio_id end,
    case
      when candidate_count = 0 then 'PENDIENTE'
      when candidate_count = 1 then 'VINCULADA'
      else 'AMBIGUA'
    end,
    case
      when candidate_count = 0 then 'SIN_COINCIDENCIA_EXACTA'
      when candidate_count = 1 then 'CLAVE_EXACTA'
      else 'MULTIPLES_COINCIDENCIAS_EXACTAS'
    end,
    pg_catalog.jsonb_build_object(
      'candidateCount', candidate_count,
      'method', 'ENTIDAD_MUNICIPIO_SECCION'
    )
  from resolved
  on conflict on constraint lista_nominal_correspondencias_evaluacion_uk
  do update set
    lista_nominal_corte_id = excluded.lista_nominal_corte_id,
    cartografia_seccion_id = excluded.cartografia_seccion_id,
    seccion_id = excluded.seccion_id,
    municipio_id = excluded.municipio_id,
    estado = excluded.estado,
    motivo = excluded.motivo,
    metadata = excluded.metadata,
    updated_at = pg_catalog.now();

  get diagnostics v_affected = row_count;
  if v_affected <> v_esperadas then
    raise exception 'La correspondencia afectó % filas; se esperaban %',
      v_affected, v_esperadas;
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (where estado = 'AMBIGUA')::integer
  into v_evaluaciones, v_ambiguas
  from public.lista_nominal_correspondencias
  where lista_nominal_corte_id = v_corte_id
    and cartografia_version_id = ${cartographyVersionId};

  if v_evaluaciones <> v_esperadas then
    raise exception 'La versión tiene % evaluaciones; se esperaban %',
      v_evaluaciones, v_esperadas;
  end if;
  if v_ambiguas <> 0 then
    raise exception 'La versión tiene % correspondencias ambiguas', v_ambiguas;
  end if;

  if v_estado = 'RECIBIDO' then
    update public.lista_nominal_cortes
    set estado = 'VALIDADO', validado_at = pg_catalog.now()
    where lista_nominal_corte_id = v_corte_id;
  end if;
end
$crosswalk$;
commit;
`;
}

export function buildListaNominalCrosswalkBatch({
  sourceHash,
  cartographyVersionId,
  expectedRows = 7191,
}) {
  if (!/^[0-9a-f]{64}$/.test(sourceHash)) {
    throw new Error("sourceHash must be a lowercase SHA-256");
  }
  if (!Number.isSafeInteger(cartographyVersionId) || cartographyVersionId <= 0) {
    throw new Error("cartographyVersionId must be a positive integer");
  }
  if (!Number.isSafeInteger(expectedRows) || expectedRows <= 0) {
    throw new Error("expectedRows must be a positive integer");
  }
  const descriptor = {
    stage: "CORRESPONDENCIAS",
    sourceHash,
    cartographyVersionId,
    expectedRows,
  };
  const checksum = createHash("sha256")
    .update(JSON.stringify(descriptor))
    .digest("hex");
  return {
    id: `CORRESPONDENCIAS:${cartographyVersionId}`,
    stage: descriptor.stage,
    start: 1,
    end: expectedRows,
    expectedRows,
    checksum,
    fileName: `900-correspondencias-v${cartographyVersionId}-${checksum.slice(0, 12)}.sql`,
    sql: crosswalkSql(descriptor),
  };
}
