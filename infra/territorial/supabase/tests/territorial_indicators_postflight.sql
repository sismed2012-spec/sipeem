begin;

do $postflight$
declare
  v_rpc oid := pg_catalog.to_regprocedure(
    'public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)'
  );
  v_version_id bigint;
  v_level text;
  v_expected_count bigint;
  v_actual_count bigint;
  v_unique_count bigint;
  v_nominal_total bigint;
  v_expected_nominal_total bigint;
  v_demographic_total bigint;
  v_expected_demographic_total bigint;
  v_source_count bigint;
  v_plan json;
  v_execution_ms numeric;
begin
  if v_rpc is null then
    raise exception 'territorial indicators RPC is missing';
  end if;
  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_rpc)
     or (select p.provolatile <> 's' from pg_catalog.pg_proc p where p.oid = v_rpc)
     or not exists (
       select 1 from pg_catalog.pg_proc p
       where p.oid = v_rpc and 'search_path=""' = any(p.proconfig)
     )
     or pg_catalog.has_function_privilege('public', v_rpc, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_rpc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_rpc, 'EXECUTE')
     or not pg_catalog.has_function_privilege('service_role', v_rpc, 'EXECUTE') then
    raise exception 'territorial indicators RPC contract or permissions are invalid';
  end if;

  select version.cartografia_version_id
  into strict v_version_id
  from public.cartografia_versiones version
  where version.estado = 'PUBLICADA'
    and version.es_predeterminada
    and version.clave_entidad = '15'
  order by version.fecha_corte desc nulls last, version.cartografia_version_id desc
  limit 1;

  foreach v_level in array array['MUNICIPIO', 'DISTRITO_LOCAL', 'DISTRITO_FEDERAL'] loop
    v_expected_count := case v_level
      when 'MUNICIPIO' then 125
      when 'DISTRITO_LOCAL' then 45
      else 40
    end;

    execute pg_catalog.format(
      'select count(*), count(distinct territorio_id), count(distinct cartografia_territorio_id), count(distinct clave) from public.rpc_indicadores_territoriales(%L, %s, null, null)',
      v_level, v_version_id
    ) into v_actual_count, v_unique_count, v_source_count, v_nominal_total;
    if v_actual_count <> v_expected_count
       or v_unique_count <> v_actual_count
       or v_source_count <> v_actual_count
       or v_nominal_total <> v_actual_count then
      raise exception '% cardinality/uniqueness mismatch: rows %, territory %, cartography %, keys %, expected %',
        v_level, v_actual_count, v_unique_count, v_source_count, v_nominal_total,
        v_expected_count;
    end if;

    execute pg_catalog.format(
      'explain (analyze, format json) select * from public.rpc_indicadores_territoriales(%L, %s, null, null)',
      v_level, v_version_id
    ) into v_plan;
    execute pg_catalog.format(
      'explain (analyze, format json) select * from public.rpc_indicadores_territoriales(%L, %s, null, null)',
      v_level, v_version_id
    ) into v_plan;
    v_execution_ms := (v_plan -> 0 ->> 'Execution Time')::numeric;
    raise notice '% second execution: % ms; plan: %', v_level, v_execution_ms, v_plan;
    if v_execution_ms > 500 then
      raise exception '% second execution exceeded 500 ms: % ms', v_level, v_execution_ms;
    end if;
  end loop;

  select pg_catalog.count(distinct result.lista_nominal_corte_id),
         pg_catalog.count(distinct result.demografia_fuente_id),
         pg_catalog.sum(result.lista_total),
         pg_catalog.sum(result.pobtot)
  into v_source_count, v_unique_count, v_nominal_total, v_demographic_total
  from public.rpc_indicadores_territoriales('MUNICIPIO', v_version_id, null, null) result;
  if v_source_count <> 1 or v_unique_count <> 1 then
    raise exception 'territorial indicators provenance is inconsistent';
  end if;

  select pg_catalog.sum(section.lista_total)::bigint
  into v_expected_nominal_total
  from public.lista_nominal_secciones section
  join public.lista_nominal_correspondencias correspondence
    on correspondence.lista_nominal_corte_id = section.lista_nominal_corte_id
   and correspondence.lista_nominal_seccion_id = section.lista_nominal_seccion_id
   and correspondence.cartografia_version_id = v_version_id
   and correspondence.estado = 'VINCULADA'
  where section.lista_nominal_corte_id = (
    select result.lista_nominal_corte_id
    from public.rpc_indicadores_territoriales('MUNICIPIO', v_version_id, null, null) result
    limit 1
  );
  if v_nominal_total is distinct from v_expected_nominal_total then
    raise exception 'nominal reconciliation mismatch: RPC %, source %',
      v_nominal_total, v_expected_nominal_total;
  end if;

  select pg_catalog.sum(section.pobtot)::bigint
  into v_expected_demographic_total
  from public.demografia_eceg_secciones section
  join public.demografia_eceg_correspondencias correspondence
    on correspondence.demografia_fuente_id = section.demografia_fuente_id
   and correspondence.demografia_eceg_seccion_id = section.demografia_eceg_seccion_id
   and correspondence.cartografia_version_id = v_version_id
   and correspondence.estado in ('VINCULO_HISTORICO', 'DIRECTA')
   and correspondence.publicada_at is not null
  where section.demografia_fuente_id = (
    select result.demografia_fuente_id
    from public.rpc_indicadores_territoriales('MUNICIPIO', v_version_id, null, null) result
    limit 1
  );
  if v_demographic_total is distinct from v_expected_demographic_total then
    raise exception 'demographic reconciliation mismatch: RPC %, source %',
      v_demographic_total, v_expected_demographic_total;
  end if;
end
$postflight$;

with selected_version as (
  select version.cartografia_version_id
  from public.cartografia_versiones version
  where version.estado = 'PUBLICADA'
    and version.es_predeterminada
    and version.clave_entidad = '15'
  order by version.fecha_corte desc nulls last, version.cartografia_version_id desc
  limit 1
)
select pg_catalog.jsonb_build_object(
  'status', 'VALIDADO',
  'cartographyVersionId', selected_version.cartografia_version_id,
  'municipalities', (
    select pg_catalog.count(*) from public.rpc_indicadores_territoriales(
      'MUNICIPIO', selected_version.cartografia_version_id, null, null
    )
  ),
  'localDistricts', (
    select pg_catalog.count(*) from public.rpc_indicadores_territoriales(
      'DISTRITO_LOCAL', selected_version.cartografia_version_id, null, null
    )
  ),
  'federalDistricts', (
    select pg_catalog.count(*) from public.rpc_indicadores_territoriales(
      'DISTRITO_FEDERAL', selected_version.cartografia_version_id, null, null
    )
  )
) as postflight
from selected_version;

rollback;
