begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
create or replace function public.rpc_listar_versiones_cartograficas()
returns table (
  cartografia_version_id bigint,
  clave text,
  nombre text,
  estado text,
  fecha_corte date,
  fecha_publicacion date,
  fecha_publicacion_esperada date,
  vigente_desde date,
  vigente_hasta date,
  es_predeterminada boolean,
  conteos jsonb
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    v.cartografia_version_id,
    v.clave,
    v.nombre,
    v.estado,
    v.fecha_corte,
    v.fecha_publicacion,
    v.fecha_publicacion_esperada,
    v.vigente_desde,
    v.vigente_hasta,
    v.es_predeterminada,
    v.conteos_validados
  from public.cartografia_versiones v
  where v.estado in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA')
  order by v.clave_entidad, v.es_predeterminada desc,
           coalesce(v.fecha_publicacion, v.fecha_corte) desc nulls last,
           v.cartografia_version_id desc;
$function$;
create or replace function public.rpc_resolver_territorio_version(
  p_latitud double precision,
  p_longitud double precision,
  p_cartografia_version_id bigint
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_version public.cartografia_versiones%rowtype;
  v_punto extensions.geometry(Point, 4326);
  v_candidatos jsonb;
  v_cantidad integer;
  v_estado text;
begin
  if p_latitud is null or p_longitud is null
     or p_cartografia_version_id is null then
    raise exception using errcode = '22004',
      message = 'latitud, longitud y version son obligatorias';
  end if;
  if p_latitud < -90 or p_latitud > 90
     or p_longitud < -180 or p_longitud > 180 then
    raise exception using errcode = '22023',
      message = 'coordenadas fuera de rango';
  end if;

  select v.* into v_version
  from public.cartografia_versiones v
  where v.cartografia_version_id = p_cartografia_version_id;

  if not found then
    raise exception using errcode = 'P0002',
      message = 'version cartografica inexistente';
  end if;
  if v_version.estado not in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA') then
    raise exception using errcode = '55000',
      message = 'version cartografica no consultable';
  end if;

  v_punto := extensions.st_setsrid(
    extensions.st_makepoint(p_longitud, p_latitud), 4326
  );

  select
    count(*)::integer,
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'cartografia_seccion_id', s.cartografia_seccion_id,
          'seccion_id', s.seccion_id,
          'clave_entidad', s.clave_entidad,
          'numero_seccion', s.numero,
          'tipo', s.tipo,
          'cartografia_municipio_id', m.cartografia_municipio_id,
          'municipio_id', m.municipio_id,
          'clave_municipio', m.clave_municipio,
          'nombre_municipio', m.nombre,
          'cartografia_distrito_local_id', dl.cartografia_distrito_local_id,
          'distrito_local_id', dl.distrito_local_id,
          'numero_distrito_local', dl.numero,
          'cartografia_distrito_federal_id', df.cartografia_distrito_federal_id,
          'distrito_federal_id', df.distrito_federal_id,
          'numero_distrito_federal', df.numero
        ) order by s.cartografia_seccion_id
      ),
      '[]'::jsonb
    )
  into v_cantidad, v_candidatos
  from public.cartografia_secciones s
  join public.cartografia_municipios m
    on m.cartografia_municipio_id = s.cartografia_municipio_id
   and m.cartografia_version_id = s.cartografia_version_id
  join public.cartografia_distritos_locales dl
    on dl.cartografia_distrito_local_id = s.cartografia_distrito_local_id
   and dl.cartografia_version_id = s.cartografia_version_id
  join public.cartografia_distritos_federales df
    on df.cartografia_distrito_federal_id = s.cartografia_distrito_federal_id
   and df.cartografia_version_id = s.cartografia_version_id
  where s.cartografia_version_id = p_cartografia_version_id
    and s.geom operator(extensions.&&) v_punto
    and extensions.st_covers(s.geom, v_punto);

  v_estado := case v_cantidad
    when 0 then 'FUERA_COBERTURA'
    when 1 then 'UNICA'
    else 'AMBIGUA_LIMITE'
  end;

  return pg_catalog.jsonb_build_object(
    'estado', v_estado,
    'cantidad_candidatos', v_cantidad,
    'version', pg_catalog.jsonb_build_object(
      'cartografia_version_id', v_version.cartografia_version_id,
      'clave', v_version.clave,
      'estado', v_version.estado
    ),
    'candidatos', v_candidatos
  );
