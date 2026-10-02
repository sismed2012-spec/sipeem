begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- M21 ya fue aplicada. Reafirmar la lectura cerrada sin modificar su archivo:
-- cada null debe conservar su ADVERTENCIA anclada a fila, ID, SHA, recibo,
-- detalle visible y clave idempotente canonica.
create or replace function public.rpc_resumen_cobertura_colonias(
  p_cartografia_version_id bigint
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_version public.cartografia_versiones%rowtype;
  v_carga public.cargas_cartograficas%rowtype;
  v_progreso public.validaciones_cartograficas_progreso%rowtype;
  v_recibo public.cartografia_cobertura_colonias_recibos%rowtype;
  v_total bigint;
  v_con bigint;
  v_sin bigint;
  v_poligonos bigint;
  v_atributos bigint;
  v_ledger bigint;
  v_advertencias bigint;
begin
  if p_cartografia_version_id is null or p_cartografia_version_id < 1 then
    raise exception using errcode = '55000',
      message = 'version cartografica no autorizada para lectura';
  end if;

  select v.* into v_version
    from public.cartografia_versiones v
   where v.cartografia_version_id = p_cartografia_version_id;
  if v_version.cartografia_version_id is null
     or v_version.estado not in ('VALIDADA','PUBLICADA','ARCHIVADA') then
    raise exception using errcode = '55000',
      message = 'version cartografica no autorizada para lectura';
  end if;

  select c.* into v_carga
    from public.cargas_cartograficas c
   where c.cartografia_version_id = p_cartografia_version_id;
  select p.* into v_progreso
    from public.validaciones_cartograficas_progreso p
   where p.cartografia_version_id = p_cartografia_version_id;
  select r.* into v_recibo
    from public.cartografia_cobertura_colonias_recibos r
   where r.cartografia_version_id = p_cartografia_version_id;
  if v_carga.carga_id is null or v_carga.estado <> 'COMPLETA'
     or v_progreso.cartografia_version_id is null
     or v_progreso.carga_id is distinct from v_carga.carga_id
     or v_progreso.fase <> 'COMPLETA' or v_progreso.errores <> 0
     or v_recibo.carga_id is null
     or v_recibo.carga_id is distinct from v_carga.carga_id
     or pg_catalog.jsonb_typeof(v_recibo.evidencia) <> 'object'
     or pg_catalog.jsonb_typeof(v_recibo.evidencia->'filas_sin_geometria')
       <> 'array'
     or v_recibo.evidencia_sha256 is distinct from
       territorial_private.sha256_jsonb_cartografico(v_recibo.evidencia)
     or v_recibo.evidencia->>'bgd_sha256' is distinct from v_carga.bgd_sha256
     or v_recibo.evidencia->>'registros_fuente'
       !~ '^(0|[1-9][0-9]{0,17})$'
     or v_recibo.evidencia->>'con_geometria'
       !~ '^(0|[1-9][0-9]{0,17})$'
     or v_recibo.evidencia->>'sin_geometria'
       !~ '^(0|[1-9][0-9]{0,17})$' then
    raise exception using errcode = '55000',
      message = 'cobertura de colonias no consistente para lectura';
  end if;

  v_total := (v_recibo.evidencia->>'registros_fuente')::bigint;
  v_con := (v_recibo.evidencia->>'con_geometria')::bigint;
  v_sin := (v_recibo.evidencia->>'sin_geometria')::bigint;
  select pg_catalog.count(*)::bigint into v_poligonos
    from public.cartografia_colonias c
   where c.cartografia_version_id = p_cartografia_version_id;
  select pg_catalog.count(*)::bigint into v_atributos
    from public.cartografia_colonias_sin_geometria n
   where n.cartografia_version_id = p_cartografia_version_id;
  select coalesce(pg_catalog.sum(l.insertados),0)::bigint into v_ledger
    from public.cargas_cartograficas_lotes l
   where l.carga_id = v_carga.carga_id and l.capa = 'COLONIA';
  select pg_catalog.count(*)::bigint into v_advertencias
    from public.cartografia_incidencias i
   where i.cartografia_version_id = p_cartografia_version_id
     and i.carga_id = v_carga.carga_id
     and i.severidad = 'ADVERTENCIA'
     and i.codigo = 'GEOMETRIA_NULA_ORIGEN';

  if v_con + v_sin <> v_total
     or v_con is distinct from v_poligonos
     or v_sin is distinct from v_atributos
     or v_total is distinct from v_ledger
     or v_sin is distinct from v_advertencias
     or exists (
       select 1 from public.cartografia_colonias_sin_geometria n
       where n.cartografia_version_id = p_cartografia_version_id
         and not exists (
           select 1 from public.cartografia_incidencias i
           where i.cartografia_version_id = p_cartografia_version_id
             and i.carga_id = v_carga.carga_id
             and i.severidad = 'ADVERTENCIA'
             and i.codigo = 'GEOMETRIA_NULA_ORIGEN'
             and i.capa = 'COLONIA'
             and i.fila_fuente = n.fila_origen
             and i.clave_fuente = 'COLONIA:' || n.id_ine || ':' ||
               n.fuente_sha256 || ':' || v_recibo.evidencia_sha256
             and i.detalle = pg_catalog.format(
               'Colonia INE sin poligono: fila %s, ID %s, huella %s, recibo %s',
               n.fila_origen,n.id_ine,n.fuente_sha256,
               v_recibo.evidencia_sha256
             )
             and i.clave_idempotencia = pg_catalog.encode(
               extensions.digest(
                 pg_catalog.convert_to(
                   pg_catalog.jsonb_build_object(
                     'version',p_cartografia_version_id,
                     'carga',v_carga.carga_id::text,
                     'capa','COLONIA',
                     'codigo','GEOMETRIA_NULA_ORIGEN',
                     'clave_fuente','COLONIA:' || n.id_ine || ':' ||
                       n.fuente_sha256 || ':' || v_recibo.evidencia_sha256,
                     'fila_fuente',n.fila_origen::text
                   )::text,'UTF8'
                 ),'sha256'
               ),'hex'
             )
         )
     )
     or v_total::text is distinct from
       v_version.conteos_esperados->>'COLONIA'
     or v_total::text is distinct from
       v_version.conteos_validados->>'COLONIA'
     or pg_catalog.jsonb_array_length(
       v_recibo.evidencia->'filas_sin_geometria') <> v_sin
     or exists (
       select 1 from public.cartografia_colonias_sin_geometria n
       where n.cartografia_version_id = p_cartografia_version_id
         and not exists (
           select 1 from pg_catalog.jsonb_array_elements(
             v_recibo.evidencia->'filas_sin_geometria') f
           where f->>'fila_origen' = n.fila_origen::text
             and f->>'id_ine' = n.id_ine
             and f->>'fuente_sha256' = n.fuente_sha256
         )
     )
     or exists (
       select 1 from pg_catalog.jsonb_array_elements(
         v_recibo.evidencia->'filas_sin_geometria') f
       where not exists (
         select 1 from public.cartografia_colonias_sin_geometria n
         where n.cartografia_version_id = p_cartografia_version_id
           and n.fila_origen::text = f->>'fila_origen'
           and n.id_ine = f->>'id_ine'
           and n.fuente_sha256 = f->>'fuente_sha256'
       )
     )
     or exists (
       select 1 from public.cartografia_colonias c
       join public.cartografia_colonias_sin_geometria n
         on n.cartografia_version_id = c.cartografia_version_id
        and (n.fila_origen = c.fila_origen
          or (n.clave_entidad = c.clave_entidad and n.id_ine = c.id_ine))
       where c.cartografia_version_id = p_cartografia_version_id
     ) then
    raise exception using errcode = '55000',
      message = 'cobertura de colonias no consistente para lectura';
  end if;

  return pg_catalog.jsonb_build_object(
    'total_fuente',v_total,
    'con_geometria',v_con,
    'sin_geometria',v_sin,
    'evidencia_sha256',v_recibo.evidencia_sha256,
    'advertencia',pg_catalog.format(
      '%s de %s colonias sin polígono',v_sin,v_total)
  );
end;
$function$;
alter function public.rpc_resumen_cobertura_colonias(bigint)
  owner to postgres;
revoke all on function public.rpc_resumen_cobertura_colonias(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_resumen_cobertura_colonias(bigint)
  to service_role;
comment on function public.rpc_resumen_cobertura_colonias(bigint) is
  'Cobertura COLONIA por version sellada explicita y advertencias ancladas; no publica.';
commit;
