begin;
-- M16/M17/M18 and the previously installed coverage table stay byte-identical.
create index cartografia_cobertura_colonias_recibos_carga_version_idx
  on public.cartografia_cobertura_colonias_recibos(carga_id, cartografia_version_id);
create function territorial_private.validar_evidencia_cobertura_colonias(
  p_carga_id bigint,
  p_cartografia_version_id bigint,
  p_evidencia jsonb,
  p_evidencia_sha256 text,
  p_nuevo boolean
) returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_carga public.cargas_cartograficas%rowtype;
  v_version public.cartografia_versiones%rowtype;
  v_total bigint;
  v_con bigint;
  v_sin bigint;
  v_archivo record;
  v_fila record;
  v_numero bigint;
  v_anterior bigint := 0;
begin
  if p_carga_id is null or p_carga_id < 1
     or p_cartografia_version_id is null or p_cartografia_version_id < 1
     or p_evidencia is null
     or territorial_private.jsonb_tiene_claves_exactas(p_evidencia,
       array['schema_version','bgd_sha256','registros_fuente',
         'con_geometria','sin_geometria','filas_sin_geometria']::text[]) is not true
     or pg_catalog.jsonb_typeof(p_evidencia->'schema_version') <> 'number'
     or p_evidencia->>'schema_version' <> '1'
     or pg_catalog.jsonb_typeof(p_evidencia->'bgd_sha256') <> 'string'
     or p_evidencia->>'bgd_sha256' !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(p_evidencia->'filas_sin_geometria') <> 'array' then
    raise exception using errcode = '22023',
      message = 'estructura de cobertura invalida';
  end if;
  if pg_catalog.jsonb_typeof(p_evidencia->'registros_fuente') <> 'number'
     or pg_catalog.jsonb_typeof(p_evidencia->'con_geometria') <> 'number'
     or pg_catalog.jsonb_typeof(p_evidencia->'sin_geometria') <> 'number'
     or p_evidencia->>'registros_fuente' !~ '^(0|[1-9][0-9]{0,17})$'
     or p_evidencia->>'con_geometria' !~ '^(0|[1-9][0-9]{0,17})$'
     or p_evidencia->>'sin_geometria' !~ '^(0|[1-9][0-9]{0,17})$' then
    raise exception using errcode = '22023',
      message = 'conteos de cobertura invalidos';
  end if;
  v_total := (p_evidencia->>'registros_fuente')::bigint;
  v_con := (p_evidencia->>'con_geometria')::bigint;
  v_sin := (p_evidencia->>'sin_geometria')::bigint;
  if v_con + v_sin <> v_total
     or pg_catalog.jsonb_array_length(p_evidencia->'filas_sin_geometria') <> v_sin then
    raise exception using errcode = '22023',
      message = 'cobertura no suma registros fuente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'SIPEEM:CARTOGRAFIA:VERSION:' || p_cartografia_version_id::text,0));
  select v.* into v_version from public.cartografia_versiones as v
   where v.cartografia_version_id = p_cartografia_version_id for update;
  select c.* into v_carga from public.cargas_cartograficas as c
   where c.carga_id = p_carga_id
     and c.cartografia_version_id = p_cartografia_version_id for update;
  if v_carga.carga_id is null or v_version.cartografia_version_id is null then
    raise exception using errcode = '55000',
      message = 'carga canonica de cobertura inexistente';
  end if;
  if p_evidencia->>'bgd_sha256' is distinct from v_carga.bgd_sha256 then
    raise exception using errcode = '23505',
      message = 'BGD de cobertura distinto de carga canonica';
  end if;
  if v_version.conteos_esperados->>'COLONIA' is null
     or v_version.conteos_esperados->>'COLONIA' !~ '^(0|[1-9][0-9]{0,17})$'
     or (v_version.conteos_esperados->>'COLONIA')::bigint <> v_total then
    raise exception using errcode = '22023',
      message = 'COLONIA de cobertura distinta del manifiesto';
  end if;
  for v_archivo in
    select a.extension,a.registros_declarados from public.cartografia_archivos as a
     where a.cartografia_version_id = p_cartografia_version_id
       and a.producto = 'BGD' and a.capa = 'COLONIA'
       and a.extension in ('shp','dbf')
       and a.metadata->>'politica' = 'CARGAR'
  loop
    if v_archivo.registros_declarados is distinct from v_total then
      raise exception using errcode = '22023',
        message = 'conteo de ' || v_archivo.extension || ' distinto de cobertura';
    end if;
  end loop;
  if (select pg_catalog.count(*) from public.cartografia_archivos as a
      where a.cartografia_version_id = p_cartografia_version_id
        and a.producto = 'BGD' and a.capa = 'COLONIA'
        and a.extension in ('shp','dbf')
        and a.metadata->>'politica' = 'CARGAR') <> 2 then
    raise exception using errcode = '22023',
      message = 'SHP y DBF de COLONIA requeridos';
  end if;

  for v_fila in
    select x.value from pg_catalog.jsonb_array_elements(
      p_evidencia->'filas_sin_geometria') with ordinality as x(value,orden)
     order by x.orden
  loop
    if territorial_private.jsonb_tiene_claves_exactas(v_fila.value,
         array['fila_origen','id_ine','fuente_sha256']::text[]) is not true
       or pg_catalog.jsonb_typeof(v_fila.value->'fila_origen') <> 'number'
       or v_fila.value->>'fila_origen' !~ '^[1-9][0-9]{0,17}$'
       or pg_catalog.jsonb_typeof(v_fila.value->'id_ine') <> 'string'
       or pg_catalog.btrim(v_fila.value->>'id_ine') = ''
       or pg_catalog.jsonb_typeof(v_fila.value->'fuente_sha256') <> 'string'
       or v_fila.value->>'fuente_sha256' !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = '22023',
        message = 'fila sin geometria de cobertura invalida';
    end if;
    v_numero := (v_fila.value->>'fila_origen')::bigint;
    if v_numero <= v_anterior or v_numero > v_total then
      raise exception using errcode = '22023',
        message = 'filas de cobertura duplicadas, desordenadas o fuera de rango';
    end if;
    v_anterior := v_numero;
  end loop;
  if p_evidencia_sha256 is distinct from
      territorial_private.sha256_jsonb_cartografico(p_evidencia) then
    raise exception using errcode = '23505',
      message = 'SHA canonico del recibo no coincide';
  end if;
  if p_nuevo and (v_carga.estado not in ('PREPARADA','CARGANDO')
      or v_carga.cursor_confirmado > 0 or v_carga.recibidos > 0
      or exists (select 1 from public.cargas_cartograficas_lotes as l
                 where l.carga_id = p_carga_id)) then
    raise exception using errcode = '55000',
      message = 'recibo de cobertura debe preceder todo lote';
  end if;
