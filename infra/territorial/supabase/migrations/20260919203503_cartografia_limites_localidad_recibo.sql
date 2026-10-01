begin;
create table public.cartografia_cobertura_limites_localidad_recibos (
  carga_id bigint primary key,
  cartografia_version_id bigint not null unique,
  evidencia jsonb not null,
  evidencia_sha256 text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint cartografia_cobertura_limites_localidad_carga_version_fk
    foreign key (carga_id, cartografia_version_id)
    references public.cargas_cartograficas (carga_id, cartografia_version_id)
    on delete restrict,
  constraint cartografia_cobertura_limites_localidad_evidencia_objeto_ck
    check (pg_catalog.jsonb_typeof(evidencia) = 'object'),
  constraint cartografia_cobertura_limites_localidad_sha256_ck
    check (evidencia_sha256 ~ '^[0-9a-f]{64}$')
);
create index cartografia_cobertura_limites_localidad_carga_version_idx
  on public.cartografia_cobertura_limites_localidad_recibos
    (carga_id, cartografia_version_id);
create function territorial_private.validar_evidencia_cobertura_limites_localidad(
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
  v_capa text;
  v_extension text;
  v_hash text;
  v_archivos bigint;
  v_conteo bigint;
  v_puntos bigint;
  v_claves_punto bigint;
  v_grupos_repetidos bigint;
  v_limites bigint;
  v_claves_limite bigint;
  v_geometrias bigint;
  v_con_punto bigint;
  v_sin_punto bigint;
  v_un_punto bigint;
  v_varios_puntos bigint;
  v_relaciones bigint;
begin
  if p_carga_id is null or p_carga_id < 1
     or p_cartografia_version_id is null or p_cartografia_version_id < 1
     or p_evidencia is null
     or territorial_private.jsonb_tiene_claves_exactas(p_evidencia,
       array['schema_version','bgd_sha256','componentes','conteos',
         'relaciones_sha256','limites_sin_punto_sha256','distribucion']::text[])
       is not true
     or pg_catalog.jsonb_typeof(p_evidencia->'schema_version') <> 'number'
     or p_evidencia->>'schema_version' <> '1'
     or pg_catalog.jsonb_typeof(p_evidencia->'bgd_sha256') <> 'string'
     or p_evidencia->>'bgd_sha256' !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(p_evidencia->'componentes') <> 'object'
     or pg_catalog.jsonb_typeof(p_evidencia->'conteos') <> 'object'
     or pg_catalog.jsonb_typeof(p_evidencia->'relaciones_sha256') <> 'string'
     or p_evidencia->>'relaciones_sha256' !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(p_evidencia->'limites_sin_punto_sha256') <> 'string'
     or p_evidencia->>'limites_sin_punto_sha256' !~ '^[0-9a-f]{64}$'
     or pg_catalog.jsonb_typeof(p_evidencia->'distribucion') <> 'object' then
    raise exception using errcode = '22023',
      message = 'estructura de cobertura de limites invalida';
  end if;

  if territorial_private.jsonb_tiene_claves_exactas(p_evidencia->'componentes',
       array['LOCALIDAD','LIMITE_LOCALIDAD']::text[]) is not true
     or territorial_private.jsonb_tiene_claves_exactas(p_evidencia->'conteos',
       array['puntos','claves_punto_distintas','grupos_punto_repetidos',
         'limites','claves_limite_distintas','geometrias_validas',
         'limites_con_punto','limites_sin_punto','limites_un_punto',
         'limites_varios_puntos','relaciones']::text[]) is not true
     or territorial_private.jsonb_tiene_claves_exactas(p_evidencia->'distribucion',
       array['vinculados','sin_punto']::text[]) is not true
     or pg_catalog.jsonb_typeof(p_evidencia->'distribucion'->'vinculados') <> 'array'
     or pg_catalog.jsonb_typeof(p_evidencia->'distribucion'->'sin_punto') <> 'array' then
    raise exception using errcode = '22023',
      message = 'componentes, conteos o distribucion invalidos';
  end if;

  foreach v_capa in array array['LOCALIDAD','LIMITE_LOCALIDAD']::text[] loop
    if territorial_private.jsonb_tiene_claves_exactas(
         p_evidencia->'componentes'->v_capa,
         array['dbf','prj','shp','shx']::text[]) is not true then
      raise exception using errcode = '22023',
        message = 'componentes incompletos para ' || v_capa;
    end if;
    foreach v_extension in array array['dbf','prj','shp','shx']::text[] loop
      v_hash := p_evidencia->'componentes'->v_capa->>v_extension;
      if pg_catalog.jsonb_typeof(
           p_evidencia->'componentes'->v_capa->v_extension) <> 'string'
         or v_hash !~ '^[0-9a-f]{64}$' then
        raise exception using errcode = '22023',
          message = 'SHA de componente invalido para ' || v_capa || '.' || v_extension;
      end if;
    end loop;
  end loop;

  select pg_catalog.count(*) into v_archivos
  from pg_catalog.jsonb_each(p_evidencia->'conteos') as x(clave,valor)
  where pg_catalog.jsonb_typeof(x.valor) <> 'number'
     or x.valor::text !~ '^(0|[1-9][0-9]{0,17})$';
  if v_archivos <> 0 then
    raise exception using errcode = '22023',message = 'conteos no enteros invalidos';
  end if;

  v_puntos := (p_evidencia->'conteos'->>'puntos')::bigint;
  v_claves_punto := (p_evidencia->'conteos'->>'claves_punto_distintas')::bigint;
  v_grupos_repetidos := (p_evidencia->'conteos'->>'grupos_punto_repetidos')::bigint;
  v_limites := (p_evidencia->'conteos'->>'limites')::bigint;
  v_claves_limite := (p_evidencia->'conteos'->>'claves_limite_distintas')::bigint;
  v_geometrias := (p_evidencia->'conteos'->>'geometrias_validas')::bigint;
  v_con_punto := (p_evidencia->'conteos'->>'limites_con_punto')::bigint;
  v_sin_punto := (p_evidencia->'conteos'->>'limites_sin_punto')::bigint;
  v_un_punto := (p_evidencia->'conteos'->>'limites_un_punto')::bigint;
  v_varios_puntos := (p_evidencia->'conteos'->>'limites_varios_puntos')::bigint;
  v_relaciones := (p_evidencia->'conteos'->>'relaciones')::bigint;

  if v_claves_punto > v_puntos
     or v_grupos_repetidos > v_claves_punto
     or v_puntos - v_claves_punto < v_grupos_repetidos
     or v_claves_limite <> v_limites
     or v_geometrias <> v_limites
     or v_con_punto + v_sin_punto <> v_limites
     or v_un_punto + v_varios_puntos <> v_con_punto
     or v_relaciones < v_un_punto + (2 * v_varios_puntos)
     or (v_puntos,v_claves_punto,v_grupos_repetidos,v_limites,
         v_claves_limite,v_geometrias,v_con_punto,v_sin_punto,
         v_un_punto,v_varios_puntos,v_relaciones)
        is distinct from (3639::bigint,3580::bigint,50::bigint,1826::bigint,
          1826::bigint,1826::bigint,1327::bigint,499::bigint,
          1279::bigint,48::bigint,1384::bigint) then
    raise exception using errcode = '22023',
      message = 'conteos de cobertura de limites no aprobados';
  end if;

  if p_evidencia->'distribucion'->'vinculados' is distinct from
      '[{"tipo":4,"cabecera":2,"conteo":1},{"tipo":4,"cabecera":3,"conteo":5},{"tipo":4,"cabecera":4,"conteo":727},{"tipo":4,"cabecera":null,"conteo":594}]'::jsonb
     or p_evidencia->'distribucion'->'sin_punto' is distinct from
      '[{"tipo":2,"cabecera":1,"conteo":2},{"tipo":2,"cabecera":2,"conteo":32},{"tipo":2,"cabecera":3,"conteo":93},{"tipo":2,"cabecera":4,"conteo":278},{"tipo":2,"cabecera":null,"conteo":94}]'::jsonb then
    raise exception using errcode = '22023',
      message = 'distribucion de cobertura de limites no aprobada';
  end if;

  if p_evidencia->>'relaciones_sha256' is distinct from
       '0fbb44e5eeeb92b3140050221a4083e340a6e9e4c1cd403d6482f12e393ddc71'
     or p_evidencia->>'limites_sin_punto_sha256' is distinct from
       '35a851408c6500c5b032fca38ed676cd741c6c275be2523c668d7b9c534bf42b' then
    raise exception using errcode = '23505',
      message = 'huellas del grafo distintas de la aprobacion';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'SIPEEM:CARTOGRAFIA:VERSION:' || p_cartografia_version_id::text,0));
  select v.* into v_version from public.cartografia_versiones v
   where v.cartografia_version_id = p_cartografia_version_id for update;
  select c.* into v_carga from public.cargas_cartograficas c
   where c.carga_id = p_carga_id
     and c.cartografia_version_id = p_cartografia_version_id for update;
  if v_version.cartografia_version_id is null or v_carga.carga_id is null then
    raise exception using errcode = '55000',
      message = 'carga canonica de limites inexistente';
  end if;
  if p_evidencia->>'bgd_sha256' is distinct from v_carga.bgd_sha256
     or p_evidencia->>'bgd_sha256' is distinct from
       'fe9a1886a428a09fcd2514b3aff909a602384e36981f9ac1f510cac6f7c4c98d' then
    raise exception using errcode = '23505',
      message = 'BGD de limites distinto de la aprobacion';
  end if;
  if pg_catalog.jsonb_typeof(v_version.conteos_esperados->'LOCALIDAD')
       is distinct from 'number'
     or pg_catalog.jsonb_typeof(v_version.conteos_esperados->'LIMITE_LOCALIDAD')
       is distinct from 'number'
     or v_version.conteos_esperados->>'LOCALIDAD' !~ '^[1-9][0-9]{0,17}$'
     or v_version.conteos_esperados->>'LIMITE_LOCALIDAD' !~ '^[1-9][0-9]{0,17}$'
     or (v_version.conteos_esperados->>'LOCALIDAD')::bigint <> v_puntos
     or (v_version.conteos_esperados->>'LIMITE_LOCALIDAD')::bigint <> v_limites then
    raise exception using errcode = '22023',
      message = 'LOCALIDAD o LIMITE_LOCALIDAD distintos del manifiesto';
  end if;

  foreach v_capa in array array['LOCALIDAD','LIMITE_LOCALIDAD']::text[] loop
    foreach v_extension in array array['dbf','prj','shp','shx']::text[] loop
      select pg_catalog.count(*),pg_catalog.min(a.sha256)
        into v_archivos,v_hash
      from public.cartografia_archivos a
      where a.cartografia_version_id = p_cartografia_version_id
        and a.producto = 'BGD' and a.capa = v_capa
        and a.extension = v_extension
        and a.metadata->>'politica' = 'CARGAR';
      if v_archivos <> 1 then
        raise exception using errcode = '22023',
          message = 'componente unico requerido para ' || v_capa || '.' || v_extension;
      end if;
      if v_hash is distinct from p_evidencia->'componentes'->v_capa->>v_extension then
        raise exception using errcode = '23505',
          message = 'SHA de componente distinto para ' || v_capa || '.' || v_extension;
      end if;
    end loop;
    v_conteo := case when v_capa = 'LOCALIDAD' then v_puntos else v_limites end;
    if exists (
      select 1 from public.cartografia_archivos a
      where a.cartografia_version_id = p_cartografia_version_id
        and a.producto='BGD' and a.capa=v_capa
        and a.extension in ('dbf','shp')
        and a.metadata->>'politica'='CARGAR'
        and a.registros_declarados is distinct from v_conteo
    ) then
      raise exception using errcode = '22023',
        message = 'conteo de componente distinto para ' || v_capa;
    end if;
  end loop;

  if p_evidencia_sha256 is distinct from
      territorial_private.sha256_jsonb_cartografico(p_evidencia) then
    raise exception using errcode = '23505',
      message = 'SHA canonico del recibo de limites no coincide';
  end if;
  if p_nuevo and (
      v_carga.estado not in ('PREPARADA','CARGANDO')
      or exists (
        select 1 from public.cargas_cartograficas_lotes l
        where l.carga_id = p_carga_id and l.capa = 'LIMITE_LOCALIDAD'
      )) then
    raise exception using errcode = '55000',
      message = 'recibo de limites debe preceder todo lote LIMITE_LOCALIDAD';
  end if;
