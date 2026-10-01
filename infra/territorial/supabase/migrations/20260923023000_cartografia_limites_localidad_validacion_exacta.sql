begin;
set local lock_timeout = '10s';
create or replace function territorial_private.snapshot_cartografia_version(
  p_cartografia_version_id bigint
) returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  with filas as materialized (
    select 'ENTIDAD'::text as capa,
           e.cartografia_entidad_id as id_versionada,
           pg_catalog.jsonb_build_object('clave_entidad', e.clave_entidad) as identidad_fuente,
           pg_catalog.jsonb_build_array(e.fuente_sha256) as huellas
    from public.cartografia_entidades e
    where e.cartografia_version_id = p_cartografia_version_id
    union all
    select 'MUNICIPIO', m.cartografia_municipio_id,
           pg_catalog.jsonb_build_object(
             'municipio_id', m.municipio_id, 'clave_municipio', m.clave_municipio
           ),
           pg_catalog.jsonb_build_array(m.fuente_sha256)
    from public.cartografia_municipios m
    where m.cartografia_version_id = p_cartografia_version_id
    union all
    select 'DISTRITO_LOCAL', d.cartografia_distrito_local_id,
           pg_catalog.jsonb_build_object(
             'distrito_local_id', d.distrito_local_id, 'numero', d.numero
           ),
           pg_catalog.jsonb_build_array(d.fuente_sha256)
    from public.cartografia_distritos_locales d
    where d.cartografia_version_id = p_cartografia_version_id
    union all
    select 'DISTRITO_FEDERAL', d.cartografia_distrito_federal_id,
           pg_catalog.jsonb_build_object(
             'distrito_federal_id', d.distrito_federal_id, 'numero', d.numero
           ),
           pg_catalog.jsonb_build_array(d.fuente_sha256)
    from public.cartografia_distritos_federales d
    where d.cartografia_version_id = p_cartografia_version_id
    union all
    select 'SECCION', s.cartografia_seccion_id,
           pg_catalog.jsonb_build_object('seccion_id', s.seccion_id, 'numero', s.numero),
           pg_catalog.jsonb_build_array(s.fuente_sha256)
    from public.cartografia_secciones s
    where s.cartografia_version_id = p_cartografia_version_id
    union all
    select 'COLONIA', c.cartografia_colonia_id,
           pg_catalog.jsonb_build_object(
             'colonia_id', c.colonia_id, 'clave_entidad', c.clave_entidad,
             'municipio_id', c.municipio_id, 'id_ine', c.id_ine,
             'fila_origen', c.fila_origen, 'tipo_registro', 'POLIGONO',
             'fuente_sha256', c.fuente_sha256
           ),
           pg_catalog.jsonb_build_array(c.fuente_sha256)
    from public.cartografia_colonias c
    where c.cartografia_version_id = p_cartografia_version_id
    union all
    select 'COLONIA', c.cartografia_colonia_sin_geometria_id,
           pg_catalog.jsonb_build_object(
             'colonia_id', c.colonia_id, 'clave_entidad', c.clave_entidad,
             'municipio_id', c.municipio_id, 'id_ine', c.id_ine,
             'fila_origen', c.fila_origen, 'tipo_registro', 'SIN_GEOMETRIA',
             'fuente_sha256', c.fuente_sha256
           ),
           pg_catalog.jsonb_build_array(c.fuente_sha256)
    from public.cartografia_colonias_sin_geometria c
    where c.cartografia_version_id = p_cartografia_version_id
    union all
    select 'LOCALIDAD', l.cartografia_localidad_id,
           pg_catalog.jsonb_build_object('localidad_id', l.localidad_id, 'id_ine', l.id_ine),
           pg_catalog.jsonb_build_array(l.fuente_punto_sha256)
    from public.cartografia_localidades l
    where l.cartografia_version_id = p_cartografia_version_id
    union all
    select 'LIMITE_LOCALIDAD', l.cartografia_limite_localidad_id,
           pg_catalog.jsonb_build_object(
             'id_fuente_limite', l.id_fuente_limite,
             'clave_municipio', m.clave_municipio,
             'clave_localidad_fuente', l.clave_localidad_fuente,
             'tipo', l.tipo,
             'cabecera', l.cabecera,
             'fila_origen', l.fila_origen,
             'fuente_sha256', l.fuente_sha256
           ),
           pg_catalog.jsonb_build_array(l.fuente_sha256)
    from public.cartografia_limites_localidad l
    join public.cartografia_municipios m
      on m.cartografia_municipio_id = l.cartografia_municipio_id
    where l.cartografia_version_id = p_cartografia_version_id
  ), capas(orden, capa) as (
    values
      (1, 'ENTIDAD'::text),
      (2, 'MUNICIPIO'::text),
      (3, 'DISTRITO_LOCAL'::text),
      (4, 'DISTRITO_FEDERAL'::text),
      (5, 'SECCION'::text),
      (6, 'COLONIA'::text),
      (7, 'LOCALIDAD'::text),
      (8, 'LIMITE_LOCALIDAD'::text)
  ), resumen as materialized (
    select f.capa,
           pg_catalog.count(*)::bigint as conteo,
           coalesce(pg_catalog.max(f.id_versionada), 0::bigint) as maximo
      from filas f
     group by f.capa
  ), limites_enlaces as materialized (
    select l.cartografia_limite_localidad_id,
           pg_catalog.count(p.cartografia_localidad_id)::bigint as enlaces
      from public.cartografia_limites_localidad l
      left join public.cartografia_limites_localidad_puntos p
        on p.cartografia_limite_localidad_id =
           l.cartografia_limite_localidad_id
     where l.cartografia_version_id = p_cartografia_version_id
     group by l.cartografia_limite_localidad_id
  ), relaciones_canonicas as materialized (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_array(
          l.fila_origen,
          p.fila_origen,
          m.clave_municipio,
          l.clave_localidad_fuente
        ) order by
          l.fila_origen,
          p.fila_origen,
          m.clave_municipio,
          l.clave_localidad_fuente
      ),
      '[]'::jsonb
    ) as filas
    from public.cartografia_limites_localidad_puntos x
    join public.cartografia_limites_localidad l
      on l.cartografia_limite_localidad_id =
         x.cartografia_limite_localidad_id
    join public.cartografia_localidades p
      on p.cartografia_localidad_id = x.cartografia_localidad_id
    join public.cartografia_municipios m
      on m.cartografia_municipio_id = l.cartografia_municipio_id
    where x.cartografia_version_id = p_cartografia_version_id
  ), limites_sin_punto_canonicos as materialized (
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_array(
          l.fila_origen,
          l.id_fuente_limite,
          m.clave_municipio,
          l.clave_localidad_fuente,
          l.fuente_sha256
        ) order by
          l.fila_origen,
          l.id_fuente_limite,
          m.clave_municipio,
          l.clave_localidad_fuente,
          l.fuente_sha256
      ),
      '[]'::jsonb
    ) as filas
    from public.cartografia_limites_localidad l
    join public.cartografia_municipios m
      on m.cartografia_municipio_id = l.cartografia_municipio_id
    where l.cartografia_version_id = p_cartografia_version_id
      and not exists (
        select 1
        from public.cartografia_limites_localidad_puntos x
        where x.cartografia_limite_localidad_id =
              l.cartografia_limite_localidad_id
      )
  ), cobertura_limites as materialized (
    select
      pg_catalog.count(*)::bigint as limites,
      pg_catalog.count(*) filter (where e.enlaces > 0)::bigint
        as limites_con_punto,
      pg_catalog.count(*) filter (where e.enlaces = 0)::bigint
        as limites_sin_punto,
      pg_catalog.count(*) filter (where e.enlaces = 1)::bigint
        as limites_un_punto,
      pg_catalog.count(*) filter (where e.enlaces > 1)::bigint
        as limites_varios_puntos,
      coalesce(pg_catalog.sum(e.enlaces), 0)::bigint as relaciones
    from limites_enlaces e
  )
  select pg_catalog.jsonb_build_object(
    'conteos', (
      select pg_catalog.jsonb_object_agg(
               c.capa, coalesce(r.conteo, 0::bigint) order by c.orden
             )
        from capas c
        left join resumen r on r.capa = c.capa
    ),
    'maximos', (
      select pg_catalog.jsonb_object_agg(
               c.capa, coalesce(r.maximo, 0::bigint) order by c.orden
             )
        from capas c
        left join resumen r on r.capa = c.capa
    ),
    'cobertura_colonias', pg_catalog.jsonb_build_object(
      'con_geometria', (
        select pg_catalog.count(*)::bigint
        from public.cartografia_colonias c
        where c.cartografia_version_id = p_cartografia_version_id
      ),
      'sin_geometria', (
        select pg_catalog.count(*)::bigint
        from public.cartografia_colonias_sin_geometria c
        where c.cartografia_version_id = p_cartografia_version_id
      ),
      'evidencia_sha256', (
        select r.evidencia_sha256
        from public.cartografia_cobertura_colonias_recibos r
        where r.cartografia_version_id = p_cartografia_version_id
      ),
      'evidencia', (
        select r.evidencia
        from public.cartografia_cobertura_colonias_recibos r
        where r.cartografia_version_id = p_cartografia_version_id
      )
    ),
    'cobertura_limites_localidad', pg_catalog.jsonb_build_object(
      'limites', (select c.limites from cobertura_limites c),
      'limites_con_punto',
        (select c.limites_con_punto from cobertura_limites c),
      'limites_sin_punto',
        (select c.limites_sin_punto from cobertura_limites c),
      'limites_un_punto',
        (select c.limites_un_punto from cobertura_limites c),
      'limites_varios_puntos',
        (select c.limites_varios_puntos from cobertura_limites c),
      'relaciones', (select c.relaciones from cobertura_limites c),
      'evidencia_sha256', (
        select r.evidencia_sha256
        from public.cartografia_cobertura_limites_localidad_recibos r
        where r.cartografia_version_id = p_cartografia_version_id
      ),
      'relaciones_sha256', (
        select territorial_private.sha256_jsonb_cartografico(r.filas)
        from relaciones_canonicas r
      ),
      'limites_sin_punto_sha256', (
        select territorial_private.sha256_jsonb_cartografico(r.filas)
        from limites_sin_punto_canonicos r
      )
    ),
    'filas', coalesce(
      (select pg_catalog.jsonb_agg(
         pg_catalog.jsonb_build_object(
           'capa', f.capa,
           'identidad_versionada', f.id_versionada,
           'identidad_fuente', f.identidad_fuente,
           'huellas', f.huellas,
           'tipo_registro', f.identidad_fuente->>'tipo_registro',
           'fila_origen', (f.identidad_fuente->>'fila_origen')::bigint
         ) order by
           f.capa,
           case when f.capa in ('COLONIA','LIMITE_LOCALIDAD')
             then (f.identidad_fuente->>'fila_origen')::bigint
             else f.id_versionada end,
           f.identidad_fuente->>'tipo_registro',
           f.identidad_fuente->>'id_ine',
           f.identidad_fuente->>'fuente_sha256'
       ) from filas f),
      '[]'::jsonb
    )
  );