end;
$function$;
create function territorial_private.validar_recibo_cobertura_insert()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  perform territorial_private.validar_evidencia_cobertura_colonias(
    new.carga_id,new.cartografia_version_id,new.evidencia,
    new.evidencia_sha256,true);
  new.created_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;
create trigger cartografia_cobertura_colonias_recibos_validar_insert
  before insert on public.cartografia_cobertura_colonias_recibos
  for each row execute function territorial_private.validar_recibo_cobertura_insert();
create function territorial_private.exigir_recibo_cobertura_lote()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if not exists (select 1 from public.cartografia_cobertura_colonias_recibos as r
    where r.carga_id = new.carga_id
      and r.cartografia_version_id = new.cartografia_version_id) then
    raise exception using errcode = '55000',
      message = 'lote cartografico sin recibo de cobertura';
  end if;
  return new;
end;
$function$;
create trigger cargas_cartograficas_lotes_exigir_recibo_cobertura
  before insert on public.cargas_cartograficas_lotes
  for each row execute function territorial_private.exigir_recibo_cobertura_lote();
revoke execute on function
  territorial_private.validar_evidencia_cobertura_colonias(bigint,bigint,jsonb,text,boolean),
  territorial_private.validar_recibo_cobertura_insert(),
  territorial_private.exigir_recibo_cobertura_lote()