end;
$function$;
create or replace function public.rpc_resolver_territorio(
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
as $function$
declare
  v_version_id bigint;
  v_resolucion jsonb;
  v_candidato jsonb;
  v_punto extensions.geometry(Point, 4326);
begin
  select v.cartografia_version_id into v_version_id
  from public.cartografia_versiones v
  where v.es_predeterminada
    and v.estado = 'PUBLICADA';

  if v_version_id is null then
    raise exception using errcode = 'P0002',
      message = 'no existe version cartografica predeterminada';
  end if;

  v_resolucion := public.rpc_resolver_territorio_version(
    p_latitud, p_longitud, v_version_id
  );
  if v_resolucion->>'estado' = 'AMBIGUA_LIMITE' then
    raise exception using errcode = 'P0003',
      message = 'el punto coincide con mas de una seccion';
  end if;
  v_candidato := v_resolucion->'candidatos'->0;
  v_punto := extensions.st_setsrid(
    extensions.st_makepoint(p_longitud, p_latitud), 4326
  );

  return query
  select
    (v_candidato->>'municipio_id')::bigint,
    v_candidato->>'clave_municipio',
    v_candidato->>'nombre_municipio',
    colonia.colonia_id,
    colonia.nombre,
    (v_candidato->>'seccion_id')::bigint,
    (v_candidato->>'numero_seccion')::integer,
    (v_candidato->>'distrito_local_id')::bigint,
    (v_candidato->>'numero_distrito_local')::smallint,
    (v_candidato->>'distrito_federal_id')::bigint,
    (v_candidato->>'numero_distrito_federal')::smallint
  from (values (1)) as base(dummy)
  left join lateral (
    select c.colonia_id, c.nombre
    from public.cartografia_colonias c
    where c.cartografia_version_id = v_version_id
      and c.municipio_id = (v_candidato->>'municipio_id')::bigint
      and c.geom operator(extensions.&&) v_punto
      and extensions.st_covers(c.geom, v_punto)
    order by extensions.st_area(c.geom), c.cartografia_colonia_id
    limit 1
  ) colonia on v_candidato is not null;
end;
$function$;
create or replace function public.rpc_secciones_en_vista(
  p_cartografia_version_id bigint,
  p_clave_municipio text,
  p_min_long double precision,
  p_min_lat double precision,
  p_max_long double precision,
  p_max_lat double precision,
  p_limite integer default 5000
)
returns table (
  cartografia_seccion_id bigint,
  seccion_id bigint,
  "CVE_MUN" text,
  "CVEGEO" text,
  "MUNICIPIO" integer,
  "SECCION" integer,
  tipo smallint,
  geometry jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_bbox extensions.geometry(Polygon, 4326);
  v_estado text;
begin
  if p_cartografia_version_id is null or p_min_long is null
     or p_min_lat is null or p_max_long is null or p_max_lat is null then
    raise exception using errcode = '22004',
      message = 'version y bbox son obligatorios';
  end if;
  if p_limite is null or p_limite < 1 or p_limite > 10000
     or p_min_long < -180 or p_max_long > 180
     or p_min_lat < -90 or p_max_lat > 90
     or p_min_long >= p_max_long or p_min_lat >= p_max_lat then
    raise exception using errcode = '22023',
      message = 'bbox o limite invalido';
  end if;

  select v.estado into v_estado
  from public.cartografia_versiones v
  where v.cartografia_version_id = p_cartografia_version_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'version cartografica inexistente';
  end if;
  if v_estado not in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA') then
    raise exception using errcode = '55000',
      message = 'version cartografica no consultable';
  end if;

  v_bbox := extensions.st_makeenvelope(
    p_min_long, p_min_lat, p_max_long, p_max_lat, 4326
  );

  return query
  select
    s.cartografia_seccion_id,
    s.seccion_id,
    m.clave_municipio,
    s.clave_entidad || m.clave_municipio,
    m.clave_municipio::integer,
    s.numero,
    case when s.tipo ~ '^[0-9]+$' then s.tipo::smallint else null end,
    extensions.st_asgeojson(s.geom)::jsonb
  from public.cartografia_secciones s
  join public.cartografia_municipios m
    on m.cartografia_municipio_id = s.cartografia_municipio_id
   and m.cartografia_version_id = s.cartografia_version_id
  where s.cartografia_version_id = p_cartografia_version_id
    and (p_clave_municipio is null
      or m.clave_municipio = p_clave_municipio)
    and s.geom operator(extensions.&&) v_bbox
    and extensions.st_intersects(s.geom, v_bbox)
  order by s.numero, s.cartografia_seccion_id
  limit p_limite;
end;
$function$;
create or replace function public.rpc_comparar_versiones_cartograficas(
  p_version_origen bigint,
  p_version_destino bigint,
  p_clave_municipio text default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_origen public.cartografia_versiones%rowtype;
  v_destino public.cartografia_versiones%rowtype;
  v_resultado jsonb;
begin
  if p_version_origen is null or p_version_destino is null then
    raise exception using errcode = '22004',
      message = 'version origen y destino son obligatorias';
  end if;

  select v.* into v_origen from public.cartografia_versiones v
  where v.cartografia_version_id = p_version_origen;
  if not found then
    raise exception using errcode = 'P0002', message = 'version origen inexistente';
  end if;
  select v.* into v_destino from public.cartografia_versiones v
  where v.cartografia_version_id = p_version_destino;
  if not found then
    raise exception using errcode = 'P0002', message = 'version destino inexistente';
  end if;
  if v_origen.estado not in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA')
     or v_destino.estado not in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA') then
    raise exception using errcode = '55000',
      message = 'ambas versiones deben ser consultables';
  end if;

  with
  origen as materialized (
    select s.*
    from public.cartografia_secciones s
    join public.cartografia_municipios m
      on m.cartografia_municipio_id = s.cartografia_municipio_id
     and m.cartografia_version_id = s.cartografia_version_id
    where s.cartografia_version_id = p_version_origen
      and (p_clave_municipio is null or m.clave_municipio = p_clave_municipio)
  ),
  destino as materialized (
    select s.*
    from public.cartografia_secciones s
    join public.cartografia_municipios m
      on m.cartografia_municipio_id = s.cartografia_municipio_id
     and m.cartografia_version_id = s.cartografia_version_id
    where s.cartografia_version_id = p_version_destino
      and (p_clave_municipio is null or m.clave_municipio = p_clave_municipio)
  ),
  pares as materialized (
    select
      coalesce(o.seccion_id, d.seccion_id) as seccion_id,
      o.cartografia_seccion_id as origen_id,
      d.cartografia_seccion_id as destino_id,
      o.numero as numero_origen,
      d.numero as numero_destino,
      case
        when o.seccion_id is null then 'SOLO_DESTINO'
        when d.seccion_id is null then 'SOLO_ORIGEN'
        when extensions.st_equals(o.geom, d.geom) then 'MISMA'
        else 'AJUSTADA'
      end as categoria
    from origen o
    full join destino d using (seccion_id)
  ),
  linaje as materialized (
    select e.*
    from public.cartografia_secciones_equivalencias e
    where e.cartografia_version_origen_id = p_version_origen
      and e.cartografia_version_destino_id = p_version_destino
      and e.estado = 'VALIDADA'
  )
  select pg_catalog.jsonb_build_object(
    'origen', pg_catalog.jsonb_build_object(
      'cartografia_version_id', v_origen.cartografia_version_id,
      'clave', v_origen.clave
    ),
    'destino', pg_catalog.jsonb_build_object(
      'cartografia_version_id', v_destino.cartografia_version_id,
      'clave', v_destino.clave
    ),
    'totales', pg_catalog.jsonb_build_object(
      'misma', count(*) filter (where p.categoria = 'MISMA'),
      'solo_origen', count(*) filter (where p.categoria = 'SOLO_ORIGEN'),
      'solo_destino', count(*) filter (where p.categoria = 'SOLO_DESTINO'),
      'ajustada', count(*) filter (where p.categoria = 'AJUSTADA'),
      'sin_equivalencia', count(*) filter (
        where p.categoria in ('SOLO_ORIGEN', 'SOLO_DESTINO')
          and not exists (
            select 1 from linaje l
            where l.seccion_origen_id = p.seccion_id
               or l.seccion_destino_id = p.seccion_id
          )
      )
    ),
    'cobertura_linaje', pg_catalog.jsonb_build_object(
      'relaciones_validadas', (select count(*) from linaje),
      'origenes_cubiertos', (select count(distinct seccion_origen_id) from linaje),
      'destinos_cubiertos', (select count(distinct seccion_destino_id)
        from linaje where seccion_destino_id is not null)
    ),
    'secciones', pg_catalog.jsonb_build_object(
      'misma', coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)
        order by p.seccion_id) filter (where p.categoria = 'MISMA'), '[]'::jsonb),
      'solo_origen', coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)
        order by p.seccion_id) filter (where p.categoria = 'SOLO_ORIGEN'), '[]'::jsonb),
      'solo_destino', coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)
        order by p.seccion_id) filter (where p.categoria = 'SOLO_DESTINO'), '[]'::jsonb),
      'ajustada', coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)
        order by p.seccion_id) filter (where p.categoria = 'AJUSTADA'), '[]'::jsonb),
      'sin_equivalencia', coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p)
        order by p.seccion_id) filter (
          where p.categoria in ('SOLO_ORIGEN', 'SOLO_DESTINO')
            and not exists (
              select 1 from linaje l
              where l.seccion_origen_id = p.seccion_id
                 or l.seccion_destino_id = p.seccion_id
            )
        ), '[]'::jsonb)
    )
  ) into v_resultado
  from pares p;

  return v_resultado;
