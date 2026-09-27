begin;

do $contract$
declare
  v_table text;
  v_privilege text;
  v_sequence text;
begin
  foreach v_table in array array[
    'demografia_eceg_secciones',
    'demografia_eceg_correspondencias'
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

  foreach v_sequence in array array[
    pg_catalog.pg_get_serial_sequence(
      'public.demografia_eceg_secciones', 'demografia_eceg_seccion_id'
    ),
    pg_catalog.pg_get_serial_sequence(
      'public.demografia_eceg_correspondencias',
      'demografia_eceg_correspondencia_id'
    )
  ] loop
    if pg_catalog.has_sequence_privilege('anon', v_sequence, 'USAGE')
      or pg_catalog.has_sequence_privilege('authenticated', v_sequence, 'USAGE')
    then
      raise exception 'client role has unexpected sequence usage on %', v_sequence;
    end if;
    if not pg_catalog.has_sequence_privilege('service_role', v_sequence, 'USAGE') then
      raise exception 'service_role lacks sequence usage on %', v_sequence;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'demografia_eceg_secciones_clave_uk'
      and conrelid = 'public.demografia_eceg_secciones'::pg_catalog.regclass
      and contype = 'u'
  ) then
    raise exception 'missing ECEG section business-key constraint';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname = 'demografia_eceg_correspondencias_destino_publicable_uk'
      and indexdef ilike '%where%VINCULO_HISTORICO%DIRECTA%'
  ) then
    raise exception 'missing partial unique destination index';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'demografia_eceg_secciones_marco_ck'
      and conrelid = 'public.demografia_eceg_secciones'::pg_catalog.regclass
      and pg_catalog.pg_get_constraintdef(oid) ilike '%2021-01-31%'
  ) then
    raise exception 'ECEG January 2021 frame constraint is missing';
  end if;

  foreach v_table in array array[
    'demografia_eceg_secciones_mutable_trg',
    'demografia_eceg_correspondencias_mutable_trg',
    'demografia_eceg_indicadores_mutable_trg',
    'demografia_eceg_fuente_immutable_trg'
  ] loop
    if not exists (
      select 1 from pg_catalog.pg_trigger where tgname = v_table and not tgisinternal
    ) then
      raise exception 'missing ECEG immutability trigger %', v_table;
    end if;
  end loop;
end
$contract$;

do $behavior$
declare
  v_source_id bigint;
  v_eceg_id bigint;
  v_other_eceg_id bigint;
  v_cartografia_version_id bigint;
  v_cartografia_seccion_id bigint;
  v_seccion_id bigint;