from public, anon, authenticated, service_role;
grant execute on function territorial_private.validar_evidencia_cobertura_colonias(
  bigint,bigint,jsonb,text,boolean) to service_role;
-- INSERT is granted only after the validating trigger exists in this transaction.
grant insert on table public.cartografia_cobertura_colonias_recibos to service_role;
create function public.rpc_registrar_cobertura_colonias(
  p_carga_id bigint,
  p_evidencia jsonb
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_version_id bigint;
  v_sha text;
  v_recibo public.cartografia_cobertura_colonias_recibos%rowtype;
begin
  if p_carga_id is null or p_carga_id < 1 or p_evidencia is null then
    raise exception using errcode = '22023',message = 'carga y cobertura requeridas';
  end if;
  select c.cartografia_version_id into v_version_id
    from public.cargas_cartograficas as c where c.carga_id = p_carga_id;
  if not found then
    raise exception using errcode = '55000',message = 'carga canonica inexistente';
  end if;
  v_sha := territorial_private.sha256_jsonb_cartografico(p_evidencia);
  perform territorial_private.validar_evidencia_cobertura_colonias(
    p_carga_id,v_version_id,p_evidencia,v_sha,false);
  select r.* into v_recibo from public.cartografia_cobertura_colonias_recibos as r
   where r.carga_id = p_carga_id;
  if found then
    if v_recibo.cartografia_version_id is distinct from v_version_id
       or v_recibo.evidencia is distinct from p_evidencia
       or v_recibo.evidencia_sha256 is distinct from v_sha then
      raise exception using errcode = '23505',
        message = 'recibo de cobertura ya existe con otra evidencia';
    end if;
  else
    perform territorial_private.validar_evidencia_cobertura_colonias(
      p_carga_id,v_version_id,p_evidencia,v_sha,true);
    insert into public.cartografia_cobertura_colonias_recibos(
      carga_id,cartografia_version_id,evidencia,evidencia_sha256
    ) values (p_carga_id,v_version_id,p_evidencia,v_sha)
    returning * into v_recibo;
  end if;
  return pg_catalog.jsonb_build_object(
    'carga_id',v_recibo.carga_id,
    'cartografia_version_id',v_recibo.cartografia_version_id,
    'evidencia',v_recibo.evidencia,
    'evidencia_sha256',v_recibo.evidencia_sha256,
    'created_at',v_recibo.created_at
  );
end;
$function$;
create function public.rpc_obtener_cobertura_colonias(p_carga_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_recibo public.cartografia_cobertura_colonias_recibos%rowtype;
begin
  if p_carga_id is null or p_carga_id < 1 then
    raise exception using errcode = '22023',message = 'carga de cobertura invalida';
  end if;
  select r.* into v_recibo from public.cartografia_cobertura_colonias_recibos as r
   where r.carga_id = p_carga_id;
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object(
    'carga_id',v_recibo.carga_id,
    'cartografia_version_id',v_recibo.cartografia_version_id,
    'evidencia',v_recibo.evidencia,
    'evidencia_sha256',v_recibo.evidencia_sha256,
    'created_at',v_recibo.created_at
  );
end;
$function$;
revoke execute on function
  public.rpc_registrar_cobertura_colonias(bigint,jsonb),
  public.rpc_obtener_cobertura_colonias(bigint)
from public, anon, authenticated, service_role;
grant execute on function
  public.rpc_registrar_cobertura_colonias(bigint,jsonb),
  public.rpc_obtener_cobertura_colonias(bigint)
to service_role;
commit;