end;
$function$;
create or replace function public.rpc_publicar_version_cartografica(
  p_cartografia_version_id bigint
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_version public.cartografia_versiones%rowtype;
  v_carga public.cargas_cartograficas%rowtype;
  v_progreso public.validaciones_cartograficas_progreso%rowtype;
  v_version_anterior_id bigint;
  v_snapshot jsonb;
  v_snapshot_sha256 text;
  v_unresolved_warnings integer;
  v_errors integer;
  v_cache_counts jsonb;
begin
  if p_cartografia_version_id is null then
    raise exception using errcode = '22004',
      message = 'version cartografica obligatoria';
  end if;

  select v.* into v_version
  from public.cartografia_versiones v
  where v.cartografia_version_id = p_cartografia_version_id;
  if not found then
    raise exception using errcode = 'P0002',
      message = 'version cartografica inexistente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'SIPEEM:CARTOGRAFIA:PUBLICAR:' || v_version.clave_entidad, 0
    )
  );

  select v.* into v_version
  from public.cartografia_versiones v
  where v.cartografia_version_id = p_cartografia_version_id
  for update;
  if v_version.estado not in ('VALIDADA', 'PUBLICADA') then
    raise exception using errcode = '55000',
      message = 'la version debe estar VALIDADA o PUBLICADA';
  end if;

  select c.* into v_carga
  from public.cargas_cartograficas c
  where c.cartografia_version_id = p_cartografia_version_id
  for update;
  if not found or v_carga.estado <> 'COMPLETA' then
    raise exception using errcode = '55000',
      message = 'la carga cartografica no esta COMPLETA';
  end if;

  select p.* into v_progreso
  from public.validaciones_cartograficas_progreso p
  where p.cartografia_version_id = p_cartografia_version_id
    and p.carga_id = v_carga.carga_id
  for update;
  if not found
     or v_progreso.fase <> 'COMPLETA'
     or v_progreso.cursor <> '{}'::jsonb
     or v_progreso.completada_at is null
     or v_progreso.errores <> 0 then
    raise exception using errcode = '55000',
      message = 'la validacion cartografica no esta completa';
  end if;

  v_snapshot := territorial_private.snapshot_cartografia_version(
    p_cartografia_version_id
  );
  v_snapshot_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(v_snapshot::text, 'UTF8'), 'sha256'
  ), 'hex');
  if v_snapshot_sha256 is distinct from v_progreso.snapshot_sha256
     or v_version.conteos_esperados is distinct from v_progreso.conteos_snapshot
     or v_version.conteos_validados is distinct from v_progreso.conteos_snapshot
     or v_progreso.conteos_snapshot is distinct from v_snapshot->'conteos'
     or v_progreso.maximos_ids_snapshot is distinct from v_snapshot->'maximos' then
    raise exception using errcode = '55000',
      message = 'snapshot o conteos cartograficos no coinciden';
  end if;

  select
    count(*) filter (where i.severidad = 'ERROR')::integer,
    count(*) filter (
      where i.severidad = 'ADVERTENCIA'
        and not (
          i.resolucion = 'JUSTIFICADA'
          and i.resuelta_at is not null
          and i.resuelta_por is not null
          and nullif(pg_catalog.btrim(i.justificacion), '') is not null
        )
    )::integer
  into v_errors, v_unresolved_warnings
  from public.cartografia_incidencias i
  where i.cartografia_version_id = p_cartografia_version_id;

  if v_errors <> 0 then
    raise exception using errcode = '55000',
      message = 'la version conserva incidencias ERROR';
  end if;
  if v_unresolved_warnings <> 0 then
    raise exception using errcode = '55000',
      message = pg_catalog.format(
        'la version conserva %s unresolved_warnings', v_unresolved_warnings
      );
  end if;
  if not exists (
    select 1 from public.cartografia_archivos a
    where a.cartografia_version_id = p_cartografia_version_id
  ) then
    raise exception using errcode = '55000',
      message = 'manifiesto cartografico ausente';
  end if;

  select v.cartografia_version_id into v_version_anterior_id
  from public.cartografia_versiones v
  where v.clave_entidad = v_version.clave_entidad
    and v.es_predeterminada
  for update;

  perform pg_catalog.set_config(
    'territorial_private.sincronizando_cache', 'on', true
  );

  update public.territorios_municipios t
     set activo = false
   where t.clave_entidad = v_version.clave_entidad;
  update public.territorios_distritos_locales t
     set activo = false
   where t.clave_entidad = v_version.clave_entidad;
  update public.territorios_distritos_federales t
     set activo = false
   where t.clave_entidad = v_version.clave_entidad;
  update public.territorios_secciones t
     set activo = false
   where t.clave_entidad = v_version.clave_entidad;
  update public.territorios_colonias t
     set activo = false
    from public.territorios_municipios m
   where m.municipio_id = t.municipio_id
     and m.clave_entidad = v_version.clave_entidad;
  update public.territorios_localidades t
     set activo = false
   where t.clave_entidad = v_version.clave_entidad;

  update public.territorios_municipios t
     set nombre = c.nombre,
         geom = c.geom,
         metadata = c.atributos_fuente || pg_catalog.jsonb_build_object(
           'cartografia_version_id', p_cartografia_version_id),
         activo = true
    from public.cartografia_municipios c
   where c.cartografia_version_id = p_cartografia_version_id
     and t.municipio_id = c.municipio_id;

  update public.territorios_distritos_locales t
     set nombre = c.nombre,
         geom = c.geom,
         metadata = c.atributos_fuente || pg_catalog.jsonb_build_object(
           'cartografia_version_id', p_cartografia_version_id),
         activo = true
    from public.cartografia_distritos_locales c
   where c.cartografia_version_id = p_cartografia_version_id
     and t.distrito_local_id = c.distrito_local_id;

  update public.territorios_distritos_federales t
     set nombre = c.nombre,
         geom = c.geom,
         metadata = c.atributos_fuente || pg_catalog.jsonb_build_object(
           'cartografia_version_id', p_cartografia_version_id),
         activo = true
    from public.cartografia_distritos_federales c
   where c.cartografia_version_id = p_cartografia_version_id
     and t.distrito_federal_id = c.distrito_federal_id;

  update public.territorios_secciones t
     set municipio_id = c.municipio_id,
         distrito_local_id = c.distrito_local_id,
         distrito_federal_id = c.distrito_federal_id,
         geom = c.geom,
         metadata = c.atributos_fuente || pg_catalog.jsonb_build_object(
           'cartografia_version_id', p_cartografia_version_id,
           'tipo', c.tipo),
         activo = true
    from public.cartografia_secciones c
   where c.cartografia_version_id = p_cartografia_version_id
     and t.seccion_id = c.seccion_id;

  update public.territorios_colonias t
     set municipio_id = c.municipio_id,
         clave = c.id_ine,
         nombre = c.nombre,
         geom = c.geom,
         metadata = c.atributos_fuente || pg_catalog.jsonb_build_object(
           'cartografia_version_id', p_cartografia_version_id),
         activo = true
    from public.cartografia_colonias c
   where c.cartografia_version_id = p_cartografia_version_id
     and t.colonia_id = c.colonia_id;

  update public.territorios_colonias t
     set municipio_id = c.municipio_id,
         clave = c.id_ine,
         nombre = c.nombre,
         geom = null,
         metadata = c.atributos_fuente || pg_catalog.jsonb_build_object(
           'cartografia_version_id', p_cartografia_version_id,
           'sin_geometria', true,
           'motivo', c.motivo),
         activo = true
    from public.cartografia_colonias_sin_geometria c
   where c.cartografia_version_id = p_cartografia_version_id
     and t.colonia_id = c.colonia_id;

  update public.territorios_localidades t
     set nombre = c.nombre,
         municipio_id = c.municipio_id,
         seccion_id = c.seccion_id,
         geom_punto = c.geom_punto,
         geom_limite = coalesce(c.geom_limite, limites.geom),
         metadata = c.atributos_fuente || pg_catalog.jsonb_build_object(
           'cartografia_version_id', p_cartografia_version_id,
           'clave_localidad_fuente', c.clave_localidad_fuente),
         activo = true
    from public.cartografia_localidades c
    left join lateral (
      select extensions.st_multi(
        extensions.st_unaryunion(extensions.st_collect(l.geom))
      )::extensions.geometry(MultiPolygon, 4326) as geom
      from public.cartografia_limites_localidad_puntos lp
      join public.cartografia_limites_localidad l
        on l.cartografia_limite_localidad_id = lp.cartografia_limite_localidad_id
       and l.cartografia_version_id = lp.cartografia_version_id
      where lp.cartografia_version_id = p_cartografia_version_id
        and lp.localidad_id = c.localidad_id
    ) limites on true
   where c.cartografia_version_id = p_cartografia_version_id
     and t.localidad_id = c.localidad_id;

  select pg_catalog.jsonb_build_object(
    'ENTIDAD', (select count(*) from public.cartografia_entidades c
      where c.cartografia_version_id = p_cartografia_version_id),
    'MUNICIPIO', (select count(*) from public.territorios_municipios t
      where t.clave_entidad = v_version.clave_entidad and t.activo),
    'DISTRITO_LOCAL', (select count(*) from public.territorios_distritos_locales t
      where t.clave_entidad = v_version.clave_entidad and t.activo),
    'DISTRITO_FEDERAL', (select count(*) from public.territorios_distritos_federales t
      where t.clave_entidad = v_version.clave_entidad and t.activo),
    'SECCION', (select count(*) from public.territorios_secciones t
      where t.clave_entidad = v_version.clave_entidad and t.activo),
    'COLONIA', (select count(*) from public.territorios_colonias t
      join public.territorios_municipios m on m.municipio_id = t.municipio_id
      where m.clave_entidad = v_version.clave_entidad and t.activo),
    'LOCALIDAD', (select count(*) from public.territorios_localidades t
      where t.clave_entidad = v_version.clave_entidad and t.activo),
    'LIMITE_LOCALIDAD', (select count(*) from public.cartografia_limites_localidad l
      where l.cartografia_version_id = p_cartografia_version_id)
  ) into v_cache_counts;

  if v_cache_counts is distinct from v_version.conteos_validados then
    raise exception using errcode = '55000',
      message = 'la sincronizacion del cache no coincide con los conteos validados';
  end if;

  update public.cartografia_versiones v
     set es_predeterminada = false
   where v.clave_entidad = v_version.clave_entidad
     and v.cartografia_version_id <> p_cartografia_version_id
     and v.es_predeterminada;

  update public.cartografia_versiones v
     set estado = 'PUBLICADA',
         es_predeterminada = true,
         publicada_at = coalesce(v.publicada_at, pg_catalog.clock_timestamp()),
         archivada_at = null
   where v.cartografia_version_id = p_cartografia_version_id;

  insert into public.cartografia_versiones_bitacora (
    cartografia_version_id, carga_id, evento, estado_anterior,
    estado_nuevo, detalle, actor_id
  ) values (
    p_cartografia_version_id,
    v_carga.carga_id,
    'PUBLICACION_CARTOGRAFICA',
    v_version.estado,
    'PUBLICADA',
    pg_catalog.jsonb_build_object(
      'version_anterior_id', v_version_anterior_id,
      'conteos_sincronizados', v_cache_counts,
      'rol_base_datos', current_user,
      'sujeto_jwt', nullif(pg_catalog.current_setting(
        'request.jwt.claim.sub', true), '')
    ),
    coalesce((select auth.uid()),
      '00000000-0000-0000-0000-000000000000'::uuid)
  );

  perform pg_catalog.set_config(
    'territorial_private.sincronizando_cache', 'off', true
  );

  return pg_catalog.jsonb_build_object(
    'version_anterior_id', v_version_anterior_id,
    'version_seleccionada_id', p_cartografia_version_id,
    'conteos_sincronizados', v_cache_counts
  );
