begin;

do $contract$
declare
  v_table text;
  v_privilege text;
begin
  foreach v_table in array array[
    'demografia_localidad_correspondencias',
    'demografia_localidad_correspondencia_secciones',
    'demografia_secciones',
    'demografia_secciones_cobertura'
  ] loop
    if pg_catalog.to_regclass('public.' || v_table) is null then
      raise exception 'missing table public.%', v_table;
    end if;
    if not (
      select c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table
    ) then
      raise exception 'RLS is not enabled on public.%', v_table;
    end if;

    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if pg_catalog.has_table_privilege('anon', 'public.' || v_table, v_privilege)
        or pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, v_privilege)
      then
        raise exception 'client role has unexpected % privilege on public.%', v_privilege, v_table;
      end if;
      if not pg_catalog.has_table_privilege('service_role', 'public.' || v_table, v_privilege) then
        raise exception 'service_role lacks % privilege on public.%', v_privilege, v_table;
      end if;
    end loop;
  end loop;

  if pg_catalog.to_regprocedure(
    'territorial_private.demografia_clasificar_correspondencia(integer,boolean,boolean,boolean)'
  ) is null then
    raise exception 'missing demographic correspondence classifier';
  end if;

  if pg_catalog.to_regprocedure(
    'public.rpc_demografia_seccion(bigint,bigint,integer)'
  ) is null then
    raise exception 'missing demographic section RPC';
  end if;
end
$contract$;

do $spatial$
declare
  v_direct_count integer;
  v_overlap_count integer;
  v_touch_count integer;
begin
  with sections(section_id, geom) as (
    values
      (100::bigint, extensions.st_multi(extensions.st_makeenvelope(0, 0, 10, 10, 4326))),
      (101::bigint, extensions.st_multi(extensions.st_makeenvelope(10, 0, 20, 10, 4326)))
  ), localities(kind, geom) as (
    values
      ('DIRECT', extensions.st_multi(extensions.st_makeenvelope(1, 1, 2, 2, 4326))),
      ('OVERLAP', extensions.st_multi(extensions.st_makeenvelope(9, 1, 11, 2, 4326))),
      ('TOUCH', extensions.st_multi(extensions.st_makeenvelope(9, 1, 10, 2, 4326)))
  )
  select
    pg_catalog.count(*) filter (where l.kind = 'DIRECT'),
    pg_catalog.count(*) filter (where l.kind = 'OVERLAP'),
    pg_catalog.count(*) filter (where l.kind = 'TOUCH')
  into v_direct_count, v_overlap_count, v_touch_count
  from localities l
  join sections s on extensions.st_intersects(l.geom, s.geom);

  if territorial_private.demografia_clasificar_correspondencia(
    v_direct_count, true, false, true
  ) <> 'DIRECTA' then
    raise exception 'single strictly covered locality must classify DIRECTA';
  end if;

  if territorial_private.demografia_clasificar_correspondencia(
    v_overlap_count, false, false, true
  ) <> 'MULTISECCION' then
    raise exception 'overlapping locality must classify MULTISECCION';
  end if;

  if territorial_private.demografia_clasificar_correspondencia(
    v_touch_count, true, false, true
  ) <> 'MULTISECCION' then
    raise exception 'boundary-touching locality must not classify DIRECTA';
  end if;

  if territorial_private.demografia_clasificar_correspondencia(
    1, true, true, true
  ) <> 'REVISION_MANUAL' then
    raise exception 'ambiguous locality must classify REVISION_MANUAL';
  end if;

  if territorial_private.demografia_clasificar_correspondencia(
    0, false, false, false
  ) <> 'SIN_CORRESPONDENCIA' then
    raise exception 'locality without geometry match must classify SIN_CORRESPONDENCIA';
  end if;
end
$spatial$;

do $behavior$
declare
  v_source_id bigint;
  v_locality_id bigint;
  v_direct_id bigint;
  v_multi_id bigint;
  v_aggregate_id bigint;
  v_pending_aggregate_id bigint;
  v_result record;
  v_unknown_count integer;
