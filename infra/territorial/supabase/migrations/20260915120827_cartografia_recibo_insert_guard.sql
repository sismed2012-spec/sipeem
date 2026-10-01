begin;
-- Additive correction: M16/M17 are already applied and remain byte-identical.
create function territorial_private.validar_recibo_codificacion_insert()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_version_id bigint;
  v_carga public.cargas_cartograficas%rowtype;
  v_capa record;
  v_item jsonb;
  v_dbf_sha text;
  v_cpg_sha text;
  v_origen text;
  v_encoding text;
  v_ldid integer;
begin
  select c.cartografia_version_id into v_version_id
    from public.cargas_cartograficas as c
   where c.carga_id = new.carga_id;
  if not found
     or v_version_id is distinct from new.cartografia_version_id then
    raise exception using errcode = '23505',
      message = 'recibo directo no pertenece a la carga canonica';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'SIPEEM:CARTOGRAFIA:VERSION:' || v_version_id::text, 0
    )
  );
  perform 1 from public.cartografia_versiones
   where cartografia_version_id = v_version_id
   for update;
  select c.* into strict v_carga
    from public.cargas_cartograficas as c
   where c.carga_id = new.carga_id
     and c.cartografia_version_id = v_version_id
   for update;
  if v_carga.estado not in ('PREPARADA','CARGANDO')
     or exists (
       select 1 from public.cargas_cartograficas_lotes as l
       where l.carga_id = new.carga_id
     ) then
    raise exception using errcode = '55000',
      message = 'recibo debe insertarse antes del primer lote';
  end if;

  if territorial_private.jsonb_tiene_claves_exactas(
       new.evidencia,
       array['schema_version','mgs_sha256','bgd_sha256','layers']::text[]
     ) is not true
     or pg_catalog.jsonb_typeof(new.evidencia->'schema_version') <> 'number'
     or new.evidencia->>'schema_version' <> '1'
     or pg_catalog.jsonb_typeof(new.evidencia->'mgs_sha256') <> 'string'
     or pg_catalog.jsonb_typeof(new.evidencia->'bgd_sha256') <> 'string'
     or new.evidencia->>'mgs_sha256' is distinct from v_carga.mgs_sha256
     or new.evidencia->>'bgd_sha256' is distinct from v_carga.bgd_sha256
     or territorial_private.jsonb_tiene_claves_exactas(
       new.evidencia->'layers',
       array[
         'ENTIDAD','MUNICIPIO','DISTRITO_LOCAL','DISTRITO_FEDERAL',
         'SECCION','COLONIA','LOCALIDAD','LIMITE_LOCALIDAD'
       ]::text[]
     ) is not true then
    raise exception using errcode = '22023',
      message = 'estructura del recibo directo invalida';
  end if;

  for v_capa in
    select * from (values
      ('MGS','ENTIDAD'),('MGS','MUNICIPIO'),
      ('MGS','DISTRITO_LOCAL'),('MGS','DISTRITO_FEDERAL'),
      ('MGS','SECCION'),('BGD','COLONIA'),('BGD','LOCALIDAD'),
      ('BGD','LIMITE_LOCALIDAD')
    ) as capas(producto,capa)
  loop
    v_item := new.evidencia->'layers'->v_capa.capa;
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
        message = 'evidencia directa de capa invalida: ' || v_capa.capa;
    end if;
    v_origen := v_item->>'origen';
    v_encoding := v_item->>'encoding';
    v_ldid := (v_item->>'ldid')::integer;
    if v_encoding not in ('utf-8','windows-1252')
       or v_origen not in ('CPG','DBF_LDID','OVERRIDE_EXPLICITO') then
      raise exception using errcode = '22023',
        message = 'codificacion directa no admitida: ' || v_capa.capa;
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
        message = 'DBF directo distinto del manifiesto: ' || v_capa.capa;
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
          message = 'CPG directo distinto del manifiesto: ' || v_capa.capa;
      end if;
    elsif pg_catalog.jsonb_typeof(v_item->'cpg_sha256') <> 'null'
       or v_origen = 'CPG'
       or (
         v_origen = 'OVERRIDE_EXPLICITO'
         and v_capa.producto <> 'BGD'
       )
       or (
         v_origen = 'DBF_LDID'
         and (v_ldid not in (3,88,89) or v_encoding <> 'windows-1252')
       ) then
      raise exception using errcode = '22023',
        message = 'origen directo sin CPG incompatible: ' || v_capa.capa;
    end if;
  end loop;

  if new.evidencia_sha256 is distinct from
     territorial_private.sha256_jsonb_cartografico(new.evidencia) then
    raise exception using errcode = '23505',
      message = 'SHA del recibo directo no corresponde a evidencia';
  end if;
  new.created_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;
create trigger cartografia_codificaciones_recibos_validar_insert
  before insert on public.cartografia_codificaciones_recibos
  for each row execute function territorial_private.validar_recibo_codificacion_insert();
revoke execute on function territorial_private.validar_recibo_codificacion_insert()
from public, anon, authenticated;
-- M16 inserta el inventario completo antes de registrar el recibo M17.
-- Una vez sellado, no se permite agregar componentes que alteren su procedencia.
create function territorial_private.rechazar_archivo_post_recibo()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'SIPEEM:CARTOGRAFIA:VERSION:' || new.cartografia_version_id::text, 0
    )
  );
  perform 1 from public.cartografia_versiones
   where cartografia_version_id = new.cartografia_version_id
   for update;
  if exists (
    select 1 from public.cartografia_codificaciones_recibos as r
     where r.cartografia_version_id = new.cartografia_version_id
  ) then
    raise exception using errcode = '55000',
      message = 'inventario cartografico sellado por recibo de codificacion';
  end if;
  return new;
end;
$function$;
create trigger cartografia_archivos_rechazar_post_recibo
  before insert on public.cartografia_archivos
  for each row execute function territorial_private.rechazar_archivo_post_recibo();
revoke execute on function territorial_private.rechazar_archivo_post_recibo()
from public, anon, authenticated;
commit;
