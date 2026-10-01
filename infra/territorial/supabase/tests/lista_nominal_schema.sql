begin;

do $contract$
declare
  v_table text;
begin
  foreach v_table in array array[
    'lista_nominal_cortes',
    'lista_nominal_secciones',
    'lista_nominal_correspondencias'
  ] loop
    if pg_catalog.to_regclass('public.' || v_table) is null then
      raise exception 'missing table public.%', v_table;
    end if;
  end loop;
end
$contract$;

do $columns$
declare
  v_actual text;
begin
  select pg_catalog.format_type(a.atttypid, a.atttypmod)
  into v_actual
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.lista_nominal_cortes'::pg_catalog.regclass
    and a.attname = 'residentes_extranjero'
    and a.attnum > 0
    and not a.attisdropped;
  if v_actual <> 'jsonb' then
    raise exception 'residentes_extranjero must be jsonb, got %', v_actual;
  end if;

  select pg_catalog.format_type(a.atttypid, a.atttypmod)
  into v_actual
  from pg_catalog.pg_attribute a
  where a.attrelid = 'public.lista_nominal_secciones'::pg_catalog.regclass
    and a.attname = 'cobertura'
    and a.attnum > 0
    and not a.attisdropped;
  if v_actual <> 'double precision' then
    raise exception 'cobertura must preserve the source double precision value, got %', v_actual;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.lista_nominal_cortes'::pg_catalog.regclass
      and conname = 'lista_nominal_cortes_archivo_sha256_uk'
      and contype = 'u'
  ) then
    raise exception 'missing unique source-hash constraint';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.lista_nominal_secciones'::pg_catalog.regclass
      and conname = 'lista_nominal_secciones_corte_entidad_numero_uk'
      and contype = 'u'
  ) then
    raise exception 'missing section business-key constraint';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.lista_nominal_correspondencias'::pg_catalog.regclass
      and conname = 'lista_nominal_correspondencias_evaluacion_uk'
      and contype = 'u'
  ) then
    raise exception 'missing correspondence evaluation constraint';
  end if;

  if pg_catalog.to_regclass('public.lista_nominal_secciones_corte_municipio_idx') is null then
    raise exception 'missing nominal sections lookup index';
  end if;
  if pg_catalog.to_regclass('public.lista_nominal_correspondencias_version_estado_idx') is null then
    raise exception 'missing correspondence status index';
  end if;
end
$columns$;

do $security$
declare
  v_table text;
  v_privilege text;
  v_sequence text;
begin
  foreach v_table in array array[
    'lista_nominal_cortes',
    'lista_nominal_secciones',
    'lista_nominal_correspondencias'
  ] loop
    if not (
      select c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = v_table
    ) then
      raise exception 'RLS is not enabled on public.%', v_table;
    end if;

    foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
      if pg_catalog.has_table_privilege('anon', 'public.' || v_table, v_privilege) then
        raise exception 'anon has unexpected % privilege on public.%', v_privilege, v_table;
      end if;
      if pg_catalog.has_table_privilege('authenticated', 'public.' || v_table, v_privilege) then
        raise exception 'authenticated has unexpected % privilege on public.%', v_privilege, v_table;
      end if;
      if not pg_catalog.has_table_privilege('service_role', 'public.' || v_table, v_privilege) then
        raise exception 'service_role lacks % privilege on public.%', v_privilege, v_table;
      end if;
    end loop;
  end loop;

  foreach v_sequence in array array[
    pg_catalog.pg_get_serial_sequence(
      'public.lista_nominal_cortes',
      'lista_nominal_corte_id'
    ),
    pg_catalog.pg_get_serial_sequence(
      'public.lista_nominal_secciones',
      'lista_nominal_seccion_id'
    ),
    pg_catalog.pg_get_serial_sequence(
      'public.lista_nominal_correspondencias',
      'lista_nominal_correspondencia_id'
    )
  ] loop
    if v_sequence is null then
      raise exception 'missing identity sequence';
    end if;
    if pg_catalog.has_sequence_privilege('anon', v_sequence, 'USAGE')
       or pg_catalog.has_sequence_privilege('authenticated', v_sequence, 'USAGE') then
      raise exception 'client role has unexpected sequence privilege on %', v_sequence;
    end if;
    if not pg_catalog.has_sequence_privilege('service_role', v_sequence, 'USAGE')
       or not pg_catalog.has_sequence_privilege('service_role', v_sequence, 'SELECT') then
      raise exception 'service_role lacks identity sequence privileges on %', v_sequence;
    end if;
  end loop;
end
$security$;

do $behavior$
declare
  v_corte_id bigint;
  v_otro_corte_id bigint;
  v_nominal_seccion_id bigint;
  v_cartografia_version_id bigint;
  v_cartografia_seccion_id bigint;
  v_seccion_id bigint;
  v_municipio_id bigint;
  v_clave_entidad text;
  v_clave_municipio text;
  v_numero_seccion integer;
