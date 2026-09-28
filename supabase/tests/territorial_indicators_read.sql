begin;

do $contract$
declare
  v_rpc oid := pg_catalog.to_regprocedure(
    'public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)'
  );
begin
  if v_rpc is null then
    raise exception 'missing RPC public.rpc_indicadores_territoriales(text,bigint,bigint,bigint)';
  end if;
  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_rpc) then
    raise exception 'territorial indicators RPC must be SECURITY INVOKER';
  end if;
  if (select p.provolatile <> 's' from pg_catalog.pg_proc p where p.oid = v_rpc) then
    raise exception 'territorial indicators RPC must be STABLE';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_rpc and 'search_path=""' = any(p.proconfig)
  ) then
    raise exception 'territorial indicators RPC must pin an empty search_path';
  end if;
  if pg_catalog.has_function_privilege('public', v_rpc, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_rpc, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
    raise exception 'client role can execute territorial indicators RPC';
  end if;
  if not pg_catalog.has_function_privilege('service_role', v_rpc, 'EXECUTE') then
    raise exception 'service_role cannot execute territorial indicators RPC';
  end if;
end
$contract$;

do $behavior$
declare
  v_source_version_id bigint;
  v_version_id bigint;
  v_source_entity public.cartografia_entidades%rowtype;
  v_source_municipality public.cartografia_municipios%rowtype;
  v_source_local public.cartografia_distritos_locales%rowtype;
  v_source_federal public.cartografia_distritos_federales%rowtype;
  v_source_section_a public.cartografia_secciones%rowtype;
  v_source_section_b public.cartografia_secciones%rowtype;
  v_cartography_municipality_id bigint;
  v_cartography_local_id bigint;
  v_cartography_federal_id bigint;
  v_cartography_section_a_id bigint;
  v_cartography_section_b_id bigint;
  v_nominal_cut_id bigint;
  v_unpublished_nominal_cut_id bigint;
  v_nominal_section_id bigint;
  v_demography_source_id bigint;
  v_unpublished_demography_source_id bigint;
  v_demography_section_id bigint;
  v_result record;
  v_expected_count bigint;
  v_actual_count bigint;
  v_failed boolean;
begin
  select s.cartografia_version_id
  into strict v_source_version_id
  from public.cartografia_secciones s
  join public.cartografia_versiones v
    on v.cartografia_version_id = s.cartografia_version_id
  where v.estado in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA')
  group by
    s.cartografia_version_id,
    s.cartografia_municipio_id,
    s.cartografia_distrito_local_id,
    s.cartografia_distrito_federal_id
  having pg_catalog.count(*) >= 2
  order by s.cartografia_version_id desc
  limit 1;

  select e.* into strict v_source_entity
  from public.cartografia_entidades e
  where e.cartografia_version_id = v_source_version_id
  limit 1;

  select s.* into strict v_source_section_a
  from public.cartografia_secciones s
  where s.cartografia_version_id = v_source_version_id
    and exists (
      select 1
      from public.cartografia_secciones paired
      where paired.cartografia_version_id = s.cartografia_version_id
        and paired.cartografia_municipio_id = s.cartografia_municipio_id
        and paired.cartografia_distrito_local_id = s.cartografia_distrito_local_id
        and paired.cartografia_distrito_federal_id = s.cartografia_distrito_federal_id
        and paired.cartografia_seccion_id <> s.cartografia_seccion_id
    )
  order by s.cartografia_seccion_id
  limit 1;

  select s.* into strict v_source_section_b
  from public.cartografia_secciones s
  where s.cartografia_version_id = v_source_section_a.cartografia_version_id
    and s.cartografia_municipio_id = v_source_section_a.cartografia_municipio_id
    and s.cartografia_distrito_local_id = v_source_section_a.cartografia_distrito_local_id
    and s.cartografia_distrito_federal_id = v_source_section_a.cartografia_distrito_federal_id
    and s.cartografia_seccion_id <> v_source_section_a.cartografia_seccion_id
  order by s.cartografia_seccion_id
  limit 1;

  select m.* into strict v_source_municipality
  from public.cartografia_municipios m
  where m.cartografia_municipio_id = v_source_section_a.cartografia_municipio_id;

  select d.* into strict v_source_local
  from public.cartografia_distritos_locales d
  where d.cartografia_distrito_local_id = v_source_section_a.cartografia_distrito_local_id;

  select d.* into strict v_source_federal
  from public.cartografia_distritos_federales d
  where d.cartografia_distrito_federal_id = v_source_section_a.cartografia_distrito_federal_id;

  insert into public.cartografia_versiones (
    clave, nombre, proveedor, clave_entidad, fecha_corte, recibida_at,
    srid_origen, srid_destino, conteos_esperados, metadata
  ) values (
    'TEST_INDICADORES_2199', 'Test indicadores 2199', 'TEST', v_source_entity.clave_entidad,
    date '2199-01-01', pg_catalog.now(), 4326, 4326,
    '{"municipios":1,"distritos_locales":1,"distritos_federales":1,"secciones":2}'::jsonb,
    '{"test":"territorial_indicators_read"}'::jsonb
  ) returning cartografia_version_id into v_version_id;

  insert into public.cartografia_entidades (
    cartografia_version_id, clave_entidad, nombre, atributos_fuente,
    fila_origen, fuente_sha256, geom
  ) values (
    v_version_id, v_source_entity.clave_entidad, v_source_entity.nombre,
    v_source_entity.atributos_fuente, 1, pg_catalog.repeat('1', 64),
    v_source_entity.geom
  );

  insert into public.cartografia_municipios (
    cartografia_version_id, municipio_id, clave_entidad, clave_municipio,
    nombre, atributos_fuente, fila_origen, fuente_sha256, geom
  ) values (
    v_version_id, v_source_municipality.municipio_id,
    v_source_municipality.clave_entidad, v_source_municipality.clave_municipio,
    v_source_municipality.nombre, v_source_municipality.atributos_fuente,
    1, pg_catalog.repeat('2', 64), v_source_municipality.geom
  ) returning cartografia_municipio_id into v_cartography_municipality_id;

  insert into public.cartografia_distritos_locales (
    cartografia_version_id, distrito_local_id, clave_entidad, numero,
    nombre, atributos_fuente, fila_origen, fuente_sha256, geom
  ) values (
    v_version_id, v_source_local.distrito_local_id,
    v_source_local.clave_entidad, v_source_local.numero,
    v_source_local.nombre, v_source_local.atributos_fuente,
    1, pg_catalog.repeat('3', 64), v_source_local.geom
  ) returning cartografia_distrito_local_id into v_cartography_local_id;

  insert into public.cartografia_distritos_federales (
    cartografia_version_id, distrito_federal_id, clave_entidad, numero,
    nombre, atributos_fuente, fila_origen, fuente_sha256, geom
  ) values (
    v_version_id, v_source_federal.distrito_federal_id,
    v_source_federal.clave_entidad, v_source_federal.numero,
    v_source_federal.nombre, v_source_federal.atributos_fuente,
    1, pg_catalog.repeat('4', 64), v_source_federal.geom
  ) returning cartografia_distrito_federal_id into v_cartography_federal_id;

  insert into public.cartografia_secciones (
    cartografia_version_id, seccion_id, clave_entidad, numero,
    cartografia_municipio_id, municipio_id,
    cartografia_distrito_local_id, distrito_local_id,
    cartografia_distrito_federal_id, distrito_federal_id,
    tipo, atributos_fuente, fila_origen, fuente_sha256, geom
  ) values (
    v_version_id, v_source_section_a.seccion_id, v_source_section_a.clave_entidad,
    v_source_section_a.numero, v_cartography_municipality_id,
    v_source_section_a.municipio_id, v_cartography_local_id,
    v_source_section_a.distrito_local_id, v_cartography_federal_id,
    v_source_section_a.distrito_federal_id, v_source_section_a.tipo,
    v_source_section_a.atributos_fuente, 1, pg_catalog.repeat('5', 64),
    v_source_section_a.geom
  ) returning cartografia_seccion_id into v_cartography_section_a_id;

  insert into public.cartografia_secciones (
    cartografia_version_id, seccion_id, clave_entidad, numero,
    cartografia_municipio_id, municipio_id,
    cartografia_distrito_local_id, distrito_local_id,
    cartografia_distrito_federal_id, distrito_federal_id,
    tipo, atributos_fuente, fila_origen, fuente_sha256, geom
  ) values (
    v_version_id, v_source_section_b.seccion_id, v_source_section_b.clave_entidad,
    v_source_section_b.numero, v_cartography_municipality_id,
    v_source_section_b.municipio_id, v_cartography_local_id,
    v_source_section_b.distrito_local_id, v_cartography_federal_id,
    v_source_section_b.distrito_federal_id, v_source_section_b.tipo,
    v_source_section_b.atributos_fuente, 2, pg_catalog.repeat('6', 64),
    v_source_section_b.geom
  ) returning cartografia_seccion_id into v_cartography_section_b_id;

  insert into public.lista_nominal_cortes (
    clave, fecha_corte, clave_entidad, fuente, archivo_nombre, archivo_sha256,
    filas_secciones, padron_total, lista_nominal_total, diferencia_total,
    residentes_extranjero
  ) values (
    'TEST-INDICADORES-2199', date '2199-07-31', v_source_entity.clave_entidad,
    'INE', 'test-indicadores.xlsx', pg_catalog.repeat('7', 64),
    1, 18, 17, 1, '{}'::jsonb
  ) returning lista_nominal_corte_id into v_nominal_cut_id;

  insert into public.lista_nominal_secciones (
    lista_nominal_corte_id, clave_entidad, clave_municipio, municipio_nombre,
    distrito_local, distrito_federal, numero_seccion,
    padron_hombres, padron_mujeres, padron_no_binario, padron_total,
    lista_hombres, lista_mujeres, lista_no_binario, lista_total,
    diferencia, cobertura, fila_origen
  ) values (
    v_nominal_cut_id, v_source_entity.clave_entidad,
    v_source_municipality.clave_municipio, v_source_municipality.nombre,
    v_source_local.numero, v_source_federal.numero, v_source_section_a.numero,
    8, 10, 0, 18, 8, 9, 0, 17, 1, 94.44444444444444, 15
  ) returning lista_nominal_seccion_id into v_nominal_section_id;

  insert into public.lista_nominal_correspondencias (
    lista_nominal_corte_id, lista_nominal_seccion_id, cartografia_version_id,
    cartografia_seccion_id, seccion_id, municipio_id, estado, motivo
  ) values (
    v_nominal_cut_id, v_nominal_section_id, v_version_id,
    v_cartography_section_a_id, v_source_section_a.seccion_id,
    v_source_section_a.municipio_id, 'VINCULADA', 'TEST'
  );

  update public.lista_nominal_cortes
  set estado = 'VALIDADO', validado_at = pg_catalog.now()
  where lista_nominal_corte_id = v_nominal_cut_id;
  update public.lista_nominal_cortes
  set estado = 'PUBLICADO', publicado_at = pg_catalog.now()
  where lista_nominal_corte_id = v_nominal_cut_id;

  insert into public.lista_nominal_cortes (
    clave, fecha_corte, clave_entidad, fuente, archivo_nombre, archivo_sha256,
    filas_secciones, padron_total, lista_nominal_total, diferencia_total,
    residentes_extranjero
  ) values (
    'TEST-INDICADORES-SIN-PUBLICAR', date '2200-07-31',
    v_source_entity.clave_entidad, 'INE', 'unpublished.xlsx',
    pg_catalog.repeat('8', 64), 1, 0, 0, 0, '{}'::jsonb
  ) returning lista_nominal_corte_id into v_unpublished_nominal_cut_id;

  insert into public.demografia_fuentes (
    proveedor, conjunto, anio_censal, clave_entidad, archivo_nombre,
    archivo_sha256, filas_total, columnas_total, metadatos
  ) values (
    'INEGI', 'CPV2020_ECEG', 2199, v_source_entity.clave_entidad,
    'test-indicadores-eceg.xlsx', pg_catalog.repeat('9', 64), 1, 220,
    '{"grain":"SECCION","sourceFrameDate":"2021-01-31"}'::jsonb
  ) returning demografia_fuente_id into v_demography_source_id;

  insert into public.demografia_eceg_secciones (
    demografia_fuente_id, clave_entidad, nombre_entidad,
    numero_distrito_federal, clave_municipio, nombre_municipio,
    numero_seccion, marco_cartografico_fecha, filas_origen, registro_sha256,
    pobtot, pobfem, pobmas, pea, pcon_disc, tvivhab, vph_inter
  ) values (
    v_demography_source_id, v_source_entity.clave_entidad,
    v_source_entity.nombre, pg_catalog.lpad(v_source_federal.numero::text, 3, '0'),
    v_source_municipality.clave_municipio, v_source_municipality.nombre,
    pg_catalog.lpad(v_source_section_a.numero::text, 4, '0'), date '2021-01-31',
    '{"fixture":1}'::jsonb, pg_catalog.repeat('a', 64),
    100, 52, 48, 0, null, 30, 12
  ) returning demografia_eceg_seccion_id into v_demography_section_id;

  insert into public.demografia_eceg_correspondencias (
    demografia_fuente_id, demografia_eceg_seccion_id,
    cartografia_version_id, cartografia_seccion_id, seccion_id,
    metodo, estado, confianza, publicada_at
  ) values (
    v_demography_source_id, v_demography_section_id, v_version_id,
    v_cartography_section_a_id, v_source_section_a.seccion_id,
    'CLAVE_NUMERICA', 'VINCULO_HISTORICO', 1, pg_catalog.now()
  );

  update public.demografia_fuentes
  set estado = 'PUBLICADA', validated_at = pg_catalog.now(),
      published_at = pg_catalog.now()
  where demografia_fuente_id = v_demography_source_id;

  insert into public.demografia_fuentes (
    proveedor, conjunto, anio_censal, clave_entidad, archivo_nombre,
    archivo_sha256, filas_total, columnas_total
  ) values (
    'INEGI', 'CPV2020_ECEG', 2200, v_source_entity.clave_entidad,
    'unpublished-eceg.xlsx', pg_catalog.repeat('b', 64), 1, 220
  ) returning demografia_fuente_id into v_unpublished_demography_source_id;

  select * into strict v_result
  from public.rpc_indicadores_territoriales(
    'MUNICIPIO', v_version_id, null, null
  )
  where territorio_id = v_source_municipality.municipio_id;

  if v_result.secciones_total <> 2
     or v_result.secciones_nominal <> 1
     or v_result.secciones_demografia <> 1
     or v_result.cobertura_fuente_nominal_pct <> 50
     or v_result.cobertura_fuente_demografia_pct <> 50
     or v_result.padron_total <> 18
     or v_result.lista_total <> 17
     or pg_catalog.abs(v_result.cobertura_padron_pct - 94.44444444444444) > 0.0000001
     or v_result.pobtot <> 100
     or v_result.pea <> 0
     or v_result.pcon_disc is not null
     or (v_result.calidad_metricas ->> 'pea')::bigint <> 1
     or (v_result.calidad_metricas ->> 'pcon_disc')::bigint <> 0
     or v_result.lista_nominal_corte_id <> v_nominal_cut_id
     or v_result.demografia_fuente_id <> v_demography_source_id then
    raise exception 'municipal aggregate failed coverage, provenance, null or zero semantics';
  end if;

  select pg_catalog.count(*) into v_actual_count
  from public.rpc_indicadores_territoriales(
    'MUNICIPIO', v_version_id, v_nominal_cut_id, v_demography_source_id
  );
  select pg_catalog.count(*) into v_expected_count
  from public.cartografia_municipios
  where cartografia_version_id = v_version_id;
  if v_actual_count <> v_expected_count then
    raise exception 'municipality cardinality mismatch: % <> %', v_actual_count, v_expected_count;
  end if;

  select pg_catalog.count(*) into v_actual_count
  from public.rpc_indicadores_territoriales(
    'DISTRITO_LOCAL', v_version_id, v_nominal_cut_id, v_demography_source_id
  );
  select pg_catalog.count(*) into v_expected_count
  from public.cartografia_distritos_locales
  where cartografia_version_id = v_version_id;
  if v_actual_count <> v_expected_count then
    raise exception 'local district cardinality mismatch: % <> %', v_actual_count, v_expected_count;
  end if;

  select pg_catalog.count(*) into v_actual_count
  from public.rpc_indicadores_territoriales(
    'DISTRITO_FEDERAL', v_version_id, v_nominal_cut_id, v_demography_source_id
  );
  select pg_catalog.count(*) into v_expected_count
  from public.cartografia_distritos_federales
  where cartografia_version_id = v_version_id;
  if v_actual_count <> v_expected_count then
    raise exception 'federal district cardinality mismatch: % <> %', v_actual_count, v_expected_count;
  end if;

  if exists (
    select 1
    from public.rpc_indicadores_territoriales(
      'MUNICIPIO', v_version_id, v_nominal_cut_id, v_demography_source_id
    )
    group by territorio_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'duplicate territorial aggregate';
  end if;

  v_failed := false;
  begin
    perform * from public.rpc_indicadores_territoriales(
      'SECCION', v_version_id, v_nominal_cut_id, v_demography_source_id
    );
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  if not v_failed then raise exception 'invalid level was accepted'; end if;

  v_failed := false;
  begin
    perform * from public.rpc_indicadores_territoriales(
      'MUNICIPIO', 9223372036854775807, v_nominal_cut_id, v_demography_source_id
    );
  exception when no_data_found then
    v_failed := true;
  end;
  if not v_failed then raise exception 'missing cartography version was accepted'; end if;

  v_failed := false;
  begin
    perform * from public.rpc_indicadores_territoriales(
      'MUNICIPIO', v_version_id, v_unpublished_nominal_cut_id, v_demography_source_id
    );
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  if not v_failed then raise exception 'unpublished nominal cutoff was accepted'; end if;

  v_failed := false;
  begin
    perform * from public.rpc_indicadores_territoriales(
      'MUNICIPIO', v_version_id, v_nominal_cut_id,
      v_unpublished_demography_source_id
    );
  exception when invalid_parameter_value then
    v_failed := true;
  end;
  if not v_failed then raise exception 'unpublished demographic source was accepted'; end if;
end
$behavior$;

rollback;
