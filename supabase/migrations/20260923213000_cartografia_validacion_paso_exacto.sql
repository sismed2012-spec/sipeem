begin;
set local lock_timeout = '10s';
create or replace function public.rpc_validar_version_cartografica_paso_exacto(
  p_cartografia_version_id bigint,
  p_fase_esperada text,
  p_cursor_esperado jsonb,
  p_snapshot_esperado text,
  p_lote integer default 250
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
set lock_timeout = '10s'
as $function$
declare
  v_version record;
  v_carga record;
  v_progreso record;
  v_snapshot jsonb;
  v_snapshot_sha256 text;
  v_cursor_text text;
  v_cursor bigint := 0;
  v_maximo_text text;
  v_resultado jsonb;
  v_base_ya_expuesta boolean;
begin
  if p_cartografia_version_id is null or p_fase_esperada is null
     or p_cursor_esperado is null or p_snapshot_esperado is null
     or p_lote is null then
    raise exception using errcode = '22004',
      message = 'version, fase, cursor, snapshot y lote son obligatorios';
  end if;
  if p_lote < 1 or p_lote > 250 then
    raise exception using errcode = '22023',
      message = 'p_lote debe estar entre 1 y 250';
  end if;
  if p_snapshot_esperado !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023',
      message = 'snapshot esperado invalido';
  end if;
  if pg_catalog.jsonb_typeof(p_cursor_esperado) <> 'object' then
    raise exception using errcode = '22023',
      message = 'cursor esperado debe ser objeto';
  end if;
  if p_fase_esperada not in (
    'SIN_INICIAR', 'PADRES', 'SOLAPES', 'COBERTURA', 'CONTEOS'
  ) then
    raise exception using errcode = '22023',
      message = 'fase esperada invalida';
  end if;

  if p_fase_esperada in ('SIN_INICIAR', 'CONTEOS') then
    if p_cursor_esperado <> '{}'::jsonb then
      raise exception using errcode = '22023',
        message = 'cursor esperado incompatible con fase';
    end if;
  elsif p_fase_esperada in ('PADRES', 'SOLAPES') then
    if (select pg_catalog.count(*)
          from pg_catalog.jsonb_object_keys(p_cursor_esperado)) <> 1
       or not (p_cursor_esperado ? 'cartografia_seccion_id')
       or pg_catalog.jsonb_typeof(
            p_cursor_esperado->'cartografia_seccion_id'
          ) <> 'number' then
      raise exception using errcode = '22023',
        message = 'cursor esperado incompatible con fase';
    end if;
    v_cursor_text := p_cursor_esperado->>'cartografia_seccion_id';
    if v_cursor_text !~ '^(0|[1-9][0-9]{0,18})$'
       or v_cursor_text::numeric > 9223372036854775807::numeric then
      raise exception using errcode = '22023',
        message = 'cursor esperado fuera de rango';
    end if;
    v_cursor := v_cursor_text::bigint;
  else
    if (select pg_catalog.count(*)
          from pg_catalog.jsonb_object_keys(p_cursor_esperado)) <> 1
       or not (p_cursor_esperado ? 'cartografia_municipio_id')
       or pg_catalog.jsonb_typeof(
            p_cursor_esperado->'cartografia_municipio_id'
          ) <> 'number' then
      raise exception using errcode = '22023',
        message = 'cursor esperado incompatible con fase';
    end if;
    v_cursor_text := p_cursor_esperado->>'cartografia_municipio_id';
    if v_cursor_text !~ '^(0|[1-9][0-9]{0,18})$'
       or v_cursor_text::numeric > 9223372036854775807::numeric then
      raise exception using errcode = '22023',
        message = 'cursor esperado fuera de rango';
    end if;
    v_cursor := v_cursor_text::bigint;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'SIPEEM:CARTOGRAFIA:VERSION:' || p_cartografia_version_id::text,
      0
    )
  );

  select v.* into v_version
    from public.cartografia_versiones v
   where v.cartografia_version_id = p_cartografia_version_id
   for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'version cartografica inexistente';
  end if;

  select c.* into v_carga
    from public.cargas_cartograficas c
   where c.cartografia_version_id = p_cartografia_version_id
   for update;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'carga cartografica inexistente';
  end if;

  -- SHARE bloquea DML externo sobre todos los insumos del snapshot hasta que
  -- la RPC interna active la barrera VALIDANDO en esta misma transaccion.
  lock table
    public.cartografia_entidades,
    public.cartografia_municipios,
    public.cartografia_distritos_locales,
    public.cartografia_distritos_federales,
    public.cartografia_secciones,
    public.cartografia_colonias,
    public.cartografia_colonias_sin_geometria,
    public.cartografia_localidades,
    public.cartografia_limites_localidad,
    public.cartografia_limites_localidad_puntos,
    public.cargas_cartograficas_lotes,
    public.cartografia_codificaciones_recibos,
    public.cartografia_cobertura_colonias_recibos,
    public.cartografia_cobertura_limites_localidad_recibos,
    public.cartografia_incidencias,
    public.validaciones_cartograficas_progreso
  in share mode;

  select p.* into v_progreso
    from public.validaciones_cartograficas_progreso p
   where p.cartografia_version_id = p_cartografia_version_id
   for update;

  if p_fase_esperada = 'SIN_INICIAR' then
    if found then
      raise exception using errcode = '55000',
        message = 'la validacion ya fue iniciada';
    end if;
    if v_version.estado <> 'CARGANDO' or v_carga.estado <> 'CARGANDO'
       or v_carga.reanudable is not false then
      raise exception using errcode = '55000',
        message = 'estado inicial de validacion incompatible';
    end if;
    if exists (
      select 1 from public.cartografia_incidencias i
       where i.cartografia_version_id = p_cartografia_version_id
    ) then
      raise exception using errcode = '55000',
        message = 'la validacion inicial exige cero incidencias';
    end if;
    v_snapshot := territorial_private.snapshot_cartografia_version(
      p_cartografia_version_id
    );
    v_snapshot_sha256 := pg_catalog.encode(
      extensions.digest(
        pg_catalog.convert_to(v_snapshot::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    if v_snapshot_sha256 is distinct from p_snapshot_esperado then
      raise exception using errcode = '55000',
        message = 'snapshot inicial distinto del esperado';
    end if;
  else
    if not found then
      raise exception using errcode = '55000',
        message = 'checkpoint esperado de validacion inexistente';
    end if;
    if v_version.estado <> 'CARGANDO' or v_carga.estado <> 'VALIDANDO'
       or v_carga.reanudable is not false
       or v_progreso.fase is distinct from p_fase_esperada
       or v_progreso.cursor is distinct from p_cursor_esperado
       or v_progreso.snapshot_sha256 is distinct from p_snapshot_esperado
       or v_progreso.completada_at is not null then
      raise exception using errcode = '55000',
        message = 'checkpoint de validacion ya avanzo o no coincide';
    end if;
    if p_fase_esperada in ('PADRES', 'SOLAPES') then
      v_maximo_text := v_progreso.maximos_ids_snapshot->>'SECCION';
      if v_maximo_text is null
         or v_maximo_text !~ '^(0|[1-9][0-9]{0,18})$'
         or v_maximo_text::numeric > 9223372036854775807::numeric
         or v_cursor > v_maximo_text::bigint
         or (v_cursor > 0 and not exists (
           select 1 from public.cartografia_secciones s
            where s.cartografia_version_id = p_cartografia_version_id
              and s.cartografia_seccion_id = v_cursor
         )) then
        raise exception using errcode = '55000',
          message = 'cursor persistido incompatible con el snapshot';
      end if;
    elsif p_fase_esperada = 'COBERTURA' then
      v_maximo_text := v_progreso.maximos_ids_snapshot->>'MUNICIPIO';
      if v_maximo_text is null
         or v_maximo_text !~ '^(0|[1-9][0-9]{0,18})$'
         or v_maximo_text::numeric > 9223372036854775807::numeric
         or v_cursor > v_maximo_text::bigint
         or (v_cursor > 0 and not exists (
           select 1 from public.cartografia_municipios m
            where m.cartografia_version_id = p_cartografia_version_id
              and m.cartografia_municipio_id = v_cursor
         )) then
        raise exception using errcode = '55000',
          message = 'cursor persistido incompatible con el snapshot';
      end if;
    end if;
  end if;

  -- El validador historico audita su propia matriz ACL. Se concede EXECUTE
  -- solo dentro de esta transaccion no confirmada, se invoca como postgres y
  -- se revoca antes de devolver. Ninguna otra sesion observa el GRANT.
  v_base_ya_expuesta := pg_catalog.has_function_privilege(
    'service_role',
    'public.rpc_validar_version_cartografica_lote(bigint,integer)',
    'execute'
  );
  if not v_base_ya_expuesta then
    execute 'grant execute on function public.rpc_validar_version_cartografica_lote(bigint,integer) to service_role';
  end if;
  begin
    v_resultado := public.rpc_validar_version_cartografica_lote(
      p_cartografia_version_id,
      p_lote
    );
  exception when others then
    if not v_base_ya_expuesta then
      execute 'revoke execute on function public.rpc_validar_version_cartografica_lote(bigint,integer) from service_role';
    end if;
    raise;
  end;
  if not v_base_ya_expuesta then
    execute 'revoke execute on function public.rpc_validar_version_cartografica_lote(bigint,integer) from service_role';
  end if;
  return v_resultado;
end;
$function$;
alter function public.rpc_validar_version_cartografica_paso_exacto(
  bigint, text, jsonb, text, integer
) owner to postgres;
revoke all on function public.rpc_validar_version_cartografica_paso_exacto(
  bigint, text, jsonb, text, integer
) from public, anon, authenticated;
grant execute on function public.rpc_validar_version_cartografica_paso_exacto(
  bigint, text, jsonb, text, integer
) to service_role;
revoke execute on function public.rpc_validar_version_cartografica_lote(
  bigint, integer
) from service_role;
comment on function public.rpc_validar_version_cartografica_paso_exacto(
  bigint, text, jsonb, text, integer
) is 'Avanza exactamente un checkpoint esperado de validacion bajo lock canonico; rechaza replay o deriva previa.';
commit;
