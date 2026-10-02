create function public.rpc_demografia_revision_bandeja(
  p_cartografia_version_id bigint default null,
  p_estado text default null,
  p_clave_municipio text default null,
  p_busqueda text default null,
  p_limite integer default 50,
  p_offset integer default 0
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_fuente_id bigint;
  v_version_id bigint;
  v_busqueda text := nullif(pg_catalog.btrim(p_busqueda), '');
  v_version jsonb;
  v_versiones jsonb;
  v_fuente jsonb;
  v_resumen jsonb;
  v_municipios jsonb;
  v_items jsonb;
  v_total integer;
  v_items_count integer;
begin
  if p_cartografia_version_id is not null and p_cartografia_version_id < 1 then
    raise exception using errcode = '22023', message = 'versionId invalido';
  end if;
  if p_estado is not null and p_estado not in (
    'MULTISECCION', 'REVISION_MANUAL', 'SIN_CORRESPONDENCIA'
  ) then
    raise exception using errcode = '22023', message = 'estado no revisable';
  end if;
  if p_clave_municipio is not null and p_clave_municipio !~ '^[0-9]{3}$' then
    raise exception using errcode = '22023', message = 'clave municipal invalida';
  end if;
  if v_busqueda is not null and pg_catalog.length(v_busqueda) > 100 then
    raise exception using errcode = '22023', message = 'busqueda demasiado larga';
  end if;
  if p_limite < 1 or p_limite > 100 then
    raise exception using errcode = '22023', message = 'limite fuera de rango';
  end if;
  if p_offset < 0 then
    raise exception using errcode = '22023', message = 'offset fuera de rango';
  end if;

  select f.demografia_fuente_id,
    pg_catalog.jsonb_build_object(
      'id', f.demografia_fuente_id,
      'provider', f.proveedor,
      'datasetKey', f.conjunto,
      'censusYear', f.anio_censal
    )
  into v_fuente_id, v_fuente
  from public.demografia_fuentes f
  where f.estado = 'PUBLICADA'
  order by f.published_at desc nulls last, f.demografia_fuente_id desc
  limit 1;

  if v_fuente_id is null then
    raise exception using errcode = '22023', message = 'no hay fuente demografica publicada';
  end if;

  select v.cartografia_version_id,
    pg_catalog.jsonb_build_object(
      'id', v.cartografia_version_id,
      'key', v.clave,
      'state', v.estado,
      'isDefault', v.es_predeterminada
    )
  into v_version_id, v_version
  from public.cartografia_versiones v
  where (p_cartografia_version_id is null or v.cartografia_version_id = p_cartografia_version_id)
    and v.estado in ('PUBLICADA', 'ARCHIVADA')
    and exists (
      select 1
      from public.demografia_localidad_correspondencias c
      where c.demografia_fuente_id = v_fuente_id
        and c.cartografia_version_id = v.cartografia_version_id
    )
  order by
    case when p_cartografia_version_id is null and v.es_predeterminada then 0 else 1 end,
    v.fecha_corte desc,
    v.cartografia_version_id desc
  limit 1;

  if v_version_id is null then
    raise exception using errcode = '22023', message = 'version cartografica no disponible';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', versions.cartografia_version_id,
        'key', versions.clave,
        'state', versions.estado,
        'isDefault', versions.es_predeterminada
      ) order by versions.fecha_corte desc, versions.cartografia_version_id desc
    ),
    '[]'::jsonb
  )
  into v_versiones
  from public.cartografia_versiones versions
  where versions.estado in ('PUBLICADA', 'ARCHIVADA')
    and exists (
      select 1
      from public.demografia_localidad_correspondencias c
      where c.demografia_fuente_id = v_fuente_id
        and c.cartografia_version_id = versions.cartografia_version_id
    );

  with pending_scope as (
    select c.estado
    from public.demografia_localidad_correspondencias c
    join public.demografia_localidades l
      on l.demografia_localidad_id = c.demografia_localidad_id
      and l.demografia_fuente_id = c.demografia_fuente_id
    where c.demografia_fuente_id = v_fuente_id
      and c.cartografia_version_id = v_version_id
      and c.estado in ('MULTISECCION', 'REVISION_MANUAL', 'SIN_CORRESPONDENCIA')
      and (p_clave_municipio is null or l.clave_municipio = p_clave_municipio)
      and (
        v_busqueda is null
        or l.nombre_localidad ilike '%' || v_busqueda || '%'
        or l.nombre_municipio ilike '%' || v_busqueda || '%'
        or l.clave_localidad = v_busqueda
      )
  )
  select pg_catalog.jsonb_build_object(
    'totalPending', pg_catalog.count(*)::integer,
    'multisection', pg_catalog.count(*) filter (where estado = 'MULTISECCION')::integer,
    'manualReview', pg_catalog.count(*) filter (where estado = 'REVISION_MANUAL')::integer,
    'unmatched', pg_catalog.count(*) filter (where estado = 'SIN_CORRESPONDENCIA')::integer
  )
  into v_resumen
  from pending_scope;

  with municipality_scope as (
    select
      l.clave_municipio,
      l.nombre_municipio,
      pg_catalog.count(*)::integer as pendientes
    from public.demografia_localidad_correspondencias c
    join public.demografia_localidades l
      on l.demografia_localidad_id = c.demografia_localidad_id
      and l.demografia_fuente_id = c.demografia_fuente_id
    where c.demografia_fuente_id = v_fuente_id
      and c.cartografia_version_id = v_version_id
      and c.estado in ('MULTISECCION', 'REVISION_MANUAL', 'SIN_CORRESPONDENCIA')
      and (
        v_busqueda is null
        or l.nombre_localidad ilike '%' || v_busqueda || '%'
        or l.nombre_municipio ilike '%' || v_busqueda || '%'
        or l.clave_localidad = v_busqueda
      )
    group by l.clave_municipio, l.nombre_municipio
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'key', municipality_scope.clave_municipio,
        'name', municipality_scope.nombre_municipio,
        'pending', municipality_scope.pendientes
      ) order by municipality_scope.nombre_municipio, municipality_scope.clave_municipio
    ),
    '[]'::jsonb
  )
  into v_municipios
  from municipality_scope;

  with filtered_scope as (
    select c.demografia_localidad_correspondencia_id
    from public.demografia_localidad_correspondencias c
    join public.demografia_localidades l
      on l.demografia_localidad_id = c.demografia_localidad_id
      and l.demografia_fuente_id = c.demografia_fuente_id
    where c.demografia_fuente_id = v_fuente_id
      and c.cartografia_version_id = v_version_id
      and c.estado in ('MULTISECCION', 'REVISION_MANUAL', 'SIN_CORRESPONDENCIA')
      and (p_estado is null or c.estado = p_estado)
      and (p_clave_municipio is null or l.clave_municipio = p_clave_municipio)
      and (
        v_busqueda is null
        or l.nombre_localidad ilike '%' || v_busqueda || '%'
        or l.nombre_municipio ilike '%' || v_busqueda || '%'
        or l.clave_localidad = v_busqueda
      )
  )
  select pg_catalog.count(*)::integer into v_total from filtered_scope;

  with filtered_scope as (
    select
      c.*,
      l.clave_entidad,
      l.clave_municipio,
      l.clave_localidad,
      l.nombre_municipio,
      l.nombre_localidad,
      l.pobtot,
      l.latitud,
      l.longitud,
      cl.nombre as cartografia_localidad_nombre
    from public.demografia_localidad_correspondencias c
    join public.demografia_localidades l
      on l.demografia_localidad_id = c.demografia_localidad_id
      and l.demografia_fuente_id = c.demografia_fuente_id
    left join public.cartografia_localidades cl
      on cl.cartografia_localidad_id = c.cartografia_localidad_id
      and cl.cartografia_version_id = c.cartografia_version_id
    where c.demografia_fuente_id = v_fuente_id
      and c.cartografia_version_id = v_version_id
      and c.estado in ('MULTISECCION', 'REVISION_MANUAL', 'SIN_CORRESPONDENCIA')
      and (p_estado is null or c.estado = p_estado)
      and (p_clave_municipio is null or l.clave_municipio = p_clave_municipio)
      and (
        v_busqueda is null
        or l.nombre_localidad ilike '%' || v_busqueda || '%'
        or l.nombre_municipio ilike '%' || v_busqueda || '%'
        or l.clave_localidad = v_busqueda
      )
    order by l.nombre_municipio, l.nombre_localidad,
      c.demografia_localidad_correspondencia_id
    limit p_limite
    offset p_offset
  ), item_rows as (
    select
      f.*,
      coalesce(candidates.items, '[]'::jsonb) as candidate_items
    from filtered_scope f
    left join lateral (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'sectionId', candidate.seccion_id,
          'cartographicSectionId', candidate.cartografia_seccion_id,
          'number', section.numero,
          'municipalityKey', municipality.clave_municipio,
          'municipalityName', municipality.nombre,
          'contactType', candidate.tipo_contacto,
          'intersectionArea', candidate.area_interseccion,
          'proportion', candidate.proporcion_localidad,
          'evidence', candidate.evidencia
        ) order by section.numero, candidate.cartografia_seccion_id
      ) as items
      from public.demografia_localidad_correspondencia_secciones candidate
      join public.cartografia_secciones section
        on section.cartografia_seccion_id = candidate.cartografia_seccion_id
        and section.cartografia_version_id = candidate.cartografia_version_id
        and section.seccion_id = candidate.seccion_id
      join public.cartografia_municipios municipality
        on municipality.cartografia_municipio_id = section.cartografia_municipio_id
        and municipality.cartografia_version_id = section.cartografia_version_id
        and municipality.municipio_id = section.municipio_id
      where candidate.demografia_localidad_correspondencia_id =
        f.demografia_localidad_correspondencia_id
    ) candidates on true
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'correspondenceId', item_rows.demografia_localidad_correspondencia_id,
        'status', item_rows.estado,
        'method', item_rows.metodo,
        'candidateCount', item_rows.secciones_candidatas,
        'strictCoverage', item_rows.cobertura_estricta,
        'distanceMeters', item_rows.distancia_metros,
        'nameSimilarity', item_rows.similitud_nombre,
        'confidence', item_rows.confianza,
        'evidence', item_rows.evidencia,
        'locality', pg_catalog.jsonb_build_object(
          'id', item_rows.demografia_localidad_id,
          'stateKey', item_rows.clave_entidad,
          'municipalityKey', item_rows.clave_municipio,
          'localityKey', item_rows.clave_localidad,
          'municipalityName', item_rows.nombre_municipio,
          'name', item_rows.nombre_localidad,
          'population', item_rows.pobtot,
          'latitude', item_rows.latitud,
          'longitude', item_rows.longitud
        ),
        'cartographicLocality', case
          when item_rows.cartografia_localidad_id is null then null
          else pg_catalog.jsonb_build_object(
            'id', item_rows.cartografia_localidad_id,
            'name', item_rows.cartografia_localidad_nombre
          )
        end,
        'candidates', item_rows.candidate_items
      ) order by item_rows.nombre_municipio, item_rows.nombre_localidad,
        item_rows.demografia_localidad_correspondencia_id
    ),
    '[]'::jsonb
  )
  into v_items
  from item_rows;

  v_items_count := pg_catalog.jsonb_array_length(v_items);

  return pg_catalog.jsonb_build_object(
    'selectedVersion', v_version,
    'versions', v_versiones,
    'source', v_fuente,
    'summary', v_resumen,
    'municipalities', v_municipios,
    'items', v_items,
    'pagination', pg_catalog.jsonb_build_object(
      'offset', p_offset,
      'limit', p_limite,
      'total', v_total,
      'hasMore', p_offset + v_items_count < v_total
    )
  );
end;
$$;

revoke all on function public.rpc_demografia_revision_bandeja(
  bigint, text, text, text, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.rpc_demografia_revision_bandeja(
  bigint, text, text, text, integer, integer
) to service_role;
