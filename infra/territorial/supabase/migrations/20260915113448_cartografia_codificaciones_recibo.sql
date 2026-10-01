begin;
-- M16 (20260915020028) is already applied and is deliberately left untouched.
create table public.cartografia_codificaciones_recibos (
  carga_id bigint primary key,
  cartografia_version_id bigint not null unique,
  evidencia jsonb not null,
  evidencia_sha256 text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint cartografia_codificaciones_recibos_carga_version_fk
    foreign key (carga_id, cartografia_version_id)
    references public.cargas_cartograficas(carga_id, cartografia_version_id)
    on delete restrict,
  constraint cartografia_codificaciones_recibos_evidencia_objeto_ck
    check (pg_catalog.jsonb_typeof(evidencia) = 'object'),
  constraint cartografia_codificaciones_recibos_sha256_ck
    check (evidencia_sha256 ~ '^[0-9a-f]{64}$')
);
alter table public.cartografia_codificaciones_recibos enable row level security;
revoke all on table public.cartografia_codificaciones_recibos
  from public, anon, authenticated, service_role;
grant select, insert on table public.cartografia_codificaciones_recibos
  to service_role;
create function territorial_private.rechazar_cambio_recibo_codificacion()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000',
    message = 'recibo de codificacion inmutable';
end;
$function$;
create trigger cartografia_codificaciones_recibos_inmutable
  before update or delete on public.cartografia_codificaciones_recibos
  for each row execute function territorial_private.rechazar_cambio_recibo_codificacion();
create function territorial_private.exigir_recibo_codificacion_lote()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.cartografia_codificaciones_recibos as r
    where r.carga_id = new.carga_id
      and r.cartografia_version_id = new.cartografia_version_id
  ) then
    raise exception using errcode = '55000',
      message = 'lote cartografico sin recibo de codificacion';
  end if;
  return new;
end;
$function$;
create trigger cargas_cartograficas_lotes_exigir_recibo_codificacion
  before insert on public.cargas_cartograficas_lotes
  for each row execute function territorial_private.exigir_recibo_codificacion_lote();
revoke execute on function
  territorial_private.rechazar_cambio_recibo_codificacion(),
  territorial_private.exigir_recibo_codificacion_lote()
