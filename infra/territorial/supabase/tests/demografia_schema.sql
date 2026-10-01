begin;

do $contract$
declare
  v_table text;
  v_column text;
begin
  foreach v_table in array array[
    'demografia_fuentes',
    'demografia_indicadores',
    'demografia_cargas_lotes',
    'demografia_localidades'
  ] loop
    if pg_catalog.to_regclass('public.' || v_table) is null then
      raise exception 'missing table public.%', v_table;
    end if;
  end loop;

  foreach v_column in array array[
    'pobtot', 'pobfem', 'pobmas', 'pob0_14', 'pob15_64', 'pob65_mas',
    'p_18ymas', 'pea', 'pocupada', 'p15ym_an', 'graproes', 'pder_ss',
    'pcon_disc', 'p3ym_hli', 'pob_afro', 'tvivhab', 'vph_aguadv',
    'vph_drenaj', 'vph_c_elec', 'vph_cel', 'vph_pc', 'vph_inter',
    'indicadores', 'estados_dato', 'geom_punto'
  ] loop
    if not exists (
      select 1
      from pg_catalog.pg_attribute a
      join pg_catalog.pg_class c on c.oid = a.attrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'demografia_localidades'
        and a.attname = v_column
        and a.attnum > 0
        and not a.attisdropped
    ) then
      raise exception 'missing column public.demografia_localidades.%', v_column;
    end if;
  end loop;

  if not exists (
    select 1
    from pg_catalog.pg_attribute a
    join pg_catalog.pg_class c on c.oid = a.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'demografia_localidades'
      and a.attname = 'geom_punto'
      and pg_catalog.format_type(a.atttypid, a.atttypmod) = 'geometry(Point,4326)'
  ) then
    raise exception 'geom_punto must be extensions.geometry(Point,4326)';
  end if;

  if pg_catalog.to_regclass('public.demografia_localidades_geom_punto_gix') is null then
    raise exception 'missing GIST index demografia_localidades_geom_punto_gix';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'demografia_fuentes_identidad_uk'
      and conrelid = 'public.demografia_fuentes'::pg_catalog.regclass
      and contype = 'u'
  ) then
    raise exception 'missing source identity unique constraint';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'demografia_localidades_clave_uk'
      and conrelid = 'public.demografia_localidades'::pg_catalog.regclass
      and contype = 'u'
  ) then
    raise exception 'missing locality business-key unique constraint';
  end if;
end
$contract$;

do $security$
declare
  v_table text;
  v_privilege text;
begin
  foreach v_table in array array[
    'demografia_fuentes',
    'demografia_indicadores',
    'demografia_cargas_lotes',
    'demografia_localidades'
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
end
$security$;

do $behavior$
declare
  v_source_id bigint;
  v_reserved_count integer;
begin
  insert into public.demografia_fuentes (
    proveedor, conjunto, anio_censal, clave_entidad, archivo_nombre,
    archivo_sha256, codificaciones, filas_total, columnas_total
  ) values (
    'INEGI', 'CPV2020_ITER', 2020, '15', 'fixture.zip',
    pg_catalog.repeat('a', 64), '{"dataset":"utf-8"}'::jsonb, 1, 286
  ) returning demografia_fuente_id into v_source_id;

  insert into public.demografia_localidades (
    demografia_fuente_id, clave_entidad, clave_municipio, clave_localidad,
    nombre_entidad, nombre_municipio, nombre_localidad,
    longitud, latitud, geom_punto, fila_origen, registro_sha256,
    pobtot, pobfem, estados_dato
  ) values (
    v_source_id, '15', '001', '0001', 'México', 'Acambay', 'Localidad prueba',
    -99.8440319, 19.9562286,
    extensions.st_setsrid(extensions.st_makepoint(-99.8440319, 19.9562286), 4326),
    2, pg_catalog.repeat('b', 64), 0, null, '{"POBFEM":"RESERVADO"}'::jsonb
  );

  select pg_catalog.count(*) into v_reserved_count
  from public.demografia_localidades
  where demografia_fuente_id = v_source_id
    and pobfem is null
    and estados_dato ->> 'POBFEM' = 'RESERVADO';

  if v_reserved_count <> 1 then
    raise exception 'reserved value was not stored as null plus RESERVADO status';
  end if;

  begin
    insert into public.demografia_localidades (
      demografia_fuente_id, clave_entidad, clave_municipio, clave_localidad,
      nombre_entidad, nombre_municipio, nombre_localidad,
      longitud, latitud, geom_punto, fila_origen, registro_sha256, pobtot
    ) values (
      v_source_id, '15', '001', '0002', 'México', 'Acambay', 'Negativa',
      -99.8, 19.9, extensions.st_setsrid(extensions.st_makepoint(-99.8, 19.9), 4326),
      3, pg_catalog.repeat('c', 64), -1
    );
    raise exception 'negative demographic count was accepted';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.demografia_cargas_lotes (
      demografia_fuente_id, etapa, rango_inicio, rango_fin,
      filas_esperadas, filas_procesadas, checksum, estado
    ) values (
      v_source_id, 'LOCALIDADES', 1, 1, 1, 0, pg_catalog.repeat('d', 64), 'CONFIRMADO'
    );
    raise exception 'invalid confirmed batch transition was accepted';
  exception
    when check_violation then null;
  end;
end
$behavior$;

rollback;