end;
$function$;
create or replace function public.rpc_archivar_version_cartografica(
  p_cartografia_version_id bigint
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_version public.cartografia_versiones%rowtype;
  v_estado_anterior text;
begin
  if p_cartografia_version_id is null then
    raise exception using errcode = '22004', message = 'version obligatoria';
  end if;
  select v.* into v_version from public.cartografia_versiones v
  where v.cartografia_version_id = p_cartografia_version_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'version inexistente';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'SIPEEM:CARTOGRAFIA:PUBLICAR:' || v_version.clave_entidad, 0)
  );
  select v.* into v_version from public.cartografia_versiones v
  where v.cartografia_version_id = p_cartografia_version_id for update;
  if v_version.es_predeterminada then
    raise exception using errcode = '55000',
      message = 'la version predeterminada no puede archivarse';
  end if;
  if v_version.estado not in ('VALIDADA', 'PUBLICADA') then
    raise exception using errcode = '55000',
      message = 'solo una version VALIDADA o PUBLICADA puede archivarse';
  end if;

  v_estado_anterior := v_version.estado;
  update public.cartografia_versiones
     set estado = 'ARCHIVADA', archivada_at = pg_catalog.clock_timestamp()
   where cartografia_version_id = p_cartografia_version_id
   returning * into v_version;

  insert into public.cartografia_versiones_bitacora (
    cartografia_version_id, evento, estado_anterior, estado_nuevo,
    detalle, actor_id
  ) values (
    p_cartografia_version_id, 'ARCHIVO_CARTOGRAFICO',
    v_estado_anterior, 'ARCHIVADA',
    pg_catalog.jsonb_build_object('rol_base_datos', current_user),
    coalesce((select auth.uid()),
      '00000000-0000-0000-0000-000000000000'::uuid)
  );

  return pg_catalog.jsonb_build_object(
    'cartografia_version_id', v_version.cartografia_version_id,
    'estado', v_version.estado,
    'archivada_at', v_version.archivada_at
  );