begin
  insert into public.cartografia_versiones(cartografia_version_id) values (4025), (4026);
  insert into public.territorios_secciones(seccion_id) values (100), (101), (102);
  insert into public.cartografia_secciones(
    cartografia_seccion_id, cartografia_version_id, seccion_id, geom
  ) values
    (1000, 4025, 100, extensions.st_multi(extensions.st_makeenvelope(0, 0, 10, 10, 4326))),
    (1001, 4025, 101, extensions.st_multi(extensions.st_makeenvelope(10, 0, 20, 10, 4326))),
    (1002, 4026, 102, extensions.st_multi(extensions.st_makeenvelope(0, 0, 10, 10, 4326)));
  insert into public.cartografia_localidades(cartografia_localidad_id) values (2000), (2001);
  insert into public.cartografia_limites_localidad(cartografia_limite_localidad_id) values (3000), (3001);

  insert into public.demografia_fuentes (
    proveedor, conjunto, anio_censal, clave_entidad, archivo_nombre,
    archivo_sha256, codificaciones, filas_total, columnas_total,
    estado, validated_at, published_at
  ) values (
    'INEGI', 'CPV2020_ITER', 2020, '15', 'fixture.zip',
    pg_catalog.repeat('e', 64), '{"dataset":"utf-8"}'::jsonb, 2, 286,
    'PUBLICADA', pg_catalog.now(), pg_catalog.now()
  ) returning demografia_fuente_id into v_source_id;

  insert into public.demografia_localidades (
    demografia_fuente_id, clave_entidad, clave_municipio, clave_localidad,
    nombre_entidad, nombre_municipio, nombre_localidad,
    longitud, latitud, geom_punto, fila_origen, registro_sha256, pobtot
  ) values (
    v_source_id, '15', '001', '0001', 'México', 'Acambay', 'Directa',
    1.5, 1.5, extensions.st_setsrid(extensions.st_makepoint(1.5, 1.5), 4326),
    2, pg_catalog.repeat('f', 64), 25
  ) returning demografia_localidad_id into v_locality_id;

  insert into public.demografia_localidad_correspondencias (
    demografia_fuente_id, demografia_localidad_id, cartografia_version_id,
    cartografia_localidad_id, cartografia_limite_localidad_id,
    cartografia_seccion_id, seccion_id, metodo, estado,
    secciones_candidatas, cobertura_estricta, confianza, evidencia
  ) values (
    v_source_id, v_locality_id, 4025, 2000, 3000, 1000, 100,
    'ESPACIAL', 'DIRECTA', 1, true, 1, '{"fixture":"direct"}'::jsonb
  ) returning demografia_localidad_correspondencia_id into v_direct_id;

  insert into public.demografia_localidad_correspondencia_secciones (
    demografia_localidad_correspondencia_id, cartografia_seccion_id,
    cartografia_version_id, seccion_id, tipo_contacto, area_interseccion,
    proporcion_localidad
  ) values (v_direct_id, 1000, 4025, 100, 'AREA', 1, 1);

  begin
    insert into public.demografia_localidad_correspondencia_secciones (
      demografia_localidad_correspondencia_id, cartografia_seccion_id,
      cartografia_version_id, seccion_id, tipo_contacto, area_interseccion,
      proporcion_localidad
    ) values (v_direct_id, 1001, 4025, 101, 'BORDE', 0, 0);
    set constraints all immediate;
    raise exception 'candidate rows no longer match the declared candidate count';
  exception
    when check_violation then null;
  end;
  set constraints all deferred;

  begin
    insert into public.demografia_localidad_correspondencia_secciones (
      demografia_localidad_correspondencia_id, cartografia_seccion_id,
      cartografia_version_id, seccion_id, tipo_contacto, area_interseccion,
      proporcion_localidad
    ) values (v_direct_id, 1002, 4026, 102, 'AREA', 1, 1);
    raise exception 'a cross-version candidate was accepted';
  exception
    when foreign_key_violation then null;
  end;

  insert into public.demografia_localidades (
    demografia_fuente_id, clave_entidad, clave_municipio, clave_localidad,
    nombre_entidad, nombre_municipio, nombre_localidad,
    longitud, latitud, geom_punto, fila_origen, registro_sha256, pobtot
  ) values (
    v_source_id, '15', '001', '0002', 'México', 'Acambay', 'Multisección',
    10, 1.5, extensions.st_setsrid(extensions.st_makepoint(10, 1.5), 4326),
    3, pg_catalog.repeat('0', 64), 40
  ) returning demografia_localidad_id into v_locality_id;

  insert into public.demografia_localidad_correspondencias (
    demografia_fuente_id, demografia_localidad_id, cartografia_version_id,
    cartografia_localidad_id, cartografia_limite_localidad_id,
    metodo, estado, secciones_candidatas, cobertura_estricta, confianza
  ) values (
    v_source_id, v_locality_id, 4025, 2001, 3001,
    'ESPACIAL', 'MULTISECCION', 2, false, 1
  ) returning demografia_localidad_correspondencia_id into v_multi_id;

  insert into public.demografia_localidad_correspondencia_secciones (
    demografia_localidad_correspondencia_id, cartografia_seccion_id,
    cartografia_version_id, seccion_id, tipo_contacto, area_interseccion,
    proporcion_localidad
  ) values
    (v_multi_id, 1000, 4025, 100, 'BORDE', 0, 0),
    (v_multi_id, 1001, 4025, 101, 'BORDE', 0, 0);

  begin
    update public.demografia_localidad_correspondencias
    set estado = 'DIRECTA', cartografia_seccion_id = 1000, seccion_id = 100,
        cobertura_estricta = true
    where demografia_localidad_correspondencia_id = v_multi_id;
    raise exception 'a two-section locality was allowed to become DIRECTA';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.demografia_localidad_correspondencia_secciones (
      demografia_localidad_correspondencia_id, cartografia_seccion_id,
      cartografia_version_id, seccion_id, tipo_contacto, area_interseccion,
      proporcion_localidad
    ) values (v_direct_id, 1000, 4025, 100, 'AREA', 1, 1);
    raise exception 'duplicate correspondence candidate was accepted';
  exception
    when unique_violation then null;
  end;

  insert into public.demografia_secciones (
    demografia_fuente_id, cartografia_version_id, cartografia_seccion_id,
    seccion_id, localidades_incluidas, poblacion_incluida, pobtot
  ) values (v_source_id, 4025, 1000, 100, 1, 25, 25)
  returning demografia_seccion_id into v_aggregate_id;

  begin
    insert into public.demografia_secciones (
      demografia_fuente_id, cartografia_version_id, cartografia_seccion_id,
      seccion_id, localidades_incluidas, poblacion_incluida, pobtot
    ) values (v_source_id, 4025, 1000, 100, 1, 25, 25);
    raise exception 'duplicate source/version/section aggregate was accepted';
  exception
    when unique_violation then null;
  end;

  insert into public.demografia_secciones_cobertura (
    demografia_seccion_id, localidades_incluidas, localidades_pendientes,
    poblacion_incluida, poblacion_pendiente_referencia,
    referencia_pendiente_defendible, porcentaje_cobertura,
    razon_porcentaje_nulo, metodo, confianza, advertencias
  ) values (
    v_aggregate_id, 1, 1, 25, null, false, null,
    'DENOMINADOR_SECCIONAL_NO_DEFENDIBLE',
    'SOLO_DIRECTAS', 1, '["Localidad multisección pendiente"]'::jsonb
  );

  begin
    update public.demografia_secciones_cobertura
    set poblacion_pendiente_referencia = 40
    where demografia_seccion_id = v_aggregate_id;
    raise exception 'duplicable pending population reference was accepted';
  exception
    when check_violation then null;
  end;

  set constraints all immediate;

  select * into v_result
  from public.rpc_demografia_seccion(100, 4025, 2020);

  if v_result.status <> 'PARTIAL'
    or (v_result.coverage ->> 'percentage') is not null
    or (v_result.source ->> 'censusYear')::integer <> 2020
    or v_result.version_id <> 4025
  then
    raise exception 'RPC returned an invalid versioned partial response';
  end if;

  insert into public.demografia_secciones (
    demografia_fuente_id, cartografia_version_id, cartografia_seccion_id,
    seccion_id, localidades_incluidas, poblacion_incluida
  ) values (v_source_id, 4025, 1001, 101, 0, null)
  returning demografia_seccion_id into v_pending_aggregate_id;

  insert into public.demografia_secciones_cobertura (
    demografia_seccion_id, localidades_incluidas, localidades_pendientes,
    poblacion_incluida, poblacion_pendiente_referencia,
    referencia_pendiente_defendible, porcentaje_cobertura,
    razon_porcentaje_nulo, metodo, confianza
  ) values (
    v_pending_aggregate_id, 0, 1, null, null, false, null,
    'DENOMINADOR_SECCIONAL_NO_DEFENDIBLE', 'SOLO_DIRECTAS', 1
  );

  select * into v_result
  from public.rpc_demografia_seccion(101, 4025, 2020);
  if v_result.status <> 'PENDING' then
    raise exception 'RPC did not expose a pending-only section';
  end if;

  select pg_catalog.count(*) into v_unknown_count
  from public.rpc_demografia_seccion(999, 4025, 2020);
  if v_unknown_count <> 0 then
    raise exception 'RPC fabricated data for an unknown section';
  end if;
end
$behavior$;

do $function_security$
declare
  v_rpc oid := 'public.rpc_demografia_seccion(bigint,bigint,integer)'::pg_catalog.regprocedure;
begin
  if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_rpc) then
    raise exception 'demographic RPC must be SECURITY INVOKER';
  end if;
  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_rpc
      and 'search_path=""' = any(p.proconfig)
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
$function_security$;

rollback;
