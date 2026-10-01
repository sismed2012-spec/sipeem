begin;

do $contract$
declare
  v_section_rpc oid := pg_catalog.to_regprocedure(
    'public.rpc_lista_nominal_seccion(bigint,bigint,date)'
  );
  v_coverage_rpc oid := pg_catalog.to_regprocedure(
    'public.rpc_lista_nominal_cobertura(bigint,bigint)'
  );
  v_rpc oid;
begin
  if v_section_rpc is null then
    raise exception 'missing RPC public.rpc_lista_nominal_seccion(bigint,bigint,date)';
  end if;
  if v_coverage_rpc is null then
    raise exception 'missing RPC public.rpc_lista_nominal_cobertura(bigint,bigint)';
  end if;

  foreach v_rpc in array array[v_section_rpc, v_coverage_rpc] loop
    if (select p.prosecdef from pg_catalog.pg_proc p where p.oid = v_rpc) then
      raise exception 'nominal-list RPC % must be SECURITY INVOKER', v_rpc::pg_catalog.regprocedure;
    end if;
    if (select p.provolatile <> 's' from pg_catalog.pg_proc p where p.oid = v_rpc) then
      raise exception 'nominal-list RPC % must be STABLE', v_rpc::pg_catalog.regprocedure;
    end if;
    if not (
      select pg_catalog.array_length(p.proconfig, 1) = 1
        and 'search_path=""' = any(p.proconfig)
      from pg_catalog.pg_proc p
      where p.oid = v_rpc
    ) then
      raise exception 'nominal-list RPC % must have blank search_path', v_rpc::pg_catalog.regprocedure;
    end if;
    if pg_catalog.has_function_privilege('anon', v_rpc, 'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated', v_rpc, 'EXECUTE') then
      raise exception 'client role has unexpected execute privilege on %', v_rpc::pg_catalog.regprocedure;
    end if;
    if not pg_catalog.has_function_privilege('service_role', v_rpc, 'EXECUTE') then
      raise exception 'service_role lacks execute privilege on %', v_rpc::pg_catalog.regprocedure;
    end if;
  end loop;
end
$contract$;

do $behavior$
declare
  v_cartografia_version_id bigint;
  v_cartografia_seccion_id bigint;
  v_seccion_id bigint;
  v_municipio_id bigint;
  v_clave_entidad text;
  v_clave_municipio text;
  v_numero integer;
  v_old_cut bigint;
  v_new_cut bigint;
  v_nominal_section bigint;
  v_result record;
  v_count integer;
