begin;

do $behavior$
declare
  v_eceg_source_id bigint;
  v_iter_source_id bigint;
  v_eceg_section_id bigint;
  v_demografia_section_id bigint;
  v_cartografia_version_id bigint;
  v_cartografia_seccion_id bigint;
  v_seccion_id bigint;
  v_clave_entidad text;
  v_numero integer;
  v_result record;
  v_test_year integer := 2199;
begin
  select
    s.cartografia_version_id,
    s.cartografia_seccion_id,
    s.seccion_id,
    s.clave_entidad,
    s.numero
  into
    v_cartografia_version_id,
    v_cartografia_seccion_id,
    v_seccion_id,
    v_clave_entidad,
    v_numero
  from public.cartografia_secciones s
  order by s.cartografia_version_id desc, s.cartografia_seccion_id
  limit 1;

  insert into public.demografia_fuentes (
    proveedor, conjunto, anio_censal, clave_entidad, archivo_nombre,
    archivo_sha256, filas_total, columnas_total, estado,
    validated_at, published_at, metadatos
  ) values (
    'INEGI', 'CPV2020_ECEG', v_test_year, v_clave_entidad, 'fixture-eceg.xlsx',
    pg_catalog.repeat('6', 64), 1, 220, 'PUBLICADA',
    pg_catalog.now(), pg_catalog.now(),
    '{"sourceFrameDate":"2021-01-31","grain":"SECCION"}'::jsonb
  ) returning demografia_fuente_id into v_eceg_source_id;

  insert into public.demografia_eceg_secciones (
    demografia_fuente_id, clave_entidad, nombre_entidad,
    numero_distrito_federal, clave_municipio, nombre_municipio,
    numero_seccion, marco_cartografico_fecha, filas_origen,
    registro_sha256, pobtot, indicadores
  ) values (
    v_eceg_source_id, v_clave_entidad, 'México', '001', '001', 'Fixture',
    pg_catalog.lpad(v_numero::text, 4, '0'), date '2021-01-31',
    '{"Población":5}'::jsonb, pg_catalog.repeat('7', 64), 100,
    '{"POBLACION_POBLACION_TOTAL":100}'::jsonb
  ) returning demografia_eceg_seccion_id into v_eceg_section_id;

  insert into public.demografia_eceg_correspondencias (
    demografia_fuente_id, demografia_eceg_seccion_id,
    cartografia_version_id, cartografia_seccion_id, seccion_id,
    metodo, estado, confianza, advertencias, publicada_at
  ) values (
    v_eceg_source_id, v_eceg_section_id,
    v_cartografia_version_id, v_cartografia_seccion_id, v_seccion_id,
    'CLAVE_NUMERICA', 'VINCULO_HISTORICO', 1,
    '["Marco INE enero 2021"]'::jsonb, pg_catalog.now()
  );

  insert into public.demografia_fuentes (
    proveedor, conjunto, anio_censal, clave_entidad, archivo_nombre,
    archivo_sha256, filas_total, columnas_total, estado,
    validated_at, published_at
  ) values (
    'INEGI', 'CPV2020_ITER', v_test_year, v_clave_entidad, 'fixture-iter.zip',
    pg_catalog.repeat('8', 64), 1, 286, 'PUBLICADA',
    pg_catalog.now(), pg_catalog.now()
  ) returning demografia_fuente_id into v_iter_source_id;

  insert into public.demografia_secciones (
    demografia_fuente_id, cartografia_version_id, cartografia_seccion_id,
    seccion_id, localidades_incluidas, poblacion_incluida, pobtot,
    indicadores
  ) values (
    v_iter_source_id, v_cartografia_version_id, v_cartografia_seccion_id,
    v_seccion_id, 1, 50, 50, '{"POBTOT":50}'::jsonb
  ) returning demografia_seccion_id into v_demografia_section_id;

  insert into public.demografia_secciones_cobertura (
    demografia_seccion_id, localidades_incluidas, localidades_pendientes,
    poblacion_incluida, referencia_pendiente_defendible,
    porcentaje_cobertura, razon_porcentaje_nulo, metodo, confianza,
    advertencias
  ) values (
    v_demografia_section_id, 1, 0, 50, false,
    100, null, 'SOLO_DIRECTAS', 1, '[]'::jsonb
  );

  select * into strict v_result
  from public.rpc_demografia_seccion(
    v_seccion_id, v_cartografia_version_id, v_test_year
  );

  if v_result.source ->> 'datasetKey' <> 'CPV2020_ECEG'
    or v_result.source ->> 'sourceGrain' <> 'SECCION'
    or v_result.source ->> 'sourceFrameDate' <> '2021-01-31'
    or v_result.source ->> 'mappingMethod' <> 'CLAVE_NUMERICA'
    or v_result.source ->> 'mappingStatus' <> 'VINCULO_HISTORICO'
    or v_result.coverage -> 'includedLocalities' <> 'null'::jsonb
    or (v_result.indicators ->> 'pobtot')::bigint <> 100
    or (v_result.indicators ->> 'POBLACION_POBLACION_TOTAL')::bigint <> 100
  then
    raise exception 'ECEG did not take precedence with explicit provenance';
  end if;

  update public.demografia_eceg_correspondencias
  set publicada_at = null
  where demografia_eceg_seccion_id = v_eceg_section_id;

  select * into strict v_result
  from public.rpc_demografia_seccion(
    v_seccion_id, v_cartografia_version_id, v_test_year
  );

  if v_result.source ->> 'datasetKey' <> 'CPV2020_ITER'
    or v_result.source ->> 'sourceGrain' <> 'LOCALIDAD'
    or (v_result.coverage ->> 'includedLocalities')::integer <> 1
    or (v_result.indicators ->> 'pobtot')::bigint <> 50
    or v_result.indicators ? 'POBLACION_POBLACION_TOTAL'
  then
    raise exception 'ITER fallback is invalid or mixes ECEG indicators';
  end if;

  update public.demografia_fuentes
  set estado = 'VALIDADA', published_at = null
  where demografia_fuente_id = v_iter_source_id;

  if exists (
    select 1 from public.rpc_demografia_seccion(
      v_seccion_id, v_cartografia_version_id, v_test_year
    )
  ) then
    raise exception 'RPC fabricated demographics without a published source';
  end if;
end
$behavior$;

do $security$
declare
  v_rpc oid := 'public.rpc_demografia_seccion(bigint,bigint,integer)'::pg_catalog.regprocedure;
begin
  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_rpc) then
    raise exception 'demographic RPC must be SECURITY INVOKER';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = v_rpc and 'search_path=""' = any(p.proconfig)
  ) then
    raise exception 'demographic RPC must pin an empty search_path';
  end if;
  if pg_catalog.has_function_privilege('anon', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('authenticated', v_rpc, 'EXECUTE')
    or pg_catalog.has_function_privilege('public', v_rpc, 'EXECUTE')
  then
    raise exception 'client role can execute demographic RPC';
  end if;
  if not pg_catalog.has_function_privilege('service_role', v_rpc, 'EXECUTE') then
    raise exception 'service_role cannot execute demographic RPC';
  end if;
end
$security$;

rollback;