end;
$function$;
create function territorial_private.validar_recibo_limites_localidad_insert()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  perform territorial_private.validar_evidencia_cobertura_limites_localidad(
    new.carga_id,new.cartografia_version_id,new.evidencia,
    new.evidencia_sha256,true);
  new.created_at := pg_catalog.clock_timestamp();
  return new;
end;
$function$;
create function territorial_private.rechazar_cambio_recibo_limites_localidad()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000',
    message = 'recibo de cobertura de limites inmutable';
end;
$function$;
create function territorial_private.exigir_recibo_limites_localidad_lote()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if new.capa = 'LIMITE_LOCALIDAD' and not exists (
    select 1 from public.cartografia_cobertura_limites_localidad_recibos r
    where r.carga_id = new.carga_id
      and r.cartografia_version_id = new.cartografia_version_id
  ) then
    raise exception using errcode = '55000',
      message = 'lote LIMITE_LOCALIDAD sin recibo de relaciones';
  end if;
  return new;
end;
$function$;
create trigger cartografia_cobertura_limites_localidad_validar_insert
  before insert on public.cartografia_cobertura_limites_localidad_recibos
  for each row execute function
    territorial_private.validar_recibo_limites_localidad_insert();
create trigger cartografia_cobertura_limites_localidad_inmutable
  before update or delete on public.cartografia_cobertura_limites_localidad_recibos
  for each row execute function
    territorial_private.rechazar_cambio_recibo_limites_localidad();
