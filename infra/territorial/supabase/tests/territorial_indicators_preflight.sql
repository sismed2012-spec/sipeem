begin;

do $preflight$
declare
  v_missing text;
  v_version_id bigint;
  v_rpc oid := pg_catalog.to_regprocedure(
    'public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)'
  );
  v_definition text;
begin
  if pg_catalog.current_database() <> 'postgres' then
    raise exception 'unexpected database: %', pg_catalog.current_database();
  end if;

  select pg_catalog.string_agg(required.name, ', ' order by required.name)
  into v_missing
  from (values
    ('public.cartografia_versiones'),
    ('public.cartografia_secciones'),
    ('public.cartografia_municipios'),
    ('public.cartografia_distritos_locales'),
    ('public.cartografia_distritos_federales'),
    ('public.lista_nominal_cortes'),
    ('public.lista_nominal_secciones'),
    ('public.lista_nominal_correspondencias'),
    ('public.demografia_fuentes'),
    ('public.demografia_eceg_secciones'),
    ('public.demografia_eceg_correspondencias')
  ) as required(name)
  where pg_catalog.to_regclass(required.name) is null;
  if v_missing is not null then
    raise exception 'missing prerequisite tables: %', v_missing;
  end if;

  select pg_catalog.string_agg(required.table_name || '.' || required.column_name, ', ')
  into v_missing
  from (values
    ('cartografia_secciones', 'cartografia_version_id'),
    ('cartografia_secciones', 'cartografia_municipio_id'),
    ('cartografia_secciones', 'cartografia_distrito_local_id'),
    ('cartografia_secciones', 'cartografia_distrito_federal_id'),
    ('lista_nominal_correspondencias', 'cartografia_seccion_id'),
    ('lista_nominal_correspondencias', 'estado'),
    ('demografia_eceg_correspondencias', 'cartografia_seccion_id'),
    ('demografia_eceg_correspondencias', 'publicada_at')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = required.table_name
      and column_info.column_name = required.column_name
  );
  if v_missing is not null then
    raise exception 'missing prerequisite columns: %', v_missing;
  end if;

  select pg_catalog.string_agg(required.name, ', ' order by required.name)
  into v_missing
  from (values
    ('cartografia_secciones_municipio_version_idx'),
    ('cartografia_secciones_distrito_local_version_idx'),
    ('cartografia_secciones_distrito_federal_version_idx'),
    ('lista_nominal_correspondencias_version_estado_idx'),
    ('lista_nominal_correspondencias_corte_destino_idx'),
    ('demografia_eceg_correspondencias_version_estado_idx')
  ) as required(name)
  where pg_catalog.to_regclass('public.' || required.name) is null;
  if v_missing is not null then
    raise exception 'missing prerequisite indexes: %', v_missing;
  end if;

  select version.cartografia_version_id
  into v_version_id
  from public.cartografia_versiones version
  where version.estado = 'PUBLICADA'
    and version.es_predeterminada
    and version.clave_entidad = '15'
  order by version.fecha_corte desc nulls last, version.cartografia_version_id desc
  limit 1;
  if v_version_id is null then
    raise exception 'published default Estado de Mexico cartography is missing';
  end if;
  if not exists (
    select 1
    from public.lista_nominal_cortes cut
    join public.lista_nominal_correspondencias correspondence
      on correspondence.lista_nominal_corte_id = cut.lista_nominal_corte_id
     and correspondence.cartografia_version_id = v_version_id
     and correspondence.estado = 'VINCULADA'
    where cut.estado = 'PUBLICADO'
      and cut.clave_entidad = '15'
  ) then
    raise exception 'compatible published nominal source is missing for version %', v_version_id;
  end if;
  if not exists (
    select 1
    from public.demografia_fuentes source
    join public.demografia_eceg_correspondencias correspondence
      on correspondence.demografia_fuente_id = source.demografia_fuente_id
     and correspondence.cartografia_version_id = v_version_id
     and correspondence.estado in ('VINCULO_HISTORICO', 'DIRECTA')
     and correspondence.publicada_at is not null
    where source.estado = 'PUBLICADA'
      and source.conjunto = 'CPV2020_ECEG'
      and source.clave_entidad = '15'
  ) then
    raise exception 'compatible published ECEG source is missing for version %', v_version_id;
  end if;

  if v_rpc is not null then
    select pg_catalog.pg_get_functiondef(v_rpc) into v_definition;
    if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_rpc)
       or (select p.provolatile <> 's' from pg_catalog.pg_proc p where p.oid = v_rpc)
       or not exists (
         select 1 from pg_catalog.pg_proc p
         where p.oid = v_rpc and 'search_path=""' = any(p.proconfig)
       )
       or (select p.pronargdefaults <> 2 from pg_catalog.pg_proc p where p.oid = v_rpc)
       or pg_catalog.pg_get_function_result(v_rpc) not like
         'TABLE(nivel text, territorio_id bigint, cartografia_territorio_id bigint, clave text, nombre text,%calidad_metricas jsonb)'
       or pg_catalog.strpos(pg_catalog.lower(v_definition), 'selected_version as') = 0
       or pg_catalog.strpos(pg_catalog.lower(v_definition), 'selected_cut as') = 0
       or pg_catalog.strpos(pg_catalog.lower(v_definition), 'selected_source as') = 0
       or pg_catalog.strpos(pg_catalog.lower(v_definition), 'nominal_by_section as') = 0
       or pg_catalog.strpos(pg_catalog.lower(v_definition), 'demography_by_section as') = 0
       or pg_catalog.strpos(pg_catalog.lower(v_definition), 'section_facts as') = 0
       or pg_catalog.has_function_privilege('public', v_rpc, 'EXECUTE')
       or pg_catalog.has_function_privilege('anon', v_rpc, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_rpc, 'EXECUTE')
       or not pg_catalog.has_function_privilege('service_role', v_rpc, 'EXECUTE') then
      raise exception 'existing territorial indicators RPC is divergent';
    end if;
  end if;
end
$preflight$;

select pg_catalog.jsonb_build_object(
  'expectedProjectRef', 'nppvprbfmjbhwheghipa',
  'database', pg_catalog.current_database(),
  'status', case
    when pg_catalog.to_regprocedure(
      'public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)'
    ) is null then 'PENDIENTE'
    else 'YA_APLICADA_COMPATIBLE'
  end,
  'cartographyVersionId', (
    select version.cartografia_version_id
    from public.cartografia_versiones version
    where version.estado = 'PUBLICADA'
      and version.es_predeterminada
      and version.clave_entidad = '15'
    order by version.fecha_corte desc nulls last, version.cartografia_version_id desc
    limit 1
  )
) as preflight;

rollback;
