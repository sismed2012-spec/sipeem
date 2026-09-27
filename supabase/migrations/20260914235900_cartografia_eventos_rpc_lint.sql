-- M15A: conserva el contrato de selección de georreferenciación y elimina el
-- aviso de lint por una variable de bloqueo aparentemente no leída.

begin;
set local lock_timeout = '10s';
create or replace function public.rpc_seleccionar_georreferenciacion_evento(
  p_evento_id bigint,
  p_georreferenciacion_id bigint
)
returns jsonb
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = ''
as $$
declare
  v_evento_id bigint;
  v_georreferenciacion public.evento_georreferenciacion%rowtype;
  v_estado_version text;
  v_marca_anterior text;
begin
  if p_evento_id is null or p_georreferenciacion_id is null then
    raise exception using
      errcode = '22004',
      message = 'evento y georreferenciacion son obligatorios';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(19013, 20260915);

  select evento.evento_id
    into v_evento_id
  from public.eventos_territoriales as evento
  where evento.evento_id = p_evento_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'evento inexistente';
  end if;

  select resolucion.*
    into v_georreferenciacion
  from public.evento_georreferenciacion as resolucion
  where resolucion.georreferenciacion_id = p_georreferenciacion_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'georreferenciacion inexistente';
  end if;

  if v_georreferenciacion.evento_id <> p_evento_id then
    raise exception using
      errcode = '55000',
      message = 'la georreferenciacion pertenece a otro evento';
  end if;

  if v_georreferenciacion.es_actual is not true then
    raise exception using
      errcode = '55000',
      message = 'solo puede seleccionarse la georreferenciacion actual de su version';
  end if;

  select version.estado
    into v_estado_version
  from public.cartografia_versiones as version
  where version.cartografia_version_id = v_georreferenciacion.cartografia_version_id;

  if v_estado_version not in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA') then
    raise exception using
      errcode = '55000',
      message = 'la seleccion exige una version cartografica sellada';
  end if;

  if v_georreferenciacion.geom is null
     or v_georreferenciacion.cartografia_municipio_id is null
     or v_georreferenciacion.municipio_id is null
     or v_georreferenciacion.cartografia_seccion_id is null
     or v_georreferenciacion.seccion_id is null
     or v_georreferenciacion.cartografia_distrito_local_id is null
     or v_georreferenciacion.distrito_local_id is null
     or v_georreferenciacion.cartografia_distrito_federal_id is null
     or v_georreferenciacion.distrito_federal_id is null
     or (
       v_georreferenciacion.cartografia_colonia_id is null
       and v_georreferenciacion.colonia_id is not null
     )
     or (
       v_georreferenciacion.cartografia_colonia_id is not null
       and v_georreferenciacion.colonia_id is null
     ) then
    raise exception using
      errcode = '55000',
      message = 'la georreferenciacion no contiene una resolucion territorial completa';
  end if;

  if exists (
    select 1
    from public.eventos_territoriales as evento
    where evento.evento_id = p_evento_id
      and evento.georreferenciacion_elegida_id is not distinct from v_georreferenciacion.georreferenciacion_id
      and evento.estado_geo_id is not distinct from v_georreferenciacion.estado_geo_id
      and extensions.st_asewkb(evento.geom) is not distinct from extensions.st_asewkb(v_georreferenciacion.geom)
      and evento.confianza_geo is not distinct from v_georreferenciacion.confianza
      and evento.cartografia_version_id is not distinct from v_georreferenciacion.cartografia_version_id
      and evento.cartografia_municipio_id is not distinct from v_georreferenciacion.cartografia_municipio_id
      and evento.municipio_id is not distinct from v_georreferenciacion.municipio_id
      and evento.cartografia_colonia_id is not distinct from v_georreferenciacion.cartografia_colonia_id
      and evento.colonia_id is not distinct from v_georreferenciacion.colonia_id
      and evento.cartografia_seccion_id is not distinct from v_georreferenciacion.cartografia_seccion_id
      and evento.seccion_id is not distinct from v_georreferenciacion.seccion_id
      and evento.cartografia_distrito_local_id is not distinct from v_georreferenciacion.cartografia_distrito_local_id
      and evento.distrito_local_id is not distinct from v_georreferenciacion.distrito_local_id
      and evento.cartografia_distrito_federal_id is not distinct from v_georreferenciacion.cartografia_distrito_federal_id
      and evento.distrito_federal_id is not distinct from v_georreferenciacion.distrito_federal_id
  ) then
    return pg_catalog.jsonb_build_object(
      'evento_id', v_evento_id,
      'georreferenciacion_elegida_id', p_georreferenciacion_id,
      'cartografia_version_id', v_georreferenciacion.cartografia_version_id
    );
  end if;

  v_marca_anterior := pg_catalog.current_setting(
    'territorial_private.seleccionando_georreferenciacion',
    true
  );

  perform pg_catalog.set_config(
    'territorial_private.seleccionando_georreferenciacion',
    'on',
    true
  );

  begin
    update public.eventos_territoriales as evento
    set georreferenciacion_elegida_id = v_georreferenciacion.georreferenciacion_id,
        estado_geo_id = v_georreferenciacion.estado_geo_id,
        geom = v_georreferenciacion.geom,
        confianza_geo = v_georreferenciacion.confianza,
        cartografia_version_id = v_georreferenciacion.cartografia_version_id,
        cartografia_municipio_id = v_georreferenciacion.cartografia_municipio_id,
        municipio_id = v_georreferenciacion.municipio_id,
        cartografia_colonia_id = v_georreferenciacion.cartografia_colonia_id,
        colonia_id = v_georreferenciacion.colonia_id,
        cartografia_seccion_id = v_georreferenciacion.cartografia_seccion_id,
        seccion_id = v_georreferenciacion.seccion_id,
        cartografia_distrito_local_id = v_georreferenciacion.cartografia_distrito_local_id,
        distrito_local_id = v_georreferenciacion.distrito_local_id,
        cartografia_distrito_federal_id = v_georreferenciacion.cartografia_distrito_federal_id,
        distrito_federal_id = v_georreferenciacion.distrito_federal_id
    where evento.evento_id = p_evento_id;

    perform pg_catalog.set_config(
      'territorial_private.seleccionando_georreferenciacion',
      case when v_marca_anterior is null then '' else v_marca_anterior end,
      true
    );
  exception
    when others then
      perform pg_catalog.set_config(
        'territorial_private.seleccionando_georreferenciacion',
        case when v_marca_anterior is null then '' else v_marca_anterior end,
        true
      );
      raise;
  end;

  return pg_catalog.jsonb_build_object(
    'evento_id', v_evento_id,
    'georreferenciacion_elegida_id', p_georreferenciacion_id,
    'cartografia_version_id', v_georreferenciacion.cartografia_version_id
  );
end;
$$;
commit;