end;
$function$;
create or replace function public.rpc_restaurar_version_cartografica(
  p_cartografia_version_id bigint
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_version public.cartografia_versiones%rowtype;
  v_carga public.cargas_cartograficas%rowtype;
  v_progreso public.validaciones_cartograficas_progreso%rowtype;
  v_snapshot jsonb;
  v_snapshot_sha256 text;
  v_actor uuid;
  v_errors integer;
  v_unresolved_warnings integer;
begin
  if p_cartografia_version_id is null then
    raise exception using errcode = '22004', message = 'version obligatoria';
  end if;
  select v.* into v_version from public.cartografia_versiones v
  where v.cartografia_version_id = p_cartografia_version_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'version inexistente';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'SIPEEM:CARTOGRAFIA:PUBLICAR:' || v_version.clave_entidad, 0)
  );
  select v.* into v_version from public.cartografia_versiones v
  where v.cartografia_version_id = p_cartografia_version_id for update;
  if v_version.estado <> 'ARCHIVADA' then
    raise exception using errcode = '55000',
      message = 'solo una version ARCHIVADA puede restaurarse';
  end if;

  select c.* into v_carga
  from public.cargas_cartograficas c
  where c.cartografia_version_id = p_cartografia_version_id
  for update;
  if not found or v_carga.estado <> 'COMPLETA' then
    raise exception using errcode = '55000',
      message = 'la carga archivada no esta COMPLETA';
  end if;

  select p.* into v_progreso
  from public.validaciones_cartograficas_progreso p
  where p.cartografia_version_id = p_cartografia_version_id
    and p.carga_id = v_carga.carga_id
  for update;
  if not found
     or v_progreso.fase <> 'COMPLETA'
     or v_progreso.cursor <> '{}'::jsonb
     or v_progreso.completada_at is null
     or v_progreso.errores <> 0 then
    raise exception using errcode = '55000',
      message = 'la validacion archivada no esta completa';
  end if;

  v_snapshot := territorial_private.snapshot_cartografia_version(
    p_cartografia_version_id
  );
  v_snapshot_sha256 := encode(extensions.digest(
    pg_catalog.convert_to(v_snapshot::text, 'UTF8'), 'sha256'
  ), 'hex');
  if v_snapshot_sha256 is distinct from v_progreso.snapshot_sha256
     or v_version.conteos_esperados is distinct from v_progreso.conteos_snapshot
     or v_version.conteos_validados is distinct from v_progreso.conteos_snapshot
     or v_progreso.conteos_snapshot is distinct from v_snapshot->'conteos'
     or v_progreso.maximos_ids_snapshot is distinct from v_snapshot->'maximos' then
    raise exception using errcode = '55000',
      message = 'snapshot o conteos archivados no coinciden';
  end if;

  select
    count(*) filter (where i.severidad = 'ERROR')::integer,
    count(*) filter (
      where i.severidad = 'ADVERTENCIA'
        and not (
          i.resolucion = 'JUSTIFICADA'
          and i.resuelta_at is not null
          and i.resuelta_por is not null
          and nullif(pg_catalog.btrim(i.justificacion), '') is not null
        )
    )::integer
  into v_errors, v_unresolved_warnings
  from public.cartografia_incidencias i
  where i.cartografia_version_id = p_cartografia_version_id;
  if v_errors <> 0 or v_unresolved_warnings <> 0 then
    raise exception using errcode = '55000',
      message = 'la version archivada conserva incidencias no resueltas';
  end if;

  v_actor := coalesce((select auth.uid()),
    '00000000-0000-0000-0000-000000000000'::uuid);
  update public.cartografia_versiones
     set estado = 'PUBLICADA',
         archivada_at = null,
         restauracion_validada_at = pg_catalog.clock_timestamp(),
         restauracion_validada_por = v_actor
   where cartografia_version_id = p_cartografia_version_id
   returning * into v_version;

  insert into public.cartografia_versiones_bitacora (
    cartografia_version_id, evento, estado_anterior, estado_nuevo,
    detalle, actor_id
  ) values (
    p_cartografia_version_id, 'RESTAURACION_CARTOGRAFICA',
    'ARCHIVADA', 'PUBLICADA',
    pg_catalog.jsonb_build_object('rol_base_datos', current_user), v_actor
  );

  return pg_catalog.jsonb_build_object(
    'cartografia_version_id', v_version.cartografia_version_id,
    'estado', v_version.estado,
    'restaurada_at', v_version.restauracion_validada_at
  );