begin
  select
    cs.cartografia_version_id,
    cs.cartografia_seccion_id,
    cs.seccion_id,
    cs.municipio_id,
    cs.clave_entidad,
    cm.clave_municipio,
    cs.numero
  into
    v_cartografia_version_id,
    v_cartografia_seccion_id,
    v_seccion_id,
    v_municipio_id,
    v_clave_entidad,
    v_clave_municipio,
    v_numero_seccion
  from public.cartografia_secciones cs
  join public.cartografia_municipios cm
    on cm.cartografia_municipio_id = cs.cartografia_municipio_id
   and cm.cartografia_version_id = cs.cartografia_version_id
   and cm.municipio_id = cs.municipio_id
  order by cs.cartografia_version_id, cs.cartografia_seccion_id
  limit 1;

  if v_cartografia_seccion_id is null then
    raise exception 'schema behavior contract requires one existing cartographic section';
  end if;

  insert into public.lista_nominal_cortes (
    clave, fecha_corte, clave_entidad, fuente, archivo_nombre,
    archivo_sha256, filas_secciones, padron_total, lista_nominal_total,
    diferencia_total, residentes_extranjero
  ) values (
    'TEST-2099-01-31-15', date '2099-01-31', v_clave_entidad, 'INE',
    'fixture.xlsx', pg_catalog.repeat('a', 64), 1, 18, 17, 1,
    '{"padron":18,"nominal":17,"difference":1,"coverage":94.44444444444444,"sourceRow":14}'::jsonb
  ) returning lista_nominal_corte_id into v_corte_id;

  insert into public.lista_nominal_secciones (
    lista_nominal_corte_id, clave_entidad, clave_municipio,
    municipio_nombre, distrito_local, distrito_local_nombre,
    distrito_federal, distrito_federal_nombre, numero_seccion,
    padron_hombres, padron_mujeres, padron_no_binario, padron_total,
    lista_hombres, lista_mujeres, lista_no_binario, lista_total,
    diferencia, cobertura, fila_origen
  ) values (
    v_corte_id, v_clave_entidad, v_clave_municipio,
    'Municipio de prueba', 1, 'Distrito local de prueba',
    1, 'Distrito federal de prueba', v_numero_seccion,
    8, 10, 0, 18, 8, 9, 0, 17, 1, 94.44444444444444, 15
  ) returning lista_nominal_seccion_id into v_nominal_seccion_id;

  begin
    insert into public.lista_nominal_secciones (
      lista_nominal_corte_id, clave_entidad, clave_municipio,
      municipio_nombre, distrito_local, distrito_federal, numero_seccion,
      padron_hombres, padron_mujeres, padron_no_binario, padron_total,
      lista_hombres, lista_mujeres, lista_no_binario, lista_total,
      diferencia, cobertura, fila_origen
    ) values (
      v_corte_id, v_clave_entidad, '999', 'Inválido', 1, 1, 9999,
      8, 10, 0, 19, 8, 9, 0, 17, 2, 89.47368421052632, 16
    );
    raise exception 'inconsistent sex totals were accepted';
  exception
    when check_violation then null;
  end;

  insert into public.lista_nominal_correspondencias (
    lista_nominal_corte_id, lista_nominal_seccion_id,
    cartografia_version_id, estado, motivo
  ) values (
    v_corte_id, v_nominal_seccion_id, v_cartografia_version_id,
    'PENDIENTE', 'Prueba transaccional'
  );

  begin
    update public.lista_nominal_correspondencias
    set estado = 'VINCULADA'
    where lista_nominal_seccion_id = v_nominal_seccion_id;
    raise exception 'linked correspondence without target IDs was accepted';
  exception
    when check_violation then null;
  end;

  update public.lista_nominal_correspondencias
  set
    estado = 'VINCULADA',
    motivo = 'Coincidencia exacta',
    cartografia_seccion_id = v_cartografia_seccion_id,
    seccion_id = v_seccion_id,
    municipio_id = v_municipio_id
  where lista_nominal_seccion_id = v_nominal_seccion_id;

  begin
    update public.lista_nominal_correspondencias
    set estado = 'PENDIENTE'
    where lista_nominal_seccion_id = v_nominal_seccion_id;
    raise exception 'non-linked correspondence retained target IDs';
  exception
    when check_violation then null;
  end;

  insert into public.lista_nominal_cortes (
    clave, fecha_corte, clave_entidad, fuente, archivo_nombre,
    archivo_sha256, filas_secciones, padron_total, lista_nominal_total,
    diferencia_total, residentes_extranjero
  ) values (
    'TEST-2099-02-28-15', date '2099-02-28', v_clave_entidad, 'INE',
    'fixture-2.xlsx', pg_catalog.repeat('b', 64), 1, 18, 17, 1,
    '{"padron":18,"nominal":17,"difference":1,"coverage":94.44444444444444,"sourceRow":14}'::jsonb
  ) returning lista_nominal_corte_id into v_otro_corte_id;

  begin
    update public.lista_nominal_cortes
    set estado = 'PUBLICADO', publicado_at = pg_catalog.now()
    where lista_nominal_corte_id = v_otro_corte_id;
    raise exception 'RECIBIDO to PUBLICADO transition was accepted';
  exception
    when check_violation then null;
  end;

  update public.lista_nominal_cortes
  set estado = 'VALIDADO', validado_at = pg_catalog.now()
  where lista_nominal_corte_id = v_corte_id;

  update public.lista_nominal_cortes
  set estado = 'PUBLICADO', publicado_at = pg_catalog.now()
  where lista_nominal_corte_id = v_corte_id;

  begin
    update public.lista_nominal_secciones
    set lista_total = 16, diferencia = 2, cobertura = 88.88888888888889
    where lista_nominal_seccion_id = v_nominal_seccion_id;
    raise exception 'published nominal row was mutable';
  exception
    when object_not_in_prerequisite_state then null;
  end;

  begin
    delete from public.lista_nominal_correspondencias
    where lista_nominal_seccion_id = v_nominal_seccion_id;
    raise exception 'published correspondence was deletable';
  exception
    when object_not_in_prerequisite_state then null;
  end;
end
$behavior$;

rollback;
