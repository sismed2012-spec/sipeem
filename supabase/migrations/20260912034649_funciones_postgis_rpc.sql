create function public.rpc_resolver_territorio(
  p_latitud double precision,
  p_longitud double precision
)
returns table (
  municipio_id bigint,
  municipio_clave text,
  municipio_nombre text,
  colonia_id bigint,
  colonia_nombre text,
  seccion_id bigint,
  seccion_numero integer,
  distrito_local_id bigint,
  distrito_local_numero smallint,
  distrito_federal_id bigint,
  distrito_federal_numero smallint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_punto extensions.geometry(Point, 4326);
begin
  if p_latitud is null or p_latitud < -90 or p_latitud > 90 then
    raise exception 'La latitud debe estar entre -90 y 90'
      using errcode = '22023';
  end if;

  if p_longitud is null or p_longitud < -180 or p_longitud > 180 then
    raise exception 'La longitud debe estar entre -180 y 180'
      using errcode = '22023';
  end if;

  v_punto := extensions.st_setsrid(extensions.st_makepoint(p_longitud, p_latitud), 4326);

  return query
  with seccion_match as (
    select s.*
    from public.territorios_secciones s
    where s.activo
      and s.geom is not null
      and extensions.st_covers(s.geom, v_punto)
    order by extensions.st_area(s.geom), s.seccion_id
    limit 1
  ),
  colonia_match as (
    select c.*
    from public.territorios_colonias c
    where c.activo
      and c.geom is not null
      and extensions.st_covers(c.geom, v_punto)
      and (
        not exists (select 1 from seccion_match)
        or c.municipio_id = (select s.municipio_id from seccion_match s)
      )
    order by extensions.st_area(c.geom), c.colonia_id
    limit 1
  ),
  municipio_espacial as (
    select m.*
    from public.territorios_municipios m
    where m.activo
      and m.geom is not null
      and extensions.st_covers(m.geom, v_punto)
    order by extensions.st_area(m.geom), m.municipio_id
    limit 1
  ),
  municipio_resuelto as (
    select m.*
    from public.territorios_municipios m
    where m.municipio_id = coalesce(
      (select s.municipio_id from seccion_match s),
      (select c.municipio_id from colonia_match c),
      (select mg.municipio_id from municipio_espacial mg)
    )
    limit 1
  ),
  distrito_local_espacial as (
    select d.*
    from public.territorios_distritos_locales d
    where d.activo
      and d.geom is not null
      and extensions.st_covers(d.geom, v_punto)
      and (
        not exists (select 1 from municipio_resuelto)
        or d.clave_entidad = (select mr.clave_entidad from municipio_resuelto mr)
      )
    order by extensions.st_area(d.geom), d.distrito_local_id
    limit 1
  ),
  distrito_federal_espacial as (
    select d.*
    from public.territorios_distritos_federales d
    where d.activo
      and d.geom is not null
      and extensions.st_covers(d.geom, v_punto)
      and (
        not exists (select 1 from municipio_resuelto)
        or d.clave_entidad = (select mr.clave_entidad from municipio_resuelto mr)
      )
    order by extensions.st_area(d.geom), d.distrito_federal_id
    limit 1
  )
  select
    m.municipio_id,
    m.clave_municipio,
    m.nombre,
    c.colonia_id,
    c.nombre,
    s.seccion_id,
    s.numero,
    coalesce(dl_link.distrito_local_id, dl_geo.distrito_local_id),
    coalesce(dl_link.numero, dl_geo.numero),
    coalesce(df_link.distrito_federal_id, df_geo.distrito_federal_id),
    coalesce(df_link.numero, df_geo.numero)
  from (values (1)) as base(dummy)
  left join seccion_match s on true
  left join municipio_resuelto m on true
  left join colonia_match c on true
  left join public.territorios_distritos_locales dl_link on dl_link.distrito_local_id = s.distrito_local_id
  left join distrito_local_espacial dl_geo on dl_link.distrito_local_id is null
  left join public.territorios_distritos_federales df_link on df_link.distrito_federal_id = s.distrito_federal_id
  left join distrito_federal_espacial df_geo on df_link.distrito_federal_id is null;
end;
$$;

create function public.rpc_get_seccion(
  p_latitud double precision,
  p_longitud double precision
)
returns table (
  seccion_id bigint,
  clave_entidad text,
  numero integer,
  municipio_id bigint,
  municipio_nombre text,
  distrito_local_id bigint,
  distrito_local_numero smallint,
  distrito_federal_id bigint,
  distrito_federal_numero smallint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    s.seccion_id,
    s.clave_entidad,
    s.numero,
    r.municipio_id,
    r.municipio_nombre,
    r.distrito_local_id,
    r.distrito_local_numero,
    r.distrito_federal_id,
    r.distrito_federal_numero
  from public.rpc_resolver_territorio(p_latitud, p_longitud) r
  join public.territorios_secciones s on s.seccion_id = r.seccion_id;
$$;

create function public.rpc_get_eventos_seccion(
  p_seccion_id bigint,
  p_desde timestamptz default (now() - interval '30 days'),
  p_limite integer default 100
)
returns table (
  evento_id bigint,
  evento_uuid uuid,
  ocurrido_en timestamptz,
  titulo text,
  contenido_original text,
  fuente_codigo text,
  estado_codigo text,
  requiere_atencion boolean,
  calidad_dato numeric,
  latitud double precision,
  longitud double precision
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_seccion_id is null then
    raise exception 'seccion_id es obligatorio' using errcode = '22004';
  end if;

  if p_desde is null then
    raise exception 'desde es obligatorio' using errcode = '22004';
  end if;

  if p_limite is null or p_limite < 1 or p_limite > 500 then
    raise exception 'limite debe estar entre 1 y 500' using errcode = '22023';
  end if;

  return query
  select
    e.evento_id,
    e.evento_uuid,
    e.ocurrido_en,
    e.titulo,
    e.contenido_original,
    f.codigo,
    ee.codigo,
    e.requiere_atencion,
    e.calidad_dato,
    case when e.geom is null then null else extensions.st_y(e.geom) end,
    case when e.geom is null then null else extensions.st_x(e.geom) end
  from public.eventos_territoriales e
  join public.cat_fuentes_evento f on f.fuente_evento_id = e.fuente_evento_id
  join public.cat_estados_evento ee on ee.estado_evento_id = e.estado_evento_id
  where e.seccion_id = p_seccion_id
    and e.ocurrido_en >= p_desde
  order by e.ocurrido_en desc, e.evento_id desc
  limit p_limite;
end;
$$;

create function public.rpc_get_seccion_contexto(p_seccion_id bigint)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_contexto jsonb;
begin
  if p_seccion_id is null then
    raise exception 'seccion_id es obligatorio' using errcode = '22004';
  end if;

  select jsonb_build_object(
    'territorio', jsonb_build_object(
      'seccion', jsonb_build_object(
        'seccion_id', s.seccion_id,
        'clave_entidad', s.clave_entidad,
        'numero', s.numero
      ),
      'municipio', jsonb_build_object(
        'municipio_id', m.municipio_id,
        'clave', m.clave_municipio,
        'nombre', m.nombre
      ),
      'distrito_local', case when dl.distrito_local_id is null then null else jsonb_build_object(
        'distrito_local_id', dl.distrito_local_id,
        'numero', dl.numero,
        'nombre', dl.nombre
      ) end,
      'distrito_federal', case when df.distrito_federal_id is null then null else jsonb_build_object(
        'distrito_federal_id', df.distrito_federal_id,
        'numero', df.numero,
        'nombre', df.nombre
      ) end
    ),
    'electoral', coalesce(electoral.resumen, '{}'::jsonb),
    'eventos', jsonb_build_object(
      'total_30_dias', coalesce(eventos_30_dias.total, 0),
      'requieren_atencion_30_dias', coalesce(eventos_30_dias.requieren_atencion, 0),
      'ultimo_evento_en', ultimo_evento.ocurrido_en
    )
  )
  into v_contexto
  from public.territorios_secciones s
  join public.territorios_municipios m on m.municipio_id = s.municipio_id
  left join public.territorios_distritos_locales dl on dl.distrito_local_id = s.distrito_local_id
  left join public.territorios_distritos_federales df on df.distrito_federal_id = s.distrito_federal_id
  left join lateral (
    select
      count(*) as total,
      count(*) filter (where e.requiere_atencion) as requieren_atencion
    from public.eventos_territoriales e
    where e.seccion_id = s.seccion_id
      and e.ocurrido_en >= now() - interval '30 days'
  ) eventos_30_dias on true
  left join lateral (
    select e.ocurrido_en
    from public.eventos_territoriales e
    where e.seccion_id = s.seccion_id
    order by e.ocurrido_en desc, e.evento_id desc
    limit 1
  ) ultimo_evento on true
  left join lateral (
    select jsonb_build_object(
      'eleccion', jsonb_build_object(
        'eleccion_id', el.eleccion_id,
        'clave', el.clave,
        'nombre', el.nombre,
        'fecha', el.fecha_eleccion
      ),
      'lista_nominal', ln.total,
      'participacion', case when pe.participacion_id is null then null else jsonb_build_object(
        'votos_emitidos', pe.votos_emitidos,
        'votos_validos', pe.votos_validos,
        'votos_nulos', pe.votos_nulos,
        'votos_no_registrados', pe.votos_no_registrados
      ) end,
      'resultados', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'partido_id', p.partido_id,
            'siglas', p.siglas,
            'votos', resultado.votos,
            'es_ganador', resultado.posicion = 1
          ) order by resultado.votos desc, p.siglas
        )
        from (
          select
            re.partido_id,
            re.votos,
            dense_rank() over (order by re.votos desc) as posicion
          from public.resultados_electorales re
          where re.eleccion_id = el.eleccion_id and re.seccion_id = ln.seccion_id
        ) resultado
        join public.partidos_catalogo p on p.partido_id = resultado.partido_id
      ), '[]'::jsonb)
    ) as resumen
    from public.listas_nominales ln
    join public.elecciones el on el.eleccion_id = ln.eleccion_id
    left join public.participacion_electoral pe
      on pe.eleccion_id = ln.eleccion_id and pe.seccion_id = ln.seccion_id
    where ln.seccion_id = s.seccion_id
    order by el.fecha_eleccion desc, el.eleccion_id desc
    limit 1
  ) electoral on true
  where s.seccion_id = p_seccion_id;

  if v_contexto is null then
    raise exception 'No existe la sección %', p_seccion_id using errcode = 'P0002';
  end if;

  return v_contexto;
end;
$$;

revoke all on function public.rpc_resolver_territorio(double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.rpc_get_seccion(double precision, double precision)
  from public, anon, authenticated;
revoke all on function public.rpc_get_eventos_seccion(bigint, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.rpc_get_seccion_contexto(bigint)
  from public, anon, authenticated;

grant execute on function public.rpc_resolver_territorio(double precision, double precision) to service_role;
grant execute on function public.rpc_get_seccion(double precision, double precision) to service_role;
grant execute on function public.rpc_get_eventos_seccion(bigint, timestamptz, integer) to service_role;
grant execute on function public.rpc_get_seccion_contexto(bigint) to service_role;

comment on function public.rpc_resolver_territorio(double precision, double precision) is
  'Resuelve municipio, colonia, sección y distritos para una coordenada WGS84.';
comment on function public.rpc_get_seccion(double precision, double precision) is
  'Devuelve la sección electoral correspondiente a una coordenada WGS84.';
comment on function public.rpc_get_eventos_seccion(bigint, timestamptz, integer) is
  'Devuelve eventos recientes de una sección con un límite máximo de 500 filas.';
comment on function public.rpc_get_seccion_contexto(bigint) is
  'Devuelve el contexto territorial, electoral y de eventos inicial de una sección.';

;