begin
  select
    cs.cartografia_version_id,
    cs.cartografia_seccion_id,
    cs.seccion_id,
    cs.municipio_id,
    cs.clave_entidad,
    cm.clave_municipio,
    cs.numero
  into strict
    v_cartografia_version_id,
    v_cartografia_seccion_id,
    v_seccion_id,
    v_municipio_id,
    v_clave_entidad,
    v_clave_municipio,
    v_numero
  from public.cartografia_secciones cs
  join public.cartografia_municipios cm
    on cm.cartografia_municipio_id = cs.cartografia_municipio_id
   and cm.cartografia_version_id = cs.cartografia_version_id
   and cm.municipio_id = cs.municipio_id
  where cs.cartografia_version_id = 4025
  order by cs.cartografia_seccion_id
  limit 1;

  insert into public.lista_nominal_cortes (
    clave, fecha_corte, clave_entidad, fuente, archivo_nombre,
    archivo_sha256, filas_secciones, padron_total, lista_nominal_total,
    diferencia_total, residentes_extranjero
  ) values (
    'TEST-RPC-2098', date '2098-07-31', v_clave_entidad, 'INE',
    'old.xlsx', pg_catalog.repeat('8', 64), 1, 18, 17, 1,
    '{"padronTotal":18,"listaTotal":17,"diferencia":1,"cobertura":94.44444444444444}'::jsonb
  ) returning lista_nominal_corte_id into v_old_cut;

  insert into public.lista_nominal_secciones (
    lista_nominal_corte_id, clave_entidad, clave_municipio,
    municipio_nombre, distrito_local, distrito_federal, numero_seccion,
    padron_hombres, padron_mujeres, padron_no_binario, padron_total,
    lista_hombres, lista_mujeres, lista_no_binario, lista_total,
    diferencia, cobertura, fila_origen
  ) values (
    v_old_cut, v_clave_entidad, v_clave_municipio, 'Municipio', 1, 1, v_numero,
    8, 10, 0, 18, 8, 9, 0, 17, 1, 94.44444444444444, 15
  ) returning lista_nominal_seccion_id into v_nominal_section;

  insert into public.lista_nominal_correspondencias (
    lista_nominal_corte_id, lista_nominal_seccion_id, cartografia_version_id,
    cartografia_seccion_id, seccion_id, municipio_id, estado, motivo
  ) values (
    v_old_cut, v_nominal_section, v_cartografia_version_id,
    v_cartografia_seccion_id, v_seccion_id, v_municipio_id,
    'VINCULADA', 'CLAVE_EXACTA'
  );
  update public.lista_nominal_cortes
  set estado = 'VALIDADO', validado_at = pg_catalog.now()
  where lista_nominal_corte_id = v_old_cut;
  update public.lista_nominal_cortes
  set estado = 'PUBLICADO', publicado_at = pg_catalog.now()
  where lista_nominal_corte_id = v_old_cut;
  update public.lista_nominal_cortes
  set estado = 'ARCHIVADO', archivado_at = pg_catalog.now()
  where lista_nominal_corte_id = v_old_cut;

  insert into public.lista_nominal_cortes (
    clave, fecha_corte, clave_entidad, fuente, archivo_nombre,
    archivo_sha256, filas_secciones, padron_total, lista_nominal_total,
    diferencia_total, residentes_extranjero
  ) values (
    'TEST-RPC-2099', date '2099-07-31', v_clave_entidad, 'INE',
    'new.xlsx', pg_catalog.repeat('9', 64), 1, 30, 27, 3,
    '{"padronTotal":30,"listaTotal":27,"diferencia":3,"cobertura":90}'::jsonb
  ) returning lista_nominal_corte_id into v_new_cut;

  insert into public.lista_nominal_secciones (
    lista_nominal_corte_id, clave_entidad, clave_municipio,
    municipio_nombre, distrito_local, distrito_federal, numero_seccion,
    padron_hombres, padron_mujeres, padron_no_binario, padron_total,
    lista_hombres, lista_mujeres, lista_no_binario, lista_total,
    diferencia, cobertura, fila_origen
  ) values (
    v_new_cut, v_clave_entidad, v_clave_municipio, 'Municipio', 1, 1, v_numero,
    14, 16, 0, 30, 13, 14, 0, 27, 3, 90, 15
  ) returning lista_nominal_seccion_id into v_nominal_section;

  insert into public.lista_nominal_correspondencias (
    lista_nominal_corte_id, lista_nominal_seccion_id, cartografia_version_id,
    cartografia_seccion_id, seccion_id, municipio_id, estado, motivo
  ) values (
    v_new_cut, v_nominal_section, v_cartografia_version_id,
    v_cartografia_seccion_id, v_seccion_id, v_municipio_id,
    'VINCULADA', 'CLAVE_EXACTA'
  );
  update public.lista_nominal_cortes
  set estado = 'VALIDADO', validado_at = pg_catalog.now()
  where lista_nominal_corte_id = v_new_cut;
  update public.lista_nominal_cortes
  set estado = 'PUBLICADO', publicado_at = pg_catalog.now()
  where lista_nominal_corte_id = v_new_cut;

  select * into strict v_result
  from public.rpc_lista_nominal_seccion(
    v_seccion_id, v_cartografia_version_id, null
  );
  if v_result.cutoff_date <> date '2099-07-31'
     or (v_result.nominal ->> 'total')::integer <> 27
     or v_result.status <> 'AVAILABLE' then
    raise exception 'latest published nominal-list selection is incorrect';
  end if;

  select * into strict v_result
  from public.rpc_lista_nominal_seccion(
    v_seccion_id, v_cartografia_version_id, date '2098-07-31'
  );
  if v_result.cutoff_date <> date '2098-07-31'
     or (v_result.nominal ->> 'total')::integer <> 17 then
    raise exception 'explicit archived cutoff selection is incorrect';
  end if;

  select pg_catalog.count(*)::integer into v_count
  from public.rpc_lista_nominal_seccion(
    9223372036854775807, v_cartografia_version_id, null
  );
  if v_count <> 0 then
    raise exception 'RPC fabricated a row for an unlinked section';
  end if;

  select * into strict v_result
  from public.rpc_lista_nominal_cobertura(v_new_cut, v_cartografia_version_id);
  if v_result.source_rows <> 1
     or v_result.linked_rows <> 1
     or v_result.pending_rows <> 0
     or v_result.cartography_rows <> 7052
     or v_result.cartography_without_nominal <> 7051 then
    raise exception 'coverage RPC returned incorrect counts';
  end if;
end
$behavior$;

rollback;