end;
$function$;
alter function public.rpc_listar_versiones_cartograficas() owner to postgres;
alter function public.rpc_resolver_territorio_version(double precision,double precision,bigint) owner to postgres;
alter function public.rpc_resolver_territorio(double precision,double precision) owner to postgres;
alter function public.rpc_secciones_en_vista(bigint,text,double precision,double precision,double precision,double precision,integer) owner to postgres;
alter function public.rpc_comparar_versiones_cartograficas(bigint,bigint,text) owner to postgres;
alter function public.rpc_publicar_version_cartografica(bigint) owner to postgres;
alter function public.rpc_archivar_version_cartografica(bigint) owner to postgres;
alter function public.rpc_restaurar_version_cartografica(bigint) owner to postgres;
revoke all on function
  public.rpc_listar_versiones_cartograficas(),
  public.rpc_resolver_territorio_version(double precision,double precision,bigint),
  public.rpc_resolver_territorio(double precision,double precision),
  public.rpc_secciones_en_vista(bigint,text,double precision,double precision,double precision,double precision,integer),
  public.rpc_comparar_versiones_cartograficas(bigint,bigint,text),
  public.rpc_publicar_version_cartografica(bigint),
  public.rpc_archivar_version_cartografica(bigint),
  public.rpc_restaurar_version_cartografica(bigint)
from public, anon, authenticated, service_role;
grant execute on function
  public.rpc_listar_versiones_cartograficas(),
  public.rpc_resolver_territorio_version(double precision,double precision,bigint),
  public.rpc_resolver_territorio(double precision,double precision),
  public.rpc_secciones_en_vista(bigint,text,double precision,double precision,double precision,double precision,integer),
  public.rpc_comparar_versiones_cartograficas(bigint,bigint,text),
  public.rpc_publicar_version_cartografica(bigint),
  public.rpc_archivar_version_cartografica(bigint),
  public.rpc_restaurar_version_cartografica(bigint)
to service_role;
comment on function public.rpc_publicar_version_cartografica(bigint) is
  'Publica atomicamente una version validada, sincroniza el cache compatible y conserva versiones historicas.';
commit;