create trigger cargas_cartograficas_lotes_exigir_recibo_limites_localidad
  before insert on public.cargas_cartograficas_lotes
  for each row execute function
    territorial_private.exigir_recibo_limites_localidad_lote();
alter table public.cartografia_cobertura_limites_localidad_recibos
  enable row level security;
revoke all on table public.cartografia_cobertura_limites_localidad_recibos
  from public, anon, authenticated, service_role;
grant select on table public.cartografia_cobertura_limites_localidad_recibos
  to service_role;
revoke execute on function
  territorial_private.validar_evidencia_cobertura_limites_localidad(
    bigint,bigint,jsonb,text,boolean),
  territorial_private.validar_recibo_limites_localidad_insert(),
  territorial_private.rechazar_cambio_recibo_limites_localidad(),
  territorial_private.exigir_recibo_limites_localidad_lote()
from public, anon, authenticated, service_role;
grant execute on function
  territorial_private.validar_evidencia_cobertura_limites_localidad(
    bigint,bigint,jsonb,text,boolean)
to service_role;
-- INSERT is granted only after validation and immutability triggers exist.
grant insert on table public.cartografia_cobertura_limites_localidad_recibos
  to service_role;
create function public.rpc_registrar_cobertura_limites_localidad(
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
  v_recibo public.cartografia_cobertura_limites_localidad_recibos%rowtype;
begin
  if p_carga_id is null or p_carga_id < 1 or p_evidencia is null then
    raise exception using errcode = '22023',
      message = 'carga y evidencia de limites requeridas';
  end if;
  select c.cartografia_version_id into v_version_id
  from public.cargas_cartograficas c where c.carga_id = p_carga_id;
  if not found then
    raise exception using errcode = '55000',message = 'carga canonica inexistente';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'SIPEEM:CARTOGRAFIA:VERSION:' || v_version_id::text,0));
  v_sha := territorial_private.sha256_jsonb_cartografico(p_evidencia);
  select r.* into v_recibo
  from public.cartografia_cobertura_limites_localidad_recibos r
  where r.carga_id = p_carga_id;
  if found then
    if v_recibo.cartografia_version_id is distinct from v_version_id
       or v_recibo.evidencia is distinct from p_evidencia
       or v_recibo.evidencia_sha256 is distinct from v_sha then
      raise exception using errcode = '23505',
        message = 'recibo de limites ya existe con otra evidencia';
    end if;
  else
    perform territorial_private.validar_evidencia_cobertura_limites_localidad(
      p_carga_id,v_version_id,p_evidencia,v_sha,true);
    insert into public.cartografia_cobertura_limites_localidad_recibos(
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
create function public.rpc_obtener_cobertura_limites_localidad(p_carga_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_recibo public.cartografia_cobertura_limites_localidad_recibos%rowtype;
begin
  if p_carga_id is null or p_carga_id < 1 then
    raise exception using errcode = '22023',message = 'carga de limites invalida';
  end if;
  select r.* into v_recibo
  from public.cartografia_cobertura_limites_localidad_recibos r
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
  public.rpc_registrar_cobertura_limites_localidad(bigint,jsonb),
  public.rpc_obtener_cobertura_limites_localidad(bigint)
from public, anon, authenticated, service_role;
grant execute on function
  public.rpc_registrar_cobertura_limites_localidad(bigint,jsonb),
  public.rpc_obtener_cobertura_limites_localidad(bigint)
to service_role;
comment on table public.cartografia_cobertura_limites_localidad_recibos is
  'Recibo inmutable del grafo BGD LOCALIDAD/LIMITE_LOCALIDAD, requerido antes del primer lote de limites.';
commit;