begin
  select s.cartografia_version_id, s.cartografia_seccion_id, s.seccion_id
  into v_cartografia_version_id, v_cartografia_seccion_id, v_seccion_id
  from public.cartografia_secciones s
  order by s.cartografia_version_id desc, s.cartografia_seccion_id
  limit 1;

  if v_cartografia_seccion_id is null then
    raise exception 'ECEG fixture requires one cartographic section';
  end if;

  insert into public.demografia_fuentes (
    proveedor, conjunto, anio_censal, clave_entidad, archivo_nombre,
    archivo_sha256, filas_total, columnas_total, metadatos
  ) values (
    'INEGI', 'CPV2020_ECEG', 2020, '15', 'fixture.xlsx',
    pg_catalog.repeat('1', 64), 2, 220,
    '{"sourceFrameDate":"2021-01-31"}'::jsonb
  ) returning demografia_fuente_id into v_source_id;

  insert into public.demografia_eceg_secciones (
    demografia_fuente_id, clave_entidad, nombre_entidad,
    numero_distrito_federal, grupo_complejidad, clave_municipio,
    nombre_municipio, numero_seccion, marco_cartografico_fecha,
    filas_origen, registro_sha256, pobtot, indicadores, estados_dato
  ) values (
    v_source_id, '15', 'México', '001', 'Disperso 1', '001',
    'Acambay', '0001', date '2021-01-31',
    '{"Población":5}'::jsonb, pg_catalog.repeat('2', 64), 10,
    '{"POBLACION_POBLACION_TOTAL":10}'::jsonb,
    '{"POBLACION_POBLACION_TOTAL":"PRESENTE"}'::jsonb
  ) returning demografia_eceg_seccion_id into v_eceg_id;

  begin
    insert into public.demografia_eceg_secciones (
      demografia_fuente_id, clave_entidad, nombre_entidad,
      numero_distrito_federal, clave_municipio, nombre_municipio,
      numero_seccion, marco_cartografico_fecha, filas_origen,
      registro_sha256, pobtot
    ) values (
      v_source_id, '15', 'México', '001', '001', 'Acambay', '0003',
      date '2026-01-31', '{"Población":7}'::jsonb,
      pg_catalog.repeat('6', 64), 30
    );
    raise exception 'ECEG section outside January 2021 frame was accepted';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.demografia_eceg_secciones (
      demografia_fuente_id, clave_entidad, nombre_entidad,
      numero_distrito_federal, clave_municipio, nombre_municipio,
      numero_seccion, marco_cartografico_fecha, filas_origen,
      registro_sha256, pobtot
    ) values (
      v_source_id, '15', 'México', '001', '001', 'Acambay', '0001',
      date '2021-01-31', '{"Población":6}'::jsonb,
      pg_catalog.repeat('3', 64), 10
    );
    raise exception 'duplicate ECEG section was accepted';
  exception
    when unique_violation then null;
  end;

  begin
    update public.demografia_eceg_secciones set pobtot = -1
    where demografia_eceg_seccion_id = v_eceg_id;
    raise exception 'negative ECEG population was accepted';
  exception
    when check_violation then null;
  end;

  insert into public.demografia_eceg_correspondencias (
    demografia_fuente_id, demografia_eceg_seccion_id,
    cartografia_version_id, cartografia_seccion_id, seccion_id,
    metodo, estado, confianza, evidencia, advertencias
  ) values (
    v_source_id, v_eceg_id, v_cartografia_version_id,
    v_cartografia_seccion_id, v_seccion_id,
    'CLAVE_NUMERICA', 'VINCULO_HISTORICO', 1,
    '{"fixture":true}'::jsonb,
    '["Marco INE enero 2021"]'::jsonb
  );

  insert into public.demografia_eceg_secciones (
    demografia_fuente_id, clave_entidad, nombre_entidad,
    numero_distrito_federal, clave_municipio, nombre_municipio,
    numero_seccion, marco_cartografico_fecha, filas_origen,
    registro_sha256, pobtot
  ) values (
    v_source_id, '15', 'México', '001', '001', 'Acambay', '0002',
    date '2021-01-31', '{"Población":6}'::jsonb,
    pg_catalog.repeat('4', 64), 20
  ) returning demografia_eceg_seccion_id into v_other_eceg_id;

  begin
    insert into public.demografia_eceg_correspondencias (
      demografia_fuente_id, demografia_eceg_seccion_id,
      cartografia_version_id, metodo, estado, confianza
    ) values (
      v_source_id, v_other_eceg_id, v_cartografia_version_id,
      'CLAVE_NUMERICA', 'VINCULO_HISTORICO', 1
    );
    raise exception 'historic link without destination was accepted';
  exception
    when check_violation then null;
    when unique_violation then null;
  end;

  begin
    insert into public.demografia_eceg_correspondencias (
      demografia_fuente_id, demografia_eceg_seccion_id,
      cartografia_version_id, cartografia_seccion_id, seccion_id,
      metodo, estado, confianza
    ) values (
      v_source_id, v_other_eceg_id, v_cartografia_version_id,
      v_cartografia_seccion_id, v_seccion_id,
      'SIN_MATCH', 'SIN_EQUIVALENCIA', 1
    );
    raise exception 'unmatched ECEG section with destination was accepted';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.demografia_eceg_correspondencias (
      demografia_fuente_id, demografia_eceg_seccion_id,
      cartografia_version_id, cartografia_seccion_id, seccion_id,
      metodo, estado, confianza
    ) values (
      v_source_id, v_other_eceg_id, v_cartografia_version_id,
      v_cartografia_seccion_id, v_seccion_id,
      'CLAVE_NUMERICA', 'VINCULO_HISTORICO', 1
    );
    raise exception 'two source sections were linked to one destination';
  exception
    when unique_violation then null;
  end;

  insert into public.demografia_cargas_lotes (
    demografia_fuente_id, etapa, rango_inicio, rango_fin,
    filas_esperadas, checksum
  ) values (
    v_source_id, 'SECCIONES_ECEG', 1, 2, 2, pg_catalog.repeat('5', 64)
  );

  update public.demografia_fuentes
  set estado = 'PUBLICADA',
      validated_at = pg_catalog.now(),
      published_at = pg_catalog.now()
  where demografia_fuente_id = v_source_id;

  begin
    update public.demografia_eceg_secciones
    set pobtot = 11
    where demografia_eceg_seccion_id = v_eceg_id;
    raise exception 'published ECEG section was mutable';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    update public.demografia_eceg_correspondencias
    set evidencia = '{"changed":true}'::jsonb
    where demografia_eceg_seccion_id = v_eceg_id;
    raise exception 'published ECEG correspondence was mutable';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    insert into public.demografia_indicadores (
      demografia_fuente_id, mnemonico, nombre, tipo_logico, orden
    ) values (
      v_source_id, 'POST_PUBLICACION', 'No permitido', 'ENTERO', 219
    );
    raise exception 'published ECEG indicator was mutable';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    update public.demografia_fuentes
    set archivo_nombre = 'changed.xlsx'
    where demografia_fuente_id = v_source_id;
    raise exception 'published ECEG source metadata was mutable';
  exception
    when sqlstate '55000' then null;
  end;
end
$behavior$;

rollback;