from public, anon, authenticated;
create function public.rpc_registrar_codificaciones_cartograficas(
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
  v_carga public.cargas_cartograficas%rowtype;
  v_recibo public.cartografia_codificaciones_recibos%rowtype;
  v_capa record;
  v_item jsonb;
  v_dbf_sha text;
  v_cpg_sha text;
  v_origen text;
  v_encoding text;
  v_ldid integer;
  v_sha text;
begin
  if p_carga_id is null or p_evidencia is null then
    raise exception using errcode = '22004',
      message = 'carga y evidencia son obligatorias';
  end if;
  if p_carga_id < 1
     or territorial_private.jsonb_tiene_claves_exactas(
          p_evidencia,
          array['schema_version','mgs_sha256','bgd_sha256','layers']::text[]
        ) is not true
     or pg_catalog.jsonb_typeof(p_evidencia->'schema_version') <> 'number'
     or p_evidencia->>'schema_version' <> '1'
     or pg_catalog.jsonb_typeof(p_evidencia->'mgs_sha256') <> 'string'
     or pg_catalog.jsonb_typeof(p_evidencia->'bgd_sha256') <> 'string'
     or p_evidencia->>'mgs_sha256' !~ '^[0-9a-f]{64}$'
     or p_evidencia->>'bgd_sha256' !~ '^[0-9a-f]{64}$'
     or territorial_private.jsonb_tiene_claves_exactas(
          p_evidencia->'layers',
          array[
            'ENTIDAD','MUNICIPIO','DISTRITO_LOCAL','DISTRITO_FEDERAL',
            'SECCION','COLONIA','LOCALIDAD','LIMITE_LOCALIDAD'
          ]::text[]
        ) is not true then
    raise exception using errcode = '22023',
      message = 'estructura del recibo de codificacion invalida';
  end if;

  select c.cartografia_version_id
    into v_version_id
    from public.cargas_cartograficas as c
    join public.cartografia_versiones as v
      on v.cartografia_version_id = c.cartografia_version_id
   where c.carga_id = p_carga_id;
  if not found then
    raise exception using errcode = '55000',
      message = 'carga canonica inexistente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'SIPEEM:CARTOGRAFIA:VERSION:' || v_version_id::text, 0
    )
  );
  perform 1 from public.cartografia_versiones
    where cartografia_version_id = v_version_id for update;
  select c.* into strict v_carga
    from public.cargas_cartograficas as c
   where c.carga_id = p_carga_id
     and c.cartografia_version_id = v_version_id
   for update;

  if p_evidencia->>'mgs_sha256' is distinct from v_carga.mgs_sha256
     or p_evidencia->>'bgd_sha256' is distinct from v_carga.bgd_sha256 then
    raise exception using errcode = '23505',
      message = 'hashes de paquetes distintos de la carga canonica';
  end if;

  for v_capa in
    select * from (values
      ('MGS','ENTIDAD'), ('MGS','MUNICIPIO'),
      ('MGS','DISTRITO_LOCAL'), ('MGS','DISTRITO_FEDERAL'),
      ('MGS','SECCION'), ('BGD','COLONIA'), ('BGD','LOCALIDAD'),
      ('BGD','LIMITE_LOCALIDAD')
    ) as capas(producto, capa)
  loop
    v_item := p_evidencia->'layers'->v_capa.capa;
    if territorial_private.jsonb_tiene_claves_exactas(
         v_item,
         array['encoding','origen','ldid','dbf_sha256','cpg_sha256']::text[]
       ) is not true
       or pg_catalog.jsonb_typeof(v_item->'encoding') <> 'string'
       or pg_catalog.jsonb_typeof(v_item->'origen') <> 'string'
       or pg_catalog.jsonb_typeof(v_item->'dbf_sha256') <> 'string'
       or pg_catalog.jsonb_typeof(v_item->'ldid') <> 'number'
       or v_item->>'ldid' !~ '^(0|[1-9][0-9]{0,2})$'
       or (v_item->>'ldid')::integer > 255 then
      raise exception using errcode = '22023',
        message = 'evidencia de capa invalida: ' || v_capa.capa;
    end if;
    v_origen := v_item->>'origen';
    v_encoding := v_item->>'encoding';
    v_ldid := (v_item->>'ldid')::integer;
    if v_encoding not in ('utf-8', 'windows-1252')
       or v_origen not in ('CPG', 'DBF_LDID', 'OVERRIDE_EXPLICITO') then
      raise exception using errcode = '22023',
        message = 'codificacion u origen no admitido: ' || v_capa.capa;
    end if;

    select a.sha256 into v_dbf_sha
      from public.cartografia_archivos as a
     where a.cartografia_version_id = v_version_id
       and a.producto = v_capa.producto
       and a.capa = v_capa.capa
       and a.extension = 'dbf'
       and a.metadata->>'politica' = 'CARGAR';
    if v_dbf_sha is null
       or v_item->>'dbf_sha256' is distinct from v_dbf_sha then
      raise exception using errcode = '23505',
        message = 'DBF no coincide con manifiesto: ' || v_capa.capa;
    end if;
    select a.sha256 into v_cpg_sha
      from public.cartografia_archivos as a
     where a.cartografia_version_id = v_version_id
       and a.producto = v_capa.producto
       and a.capa = v_capa.capa
       and a.extension = 'cpg'
       and a.metadata->>'politica' = 'CARGAR';

    if v_cpg_sha is not null then
      if v_origen <> 'CPG'
         or pg_catalog.jsonb_typeof(v_item->'cpg_sha256') <> 'string'
         or v_item->>'cpg_sha256' is distinct from v_cpg_sha then
        raise exception using errcode = '23505',
          message = 'CPG no coincide con manifiesto: ' || v_capa.capa;
      end if;
    elsif pg_catalog.jsonb_typeof(v_item->'cpg_sha256') <> 'null'
       or v_origen = 'CPG'
       or (
         v_origen = 'OVERRIDE_EXPLICITO'
         and v_capa.producto <> 'BGD'
       )
       or (
         v_origen = 'DBF_LDID'
         and (v_ldid not in (3, 88, 89) or v_encoding <> 'windows-1252')
       ) then
      raise exception using errcode = '22023',
        message = 'origen sin CPG incompatible: ' || v_capa.capa;
    end if;
  end loop;

  v_sha := territorial_private.sha256_jsonb_cartografico(p_evidencia);
  select r.* into v_recibo
    from public.cartografia_codificaciones_recibos as r
   where r.carga_id = p_carga_id;
  if found then
    if v_recibo.cartografia_version_id is distinct from v_version_id
       or v_recibo.evidencia is distinct from p_evidencia
       or v_recibo.evidencia_sha256 is distinct from v_sha then
      raise exception using errcode = '23505',
        message = 'recibo de codificacion ya existe con otra evidencia';
    end if;
  else
    if v_carga.estado not in ('PREPARADA', 'CARGANDO')
       or exists (
         select 1 from public.cargas_cartograficas_lotes as l
         where l.carga_id = p_carga_id
       ) then
      raise exception using errcode = '55000',
        message = 'recibo debe registrarse antes del primer lote';
    end if;
    insert into public.cartografia_codificaciones_recibos (
      carga_id, cartografia_version_id, evidencia, evidencia_sha256
    ) values (p_carga_id, v_version_id, p_evidencia, v_sha)
    returning * into v_recibo;
  end if;

  return pg_catalog.jsonb_build_object(
    'carga_id', v_recibo.carga_id,
    'cartografia_version_id', v_recibo.cartografia_version_id,
    'evidencia', v_recibo.evidencia,
    'evidencia_sha256', v_recibo.evidencia_sha256,
    'created_at', v_recibo.created_at
  );
end;
$function$;
create function public.rpc_obtener_codificaciones_cartograficas(
  p_carga_id bigint
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_recibo public.cartografia_codificaciones_recibos%rowtype;
begin
  if p_carga_id is null or p_carga_id < 1 then
    raise exception using errcode = '22023',
      message = 'carga invalida para consultar codificacion';
  end if;
  select r.* into v_recibo
    from public.cartografia_codificaciones_recibos as r
   where r.carga_id = p_carga_id;
  if not found then return null; end if;
  return pg_catalog.jsonb_build_object(
    'carga_id', v_recibo.carga_id,
    'cartografia_version_id', v_recibo.cartografia_version_id,
    'evidencia', v_recibo.evidencia,
    'evidencia_sha256', v_recibo.evidencia_sha256,
    'created_at', v_recibo.created_at
  );
end;
$function$;
revoke execute on function
  public.rpc_registrar_codificaciones_cartograficas(bigint,jsonb),
  public.rpc_obtener_codificaciones_cartograficas(bigint)
from public, anon, authenticated, service_role;
grant execute on function
  public.rpc_registrar_codificaciones_cartograficas(bigint,jsonb),
  public.rpc_obtener_codificaciones_cartograficas(bigint)
to service_role;
commit;