$function$;
create or replace function public.rpc_validar_version_cartografica_lote(
  p_cartografia_version_id bigint,
  p_lote integer default 250
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_version_id bigint;
  v_version record;
  v_carga record;
  v_progreso record;
  v_tiene_progreso boolean := false;
  v_snapshot jsonb;
  v_snapshot_sha256 text;
  v_ids bigint[] := '{}'::bigint[];
  v_cursor bigint := 0;
  v_ultimo_id bigint;
  v_procesados bigint := 0;
  v_errores bigint := 0;
  v_advertencias bigint := 0;
  v_fase text;
  v_conteo_capa_actual_text text;
begin
  if p_cartografia_version_id is null or p_lote is null then
    raise exception using errcode = '22004', message = 'version y lote son obligatorios';
  end if;
  if p_lote < 1 or p_lote > 250 then
    raise exception using errcode = '22023', message = 'p_lote debe estar entre 1 y 250';
  end if;

  -- Resolver sin lock, tomar el advisory canonico y volver a leer las filas.
  select v.cartografia_version_id
    into v_version_id
    from public.cartografia_versiones v
   where v.cartografia_version_id = p_cartografia_version_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'version cartografica inexistente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('SIPEEM:CARTOGRAFIA:VERSION:' ||
      v_version_id::text, 0)
  );

  select v.* into v_version
    from public.cartografia_versiones v
   where v.cartografia_version_id = v_version_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'version cartografica inexistente';
  end if;

  select c.* into v_carga
    from public.cargas_cartograficas c
   where c.cartografia_version_id = v_version_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'carga cartografica inexistente';
  end if;

  select p.* into v_progreso
    from public.validaciones_cartograficas_progreso p
   where p.cartografia_version_id = v_version_id
   for update;
  v_tiene_progreso := found;

  -- Los dos resultados terminales son idempotentes y no escriben timestamps.
  if v_version.estado = 'VALIDADA'
     or v_carga.estado = 'COMPLETA'
     or (v_version.estado = 'FALLIDA' and v_carga.estado = 'FALLIDA'
         and v_tiene_progreso and v_progreso.fase = 'COMPLETA') then
    if v_tiene_progreso then
      return pg_catalog.jsonb_build_object(
        'cartografia_version_id', v_version_id,
        'completa', true,
        'fase', 'COMPLETA',
        'cursor', v_progreso.cursor,
        'procesados', 0,
        'errores', v_progreso.errores,
        'advertencias', v_progreso.advertencias,
        'snapshot_sha256', v_progreso.snapshot_sha256
      );
    end if;

    select pg_catalog.count(*) filter (where i.severidad = 'ERROR'),
           pg_catalog.count(*) filter (where i.severidad = 'ADVERTENCIA')
      into v_errores, v_advertencias
      from public.cartografia_incidencias i
     where i.cartografia_version_id = v_version_id;
    return pg_catalog.jsonb_build_object(
      'cartografia_version_id', v_version_id,
      'completa', true,
      'fase', 'COMPLETA',
      'cursor', '{}'::jsonb,
      'procesados', 0,
      'errores', v_errores,
      'advertencias', v_advertencias,
      'snapshot_sha256', null
    );
  end if;

  if not v_tiene_progreso then
    if v_version.estado <> 'CARGANDO' or v_carga.estado <> 'CARGANDO' then
      raise exception using errcode = '55000', message = 'la version no esta lista para validar';
    end if;

    -- El cursor resume la ultima capa, pero el ledger demuestra que todas las
    -- capas CARGAR cubren exactamente 1..conteo (y ninguna fila si el conteo es
    -- cero). Asi una llamada prematura nunca sella una carga recuperable.
    if exists (
      with capas(capa) as (
        values
          ('ENTIDAD'::text), ('MUNICIPIO'::text),
          ('DISTRITO_LOCAL'::text), ('DISTRITO_FEDERAL'::text),
          ('SECCION'::text), ('COLONIA'::text),
          ('LOCALIDAD'::text), ('LIMITE_LOCALIDAD'::text)
      ), confirmados as (
        select l.capa,
               pg_catalog.count(*)::bigint as lotes,
               pg_catalog.min(l.registro_desde) as minimo,
               pg_catalog.max(l.registro_hasta) as maximo,
               pg_catalog.sum(
                 l.registro_hasta - l.registro_desde + 1
               )::bigint as registros
          from public.cargas_cartograficas_lotes l
         where l.carga_id = v_carga.carga_id
         group by l.capa
      )
      select 1
        from capas c
        left join confirmados x on x.capa = c.capa
       where v_version.conteos_esperados ->> c.capa is null
          or v_version.conteos_esperados ->> c.capa
               !~ '^(0|[1-9][0-9]{0,18})$'
          or case
               when v_version.conteos_esperados ->> c.capa
                      ~ '^(0|[1-9][0-9]{0,18})$'
               then (v_version.conteos_esperados ->> c.capa)::numeric
                    > 9223372036854775807::numeric
               else false
             end
          or case
               when v_version.conteos_esperados ->> c.capa
                      ~ '^(0|[1-9][0-9]{0,18})$'
                and (v_version.conteos_esperados ->> c.capa)::numeric
                      <= 9223372036854775807::numeric
               then
                 coalesce(x.registros, 0::bigint)
                   <> (v_version.conteos_esperados ->> c.capa)::bigint
                 or (
                   (v_version.conteos_esperados ->> c.capa)::bigint = 0
                   and coalesce(x.lotes, 0::bigint) <> 0
                 )
                 or (
                   (v_version.conteos_esperados ->> c.capa)::bigint > 0
                   and (
                     x.minimo is distinct from 1::bigint
                     or x.maximo is distinct from
                          (v_version.conteos_esperados ->> c.capa)::bigint
                   )
                 )
               else false
             end
    ) then
      raise exception using
        errcode = '55000',
        message = 'el ledger cartografico aun no cubre todos los conteos esperados';
    end if;

    if v_carga.capa_actual is null
       or territorial_private.importar_orden_capa_cartografica(
            v_carga.capa_actual
          ) is null then
      raise exception using
        errcode = '55000',
        message = 'la carga no ha alcanzado una capa cartografica valida';
    end if;

    v_conteo_capa_actual_text :=
      v_version.conteos_esperados ->> v_carga.capa_actual;
    if v_conteo_capa_actual_text is null
       or v_conteo_capa_actual_text !~ '^(0|[1-9][0-9]{0,18})$'
       or v_conteo_capa_actual_text::numeric > 9223372036854775807::numeric
       or v_carga.cursor_confirmado <> v_conteo_capa_actual_text::bigint
       or territorial_private.importar_siguiente_capa_cartografica(
            v_version.conteos_esperados, v_carga.capa_actual
          ) is not null then
      raise exception using
        errcode = '55000',
        message = 'la carga cartografica aun no esta completa para validar';
    end if;

    -- La transicion activa la barrera M13 mientras los row locks impiden carreras.
    update public.cargas_cartograficas c
       set estado = 'VALIDANDO',
           reanudable = false
     where c.carga_id = v_carga.carga_id;

    v_snapshot := territorial_private.snapshot_cartografia_version(v_version_id);
    v_snapshot_sha256 := pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(v_snapshot::text, 'UTF8'), 'sha256'),
      'hex'
    );

    insert into public.validaciones_cartograficas_progreso (
      cartografia_version_id, carga_id, fase, cursor,
      conteos_snapshot, maximos_ids_snapshot, snapshot_sha256,
      errores, advertencias, iniciada_at
    ) values (
      v_version_id, v_carga.carga_id, 'ESTRUCTURA', '{}'::jsonb,
      v_snapshot->'conteos', v_snapshot->'maximos', v_snapshot_sha256,
      0, 0, pg_catalog.clock_timestamp()
    );

    select p.* into v_progreso
      from public.validaciones_cartograficas_progreso p
     where p.cartografia_version_id = v_version_id
     for update;
    v_carga.estado := 'VALIDANDO';
  else
    if v_version.estado <> 'CARGANDO' or v_carga.estado <> 'VALIDANDO'
       or v_progreso.fase = 'COMPLETA' then
      raise exception using errcode = '55000', message = 'estado de validacion incompatible';
    end if;
    -- La barrera M13 hace inmutables las filas mientras VALIDANDO. El sello
    -- completo se conserva en el checkpoint y se vuelve a calcular una sola
    -- vez al cerrar CONTEOS, no en cada lote espacial.
    v_snapshot_sha256 := v_progreso.snapshot_sha256;
  end if;

  v_fase := v_progreso.fase;

  if v_fase = 'ESTRUCTURA' then
    -- M23/M24 separan poligonos, relaciones y recibo. Antes de confiar en el
    -- grafo, verificar que sus barreras de integridad siguen activas.
    if exists (
      with esperadas_fk(tabla,nombre) as (
        values
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_version_entidad_fk'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_municipio_version_fk'),
          ('cartografia_limites_localidad_puntos',
           'cartografia_limites_localidad_puntos_limite_fk'),
          ('cartografia_limites_localidad_puntos',
           'cartografia_limites_localidad_puntos_localidad_fk'),
          ('cartografia_cobertura_limites_localidad_recibos',
           'cartografia_cobertura_limites_localidad_carga_version_fk')
      ), esperados_check(tabla,nombre) as (
        values
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_clave_entidad_ck'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_id_fuente_ck'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_clave_fuente_ck'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_nombre_ck'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_tipo_ck'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_cabecera_ck'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_atributos_objeto_ck'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_fila_origen_ck'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_fuente_sha256_ck'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_geom_ck'),
          ('cartografia_limites_localidad_puntos',
           'cartografia_limites_localidad_puntos_clave_entidad_ck'),
          ('cartografia_limites_localidad_puntos',
           'cartografia_limites_localidad_puntos_clave_fuente_ck'),
          ('cartografia_limites_localidad_puntos',
           'cartografia_limites_localidad_puntos_metodo_ck'),
          ('cartografia_cobertura_limites_localidad_recibos',
           'cartografia_cobertura_limites_localidad_evidencia_objeto_ck'),
          ('cartografia_cobertura_limites_localidad_recibos',
           'cartografia_cobertura_limites_localidad_sha256_ck')
      ), esperados_indices(tabla,nombre,metodo) as (
        values
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_municipio_version_idx','btree'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_version_municipio_clave_idx','btree'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_version_tipo_idx','btree'),
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_geom_gix','gist'),
          ('cartografia_limites_localidad_puntos',
           'cartografia_limites_localidad_puntos_localidad_contexto_idx','btree'),
          ('cartografia_limites_localidad_puntos',
           'cartografia_limites_localidad_puntos_limite_contexto_idx','btree'),
          ('cartografia_limites_localidad_puntos',
           'cartografia_limites_localidad_puntos_version_municipio_idx','btree'),
          ('cartografia_cobertura_limites_localidad_recibos',
           'cartografia_cobertura_limites_localidad_carga_version_idx','btree')
      ), esperados_triggers(tabla,nombre,tipo,funcion) as (
        values
          ('cartografia_limites_localidad',
           'cartografia_limites_localidad_proteger_geometria',31,
           'territorial_private.proteger_geometria_cartografica()'),
          ('cartografia_limites_localidad_puntos',
           'cartografia_limites_localidad_puntos_proteger_geometria',31,
           'territorial_private.proteger_geometria_cartografica()'),
          ('cartografia_cobertura_limites_localidad_recibos',
           'cartografia_cobertura_limites_localidad_validar_insert',7,
           'territorial_private.validar_recibo_limites_localidad_insert()'),
          ('cartografia_cobertura_limites_localidad_recibos',
           'cartografia_cobertura_limites_localidad_inmutable',27,
           'territorial_private.rechazar_cambio_recibo_limites_localidad()'),
          ('cargas_cartograficas_lotes',
           'cargas_cartograficas_lotes_exigir_recibo_limites_localidad',7,
           'territorial_private.exigir_recibo_limites_localidad_lote()')
      ), defectos as (
        select 1
        from esperadas_fk e
        left join pg_catalog.pg_namespace n on n.nspname='public'
        left join pg_catalog.pg_class r
          on r.relnamespace=n.oid and r.relname=e.tabla
        left join pg_catalog.pg_constraint c
          on c.conrelid=r.oid and c.conname=e.nombre
        where c.oid is null or c.contype <> 'f'
           or c.convalidated is not true or c.confdeltype <> 'r'
        union all
        select 1
        from esperados_check e
        left join pg_catalog.pg_namespace n on n.nspname='public'
        left join pg_catalog.pg_class r
          on r.relnamespace=n.oid and r.relname=e.tabla
        left join pg_catalog.pg_constraint c
          on c.conrelid=r.oid and c.conname=e.nombre
        where c.oid is null or c.contype <> 'c'
           or c.convalidated is not true
        union all
        select 1
        from esperados_indices e
        left join pg_catalog.pg_namespace n on n.nspname='public'
        left join pg_catalog.pg_class r
          on r.relnamespace=n.oid and r.relname=e.tabla
        left join pg_catalog.pg_class x
          on x.relnamespace=n.oid and x.relname=e.nombre
        left join pg_catalog.pg_index i
          on i.indexrelid=x.oid and i.indrelid=r.oid
        left join pg_catalog.pg_am a on a.oid=x.relam
        where i.indexrelid is null or i.indisvalid is not true
           or i.indisready is not true or a.amname is distinct from e.metodo
        union all
        select 1
        from esperados_triggers e
        left join pg_catalog.pg_namespace n on n.nspname='public'
        left join pg_catalog.pg_class r
          on r.relnamespace=n.oid and r.relname=e.tabla
        left join pg_catalog.pg_trigger t
          on t.tgrelid=r.oid and t.tgname=e.nombre and not t.tgisinternal
        where t.oid is null or t.tgenabled not in ('O','A')
           or t.tgtype <> e.tipo
           or t.tgfoid is distinct from pg_catalog.to_regprocedure(e.funcion)
        union all
        select 1
        from pg_catalog.pg_class r
        where r.oid in (
          'public.cartografia_limites_localidad'::regclass,
          'public.cartografia_limites_localidad_puntos'::regclass,
          'public.cartografia_cobertura_limites_localidad_recibos'::regclass
        ) and r.relrowsecurity is not true
      )
      select 1 from defectos limit 1
    ) then
      raise exception using errcode='55000',
        message='las restricciones estructurales cartograficas no estan validadas';
    end if;

    -- M27 endurece el gate de M26: los nombres no bastan. Las definiciones
    -- de constraints e indices, el typmod y los privilegios deben ser exactos.
    select pg_catalog.string_agg(d.defecto,',' order by d.defecto)
      into v_conteo_capa_actual_text
      from (
      with esperadas_restricciones(tabla,nombre,tipo,definicion_sha256) as (
        values
          ('cartografia_limites_localidad','cartografia_limites_localidad_version_entidad_fk','f','0c4850e3fca8dac68e75d55c6ae914faace8fc71bbbb3a61b441041d4e184b3d'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_municipio_version_fk','f','2a11fb1501d1ca11aaea95b23f594e93d2dfd0b4cc19a4b403c85c43adb6d3df'),
          ('cartografia_limites_localidad_puntos','cartografia_limites_localidad_puntos_limite_fk','f','df7e6b60059e930f203d19bf5b8d6de8f3f28d9ac97ca3f88f3e5c82d2bd7125'),
          ('cartografia_limites_localidad_puntos','cartografia_limites_localidad_puntos_localidad_fk','f','25ad3458faeb6c980febe3e6b6d9ed07af598c946e881a14459ea4968dbc7483'),
          ('cartografia_cobertura_limites_localidad_recibos','cartografia_cobertura_limites_localidad_carga_version_fk','f','fb9bce570a4fc5d2d62bcbf5548c4506ea0559a9546e0ef3a008869758655d49'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_clave_entidad_ck','c','2931cabf04a258799d2631a5160d6747fb1cef42d87250cdcd7cf02d0b6767ae'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_id_fuente_ck','c','b1c782bc181143208d68d362d3a511474385862199f51538b33bfb033ea17797'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_clave_fuente_ck','c','6e0d79f209dcc6a9ef8188dfb7782bdfe1d7adf42dfca5020bd159b2434a8fd5'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_nombre_ck','c','b70f1f13e751933d8c24566fcd263d044b9e048f3a50f3d35ae4061f5f5a9cb0'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_tipo_ck','c','07f6c16018614fcaa897dfad9093297072c1b7c50dffbfbca219a62351798962'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_cabecera_ck','c','59b3823184f6631572a3fe0401d26c306b64a7cc9a557b9090c8bafd5fb6174a'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_atributos_objeto_ck','c','cfb33ee2c09af7ed975a2e3d9811b8b646b4c18cf7568161e7b19780848635e7'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_fila_origen_ck','c','6343938924767523c6594fa608b34112ff9fdba4de6d6ca5b0f68faaf6d5b329'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_fuente_sha256_ck','c','037f3a1ad6f37110c64ca945d43499f2ee2e0d1f8d9b032d214ec76fa466b6da'),
          ('cartografia_limites_localidad','cartografia_limites_localidad_geom_ck','c','23bcde7070b3ce71d32f831bd40439dc4dab8519d8db6eb05cd74e1c8b70bc44'),
          ('cartografia_limites_localidad_puntos','cartografia_limites_localidad_puntos_clave_entidad_ck','c','2931cabf04a258799d2631a5160d6747fb1cef42d87250cdcd7cf02d0b6767ae'),
          ('cartografia_limites_localidad_puntos','cartografia_limites_localidad_puntos_clave_fuente_ck','c','6e0d79f209dcc6a9ef8188dfb7782bdfe1d7adf42dfca5020bd159b2434a8fd5'),
          ('cartografia_limites_localidad_puntos','cartografia_limites_localidad_puntos_metodo_ck','c','e999cffe479e415f87b67da59af4d877375b6331ffec798847622f8621c5d1c1'),
          ('cartografia_cobertura_limites_localidad_recibos','cartografia_cobertura_limites_localidad_evidencia_objeto_ck','c','e1b9b5eb887bd5ac89e8bc64fa44e7b431c99fca5edcb8c5814795ba1f866668'),
          ('cartografia_cobertura_limites_localidad_recibos','cartografia_cobertura_limites_localidad_sha256_ck','c','d27468da7613df95653af8c82a8dc5482f9f90ea37de9467c87b07659362cb17')
      ), esperados_indices(nombre,definicion_sha256) as (
        values
          ('cartografia_limites_localidad_municipio_version_idx','bd2b9cc3a17c8f11272a7aa4f2ae26039a8c6b038d8a861743ee5b396b915ce6'),
          ('cartografia_limites_localidad_version_municipio_clave_idx','91b7b28ffd1d965e46dff0cf444397d44a6950c6e1ded4e202b893765d9440f4'),
          ('cartografia_limites_localidad_version_tipo_idx','5f160dbda4081c89daf6cedf744ec53000c5e1bd7fb70596ad0e2370678096a1'),
          ('cartografia_limites_localidad_geom_gix','d983033a1b6372fb446f7014985f7a2e2f2b330583d284d46685ed9ef3c8fac2'),
          ('cartografia_limites_localidad_puntos_localidad_contexto_idx','09ef56eb5dc778dc5e9ae7e695b3a25ef655a57ee5f6614362daf550fe91f37d'),
          ('cartografia_limites_localidad_puntos_limite_contexto_idx','397a697d332e84be985291511cb6e690c6f7369d547d9f8e3b5727619ed3cde9'),
          ('cartografia_limites_localidad_puntos_version_municipio_idx','22177294fc47ae3a824b927800f3a9c96305946254433dd1caae49448408a1b3'),
          ('cartografia_cobertura_limites_localidad_carga_version_idx','f4d56e2bc5897fdf5e2111dc0d91b70c6638cb0ab47f7a30903c4374a2a6e430')
      ), tablas_acl(tabla) as (
        values
          ('cartografia_limites_localidad'::text),
          ('cartografia_limites_localidad_puntos'),
          ('cartografia_cobertura_limites_localidad_recibos')
      ), roles_acl(rol) as (
        values ('anon'::text),('authenticated'),('service_role')
      ), privilegios_acl(privilegio) as (
        values
          ('SELECT'::text),('INSERT'),('UPDATE'),('DELETE'),
          ('TRUNCATE'),('REFERENCES'),('TRIGGER'),('MAINTAIN')
      ), esperados_privilegios(tabla,rol,privilegio,permitido) as (
        select t.tabla,r.rol,p.privilegio,
               r.rol='service_role' and (
                 (t.tabla='cartografia_limites_localidad'
                  and p.privilegio in ('SELECT','INSERT','UPDATE'))
                 or
                 (t.tabla in (
                    'cartografia_limites_localidad_puntos',
                    'cartografia_cobertura_limites_localidad_recibos'
                  ) and p.privilegio in ('SELECT','INSERT'))
               ) as permitido
          from tablas_acl t cross join roles_acl r cross join privilegios_acl p
      ), funciones(firma) as (
        values
          ('territorial_private.snapshot_cartografia_version(bigint)'::text),
          ('public.rpc_validar_version_cartografica_lote(bigint,integer)'),
          ('public.rpc_registrar_cobertura_limites_localidad(bigint,jsonb)'),
          ('public.rpc_obtener_cobertura_limites_localidad(bigint)'),
          ('public.rpc_importar_lote_cartografico(bigint,text,bigint,bigint,jsonb)'),
          ('public.rpc_importar_lote_cartografico_sin_replay(bigint,text,bigint,bigint,jsonb)')
      ), roles(rol) as (
        values ('anon'::text),('authenticated'),('service_role')
      ), defectos as (
        select 'CONSTRAINT:' || e.nombre as defecto
          from esperadas_restricciones e
          left join pg_catalog.pg_namespace n on n.nspname='public'
          left join pg_catalog.pg_class r
            on r.relnamespace=n.oid and r.relname=e.tabla
          left join pg_catalog.pg_constraint c
            on c.conrelid=r.oid and c.conname=e.nombre
         where c.oid is null
            or c.contype::text is distinct from e.tipo
            or c.convalidated is not true
            or pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
                 pg_catalog.pg_get_constraintdef(c.oid,false),'UTF8'
               ),'sha256'),'hex') is distinct from e.definicion_sha256
        union all
        select 'INDEX:' || e.nombre
          from esperados_indices e
          left join pg_catalog.pg_namespace n on n.nspname='public'
          left join pg_catalog.pg_class x
            on x.relnamespace=n.oid and x.relname=e.nombre
          left join pg_catalog.pg_index i on i.indexrelid=x.oid
         where i.indexrelid is null
            or i.indisvalid is not true or i.indisready is not true
            or pg_catalog.encode(extensions.digest(pg_catalog.convert_to(
                 pg_catalog.pg_get_indexdef(i.indexrelid,0,false),'UTF8'
               ),'sha256'),'hex') is distinct from e.definicion_sha256
        union all
        select 'GEOMETRIA:cartografia_limites_localidad.geom'
          from (values ('geom'::text)) e(columna)
          left join pg_catalog.pg_attribute a
            on a.attrelid='public.cartografia_limites_localidad'::regclass
           and a.attname=e.columna and a.attnum>0
         where a.attnum is null
            or a.atttypid<>pg_catalog.to_regtype('extensions.geometry')
             or extensions.postgis_typmod_type(a.atttypmod)<>'MultiPolygon'
             or extensions.postgis_typmod_srid(a.atttypmod)<>4326
             or extensions.postgis_typmod_dims(a.atttypmod)<>2
             or a.attnotnull is not true
        union all
        select 'PRIVILEGIO:' || e.tabla || ':' || e.rol || ':' || e.privilegio
          from esperados_privilegios e
         where pg_catalog.has_table_privilege(
                 e.rol,'public.'||e.tabla,e.privilegio
               ) is distinct from e.permitido
        union all
        select 'FUNCION:' || f.firma || ':' || r.rol
          from funciones f cross join roles r
         where pg_catalog.has_function_privilege(r.rol,f.firma,'EXECUTE')
               is distinct from (r.rol='service_role')
        union all
        select 'SECUENCIA:' || r.rol || ':' || p.privilegio
          from roles r
          cross join (values ('USAGE'::text),('SELECT'),('UPDATE')) p(privilegio)
         where pg_catalog.has_sequence_privilege(
                 r.rol,
                 pg_catalog.pg_get_serial_sequence(
                   'public.cartografia_limites_localidad',
                   'cartografia_limite_localidad_id'
                 ),
                 p.privilegio
               ) is distinct from
               (r.rol='service_role' and p.privilegio='USAGE')
      )
      select defecto from defectos
    ) d;
    if v_conteo_capa_actual_text is not null then
      raise exception using errcode='55000',
        message='las restricciones estructurales cartograficas no estan validadas',
        detail=v_conteo_capa_actual_text;
    end if;

    -- M13 ya impone tipos geometria, SRID, no-vacia, validez, bbox y todas las
    -- referencias mediante CHECK/FK. Verificar que esas barreras siguen
    -- validadas es constante respecto al numero de features y evita repetir
    -- operaciones PostGIS completas bajo el lock de version.
    if exists (
      with esperadas_fk(
        tabla, nombre, columnas, tabla_referida, columnas_referidas
      ) as (
        values
          ('cartografia_entidades', 'cartografia_entidades_version_entidad_fk',
           array['cartografia_version_id','clave_entidad']::text[],
           'cartografia_versiones', array['cartografia_version_id','clave_entidad']::text[]),
          ('cartografia_municipios', 'cartografia_municipios_version_entidad_fk',
           array['cartografia_version_id','clave_entidad']::text[],
           'cartografia_versiones', array['cartografia_version_id','clave_entidad']::text[]),
          ('cartografia_municipios', 'cartografia_municipios_estable_entidad_fk',
           array['municipio_id','clave_entidad']::text[],
           'territorios_municipios', array['municipio_id','clave_entidad']::text[]),
          ('cartografia_distritos_locales', 'cartografia_distritos_locales_version_entidad_fk',
           array['cartografia_version_id','clave_entidad']::text[],
           'cartografia_versiones', array['cartografia_version_id','clave_entidad']::text[]),
          ('cartografia_distritos_locales', 'cartografia_distritos_locales_estable_entidad_fk',
           array['distrito_local_id','clave_entidad']::text[],
           'territorios_distritos_locales', array['distrito_local_id','clave_entidad']::text[]),
          ('cartografia_distritos_federales', 'cartografia_distritos_federales_version_entidad_fk',
           array['cartografia_version_id','clave_entidad']::text[],
           'cartografia_versiones', array['cartografia_version_id','clave_entidad']::text[]),
          ('cartografia_distritos_federales', 'cartografia_distritos_federales_estable_entidad_fk',
           array['distrito_federal_id','clave_entidad']::text[],
           'territorios_distritos_federales', array['distrito_federal_id','clave_entidad']::text[]),
          ('cartografia_secciones', 'cartografia_secciones_version_entidad_fk',
           array['cartografia_version_id','clave_entidad']::text[],
           'cartografia_versiones', array['cartografia_version_id','clave_entidad']::text[]),
          ('cartografia_secciones', 'cartografia_secciones_estable_entidad_fk',
           array['seccion_id','clave_entidad']::text[],
           'territorios_secciones', array['seccion_id','clave_entidad']::text[]),
          ('cartografia_secciones', 'cartografia_secciones_municipio_version_fk',
           array['cartografia_municipio_id','cartografia_version_id','municipio_id']::text[],
           'cartografia_municipios', array['cartografia_municipio_id','cartografia_version_id','municipio_id']::text[]),
          ('cartografia_secciones', 'cartografia_secciones_distrito_local_version_fk',
           array['cartografia_distrito_local_id','cartografia_version_id','distrito_local_id']::text[],
           'cartografia_distritos_locales', array['cartografia_distrito_local_id','cartografia_version_id','distrito_local_id']::text[]),
          ('cartografia_secciones', 'cartografia_secciones_distrito_federal_version_fk',
           array['cartografia_distrito_federal_id','cartografia_version_id','distrito_federal_id']::text[],
           'cartografia_distritos_federales', array['cartografia_distrito_federal_id','cartografia_version_id','distrito_federal_id']::text[]),
          ('cartografia_colonias', 'cartografia_colonias_version_entidad_fk',
           array['cartografia_version_id','clave_entidad']::text[],
           'cartografia_versiones', array['cartografia_version_id','clave_entidad']::text[]),
          ('cartografia_colonias', 'cartografia_colonias_estable_fk',
           array['colonia_id']::text[],
           'territorios_colonias', array['colonia_id']::text[]),
          ('cartografia_colonias', 'cartografia_colonias_municipio_version_fk',
           array['cartografia_municipio_id','cartografia_version_id','municipio_id']::text[],
           'cartografia_municipios', array['cartografia_municipio_id','cartografia_version_id','municipio_id']::text[]),
          ('cartografia_localidades', 'cartografia_localidades_version_entidad_fk',
           array['cartografia_version_id','clave_entidad']::text[],
           'cartografia_versiones', array['cartografia_version_id','clave_entidad']::text[]),
          ('cartografia_localidades', 'cartografia_localidades_estable_entidad_fk',
           array['localidad_id','clave_entidad']::text[],
           'territorios_localidades', array['localidad_id','clave_entidad']::text[]),
          ('cartografia_localidades', 'cartografia_localidades_municipio_version_fk',
           array['cartografia_municipio_id','cartografia_version_id','municipio_id']::text[],
           'cartografia_municipios', array['cartografia_municipio_id','cartografia_version_id','municipio_id']::text[]),
          ('cartografia_localidades', 'cartografia_localidades_seccion_version_fk',
           array['cartografia_seccion_id','cartografia_version_id','seccion_id']::text[],
           'cartografia_secciones', array['cartografia_seccion_id','cartografia_version_id','seccion_id']::text[])
      ), esperados_check(tabla, nombre, definicion_sha256) as (
        values
          ('cartografia_entidades', 'cartografia_entidades_geom_ck',
           '62a57fbb62cc26825c5434ca29331dc37774e6c6f4d8b299ddc7490abb0182d0'),
          ('cartografia_municipios', 'cartografia_municipios_geom_ck',
           '62a57fbb62cc26825c5434ca29331dc37774e6c6f4d8b299ddc7490abb0182d0'),
          ('cartografia_distritos_locales', 'cartografia_distritos_locales_geom_ck',
           '62a57fbb62cc26825c5434ca29331dc37774e6c6f4d8b299ddc7490abb0182d0'),
          ('cartografia_distritos_federales', 'cartografia_distritos_federales_geom_ck',
           '62a57fbb62cc26825c5434ca29331dc37774e6c6f4d8b299ddc7490abb0182d0'),
          ('cartografia_secciones', 'cartografia_secciones_geom_ck',
           '62a57fbb62cc26825c5434ca29331dc37774e6c6f4d8b299ddc7490abb0182d0'),
          ('cartografia_colonias', 'cartografia_colonias_geom_ck',
           '62a57fbb62cc26825c5434ca29331dc37774e6c6f4d8b299ddc7490abb0182d0'),
          ('cartografia_localidades', 'cartografia_localidades_geom_punto_ck',
           'aa023dd89d6360f6e248d9a0faa035d94835daddb265b89d6b6036109b5f551b'),
          ('cartografia_localidades', 'cartografia_localidades_limite_conjunto_ck',
           'd1f4188da19a52c30674a4e3285549854f4d0079b669e0e88bf5eca5e9009c76')
      ), esperadas_columnas(tabla, columna, geom_tipo, obligatoria) as (
        values
          ('cartografia_entidades', 'geom', 'MultiPolygon', true),
          ('cartografia_municipios', 'geom', 'MultiPolygon', true),
          ('cartografia_distritos_locales', 'geom', 'MultiPolygon', true),
          ('cartografia_distritos_federales', 'geom', 'MultiPolygon', true),
          ('cartografia_secciones', 'geom', 'MultiPolygon', true),
          ('cartografia_colonias', 'geom', 'MultiPolygon', true),
          ('cartografia_localidades', 'geom_punto', 'Point', true),
          ('cartografia_localidades', 'geom_limite', 'MultiPolygon', false)
      ), esperados_triggers(tabla, nombre) as (
        values
          ('cartografia_entidades', 'cartografia_entidades_proteger_geometria'),
          ('cartografia_municipios', 'cartografia_municipios_proteger_geometria'),
          ('cartografia_distritos_locales', 'cartografia_distritos_locales_proteger_geometria'),
          ('cartografia_distritos_federales', 'cartografia_distritos_federales_proteger_geometria'),
          ('cartografia_secciones', 'cartografia_secciones_proteger_geometria'),
          ('cartografia_colonias', 'cartografia_colonias_proteger_geometria'),
          ('cartografia_localidades', 'cartografia_localidades_proteger_geometria')
      ), defectos as (
        select 'FK:' || e.nombre as defecto
          from esperadas_fk e
          left join pg_catalog.pg_namespace nsp on nsp.nspname = 'public'
          left join pg_catalog.pg_class rel
            on rel.relnamespace = nsp.oid and rel.relname = e.tabla
          left join pg_catalog.pg_constraint con
            on con.conrelid = rel.oid and con.conname = e.nombre
          left join pg_catalog.pg_class ref on ref.oid = con.confrelid
          left join pg_catalog.pg_namespace ref_nsp on ref_nsp.oid = ref.relnamespace
         where con.oid is null
            or con.contype <> 'f'
            or con.convalidated is not true
            or con.confdeltype <> 'r'
            or ref_nsp.nspname is distinct from 'public'
            or ref.relname is distinct from e.tabla_referida
            or (
              select pg_catalog.array_agg(a.attname::text order by k.ord)
                from pg_catalog.unnest(con.conkey) with ordinality as k(attnum, ord)
                join pg_catalog.pg_attribute a
                  on a.attrelid = con.conrelid and a.attnum = k.attnum
            ) is distinct from e.columnas
            or (
              select pg_catalog.array_agg(a.attname::text order by k.ord)
                from pg_catalog.unnest(con.confkey) with ordinality as k(attnum, ord)
                join pg_catalog.pg_attribute a
                  on a.attrelid = con.confrelid and a.attnum = k.attnum
            ) is distinct from e.columnas_referidas
            or (
              select pg_catalog.count(*) <> 4
                  or not pg_catalog.bool_and(t.tgenabled in ('O', 'A'))
                from pg_catalog.pg_trigger t
               where t.tgconstraint = con.oid
            )
        union all
        select 'CHECK:' || e.nombre
          from esperados_check e
          left join pg_catalog.pg_namespace nsp on nsp.nspname = 'public'
          left join pg_catalog.pg_class rel
            on rel.relnamespace = nsp.oid and rel.relname = e.tabla
          left join pg_catalog.pg_constraint con
            on con.conrelid = rel.oid and con.conname = e.nombre
         where con.oid is null
            or con.contype <> 'c'
            or con.convalidated is not true
            or pg_catalog.encode(
              extensions.digest(
                pg_catalog.convert_to(
                  pg_catalog.pg_get_constraintdef(con.oid, false), 'UTF8'
                ),
                'sha256'
              ),
              'hex'
            ) is distinct from e.definicion_sha256
        union all
        select 'COLUMNA:' || e.tabla || '.' || e.columna
          from esperadas_columnas e
          left join pg_catalog.pg_namespace nsp on nsp.nspname = 'public'
          left join pg_catalog.pg_class rel
            on rel.relnamespace = nsp.oid and rel.relname = e.tabla
          left join pg_catalog.pg_attribute a
            on a.attrelid = rel.oid and a.attname = e.columna and a.attnum > 0
         where a.attnum is null
            or a.atttypid <> pg_catalog.to_regtype('extensions.geometry')
            or extensions.postgis_typmod_type(a.atttypmod) is distinct from e.geom_tipo
            or extensions.postgis_typmod_srid(a.atttypmod) is distinct from 4326
            or extensions.postgis_typmod_dims(a.atttypmod) is distinct from 2
            or a.attnotnull is distinct from e.obligatoria
        union all
        select 'TRIGGER:' || e.nombre
          from esperados_triggers e
          left join pg_catalog.pg_namespace nsp on nsp.nspname = 'public'
          left join pg_catalog.pg_class rel
            on rel.relnamespace = nsp.oid and rel.relname = e.tabla
          left join pg_catalog.pg_trigger t
            on t.tgrelid = rel.oid and t.tgname = e.nombre and not t.tgisinternal
         where t.oid is null
            or t.tgenabled not in ('O', 'A')
            or t.tgtype is distinct from 31::smallint
            or t.tgattr is distinct from ''::pg_catalog.int2vector
            or t.tgqual is not null
            or t.tgfoid is distinct from pg_catalog.to_regprocedure(
              'territorial_private.proteger_geometria_cartografica()'
            )
      )
      select 1 from defectos limit 1
    ) then
      raise exception using
        errcode = '55000',
        message = 'las restricciones estructurales cartograficas no estan validadas';
    end if;

    -- M16 sella las tablas espaciales. Esta etapa extiende el mismo gate a
    -- la ruta no espacial, el recibo inmutable y la guarda entre rutas.
    if exists (
      with protecciones(tabla,nombre,tipo,funcion) as (
        values
          ('cartografia_colonias_sin_geometria',
           'cartografia_colonias_sin_geometria_proteger',31,
           'territorial_private.proteger_geometria_cartografica()'),
          ('cartografia_colonias',
           'cartografia_colonias_rutas_disjuntas',23,
           'territorial_private.asegurar_colonias_rutas_disjuntas()'),
          ('cartografia_colonias_sin_geometria',
           'cartografia_colonias_sin_geometria_rutas_disjuntas',23,
           'territorial_private.asegurar_colonias_rutas_disjuntas()'),
          ('cartografia_cobertura_colonias_recibos',
           'cartografia_cobertura_colonias_recibos_inmutable',27,
           'territorial_private.rechazar_cambio_recibo_cobertura()'),
          ('cartografia_cobertura_colonias_recibos',
           'cartografia_cobertura_colonias_recibos_validar_insert',7,
           'territorial_private.validar_recibo_cobertura_insert()')
      ), defectos as (
        select 1
        from protecciones p
        left join pg_catalog.pg_namespace n
          on n.nspname='public'
        left join pg_catalog.pg_class r
          on r.relnamespace=n.oid and r.relname=p.tabla
        left join pg_catalog.pg_trigger t
          on t.tgrelid=r.oid and t.tgname=p.nombre
         and not t.tgisinternal
        where t.oid is null
           or t.tgenabled not in ('O','A')
           or t.tgtype <> p.tipo
           or t.tgfoid is distinct from
             pg_catalog.to_regprocedure(p.funcion)
        union all
        select 1
        from pg_catalog.pg_class r
        where r.oid in (
          'public.cartografia_colonias_sin_geometria'::regclass,
          'public.cartografia_cobertura_colonias_recibos'::regclass
        ) and r.relrowsecurity is not true
        union all
        select 1
        from (values
          ('cartografia_colonias_sin_geometria',
           'cartografia_colonias_sin_geometria_motivo_ck'),
          ('cartografia_cobertura_colonias_recibos',
           'cartografia_cobertura_colonias_recibos_sha256_ck')
        ) e(tabla,nombre)
        left join pg_catalog.pg_namespace n on n.nspname='public'
        left join pg_catalog.pg_class r
          on r.relnamespace=n.oid and r.relname=e.tabla
        left join pg_catalog.pg_constraint c
          on c.conrelid=r.oid and c.conname=e.nombre
        where c.oid is null or c.contype <> 'c'
           or c.convalidated is not true
      )
      select 1 from defectos limit 1
    ) then
      raise exception using errcode='55000',
        message='las restricciones estructurales cartograficas no estan validadas';
    end if;

    -- El recibo, ambas rutas y el ledger deben describir exactamente el
    -- mismo conjunto de filas. Un defecto queda como ERROR, no se "arregla"
    -- reduciendo el manifiesto a los poligonos disponibles.
    if not exists (
      select 1
      from public.cartografia_cobertura_colonias_recibos r
      where r.carga_id = v_carga.carga_id
        and r.cartografia_version_id = v_version_id
        and r.evidencia_sha256 =
          territorial_private.sha256_jsonb_cartografico(r.evidencia)
        and r.evidencia->>'bgd_sha256' = v_carga.bgd_sha256
        and (r.evidencia->>'registros_fuente')::bigint =
          (v_version.conteos_esperados->>'COLONIA')::bigint
        and (r.evidencia->>'con_geometria')::bigint = (
          select pg_catalog.count(*)::bigint
          from public.cartografia_colonias c
          where c.cartografia_version_id = v_version_id
        )
        and (r.evidencia->>'sin_geometria')::bigint = (
          select pg_catalog.count(*)::bigint
          from public.cartografia_colonias_sin_geometria c
          where c.cartografia_version_id = v_version_id
        )
        and (r.evidencia->>'registros_fuente')::bigint = (
          select pg_catalog.count(*)::bigint
          from public.cartografia_colonias c
          where c.cartografia_version_id = v_version_id
        ) + (
          select pg_catalog.count(*)::bigint
          from public.cartografia_colonias_sin_geometria c
          where c.cartografia_version_id = v_version_id
        )
        and (r.evidencia->>'registros_fuente')::bigint = (
          select coalesce(pg_catalog.sum(l.insertados), 0)::bigint
          from public.cargas_cartograficas_lotes l
          where l.carga_id = v_carga.carga_id and l.capa = 'COLONIA'
        )
        and not exists (
          select 1
          from public.cartografia_colonias_sin_geometria n
          where n.cartografia_version_id = v_version_id
            and not exists (
              select 1
              from pg_catalog.jsonb_array_elements(
                r.evidencia->'filas_sin_geometria') f
              where (f->>'fila_origen')::bigint = n.fila_origen
                and f->>'id_ine' = n.id_ine
                and f->>'fuente_sha256' = n.fuente_sha256
            )
        )
        and not exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            r.evidencia->'filas_sin_geometria') f
          where not exists (
            select 1
            from public.cartografia_colonias_sin_geometria n
            where n.cartografia_version_id = v_version_id
              and n.fila_origen = (f->>'fila_origen')::bigint
              and n.id_ine = f->>'id_ine'
              and n.fuente_sha256 = f->>'fuente_sha256'
          )
        )
        and not exists (
          select 1
          from public.cartografia_colonias p
          join public.cartografia_colonias_sin_geometria n
            on n.cartografia_version_id = p.cartografia_version_id
           and (n.fila_origen = p.fila_origen
             or (n.clave_entidad = p.clave_entidad and n.id_ine = p.id_ine))
          where p.cartografia_version_id = v_version_id
        )
    ) then
      insert into public.cartografia_incidencias (
        cartografia_version_id, carga_id, severidad, codigo, capa,
        clave_fuente, fila_fuente, clave_idempotencia, detalle
      ) values (
        v_version_id, v_carga.carga_id, 'ERROR',
        'CONTEO_NO_COINCIDE', 'COLONIA', 'COLONIA:COBERTURA', null,
        pg_catalog.repeat('0', 64),
        'Recibo de cobertura, rutas de COLONIA y ledger no coinciden'
      )
      on conflict (cartografia_version_id, clave_idempotencia) do nothing;
    end if;

    -- El recibo de M24 es la expectativa aprobada; el snapshot recompone el
    -- grafo con identidades fuente, nunca con identity IDs de una version.
    v_snapshot := territorial_private.snapshot_cartografia_version(v_version_id);
    if exists (
      select 1
      from public.cartografia_localidades l
      where l.cartografia_version_id = v_version_id
        and (l.atributos_limite_fuente is not null
          or l.fila_limite_origen is not null
          or l.fuente_limite_sha256 is not null
          or l.geom_limite is not null)
    ) or not exists (
      select 1
      from public.cartografia_cobertura_limites_localidad_recibos r
      where r.carga_id = v_carga.carga_id
        and r.cartografia_version_id = v_version_id
        and r.evidencia_sha256 =
          territorial_private.sha256_jsonb_cartografico(r.evidencia)
        and r.evidencia->>'bgd_sha256' = v_carga.bgd_sha256
        and (r.evidencia->'conteos'->>'puntos')::bigint = (
          select pg_catalog.count(*)::bigint
          from public.cartografia_localidades l
          where l.cartografia_version_id = v_version_id
        )
        and (r.evidencia->'conteos'->>'claves_punto_distintas')::bigint = (
          select pg_catalog.count(*)::bigint
          from (
            select l.clave_entidad,l.cartografia_municipio_id,
                   l.clave_localidad_fuente
            from public.cartografia_localidades l
            where l.cartografia_version_id = v_version_id
            group by l.clave_entidad,l.cartografia_municipio_id,
                     l.clave_localidad_fuente
          ) q
        )
        and (r.evidencia->'conteos'->>'grupos_punto_repetidos')::bigint = (
          select pg_catalog.count(*)::bigint
          from (
            select 1
            from public.cartografia_localidades l
            where l.cartografia_version_id = v_version_id
            group by l.clave_entidad,l.cartografia_municipio_id,
                     l.clave_localidad_fuente
            having pg_catalog.count(*) > 1
          ) q
        )
        and (r.evidencia->'conteos'->>'limites')::bigint =
          (v_snapshot->'cobertura_limites_localidad'->>'limites')::bigint
        and (r.evidencia->'conteos'->>'claves_limite_distintas')::bigint = (
          select pg_catalog.count(*)::bigint
          from (
            select l.clave_entidad,l.cartografia_municipio_id,
                   l.clave_localidad_fuente
            from public.cartografia_limites_localidad l
            where l.cartografia_version_id = v_version_id
            group by l.clave_entidad,l.cartografia_municipio_id,
                     l.clave_localidad_fuente
          ) q
        )
        and (r.evidencia->'conteos'->>'geometrias_validas')::bigint =
          (v_snapshot->'cobertura_limites_localidad'->>'limites')::bigint
        and (r.evidencia->'conteos'->>'limites_con_punto')::bigint =
          (v_snapshot->'cobertura_limites_localidad'->>'limites_con_punto')::bigint
        and (r.evidencia->'conteos'->>'limites_sin_punto')::bigint =
          (v_snapshot->'cobertura_limites_localidad'->>'limites_sin_punto')::bigint
        and (r.evidencia->'conteos'->>'limites_un_punto')::bigint =
          (v_snapshot->'cobertura_limites_localidad'->>'limites_un_punto')::bigint
        and (r.evidencia->'conteos'->>'limites_varios_puntos')::bigint =
          (v_snapshot->'cobertura_limites_localidad'->>'limites_varios_puntos')::bigint
        and (r.evidencia->'conteos'->>'relaciones')::bigint =
          (v_snapshot->'cobertura_limites_localidad'->>'relaciones')::bigint
        and r.evidencia->>'relaciones_sha256' =
          v_snapshot->'cobertura_limites_localidad'->>'relaciones_sha256'
        and r.evidencia->>'limites_sin_punto_sha256' =
          v_snapshot->'cobertura_limites_localidad'->>'limites_sin_punto_sha256'
        and r.evidencia->'distribucion'->'vinculados' = (
          select coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'tipo',d.tipo,'cabecera',d.cabecera,'conteo',d.conteo
              ) order by d.tipo,d.cabecera nulls last
            ),
            '[]'::jsonb
          )
          from (
            select l.tipo,l.cabecera,pg_catalog.count(*)::bigint as conteo
            from public.cartografia_limites_localidad l
            where l.cartografia_version_id=v_version_id
              and exists (
                select 1
                from public.cartografia_limites_localidad_puntos x
                where x.cartografia_limite_localidad_id=
                      l.cartografia_limite_localidad_id
              )
            group by l.tipo,l.cabecera
          ) d
        )
        and r.evidencia->'distribucion'->'sin_punto' = (
          select coalesce(
            pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object(
                'tipo',d.tipo,'cabecera',d.cabecera,'conteo',d.conteo
              ) order by d.tipo,d.cabecera nulls last
            ),
            '[]'::jsonb
          )
          from (
            select l.tipo,l.cabecera,pg_catalog.count(*)::bigint as conteo
            from public.cartografia_limites_localidad l
            where l.cartografia_version_id=v_version_id
              and not exists (
                select 1
                from public.cartografia_limites_localidad_puntos x
                where x.cartografia_limite_localidad_id=
                      l.cartografia_limite_localidad_id
              )
            group by l.tipo,l.cabecera
          ) d
        )
        and (v_version.conteos_esperados->>'LOCALIDAD')::bigint =
          (r.evidencia->'conteos'->>'puntos')::bigint
        and (v_version.conteos_esperados->>'LIMITE_LOCALIDAD')::bigint =
          (r.evidencia->'conteos'->>'limites')::bigint
        and (r.evidencia->'conteos'->>'limites')::bigint = (
          select coalesce(pg_catalog.sum(l.insertados),0)::bigint
          from public.cargas_cartograficas_lotes l
          where l.carga_id=v_carga.carga_id
            and l.capa='LIMITE_LOCALIDAD'
        )
    ) then
      insert into public.cartografia_incidencias (
        cartografia_version_id,carga_id,severidad,codigo,capa,
        clave_fuente,fila_fuente,clave_idempotencia,detalle
      ) values (
        v_version_id,v_carga.carga_id,'ERROR','CONTEO_NO_COINCIDE',
        'LIMITE_LOCALIDAD','LIMITE_LOCALIDAD:GRAFO',null,
        territorial_private.sha256_jsonb_cartografico(
          pg_catalog.jsonb_build_object('tipo','LIMITE_LOCALIDAD:GRAFO')
        ),
        'Recibo, grafo de limites y puntos, columnas heredadas o ledger no coinciden'
      )
      on conflict (cartografia_version_id,clave_idempotencia) do nothing;
    end if;

    insert into public.cartografia_incidencias (
      cartografia_version_id, carga_id, severidad, codigo, capa,
      clave_fuente, fila_fuente, clave_idempotencia, detalle
    )
    select v_version_id, v_carga.carga_id, 'ADVERTENCIA',
           'GEOMETRIA_NULA_ORIGEN', 'COLONIA',
           'COLONIA:' || n.id_ine || ':' || n.fuente_sha256 ||
             ':' || r.evidencia_sha256,
           n.fila_origen, pg_catalog.repeat('0', 64),
           pg_catalog.format(
             'Colonia INE sin poligono: fila %s, ID %s, huella %s, recibo %s',
             n.fila_origen, n.id_ine, n.fuente_sha256, r.evidencia_sha256
           )
    from public.cartografia_colonias_sin_geometria n
    join public.cartografia_cobertura_colonias_recibos r
      on r.cartografia_version_id = n.cartografia_version_id
     and r.carga_id = v_carga.carga_id
    where n.cartografia_version_id = v_version_id
    on conflict (cartografia_version_id, clave_idempotencia) do nothing;

    v_procesados := 0;
    update public.validaciones_cartograficas_progreso p
       set fase = 'PADRES', cursor = pg_catalog.jsonb_build_object('cartografia_seccion_id', 0)
     where p.cartografia_version_id = v_version_id;
    v_fase := 'PADRES';

  elsif v_fase = 'PADRES' then
    v_cursor := coalesce((v_progreso.cursor->>'cartografia_seccion_id')::bigint, 0);
    select coalesce(pg_catalog.array_agg(x.cartografia_seccion_id order by x.cartografia_seccion_id), '{}'::bigint[]),
           pg_catalog.count(*), pg_catalog.max(x.cartografia_seccion_id)
      into v_ids, v_procesados, v_ultimo_id
      from (
        select s.cartografia_seccion_id
          from public.cartografia_secciones s
         where s.cartografia_version_id = v_version_id
           and s.cartografia_seccion_id > v_cursor
         order by s.cartografia_seccion_id
         limit p_lote
      ) x;

    with pares as (
      select s.numero seccion, s.fila_origen fila, s.geom seccion_geom,
             'MUNICIPIO'::text dimension, m.geom padre_geom
      from public.cartografia_secciones s
      join public.cartografia_municipios m
        on m.cartografia_municipio_id = s.cartografia_municipio_id
       and m.cartografia_version_id = s.cartografia_version_id
      where s.cartografia_seccion_id = any(v_ids)
      union all
      select s.numero, s.fila_origen, s.geom, 'DISTRITO_LOCAL', d.geom
      from public.cartografia_secciones s
      join public.cartografia_distritos_locales d
        on d.cartografia_distrito_local_id = s.cartografia_distrito_local_id
       and d.cartografia_version_id = s.cartografia_version_id
      where s.cartografia_seccion_id = any(v_ids)
      union all
      select s.numero, s.fila_origen, s.geom, 'DISTRITO_FEDERAL', d.geom
      from public.cartografia_secciones s
      join public.cartografia_distritos_federales d
        on d.cartografia_distrito_federal_id = s.cartografia_distrito_federal_id
       and d.cartografia_version_id = s.cartografia_version_id
      where s.cartografia_seccion_id = any(v_ids)
    ), proyectadas as (
      select p.*,
             extensions.st_transform(p.seccion_geom, 32614) seccion_32614,
             extensions.st_transform(p.padre_geom, 32614) padre_32614
      from pares p
      where not extensions.st_isempty(p.seccion_geom)
        and not extensions.st_isempty(p.padre_geom)
        and extensions.st_isvalid(p.seccion_geom)
        and extensions.st_isvalid(p.padre_geom)
        and extensions.st_srid(p.seccion_geom) = 4326
        and extensions.st_srid(p.padre_geom) = 4326
    ), metricas as (
      select p.*,
             extensions.st_area(extensions.st_difference(p.seccion_32614, p.padre_32614)) area_fuera,
             greatest(1.0, 0.000001 * extensions.st_area(p.seccion_32614)) umbral_fuera,
             extensions.st_distance(
               extensions.st_pointonsurface(p.seccion_32614), p.padre_32614
             ) distancia_punto
      from proyectadas p
    ), anomalias as (
      select m.seccion, m.fila, m.dimension, ''::text sufijo,
             case when m.area_fuera > m.umbral_fuera then 'ERROR' else 'ADVERTENCIA' end severidad,
             pg_catalog.format('Area fuera del padre: %s m2; umbral: %s m2', m.area_fuera, m.umbral_fuera) detalle
      from metricas m where m.area_fuera > 0
      union all
      select m.seccion, m.fila, m.dimension, ':PUNTO',
             case when m.distancia_punto > 1.0 then 'ERROR' else 'ADVERTENCIA' end,
             pg_catalog.format('Punto representativo a %s m del padre', m.distancia_punto)
      from metricas m where m.distancia_punto > 0
    )
    insert into public.cartografia_incidencias (
      cartografia_version_id, carga_id, severidad, codigo, capa,
      clave_fuente, fila_fuente, clave_idempotencia, detalle
    )
    select v_version_id, v_carga.carga_id, a.severidad,
           'PERTENENCIA_ESPACIAL_NO_COINCIDE', 'SECCION',
           'SECCION:' || a.seccion::text || ':' || a.dimension || a.sufijo,
           a.fila, pg_catalog.repeat('0', 64), a.detalle
      from anomalias a
    on conflict (cartografia_version_id, clave_idempotencia) do update
      set severidad = excluded.severidad,
          detalle = excluded.detalle;

    if v_procesados = 0 or not exists (
      select 1 from public.cartografia_secciones s
       where s.cartografia_version_id = v_version_id
         and s.cartografia_seccion_id > coalesce(v_ultimo_id, v_cursor)
    ) then
      update public.validaciones_cartograficas_progreso p
         set fase = 'SOLAPES', cursor = pg_catalog.jsonb_build_object('cartografia_seccion_id', 0)
       where p.cartografia_version_id = v_version_id;
      v_fase := 'SOLAPES';
    else
      update public.validaciones_cartograficas_progreso p
         set cursor = pg_catalog.jsonb_build_object('cartografia_seccion_id', v_ultimo_id)
       where p.cartografia_version_id = v_version_id;
    end if;

  elsif v_fase = 'SOLAPES' then
    v_cursor := coalesce((v_progreso.cursor->>'cartografia_seccion_id')::bigint, 0);
    select coalesce(pg_catalog.array_agg(x.cartografia_seccion_id order by x.cartografia_seccion_id), '{}'::bigint[]),
           pg_catalog.count(*), pg_catalog.max(x.cartografia_seccion_id)
      into v_ids, v_procesados, v_ultimo_id
      from (
        select s.cartografia_seccion_id
          from public.cartografia_secciones s
         where s.cartografia_version_id = v_version_id
           and s.cartografia_seccion_id > v_cursor
         order by s.cartografia_seccion_id
         limit p_lote
      ) x;

    with pares as (
      select a.numero seccion_a, b.numero seccion_b, a.fila_origen fila,
             extensions.st_area(
               extensions.st_intersection(
                 extensions.st_transform(a.geom, 32614),
                 extensions.st_transform(b.geom, 32614)
               )
             ) area_solape
      from public.cartografia_secciones a
      join public.cartografia_secciones b
        on b.cartografia_version_id = a.cartografia_version_id
       and b.cartografia_seccion_id > a.cartografia_seccion_id
       and b.geom operator(extensions.&&) a.geom
       and extensions.st_intersects(b.geom, a.geom)
      where a.cartografia_seccion_id = any(v_ids)
        and extensions.st_isvalid(a.geom) and extensions.st_isvalid(b.geom)
        and not extensions.st_isempty(a.geom) and not extensions.st_isempty(b.geom)
        and extensions.st_srid(a.geom) = 4326 and extensions.st_srid(b.geom) = 4326
    )
    insert into public.cartografia_incidencias (
      cartografia_version_id, carga_id, severidad, codigo, capa,
      clave_fuente, fila_fuente, clave_idempotencia, detalle
    )
    select v_version_id, v_carga.carga_id,
           case when p.area_solape > 1.0 then 'ERROR' else 'ADVERTENCIA' end,
           'SOLAPE_SECCIONES', 'SECCION',
           'SECCION:' || p.seccion_a::text || ':SOLAPE:' || p.seccion_b::text,
           p.fila, pg_catalog.repeat('0', 64),
           pg_catalog.format('Solape entre secciones: %s m2', p.area_solape)
      from pares p where p.area_solape > 0
    on conflict (cartografia_version_id, clave_idempotencia) do update
      set severidad = excluded.severidad,
          detalle = excluded.detalle;

    if v_procesados = 0 or not exists (
      select 1 from public.cartografia_secciones s
       where s.cartografia_version_id = v_version_id
         and s.cartografia_seccion_id > coalesce(v_ultimo_id, v_cursor)
    ) then
      update public.validaciones_cartograficas_progreso p
         set fase = 'COBERTURA', cursor = pg_catalog.jsonb_build_object('cartografia_municipio_id', 0)
       where p.cartografia_version_id = v_version_id;
      v_fase := 'COBERTURA';
    else
      update public.validaciones_cartograficas_progreso p
         set cursor = pg_catalog.jsonb_build_object('cartografia_seccion_id', v_ultimo_id)
       where p.cartografia_version_id = v_version_id;
    end if;

  elsif v_fase = 'COBERTURA' then
    v_cursor := coalesce((v_progreso.cursor->>'cartografia_municipio_id')::bigint, 0);
    select m.cartografia_municipio_id
      into v_ultimo_id
      from public.cartografia_municipios m
     where m.cartografia_version_id = v_version_id
       and m.cartografia_municipio_id > v_cursor
     order by m.cartografia_municipio_id
     limit 1;

    if found then
      v_procesados := 1;
      with metrica as (
        select m.clave_municipio, m.fila_origen,
               extensions.st_area(
                 case when u.secciones_32614 is null then extensions.st_transform(m.geom, 32614)
                      else extensions.st_difference(
                        extensions.st_transform(m.geom, 32614), u.secciones_32614
                      ) end
               ) area_hueco,
               greatest(
                 100.0,
                 0.00001 * extensions.st_area(extensions.st_transform(m.geom, 32614))
               ) umbral_hueco
        from public.cartografia_municipios m
        left join lateral (
          select extensions.st_unaryunion(
                   extensions.st_collect(extensions.st_transform(s.geom, 32614))
                 ) secciones_32614
          from public.cartografia_secciones s
          where s.cartografia_version_id = m.cartografia_version_id
            and s.cartografia_municipio_id = m.cartografia_municipio_id
            and extensions.st_isvalid(s.geom)
            and not extensions.st_isempty(s.geom)
            and extensions.st_srid(s.geom) = 4326
        ) u on true
        where m.cartografia_municipio_id = v_ultimo_id
          and extensions.st_isvalid(m.geom)
          and not extensions.st_isempty(m.geom)
          and extensions.st_srid(m.geom) = 4326
      )
      insert into public.cartografia_incidencias (
        cartografia_version_id, carga_id, severidad, codigo, capa,
        clave_fuente, fila_fuente, clave_idempotencia, detalle
      )
      select v_version_id, v_carga.carga_id,
             case when m.area_hueco > m.umbral_hueco then 'ERROR' else 'ADVERTENCIA' end,
             'HUECO_MUNICIPAL', 'MUNICIPIO',
             'MUNICIPIO:' || m.clave_municipio || ':COBERTURA',
             m.fila_origen, pg_catalog.repeat('0', 64),
             pg_catalog.format('Hueco municipal: %s m2; umbral: %s m2', m.area_hueco, m.umbral_hueco)
        from metrica m where m.area_hueco > 0
      on conflict (cartografia_version_id, clave_idempotencia) do update
        set severidad = excluded.severidad,
            detalle = excluded.detalle;
    end if;

    if v_ultimo_id is null or not exists (
      select 1 from public.cartografia_municipios m
       where m.cartografia_version_id = v_version_id
         and m.cartografia_municipio_id > coalesce(v_ultimo_id, v_cursor)
    ) then
      update public.validaciones_cartograficas_progreso p
         set fase = 'CONTEOS', cursor = '{}'::jsonb
       where p.cartografia_version_id = v_version_id;
      v_fase := 'CONTEOS';
    else
      update public.validaciones_cartograficas_progreso p
         set cursor = pg_catalog.jsonb_build_object('cartografia_municipio_id', v_ultimo_id)
       where p.cartografia_version_id = v_version_id;
    end if;

  elsif v_fase = 'CONTEOS' then
    -- Defensa final: la barrera M13 impide mutaciones normales desde el sello.
    -- Se recalcula una sola vez al cierre para detectar cualquier bypass
    -- administrativo y confirmar tanto el contenido como conteos/maximos.
    v_snapshot := territorial_private.snapshot_cartografia_version(v_version_id);
    v_snapshot_sha256 := pg_catalog.encode(
      extensions.digest(pg_catalog.convert_to(v_snapshot::text, 'UTF8'), 'sha256'),
      'hex'
    );
    if v_snapshot_sha256 is distinct from v_progreso.snapshot_sha256
       or v_snapshot->'conteos' is distinct from v_progreso.conteos_snapshot
       or v_snapshot->'maximos' is distinct from v_progreso.maximos_ids_snapshot then
      raise exception using errcode = '55000', message = 'el sello cartografico no coincide';
    end if;

    with capas(capa) as (
      values ('ENTIDAD'::text), ('MUNICIPIO'), ('DISTRITO_LOCAL'), ('DISTRITO_FEDERAL'),
             ('SECCION'), ('COLONIA'), ('LOCALIDAD'), ('LIMITE_LOCALIDAD')
    ), diferencias as (
      select c.capa,
             v_version.conteos_esperados->>c.capa esperado,
             v_snapshot->'conteos'->>c.capa observado
      from capas c
      where v_version.conteos_esperados->>c.capa is distinct from
            v_snapshot->'conteos'->>c.capa
    )
    insert into public.cartografia_incidencias (
      cartografia_version_id, carga_id, severidad, codigo, capa,
      clave_fuente, fila_fuente, clave_idempotencia, detalle
    )
    select v_version_id, v_carga.carga_id, 'ERROR', 'CONTEO_NO_COINCIDE', d.capa,
           d.capa || ':CONTEO', null, pg_catalog.repeat('0', 64),
           pg_catalog.format('Conteo esperado %s; observado %s',
             coalesce(d.esperado, '<AUSENTE>'),
             coalesce(d.observado, '<AUSENTE>'))
      from diferencias d
    on conflict (cartografia_version_id, clave_idempotencia) do update
      set severidad = excluded.severidad,
          detalle = excluded.detalle;
    v_procesados := 8;
    v_fase := 'COMPLETA';
  else
    raise exception using errcode = '55000', message = 'fase de validacion desconocida';
  end if;

  select pg_catalog.count(*) filter (where i.severidad = 'ERROR'),
         pg_catalog.count(*) filter (where i.severidad = 'ADVERTENCIA')
    into v_errores, v_advertencias
    from public.cartografia_incidencias i
   where i.cartografia_version_id = v_version_id;

  if v_fase = 'COMPLETA' then
    update public.validaciones_cartograficas_progreso p
       set fase = 'COMPLETA', cursor = '{}'::jsonb,
           errores = v_errores, advertencias = v_advertencias,
           completada_at = pg_catalog.clock_timestamp()
     where p.cartografia_version_id = v_version_id;

    if v_errores = 0 then
      update public.cargas_cartograficas c
         set estado = 'COMPLETA', codigo_fallo = null, detalle_fallo = null,
             reanudable = false, finalizada_at = pg_catalog.clock_timestamp()
       where c.carga_id = v_carga.carga_id;
      update public.cartografia_versiones v
         set estado = 'VALIDADA', conteos_validados = v_snapshot->'conteos'
       where v.cartografia_version_id = v_version_id;
    else
      update public.cargas_cartograficas c
         set estado = 'FALLIDA', codigo_fallo = 'VALIDACION_FALLIDA',
             detalle_fallo = pg_catalog.jsonb_build_object(
               'errores', v_errores, 'advertencias', v_advertencias,
               'snapshot_sha256', v_snapshot_sha256
             ),
             reanudable = false, finalizada_at = pg_catalog.clock_timestamp()
       where c.carga_id = v_carga.carga_id;
      update public.cartografia_versiones v
         set estado = 'FALLIDA'
       where v.cartografia_version_id = v_version_id;
    end if;
  else
    update public.validaciones_cartograficas_progreso p
       set errores = v_errores, advertencias = v_advertencias
     where p.cartografia_version_id = v_version_id;
  end if;

  return pg_catalog.jsonb_build_object(
    'cartografia_version_id', v_version_id,
    'completa', (v_fase = 'COMPLETA'),
    'fase', v_fase,
    'cursor', (select p.cursor from public.validaciones_cartograficas_progreso p where p.cartografia_version_id = v_version_id),
    'procesados', v_procesados,
    'errores', v_errores,
    'advertencias', v_advertencias,
    'snapshot_sha256', v_snapshot_sha256
  );
end;
$function$;
alter function territorial_private.snapshot_cartografia_version(bigint) owner to postgres;
alter function public.rpc_validar_version_cartografica_lote(bigint, integer) owner to postgres;
revoke all on function territorial_private.snapshot_cartografia_version(bigint)
  from public, anon, authenticated, service_role;
grant execute on function territorial_private.snapshot_cartografia_version(bigint)
  to service_role;
revoke all on function public.rpc_validar_version_cartografica_lote(bigint, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_validar_version_cartografica_lote(bigint, integer)
  to service_role;
comment on function public.rpc_validar_version_cartografica_lote(bigint, integer) is
  'Valida una version cartografica sellada por fases y lotes acotados.';
commit;
