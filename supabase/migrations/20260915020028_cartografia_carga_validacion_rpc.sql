begin;
-- Borrador acotado para integrar dentro de BEGIN/COMMIT de M16.
-- No contiene el importador de features ni la validacion espacial incremental.

do $$
declare
  v_schema text;
begin
  select n.nspname
    into v_schema
    from pg_catalog.pg_extension e
    join pg_catalog.pg_namespace n on n.oid = e.extnamespace
   where e.extname = 'btree_gist';

  if v_schema is not null and v_schema <> 'extensions' then
    raise exception using
      errcode = '55000',
      message = pg_catalog.format(
        'btree_gist esta instalada en %s; se requiere extensions', v_schema
      );
  end if;
end;
$$;
create extension if not exists btree_gist with schema extensions;
alter table public.cargas_cartograficas
  alter column detalle_fallo type jsonb
  using case
    when detalle_fallo is null then null
    else pg_catalog.jsonb_build_object('legacy_text', detalle_fallo)
  end;
alter table public.cargas_cartograficas
  add constraint cargas_cartograficas_detalle_fallo_objeto_ck check (
    detalle_fallo is null or pg_catalog.jsonb_typeof(detalle_fallo) = 'object'
  );
alter table public.cartografia_incidencias
  drop constraint cartografia_incidencias_codigo_ck;
alter table public.cartografia_incidencias
  add constraint cartografia_incidencias_codigo_ck check (
    codigo in (
      'ARCHIVO_REQUERIDO_AUSENTE', 'HUELLA_INESPERADA', 'CONTEO_NO_COINCIDE',
      'CLAVE_DUPLICADA', 'REFERENCIA_TERRITORIAL_INVALIDA', 'SRID_INESPERADO',
      'GEOMETRIA_VACIA', 'GEOMETRIA_INVALIDA', 'PERTENENCIA_ESPACIAL_NO_COINCIDE',
      'CAPA_MGS_BGD_DIFIERE', 'SECCION_ELECTORAL_SIN_MAPA', 'EQUIVALENCIA_NO_OFICIAL',
      'SOLAPE_SECCIONES', 'HUECO_MUNICIPAL'
    )
  );
create table public.validaciones_cartograficas_progreso (
  cartografia_version_id bigint primary key,
  carga_id bigint not null unique,
  fase text not null default 'ESTRUCTURA',
  cursor jsonb not null default '{}'::jsonb,
  conteos_snapshot jsonb not null default '{}'::jsonb,
  maximos_ids_snapshot jsonb not null default '{}'::jsonb,
  snapshot_sha256 text not null,
  errores bigint not null default 0,
  advertencias bigint not null default 0,
  iniciada_at timestamptz not null default pg_catalog.clock_timestamp(),
  completada_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint validaciones_cartograficas_progreso_carga_version_fk
    foreign key (carga_id, cartografia_version_id)
    references public.cargas_cartograficas(carga_id, cartografia_version_id)
    on delete restrict,
  constraint validaciones_cartograficas_progreso_fase_ck check (
    fase in ('ESTRUCTURA', 'PADRES', 'SOLAPES', 'COBERTURA', 'CONTEOS', 'COMPLETA')
  ),
  constraint validaciones_cartograficas_progreso_cursor_objeto_ck check (
    pg_catalog.jsonb_typeof(cursor) = 'object'
  ),
  constraint validaciones_cartograficas_progreso_conteos_objeto_ck check (
    pg_catalog.jsonb_typeof(conteos_snapshot) = 'object'
  ),
  constraint validaciones_cartograficas_progreso_maximos_objeto_ck check (
    pg_catalog.jsonb_typeof(maximos_ids_snapshot) = 'object'
  ),
  constraint validaciones_cartograficas_progreso_snapshot_sha256_ck check (
    snapshot_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint validaciones_cartograficas_progreso_totales_ck check (
    errores >= 0 and advertencias >= 0
  ),
  constraint validaciones_cartograficas_progreso_completa_ck check (
    (fase = 'COMPLETA' and completada_at is not null)
    or (fase <> 'COMPLETA' and completada_at is null)
  )
);
create table public.cargas_cartograficas_lotes (
  carga_lote_id bigint generated always as identity primary key,
  carga_id bigint not null,
  cartografia_version_id bigint not null,
  capa text not null,
  registro_desde bigint not null,
  registro_hasta bigint not null,
  payload_sha256 text not null,
  recibidos bigint not null,
  insertados bigint not null,
  repetidos bigint not null,
  rechazados bigint not null,
  resultado jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint cargas_cartograficas_lotes_carga_version_fk
    foreign key (carga_id, cartografia_version_id)
    references public.cargas_cartograficas(carga_id, cartografia_version_id)
    on delete restrict,
  constraint cargas_cartograficas_lotes_capa_ck check (
    capa in (
      'ENTIDAD', 'MUNICIPIO', 'DISTRITO_LOCAL', 'DISTRITO_FEDERAL',
      'SECCION', 'COLONIA', 'LOCALIDAD', 'LIMITE_LOCALIDAD'
    )
  ),
  constraint cargas_cartograficas_lotes_rango_ck check (
    registro_desde > 0 and registro_hasta >= registro_desde
  ),
  constraint cargas_cartograficas_lotes_payload_sha256_ck check (
    payload_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint cargas_cartograficas_lotes_conteos_ck check (
    recibidos > 0
    and insertados >= 0
    and repetidos >= 0
    and rechazados >= 0
    and recibidos = insertados + repetidos + rechazados
    and recibidos = registro_hasta - registro_desde + 1
  ),
  constraint cargas_cartograficas_lotes_resultado_objeto_ck check (
    pg_catalog.jsonb_typeof(resultado) = 'object'
  ),
  constraint cargas_cartograficas_lotes_rango_uq unique (
    carga_id, capa, registro_desde, registro_hasta
  ),
  constraint cargas_cartograficas_lotes_rango_excl exclude using gist (
    carga_id with =,
    capa with =,
    int8range(registro_desde, registro_hasta, '[]') with &&
  )
);
create index validaciones_cartograficas_progreso_carga_version_idx
  on public.validaciones_cartograficas_progreso (carga_id, cartografia_version_id);
create index cargas_cartograficas_lotes_carga_version_idx
  on public.cargas_cartograficas_lotes (carga_id, cartografia_version_id);
create index cargas_cartograficas_lotes_version_capa_idx
  on public.cargas_cartograficas_lotes (
    cartografia_version_id, capa, registro_desde, registro_hasta
  );
create trigger validaciones_cartograficas_progreso_set_updated_at
  before update on public.validaciones_cartograficas_progreso
  for each row execute function territorial_private.set_updated_at();
alter table public.validaciones_cartograficas_progreso enable row level security;
alter table public.cargas_cartograficas_lotes enable row level security;
revoke all on table
  public.validaciones_cartograficas_progreso,
  public.cargas_cartograficas_lotes
from public, anon, authenticated, service_role;
grant select, insert, update on table
  public.validaciones_cartograficas_progreso
to service_role;
grant select, insert on table
  public.cargas_cartograficas_lotes
to service_role;
revoke all on sequence public.cargas_cartograficas_lotes_carga_lote_id_seq
from public, anon, authenticated, service_role;
grant usage, select on sequence public.cargas_cartograficas_lotes_carga_lote_id_seq
to service_role;
create function territorial_private.jsonb_tiene_claves_exactas(
  p_valor jsonb,
  p_claves text[]
) returns boolean
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $function$
  select
    pg_catalog.jsonb_typeof(p_valor) = 'object'
    and (
      select pg_catalog.array_agg(k.clave order by k.clave)
      from pg_catalog.jsonb_object_keys(p_valor) as k(clave)
    ) = (
      select pg_catalog.array_agg(c.clave order by c.clave)
      from pg_catalog.unnest(p_claves) as c(clave)
    );
$function$;
create function territorial_private.sha256_jsonb_cartografico(p_valor jsonb)
returns text
language sql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $function$
  select pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(p_valor::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$function$;
create function territorial_private.normalizar_manifiesto_cartografico(
  p_manifiesto jsonb
) returns jsonb
language plpgsql
stable
strict
security invoker
set search_path = ''
as $function$
declare
  v_producto text;
  v_paquete jsonb;
  v_capa jsonb;
  v_capa_nombre text;
  v_politica text;
  v_tipo_geometria text;
  v_registros_numeric numeric;
  v_registros bigint;
  v_componentes jsonb;
  v_componente jsonb;
  v_extension text;
  v_bytes_numeric numeric;
  v_bytes bigint;
  v_registros_declarados_numeric numeric;
  v_registros_declarados bigint;
  v_extensiones text[];
  v_capas_vistas text[] := '{}'::text[];
  v_capas_normalizadas jsonb := '[]'::jsonb;
  v_capas_ordenadas jsonb;
  v_paquetes_normalizados jsonb := '{}'::jsonb;
  v_requerida record;
  v_mgs jsonb;
  v_bgd jsonb;
  v_mgs_componentes jsonb;
  v_bgd_componentes jsonb;
begin
  if territorial_private.jsonb_tiene_claves_exactas(
       p_manifiesto,
       array[
         'schema_version', 'clave_entidad', 'srid_origen',
         'srid_destino', 'packages', 'layers'
       ]::text[]
     ) is not true then
    raise exception using errcode = '22023', message = 'manifiesto con propiedades invalidas';
  end if;

  if pg_catalog.jsonb_typeof(p_manifiesto->'schema_version') <> 'number'
     or p_manifiesto->>'schema_version' <> '1'
     or pg_catalog.jsonb_typeof(p_manifiesto->'clave_entidad') <> 'string'
     or p_manifiesto->>'clave_entidad' <> '15'
     or pg_catalog.jsonb_typeof(p_manifiesto->'srid_origen') <> 'number'
     or p_manifiesto->>'srid_origen' <> '32614'
     or pg_catalog.jsonb_typeof(p_manifiesto->'srid_destino') <> 'number'
     or p_manifiesto->>'srid_destino' <> '4326'
     or pg_catalog.jsonb_typeof(p_manifiesto->'packages') <> 'object'
     or pg_catalog.jsonb_typeof(p_manifiesto->'layers') <> 'array' then
    raise exception using errcode = '22023', message = 'cabecera de manifiesto invalida';
  end if;

  if territorial_private.jsonb_tiene_claves_exactas(
       p_manifiesto->'packages', array['MGS', 'BGD']::text[]
     ) is not true then
    raise exception using errcode = '22023', message = 'packages debe contener exactamente MGS y BGD';
  end if;

  foreach v_producto in array array['MGS', 'BGD']::text[] loop
    v_paquete := p_manifiesto->'packages'->v_producto;

    if territorial_private.jsonb_tiene_claves_exactas(
         v_paquete, array['nombre', 'sha256', 'bytes']::text[]
       ) is not true
       or pg_catalog.jsonb_typeof(v_paquete->'nombre') <> 'string'
       or pg_catalog.btrim(v_paquete->>'nombre') = ''
       or pg_catalog.btrim(v_paquete->>'nombre') <> v_paquete->>'nombre'
       or v_paquete->>'nombre' in ('.', '..')
       or v_paquete->>'nombre' ~ '[/\\]'
       or pg_catalog.lower(v_paquete->>'nombre') !~ '\.zip$'
       or pg_catalog.jsonb_typeof(v_paquete->'sha256') <> 'string'
       or (v_paquete->>'sha256') !~ '^[0-9a-f]{64}$'
       or pg_catalog.jsonb_typeof(v_paquete->'bytes') <> 'number' then
      raise exception using
        errcode = '22023',
        message = pg_catalog.format('paquete %s invalido', v_producto);
    end if;

    v_bytes_numeric := (v_paquete->>'bytes')::numeric;
    if v_bytes_numeric <> pg_catalog.trunc(v_bytes_numeric)
       or v_bytes_numeric <= 0
       or v_bytes_numeric > 9223372036854775807::numeric then
      raise exception using
        errcode = '22023',
        message = pg_catalog.format('bytes invalidos para paquete %s', v_producto);
    end if;
    v_bytes := v_bytes_numeric::bigint;

    v_paquetes_normalizados := v_paquetes_normalizados
      || pg_catalog.jsonb_build_object(
           v_producto,
           pg_catalog.jsonb_build_object(
             'nombre', v_paquete->>'nombre',
             'sha256', v_paquete->>'sha256',
             'bytes', v_bytes
           )
         );
  end loop;

  if pg_catalog.jsonb_array_length(p_manifiesto->'layers') < 13 then
    raise exception using errcode = '22023', message = 'faltan capas requeridas en manifiesto';
  end if;

  for v_capa in
    select l.valor
    from pg_catalog.jsonb_array_elements(p_manifiesto->'layers') as l(valor)
  loop
    if territorial_private.jsonb_tiene_claves_exactas(
         v_capa,
         array[
           'producto', 'capa', 'politica', 'tipo_geometria',
           'registros', 'components'
         ]::text[]
       ) is not true
       or pg_catalog.jsonb_typeof(v_capa->'producto') <> 'string'
       or pg_catalog.jsonb_typeof(v_capa->'capa') <> 'string'
       or pg_catalog.jsonb_typeof(v_capa->'politica') <> 'string'
       or pg_catalog.jsonb_typeof(v_capa->'tipo_geometria') <> 'string'
       or pg_catalog.jsonb_typeof(v_capa->'registros') <> 'number'
       or pg_catalog.jsonb_typeof(v_capa->'components') <> 'array' then
      raise exception using errcode = '22023', message = 'capa de manifiesto invalida';
    end if;

    v_producto := v_capa->>'producto';
    v_capa_nombre := v_capa->>'capa';
    v_politica := v_capa->>'politica';
    v_tipo_geometria := v_capa->>'tipo_geometria';

    if v_producto not in ('MGS', 'BGD')
       or v_capa_nombre !~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'
       or v_tipo_geometria not in (
         'Point', 'MultiPoint', 'LineString', 'MultiLineString',
         'Polygon', 'MultiPolygon'
       ) then
      raise exception using errcode = '22023', message = 'enum o nombre de capa invalido';
    end if;

    if v_producto = 'MGS' then
      if v_capa_nombre not in (
           'ENTIDAD', 'MUNICIPIO', 'DISTRITO_LOCAL', 'DISTRITO_FEDERAL', 'SECCION'
         )
         or v_politica <> 'CARGAR' then
        raise exception using errcode = '22023', message = 'capa o politica MGS invalida';
      end if;
    elsif v_capa_nombre in (
      'ENTIDAD', 'MUNICIPIO', 'DISTRITO_LOCAL', 'DISTRITO_FEDERAL', 'SECCION'
    ) then
      if v_politica <> 'VERIFICAR_DUPLICADA' then
        raise exception using errcode = '22023', message = 'politica duplicada BGD invalida';
      end if;
    elsif v_capa_nombre in ('COLONIA', 'LOCALIDAD', 'LIMITE_LOCALIDAD') then
      if v_politica <> 'CARGAR' then
        raise exception using errcode = '22023', message = 'politica contextual BGD invalida';
      end if;
    elsif v_politica <> 'DIFERIR' then
      raise exception using errcode = '22023', message = 'una capa BGD adicional debe diferirse';
    end if;

    if (
      v_capa_nombre = 'LOCALIDAD'
      and v_tipo_geometria <> 'Point'
    ) or (
      v_capa_nombre in (
        'ENTIDAD', 'MUNICIPIO', 'DISTRITO_LOCAL', 'DISTRITO_FEDERAL',
        'SECCION', 'COLONIA', 'LIMITE_LOCALIDAD'
      )
      and v_tipo_geometria <> 'MultiPolygon'
    ) then
      raise exception using errcode = '22023', message = 'tipo de geometria incompatible con la capa';
    end if;

    if (v_producto || pg_catalog.chr(31) || v_capa_nombre) = any(v_capas_vistas) then
      raise exception using errcode = '22023', message = 'capa duplicada en manifiesto';
    end if;
    v_capas_vistas := pg_catalog.array_append(
      v_capas_vistas, v_producto || pg_catalog.chr(31) || v_capa_nombre
    );

    v_registros_numeric := (v_capa->>'registros')::numeric;
    if v_registros_numeric <> pg_catalog.trunc(v_registros_numeric)
       or v_registros_numeric < 0
       or v_registros_numeric > 9223372036854775807::numeric then
      raise exception using errcode = '22023', message = 'conteo de capa invalido';
    end if;
    v_registros := v_registros_numeric::bigint;

    if (
         (v_producto = 'MGS' or v_capa_nombre in (
           'ENTIDAD', 'MUNICIPIO', 'DISTRITO_LOCAL', 'DISTRITO_FEDERAL', 'SECCION'
         ))
         and pg_catalog.jsonb_array_length(v_capa->'components') <> 5
       ) or (
         v_producto = 'BGD'
         and v_capa_nombre not in (
           'ENTIDAD', 'MUNICIPIO', 'DISTRITO_LOCAL', 'DISTRITO_FEDERAL', 'SECCION'
         )
         and pg_catalog.jsonb_array_length(v_capa->'components') not in (4, 5)
       ) then
      raise exception using
        errcode = '22023',
        message = 'cantidad de componentes incompatible con producto y capa';
    end if;

    v_extensiones := '{}'::text[];
    v_componentes := '[]'::jsonb;

    for v_componente in
      select c.valor
      from pg_catalog.jsonb_array_elements(v_capa->'components') as c(valor)
    loop
      if territorial_private.jsonb_tiene_claves_exactas(
           v_componente,
           array[
             'extension', 'nombre', 'sha256', 'bytes', 'registros_declarados'
           ]::text[]
         ) is not true
         or pg_catalog.jsonb_typeof(v_componente->'extension') <> 'string'
         or pg_catalog.jsonb_typeof(v_componente->'nombre') <> 'string'
         or pg_catalog.btrim(v_componente->>'nombre') = ''
         or pg_catalog.btrim(v_componente->>'nombre') <> v_componente->>'nombre'
         or v_componente->>'nombre' in ('.', '..')
         or v_componente->>'nombre' ~ '[/\\]'
         or pg_catalog.jsonb_typeof(v_componente->'sha256') <> 'string'
         or (v_componente->>'sha256') !~ '^[0-9a-f]{64}$'
         or pg_catalog.jsonb_typeof(v_componente->'bytes') <> 'number' then
        raise exception using errcode = '22023', message = 'componente de manifiesto invalido';
      end if;

      v_extension := v_componente->>'extension';
      if v_extension not in ('shp', 'shx', 'dbf', 'prj', 'cpg')
         or v_extension = any(v_extensiones)
         or pg_catalog.lower(v_componente->>'nombre')
              not like ('%.' || v_extension) then
        raise exception using errcode = '22023', message = 'extension ausente o duplicada';
      end if;
      v_extensiones := pg_catalog.array_append(v_extensiones, v_extension);

      v_bytes_numeric := (v_componente->>'bytes')::numeric;
      if v_bytes_numeric <> pg_catalog.trunc(v_bytes_numeric)
         or v_bytes_numeric <= 0
         or v_bytes_numeric > 9223372036854775807::numeric then
        raise exception using errcode = '22023', message = 'bytes de componente invalidos';
      end if;
      v_bytes := v_bytes_numeric::bigint;

      if v_extension in ('shp', 'shx', 'dbf') then
        if pg_catalog.jsonb_typeof(v_componente->'registros_declarados') <> 'number' then
          raise exception using errcode = '22023', message = 'conteo de componente ausente';
        end if;
        v_registros_declarados_numeric := (v_componente->>'registros_declarados')::numeric;
        if v_registros_declarados_numeric <> pg_catalog.trunc(v_registros_declarados_numeric)
           or v_registros_declarados_numeric < 0
           or v_registros_declarados_numeric > 9223372036854775807::numeric then
          raise exception using errcode = '22023', message = 'conteo de componente invalido';
        end if;
        v_registros_declarados := v_registros_declarados_numeric::bigint;
        if v_registros_declarados <> v_registros then
          raise exception using errcode = '22023', message = 'conteos SHP SHX DBF no coinciden';
        end if;
      else
        if pg_catalog.jsonb_typeof(v_componente->'registros_declarados') <> 'null' then
          raise exception using errcode = '22023', message = 'PRJ y CPG no declaran registros';
        end if;
        v_registros_declarados := null;
      end if;

      v_componentes := v_componentes || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'extension', v_extension,
          'nombre', v_componente->>'nombre',
          'sha256', v_componente->>'sha256',
          'bytes', v_bytes,
          'registros_declarados', v_registros_declarados
        )
      );
    end loop;

    if not (
      v_extensiones @> array['shp', 'shx', 'dbf', 'prj']::text[]
      and v_extensiones <@ array['shp', 'shx', 'dbf', 'prj', 'cpg']::text[]
      and (
        (
          v_producto = 'BGD'
          and v_capa_nombre not in (
            'ENTIDAD', 'MUNICIPIO', 'DISTRITO_LOCAL',
            'DISTRITO_FEDERAL', 'SECCION'
          )
        )
        or v_extensiones @> array['cpg']::text[]
      )
    ) then
      raise exception using errcode = '22023', message = 'juego de componentes incompleto';
    end if;

    select pg_catalog.jsonb_agg(c.valor order by c.valor->>'extension')
      into v_componentes
    from pg_catalog.jsonb_array_elements(v_componentes) as c(valor);

    v_capas_normalizadas := v_capas_normalizadas || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'producto', v_producto,
        'capa', v_capa_nombre,
        'politica', v_politica,
        'tipo_geometria', v_tipo_geometria,
        'registros', v_registros,
        'components', v_componentes
      )
    );
  end loop;

  for v_requerida in
    select r.producto, r.capa
    from (values
      ('MGS', 'ENTIDAD'), ('MGS', 'MUNICIPIO'),
      ('MGS', 'DISTRITO_LOCAL'), ('MGS', 'DISTRITO_FEDERAL'), ('MGS', 'SECCION'),
      ('BGD', 'ENTIDAD'), ('BGD', 'MUNICIPIO'),
      ('BGD', 'DISTRITO_LOCAL'), ('BGD', 'DISTRITO_FEDERAL'), ('BGD', 'SECCION'),
      ('BGD', 'COLONIA'), ('BGD', 'LOCALIDAD'), ('BGD', 'LIMITE_LOCALIDAD')
    ) as r(producto, capa)
  loop
    if not (
      v_requerida.producto || pg_catalog.chr(31) || v_requerida.capa
      = any(v_capas_vistas)
    ) then
      raise exception using
        errcode = '22023',
        message = pg_catalog.format(
          'falta capa requerida %s/%s', v_requerida.producto, v_requerida.capa
        );
    end if;
  end loop;

  foreach v_capa_nombre in array array[
    'ENTIDAD', 'MUNICIPIO', 'DISTRITO_LOCAL', 'DISTRITO_FEDERAL', 'SECCION'
  ]::text[] loop
    select l.valor into v_mgs
    from pg_catalog.jsonb_array_elements(v_capas_normalizadas) as l(valor)
    where l.valor->>'producto' = 'MGS'
      and l.valor->>'capa' = v_capa_nombre;

    select l.valor into v_bgd
    from pg_catalog.jsonb_array_elements(v_capas_normalizadas) as l(valor)
    where l.valor->>'producto' = 'BGD'
      and l.valor->>'capa' = v_capa_nombre;

    select pg_catalog.jsonb_object_agg(
             c.valor->>'extension',
             pg_catalog.jsonb_build_object(
               'sha256', c.valor->>'sha256',
               'bytes', c.valor->'bytes',
               'registros_declarados', c.valor->'registros_declarados'
             )
           )
      into v_mgs_componentes
    from pg_catalog.jsonb_array_elements(v_mgs->'components') as c(valor);

    select pg_catalog.jsonb_object_agg(
             c.valor->>'extension',
             pg_catalog.jsonb_build_object(
               'sha256', c.valor->>'sha256',
               'bytes', c.valor->'bytes',
               'registros_declarados', c.valor->'registros_declarados'
             )
           )
      into v_bgd_componentes
    from pg_catalog.jsonb_array_elements(v_bgd->'components') as c(valor);

    if v_mgs->'registros' is distinct from v_bgd->'registros'
       or v_mgs->>'tipo_geometria' is distinct from v_bgd->>'tipo_geometria'
       or v_mgs_componentes is distinct from v_bgd_componentes then
      raise exception using
        errcode = '22023',
        message = pg_catalog.format('capa MGS/BGD difiere: %s', v_capa_nombre);
    end if;
  end loop;

  select pg_catalog.jsonb_agg(
           l.valor order by l.valor->>'producto', l.valor->>'capa'
         )
    into v_capas_ordenadas
  from pg_catalog.jsonb_array_elements(v_capas_normalizadas) as l(valor);

  return pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'clave_entidad', '15',
    'srid_origen', 32614,
    'srid_destino', 4326,
    'packages', v_paquetes_normalizados,
    'layers', v_capas_ordenadas
  );
end;
$function$;
create function public.rpc_iniciar_carga_cartografica(
  p_clave_version text,
  p_nombre_version text,
  p_fecha_publicacion_esperada date,
  p_mgs_sha256 text,
  p_bgd_sha256 text,
  p_manifiesto jsonb
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_manifiesto jsonb;
  v_manifiesto_sha256 text;
  v_conteos_esperados jsonb;
  v_version public.cartografia_versiones%rowtype;
  v_carga public.cargas_cartograficas%rowtype;
  v_version_existia boolean := false;
begin
  if p_clave_version is null
     or p_nombre_version is null
     or p_mgs_sha256 is null
     or p_bgd_sha256 is null
     or p_manifiesto is null then
    raise exception using errcode = '22004', message = 'los parametros obligatorios no pueden ser nulos';
  end if;

  if p_clave_version !~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'
     or pg_catalog.btrim(p_nombre_version) = ''
     or p_mgs_sha256 !~ '^[0-9a-f]{64}$'
     or p_bgd_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'clave, nombre o hashes invalidos';
  end if;

  v_manifiesto := territorial_private.normalizar_manifiesto_cartografico(p_manifiesto);

  if v_manifiesto->'packages'->'MGS'->>'sha256' <> p_mgs_sha256
     or v_manifiesto->'packages'->'BGD'->>'sha256' <> p_bgd_sha256 then
    raise exception using errcode = '22023', message = 'los hashes de packages no coinciden con los parametros';
  end if;

  v_manifiesto_sha256 := territorial_private.sha256_jsonb_cartografico(v_manifiesto);

  select coalesce(
           pg_catalog.jsonb_object_agg(l.valor->>'capa', l.valor->'registros'),
           '{}'::jsonb
         )
    into v_conteos_esperados
  from pg_catalog.jsonb_array_elements(v_manifiesto->'layers') as l(valor)
  where l.valor->>'politica' = 'CARGAR';

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('SIPEEM:CARTOGRAFIA:CLAVE:' || p_clave_version, 0)
  );

  select v.* into v_version
  from public.cartografia_versiones as v
  where v.clave = p_clave_version;

  if found then
    v_version_existia := true;
  else
    insert into public.cartografia_versiones (
      clave,
      nombre,
      proveedor,
      clave_entidad,
      estado,
      fecha_corte,
      fecha_publicacion_esperada,
      recibida_at,
      srid_origen,
      srid_destino,
      conteos_esperados,
      metadata
    ) values (
      p_clave_version,
      p_nombre_version,
      'INE',
      v_manifiesto->>'clave_entidad',
      'PREPARADA',
      null,
      p_fecha_publicacion_esperada,
      pg_catalog.clock_timestamp(),
      (v_manifiesto->>'srid_origen')::integer,
      (v_manifiesto->>'srid_destino')::integer,
      v_conteos_esperados,
      pg_catalog.jsonb_build_object(
        'manifiesto_schema_version', v_manifiesto->'schema_version',
        'packages', v_manifiesto->'packages'
      )
    )
    returning * into v_version;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('SIPEEM:CARTOGRAFIA:VERSION:' ||
      v_version.cartografia_version_id::text, 0)
  );

  select v.* into strict v_version
  from public.cartografia_versiones as v
  where v.cartografia_version_id = v_version.cartografia_version_id
  for update;

  if v_version_existia then
    if v_version.nombre is distinct from p_nombre_version
       or v_version.proveedor is distinct from 'INE'
       or v_version.clave_entidad is distinct from v_manifiesto->>'clave_entidad'
       or v_version.fecha_publicacion_esperada is distinct from p_fecha_publicacion_esperada
       or v_version.srid_origen is distinct from (v_manifiesto->>'srid_origen')::integer
       or v_version.srid_destino is distinct from (v_manifiesto->>'srid_destino')::integer
       or v_version.conteos_esperados is distinct from v_conteos_esperados then
      raise exception using errcode = '23505', message = 'la clave de version ya existe con otro contrato';
    end if;

    select c.* into v_carga
    from public.cargas_cartograficas as c
    where c.cartografia_version_id = v_version.cartografia_version_id
    for update;

    if not found then
      raise exception using errcode = '55000', message = 'la version existente no tiene carga canonica';
    end if;

    if v_carga.mgs_sha256 is distinct from p_mgs_sha256
       or v_carga.bgd_sha256 is distinct from p_bgd_sha256
       or v_carga.manifiesto_sha256 is distinct from v_manifiesto_sha256 then
      raise exception using errcode = '23505', message = 'la clave de version ya existe con otra huella';
    end if;

    if v_version.estado = 'FALLIDA' and v_carga.estado = 'FALLIDA' then
      if v_carga.reanudable is not true then
        raise exception using errcode = '55000', message = 'la carga fallida no es reanudable';
      end if;

      update public.cargas_cartograficas
      set estado = 'CARGANDO',
          codigo_fallo = null,
          detalle_fallo = null,
          reanudable = true,
          iniciada_at = coalesce(iniciada_at, pg_catalog.clock_timestamp()),
          finalizada_at = null
      where carga_id = v_carga.carga_id
      returning * into v_carga;

      update public.cartografia_versiones
      set estado = 'CARGANDO'
      where cartografia_version_id = v_version.cartografia_version_id
      returning * into v_version;
    elsif not (
      (v_version.estado = 'PREPARADA' and v_carga.estado = 'PREPARADA')
      or (v_version.estado = 'CARGANDO' and v_carga.estado = 'CARGANDO')
    ) then
      raise exception using errcode = '55000', message = 'estado incompatible para iniciar o reanudar';
    end if;
  else
    insert into public.cargas_cartograficas (
      cartografia_version_id,
      estado,
      mgs_sha256,
      bgd_sha256,
      manifiesto_sha256,
      reanudable
    ) values (
      v_version.cartografia_version_id,
      'PREPARADA',
      p_mgs_sha256,
      p_bgd_sha256,
      v_manifiesto_sha256,
      false
    )
    returning * into v_carga;

    insert into public.cartografia_archivos (
      cartografia_version_id,
      producto,
      capa,
      nombre,
      extension,
      sha256,
      bytes,
      registros_declarados,
      tipo_geometria,
      proyeccion,
      metadata
    )
    select
      v_version.cartografia_version_id,
      l.valor->>'producto',
      l.valor->>'capa',
      c.valor->>'nombre',
      c.valor->>'extension',
      c.valor->>'sha256',
      (c.valor->>'bytes')::bigint,
      case
        when pg_catalog.jsonb_typeof(c.valor->'registros_declarados') = 'null' then null
        else (c.valor->>'registros_declarados')::bigint
      end,
      l.valor->>'tipo_geometria',
      'EPSG:' || (v_manifiesto->>'srid_origen'),
      pg_catalog.jsonb_build_object(
        'schema_version', v_manifiesto->'schema_version',
        'politica', l.valor->'politica',
        'registros', l.valor->'registros',
        'package_nombre', v_manifiesto->'packages'->(l.valor->>'producto')->'nombre',
        'package_sha256', v_manifiesto->'packages'->(l.valor->>'producto')->'sha256',
        'package_bytes', v_manifiesto->'packages'->(l.valor->>'producto')->'bytes',
        'cpg_presente', exists (
          select 1
            from pg_catalog.jsonb_array_elements(l.valor->'components') as ec(valor)
           where ec.valor->>'extension' = 'cpg'
        ),
        'codificacion_evidencia', case
          when exists (
            select 1
              from pg_catalog.jsonb_array_elements(l.valor->'components') as ec(valor)
             where ec.valor->>'extension' = 'cpg'
          ) then 'CPG'
          else 'DBF_LDID_O_CONFIGURACION_EXPLICITA'
        end
      )
    from pg_catalog.jsonb_array_elements(v_manifiesto->'layers') as l(valor)
    cross join lateral pg_catalog.jsonb_array_elements(l.valor->'components') as c(valor);
  end if;

  return pg_catalog.jsonb_build_object(
    'cartografia_version_id', v_version.cartografia_version_id,
    'carga_id', v_carga.carga_id,
    'reanudada', v_version_existia,
    'reanudable', v_carga.reanudable,
    'estado_version', v_version.estado,
    'estado_carga', v_carga.estado,
    'capa_actual', v_carga.capa_actual,
    'registro_confirmado', v_carga.cursor_confirmado
  );
end;
$function$;
create function public.rpc_marcar_carga_cartografica_fallida(
  p_carga_id bigint,
  p_codigo text,
  p_detalle jsonb
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_cartografia_version_id bigint;
  v_version public.cartografia_versiones%rowtype;
  v_carga public.cargas_cartograficas%rowtype;
  v_reanudable boolean;
begin
  if p_carga_id is null or p_codigo is null or p_detalle is null then
    raise exception using errcode = '22004', message = 'carga, codigo y detalle son obligatorios';
  end if;

  if pg_catalog.jsonb_typeof(p_detalle) <> 'object' then
    raise exception using errcode = '22023', message = 'detalle debe ser un objeto JSON';
  end if;

  if p_codigo in ('HTTP_TRANSITORIO', 'TIMEOUT_TRANSITORIO', 'CONEXION_INTERRUMPIDA') then
    v_reanudable := true;
  elsif p_codigo in (
    'RESPUESTA_INVALIDA', 'CONFLICTO_HASH', 'FUENTE_INVALIDA', 'VALIDACION_FALLIDA'
  ) then
    v_reanudable := false;
  else
    raise exception using errcode = '22023', message = 'codigo de fallo desconocido';
  end if;

  select c.cartografia_version_id into v_cartografia_version_id
  from public.cargas_cartograficas as c
  where c.carga_id = p_carga_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'carga cartografica inexistente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('SIPEEM:CARTOGRAFIA:VERSION:' ||
      v_cartografia_version_id::text, 0)
  );

  select v.* into strict v_version
  from public.cartografia_versiones as v
  where v.cartografia_version_id = v_cartografia_version_id
  for update;

  select c.* into v_carga
  from public.cargas_cartograficas as c
  where c.carga_id = p_carga_id
    and c.cartografia_version_id = v_cartografia_version_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'carga cartografica inexistente';
  end if;

  if v_carga.estado = 'VALIDANDO' and p_codigo <> 'VALIDACION_FALLIDA' then
    raise exception using
      errcode = '55000',
      message = 'una carga sellada en validacion solo admite VALIDACION_FALLIDA';
  end if;

  if v_carga.estado = 'FALLIDA' then
    if v_version.estado <> 'FALLIDA'
       or v_carga.codigo_fallo is distinct from p_codigo
       or v_carga.detalle_fallo is distinct from p_detalle
       or v_carga.reanudable is distinct from v_reanudable then
      raise exception using errcode = '55000', message = 'la carga ya fue sellada con otro fallo';
    end if;
  elsif v_carga.estado not in ('PREPARADA', 'CARGANDO', 'VALIDANDO')
        or v_version.estado not in ('PREPARADA', 'CARGANDO') then
    raise exception using errcode = '55000', message = 'estado incompatible para marcar fallo';
  else
    update public.cargas_cartograficas
    set estado = 'FALLIDA',
        codigo_fallo = p_codigo,
        detalle_fallo = p_detalle,
        reanudable = v_reanudable,
        finalizada_at = pg_catalog.clock_timestamp()
    where carga_id = p_carga_id
    returning * into v_carga;

    update public.cartografia_versiones
    set estado = 'FALLIDA'
    where cartografia_version_id = v_cartografia_version_id
    returning * into v_version;
  end if;

  return pg_catalog.jsonb_build_object(
    'carga_id', v_carga.carga_id,
    'estado', v_carga.estado,
    'reanudable', v_carga.reanudable,
    'registro_confirmado', v_carga.cursor_confirmado
  );
end;
$function$;
create function public.rpc_justificar_incidencia_cartografica(
  p_incidencia_id bigint,
  p_justificacion text
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_cartografia_version_id bigint;
  v_carga_id bigint;
  v_incidencia public.cartografia_incidencias%rowtype;
  v_actor uuid;
  v_rol_base text := current_user;
  v_sujeto_jwt text;
begin
  if p_incidencia_id is null or p_justificacion is null then
    raise exception using errcode = '22004', message = 'incidencia y justificacion son obligatorias';
  end if;
  if pg_catalog.btrim(p_justificacion) = '' then
    raise exception using errcode = '22023', message = 'la justificacion no puede estar vacia';
  end if;

  select i.cartografia_version_id, i.carga_id
    into v_cartografia_version_id, v_carga_id
  from public.cartografia_incidencias as i
  where i.cartografia_incidencia_id = p_incidencia_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'incidencia cartografica inexistente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('SIPEEM:CARTOGRAFIA:VERSION:' ||
      v_cartografia_version_id::text, 0)
  );

  perform 1
  from public.cartografia_versiones as v
  where v.cartografia_version_id = v_cartografia_version_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'version cartografica inexistente';
  end if;

  if v_carga_id is not null then
    perform 1
    from public.cargas_cartograficas as c
    where c.carga_id = v_carga_id
      and c.cartografia_version_id = v_cartografia_version_id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'carga cartografica inexistente';
    end if;
  end if;

  select i.* into v_incidencia
  from public.cartografia_incidencias as i
  where i.cartografia_incidencia_id = p_incidencia_id
    and i.cartografia_version_id = v_cartografia_version_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'incidencia cartografica inexistente';
  end if;

  if v_incidencia.severidad <> 'ADVERTENCIA' then
    raise exception using errcode = '55000', message = 'una incidencia ERROR no puede justificarse';
  end if;

  if v_incidencia.resolucion is not null then
    if v_incidencia.resolucion <> 'JUSTIFICADA'
       or v_incidencia.justificacion is distinct from pg_catalog.btrim(p_justificacion) then
      raise exception using errcode = '55000', message = 'la incidencia ya tiene otra resolucion';
    end if;
  else
    v_actor := coalesce(
      (select auth.uid()),
      '00000000-0000-0000-0000-000000000000'::uuid
    );
    v_sujeto_jwt := nullif(
      pg_catalog.current_setting('request.jwt.claim.sub', true),
      ''
    );

    update public.cartografia_incidencias
    set justificacion = pg_catalog.btrim(p_justificacion),
        resuelta_at = pg_catalog.clock_timestamp(),
        resuelta_por = v_actor,
        resolucion = 'JUSTIFICADA'
    where cartografia_incidencia_id = p_incidencia_id
    returning * into v_incidencia;

    insert into public.cartografia_versiones_bitacora (
      cartografia_version_id,
      carga_id,
      evento,
      estado_anterior,
      estado_nuevo,
      detalle,
      actor_id
    ) values (
      v_incidencia.cartografia_version_id,
      v_incidencia.carga_id,
      'INCIDENCIA_JUSTIFICADA',
      null,
      null,
      pg_catalog.jsonb_build_object(
        'incidencia_id', v_incidencia.cartografia_incidencia_id,
        'codigo', v_incidencia.codigo,
        'severidad', v_incidencia.severidad,
        'rol_base_datos', v_rol_base,
        'sujeto_jwt', v_sujeto_jwt
      ),
      v_actor
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'incidencia_id', v_incidencia.cartografia_incidencia_id,
    'justificada', true,
    'justificada_at', v_incidencia.resuelta_at
  );
end;
$function$;
create function public.rpc_obtener_estado_carga_cartografica(
  p_clave_version text
) returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare
  v_resultado jsonb;
begin
  if p_clave_version is null then
    raise exception using errcode = '22004', message = 'la clave de version es obligatoria';
  end if;
  if p_clave_version !~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'clave de version invalida';
  end if;

  select pg_catalog.jsonb_build_object(
           'version', pg_catalog.jsonb_build_object(
             'cartografia_version_id', v.cartografia_version_id,
             'clave', v.clave,
             'estado', v.estado,
             'es_predeterminada', v.es_predeterminada
           ),
           'carga', (
             select pg_catalog.jsonb_build_object(
                      'carga_id', c.carga_id,
                      'estado', c.estado,
                      'reanudable', c.reanudable,
                      'capa_actual', c.capa_actual,
                      'registro_confirmado', c.cursor_confirmado,
                      'hashes', pg_catalog.jsonb_build_object(
                        'mgs_sha256', c.mgs_sha256,
                        'bgd_sha256', c.bgd_sha256,
                        'manifiesto_sha256', c.manifiesto_sha256
                      ),
                      'conteos', pg_catalog.jsonb_build_object(
                        'recibidos', c.recibidos,
                        'insertados', c.insertados,
                        'repetidos', c.repetidos,
                        'rechazados', c.rechazados
                      )
                    )
             from public.cargas_cartograficas as c
             where c.cartografia_version_id = v.cartografia_version_id
           ),
           'validacion', (
             select pg_catalog.jsonb_build_object(
                      'fase', p.fase,
                      'cursor', p.cursor,
                      'completa', p.fase = 'COMPLETA',
                      'snapshot_sha256', p.snapshot_sha256
                    )
             from public.validaciones_cartograficas_progreso as p
             where p.cartografia_version_id = v.cartografia_version_id
           )
         )
    into v_resultado
  from public.cartografia_versiones as v
  where v.clave = p_clave_version;

  return coalesce(
    v_resultado,
    '{"version":null,"carga":null,"validacion":null}'::jsonb
  );
end;
$function$;
revoke all on function
  territorial_private.jsonb_tiene_claves_exactas(jsonb, text[]),
  territorial_private.sha256_jsonb_cartografico(jsonb),
  territorial_private.normalizar_manifiesto_cartografico(jsonb)
from public, anon, authenticated, service_role;
grant execute on function
  territorial_private.jsonb_tiene_claves_exactas(jsonb, text[]),
  territorial_private.sha256_jsonb_cartografico(jsonb),
  territorial_private.normalizar_manifiesto_cartografico(jsonb)
to service_role;
revoke all on function
  public.rpc_iniciar_carga_cartografica(text, text, date, text, text, jsonb),
  public.rpc_marcar_carga_cartografica_fallida(bigint, text, jsonb),
  public.rpc_justificar_incidencia_cartografica(bigint, text),
  public.rpc_obtener_estado_carga_cartografica(text)
from public, anon, authenticated, service_role;
grant execute on function
  public.rpc_iniciar_carga_cartografica(text, text, date, text, text, jsonb),
  public.rpc_marcar_carga_cartografica_fallida(bigint, text, jsonb),
  public.rpc_justificar_incidencia_cartografica(bigint, text),
  public.rpc_obtener_estado_carga_cartografica(text)
to service_role;
comment on table public.validaciones_cartograficas_progreso is
  'Checkpoint sellado y reanudable de la validacion espacial por version cartografica.';
comment on table public.cargas_cartograficas_lotes is
  'Ledger idempotente de rangos de carga cartografica confirmados atomicamente.';
comment on function territorial_private.jsonb_tiene_claves_exactas(jsonb, text[]) is
  'Comprueba la forma cerrada de un objeto JSONB sin aceptar propiedades adicionales.';
comment on function territorial_private.sha256_jsonb_cartografico(jsonb) is
  'Calcula SHA-256 hexadecimal sobre la representacion JSONB canonica UTF-8.';
comment on function territorial_private.normalizar_manifiesto_cartografico(jsonb) is
  'Valida el manifiesto cerrado y ordena capas y componentes para una huella estable.';
comment on function public.rpc_iniciar_carga_cartografica(text, text, date, text, text, jsonb) is
  'Crea o reanuda de forma idempotente la version y carga canonica despues de validar el manifiesto.';
comment on function public.rpc_marcar_carga_cartografica_fallida(bigint, text, jsonb) is
  'Sella una carga como FALLIDA y clasifica de forma cerrada si puede reanudarse.';
comment on function public.rpc_justificar_incidencia_cartografica(bigint, text) is
  'Justifica una ADVERTENCIA cartografica y registra actor, rol y sujeto JWT en bitacora.';
comment on function public.rpc_obtener_estado_carga_cartografica(text) is
  'Devuelve version, carga y checkpoint de validacion; una clave ausente produce tres nodos nulos.';
-- Task 5 / M16 - componente aislado de importacion cartografica.
--
-- Borrador para integrar dentro de
-- supabase/migrations/20260915020028_cartografia_carga_validacion_rpc.sql.
-- No es una migracion autonoma: el bloque de control M16 debe crear antes
-- public.cargas_cartograficas_lotes y los helpers canonicos
-- territorial_private.sha256_jsonb_cartografico(jsonb) y
-- territorial_private.normalizar_manifiesto_cartografico(jsonb).

create function territorial_private.importar_objeto_tiene_claves_exactas(
  p_objeto jsonb,
  p_claves text[]
) returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case
    when pg_catalog.jsonb_typeof(p_objeto) <> 'object' then false
    else (
      select coalesce(pg_catalog.array_agg(k.clave order by k.clave), '{}'::text[])
      from pg_catalog.jsonb_object_keys(p_objeto) as k(clave)
    ) = (
      select coalesce(pg_catalog.array_agg(c.clave order by c.clave), '{}'::text[])
      from pg_catalog.unnest(p_claves) as c(clave)
    )
  end;
$function$;
create function territorial_private.importar_orden_capa_cartografica(
  p_capa text
) returns integer
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case p_capa
    when 'ENTIDAD' then 1
    when 'MUNICIPIO' then 2
    when 'DISTRITO_LOCAL' then 3
    when 'DISTRITO_FEDERAL' then 4
    when 'SECCION' then 5
    when 'COLONIA' then 6
    when 'LOCALIDAD' then 7
    when 'LIMITE_LOCALIDAD' then 8
    else null
  end;
$function$;
create function territorial_private.importar_clave_entero_positivo_valido(
  p_clave jsonb,
  p_campo text,
  p_maximo bigint
) returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case
    when pg_catalog.jsonb_typeof(p_clave -> p_campo) not in ('string', 'number') then false
    when (p_clave ->> p_campo) !~ '^[0-9]{1,10}$' then false
    else (p_clave ->> p_campo)::numeric between 1 and p_maximo::numeric
  end;
$function$;
create function territorial_private.importar_producto_capa_cartografica(
  p_capa text
) returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case
    when p_capa in (
      'ENTIDAD', 'MUNICIPIO', 'DISTRITO_LOCAL', 'DISTRITO_FEDERAL', 'SECCION'
    ) then 'MGS'
    when p_capa in ('COLONIA', 'LOCALIDAD', 'LIMITE_LOCALIDAD') then 'BGD'
    else null
  end;
$function$;
create function territorial_private.importar_siguiente_capa_cartografica(
  p_conteos jsonb,
  p_despues_de text
) returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select capas.capa
  from (
    values
      (1, 'ENTIDAD'::text),
      (2, 'MUNICIPIO'::text),
      (3, 'DISTRITO_LOCAL'::text),
      (4, 'DISTRITO_FEDERAL'::text),
      (5, 'SECCION'::text),
      (6, 'COLONIA'::text),
      (7, 'LOCALIDAD'::text),
      (8, 'LIMITE_LOCALIDAD'::text)
  ) as capas(orden, capa)
  where capas.orden > coalesce(
      territorial_private.importar_orden_capa_cartografica(p_despues_de), 0
    )
    and coalesce(p_conteos ->> capas.capa, '0') ~ '^(0|[1-9][0-9]{0,18})$'
    and (coalesce(p_conteos ->> capas.capa, '0'))::numeric > 0
  order by capas.orden
  limit 1;
$function$;
create function territorial_private.importar_clave_lock_identidad_cartografica(
  p_capa text,
  p_clave jsonb
) returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case p_capa
    when 'ENTIDAD' then
      'ENTIDAD:' || coalesce(p_clave ->> 'entidad', '')
    when 'MUNICIPIO' then
      'MUNICIPIO:' || coalesce(p_clave ->> 'entidad', '') || ':'
        || coalesce(p_clave ->> 'municipio', '')
    when 'DISTRITO_LOCAL' then
      'DISTRITO_LOCAL:' || coalesce(p_clave ->> 'entidad', '') || ':'
        || coalesce(p_clave ->> 'distrito_local', '')
    when 'DISTRITO_FEDERAL' then
      'DISTRITO_FEDERAL:' || coalesce(p_clave ->> 'entidad', '') || ':'
        || coalesce(p_clave ->> 'distrito_federal', '')
    when 'SECCION' then
      'SECCION:' || coalesce(p_clave ->> 'entidad', '') || ':'
        || coalesce(p_clave ->> 'seccion', '')
    when 'COLONIA' then
      'COLONIA:' || coalesce(p_clave ->> 'entidad', '') || ':'
        || coalesce(p_clave ->> 'municipio', '') || ':'
        || pg_catalog.btrim(coalesce(p_clave ->> 'id_ine', ''))
    when 'LOCALIDAD' then
      'LOCALIDAD:' || coalesce(p_clave ->> 'entidad', '') || ':'
        || pg_catalog.btrim(coalesce(p_clave ->> 'id_ine', ''))
    when 'LIMITE_LOCALIDAD' then
      'LOCALIDAD:' || coalesce(p_clave ->> 'entidad', '') || ':'
        || pg_catalog.btrim(coalesce(p_clave ->> 'id_ine', ''))
    else 'DESCONOCIDA:' || coalesce(p_clave::text, 'null')
  end;
$function$;
create function territorial_private.importar_registrar_incidencia_cartografica(
  p_cartografia_version_id bigint,
  p_carga_id bigint,
  p_capa text,
  p_codigo text,
  p_clave_fuente text,
  p_fila_fuente bigint,
  p_detalle text
) returns void
language sql
volatile
security invoker
set search_path = ''
as $function$
  insert into public.cartografia_incidencias (
    cartografia_version_id,
    carga_id,
    severidad,
    codigo,
    capa,
    clave_fuente,
    fila_fuente,
    clave_idempotencia,
    detalle
  ) values (
    p_cartografia_version_id,
    p_carga_id,
    'ERROR',
    p_codigo,
    p_capa,
    p_clave_fuente,
    p_fila_fuente,
    pg_catalog.repeat('0', 64),
    p_detalle
  )
  on conflict (cartografia_version_id, clave_idempotencia) do nothing;
$function$;
revoke all on function territorial_private.importar_objeto_tiene_claves_exactas(jsonb, text[])
  from public, anon, authenticated;
revoke all on function territorial_private.importar_orden_capa_cartografica(text)
  from public, anon, authenticated;
revoke all on function territorial_private.importar_clave_entero_positivo_valido(jsonb, text, bigint)
  from public, anon, authenticated;
revoke all on function territorial_private.importar_producto_capa_cartografica(text)
  from public, anon, authenticated;
revoke all on function territorial_private.importar_siguiente_capa_cartografica(jsonb, text)
  from public, anon, authenticated;
revoke all on function territorial_private.importar_clave_lock_identidad_cartografica(text, jsonb)
  from public, anon, authenticated;
revoke all on function territorial_private.importar_registrar_incidencia_cartografica(bigint, bigint, text, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function territorial_private.importar_objeto_tiene_claves_exactas(jsonb, text[])
  to service_role;
grant execute on function territorial_private.importar_orden_capa_cartografica(text)
  to service_role;
grant execute on function territorial_private.importar_clave_entero_positivo_valido(jsonb, text, bigint)
  to service_role;
grant execute on function territorial_private.importar_producto_capa_cartografica(text)
  to service_role;
grant execute on function territorial_private.importar_siguiente_capa_cartografica(jsonb, text)
  to service_role;
grant execute on function territorial_private.importar_clave_lock_identidad_cartografica(text, jsonb)
  to service_role;
grant execute on function territorial_private.importar_registrar_incidencia_cartografica(bigint, bigint, text, text, text, bigint, text)
  to service_role;
create function public.rpc_importar_lote_cartografico(
  p_carga_id bigint,
  p_capa text,
  p_registro_desde bigint,
  p_registro_hasta bigint,
  p_features jsonb
) returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_version_id bigint;
  v_version public.cartografia_versiones%rowtype;
  v_carga public.cargas_cartograficas%rowtype;
  v_lote public.cargas_cartograficas_lotes%rowtype;
  v_payload_sha256 text;
  v_producto text;
  v_capa_esperada text;
  v_conteo_version_text text;
  v_conteo_version numeric;
  v_conteo_manifiesto_min numeric;
  v_conteo_manifiesto_max numeric;
  v_componentes integer;
  v_componentes_validos integer;
  v_extensiones text[];
  v_conteo_declarado bigint;
  v_conteo_capa_anterior bigint;
  v_cursor_base bigint;
  v_feature_count integer;
  v_feature jsonb;
  v_clave jsonb;
  v_atributos jsonb;
  v_fila bigint;
  v_fila_esperada bigint;
  v_sha256 text;
  v_entidad text;
  v_municipio text;
  v_id_ine text;
  v_nombre text;
  v_numero_text text;
  v_numero integer;
  v_clave_fuente text;
  v_lock_identidad text;
  v_geom extensions.geometry;
  v_geom_tipo text;
  v_geom_detalle text;
  v_municipio_id bigint;
  v_distrito_local_id bigint;
  v_distrito_federal_id bigint;
  v_seccion_id bigint;
  v_colonia_id bigint;
  v_localidad_id bigint;
  v_cartografia_entidad_id bigint;
  v_cartografia_municipio_id bigint;
  v_cartografia_distrito_local_id bigint;
  v_cartografia_distrito_federal_id bigint;
  v_cartografia_seccion_id bigint;
  v_cartografia_colonia_id bigint;
  v_cartografia_localidad_id bigint;
  v_hash_existente text;
  v_recibidos_lote bigint := 0;
  v_insertados_lote bigint := 0;
  v_repetidos_lote bigint := 0;
  v_rechazados_lote bigint := 0;
  v_resultado jsonb;
begin
  if p_carga_id is null
     or p_capa is null
     or p_registro_desde is null
     or p_registro_hasta is null
     or p_features is null then
    raise exception using
      errcode = '22004',
      message = 'los parametros del lote cartografico no pueden ser nulos';
  end if;

  v_producto := territorial_private.importar_producto_capa_cartografica(p_capa);
  if v_producto is null then
    raise exception using
      errcode = '22023',
      message = 'capa cartografica fuera del contrato cerrado';
  end if;

  if pg_catalog.octet_length(pg_catalog.convert_to(p_features::text, 'UTF8')) > 5000000 then
    raise exception using
      errcode = '22023',
      message = 'p_features excede 5,000,000 bytes UTF8';
  end if;

  if p_registro_desde < 1 or p_registro_hasta < p_registro_desde then
    raise exception using
      errcode = '22023',
      message = 'el rango cartografico es invalido';
  end if;

  v_payload_sha256 := territorial_private.sha256_jsonb_cartografico(p_features);

  -- Prelectura optimista: el ledger es append-only. Esto preserva la semantica
  -- especifica de un rango confirmado aun si el reenvio ya no tiene forma
  -- estructural valida. La misma comprobacion se repite bajo el lock de version.
  select l.*
    into v_lote
    from public.cargas_cartograficas_lotes l
    where l.carga_id = p_carga_id
      and l.capa = p_capa
      and l.registro_desde = p_registro_desde
      and l.registro_hasta = p_registro_hasta;

  if found then
    if v_lote.payload_sha256 <> v_payload_sha256 then
      raise exception using
        errcode = '23505',
        message = 'el rango ya fue confirmado con otra huella de payload';
    end if;
    return v_lote.resultado;
  end if;

  if pg_catalog.jsonb_typeof(p_features) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'p_features debe ser un arreglo JSON';
  end if;

  v_feature_count := pg_catalog.jsonb_array_length(p_features);
  if v_feature_count < 1 or v_feature_count > 250 then
    raise exception using
      errcode = '22023',
      message = 'un lote debe contener entre 1 y 250 features';
  end if;

  if p_registro_hasta::numeric - p_registro_desde::numeric >= 250
     or p_registro_hasta::numeric - p_registro_desde::numeric + 1
        <> v_feature_count::numeric then
    raise exception using
      errcode = '22023',
      message = 'el rango no coincide con el numero de features';
  end if;

  -- Primera pasada: cualquier defecto estructural es tecnico y debe ocurrir
  -- antes de insertar identidades, geometrias o incidencias. La ordinalidad
  -- cero-based del arreglo se traduce al rango fuente uno-based.
  for v_index in 0..(v_feature_count - 1) loop
    v_feature := p_features -> v_index;

    if not territorial_private.importar_objeto_tiene_claves_exactas(
      v_feature,
      array['fila', 'clave', 'atributos', 'geometry', 'sha256']::text[]
    ) then
      raise exception using
        errcode = '22023',
        message = pg_catalog.format('feature %s no cumple la forma cerrada', v_index + 1);
    end if;

    if pg_catalog.jsonb_typeof(v_feature -> 'fila') <> 'number'
       or (v_feature ->> 'fila') !~ '^[1-9][0-9]{0,18}$'
       or (v_feature ->> 'fila')::numeric > 9223372036854775807::numeric then
      raise exception using
        errcode = '22023',
        message = pg_catalog.format('feature %s tiene fila invalida', v_index + 1);
    end if;

    v_fila := (v_feature ->> 'fila')::bigint;
    v_fila_esperada := p_registro_desde + v_index::bigint;
    if v_fila <> v_fila_esperada then
      raise exception using
        errcode = '22023',
        message = pg_catalog.format(
          'feature %s debe declarar fila %s', v_index + 1, v_fila_esperada
        );
    end if;

    if pg_catalog.jsonb_typeof(v_feature -> 'clave') <> 'object'
       or pg_catalog.jsonb_typeof(v_feature -> 'atributos') <> 'object'
       or pg_catalog.jsonb_typeof(v_feature -> 'sha256') <> 'string'
       or (v_feature ->> 'sha256') !~ '^[0-9a-f]{64}$' then
      raise exception using
        errcode = '22023',
        message = pg_catalog.format('feature %s tiene tipos estructurales invalidos', v_index + 1);
    end if;
  end loop;

  -- Resolver sin lock, tomar el advisory canonico y volver a leer FOR UPDATE.
  select c.cartografia_version_id
    into v_version_id
    from public.cargas_cartograficas c
    where c.carga_id = p_carga_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'carga cartografica inexistente';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('SIPEEM:CARTOGRAFIA:VERSION:' || v_version_id::text, 0)
  );

  select v.*
    into v_version
    from public.cartografia_versiones v
    where v.cartografia_version_id = v_version_id
    for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'version cartografica inexistente';
  end if;

  select c.*
    into v_carga
    from public.cargas_cartograficas c
    where c.carga_id = p_carga_id
      and c.cartografia_version_id = v_version_id
    for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'carga cartografica inexistente';
  end if;

  -- El ledger se consulta antes del sello de estado/cursor: una respuesta HTTP
  -- perdida puede reintentarse exactamente incluso despues de avanzar de capa.
  select l.*
    into v_lote
    from public.cargas_cartograficas_lotes l
    where l.carga_id = p_carga_id
      and l.capa = p_capa
      and l.registro_desde = p_registro_desde
      and l.registro_hasta = p_registro_hasta;

  if found then
    if v_lote.payload_sha256 <> v_payload_sha256 then
      raise exception using
        errcode = '23505',
        message = 'el rango ya fue confirmado con otra huella de payload';
    end if;
    return v_lote.resultado;
  end if;

  if exists (
    select 1
    from public.cargas_cartograficas_lotes l
    where l.carga_id = p_carga_id
      and l.capa = p_capa
      and pg_catalog.int8range(
            l.registro_desde, l.registro_hasta, '[]'
          ) operator(pg_catalog.&&) pg_catalog.int8range(
            p_registro_desde, p_registro_hasta, '[]'
          )
  ) then
    raise exception using
      errcode = '55000',
      message = 'el rango se solapa con otro lote ya confirmado';
  end if;

  if v_carga.estado not in ('PREPARADA', 'CARGANDO')
     or v_version.estado not in ('PREPARADA', 'CARGANDO') then
    raise exception using
      errcode = '55000',
      message = 'la carga o version ya esta sellada para importacion';
  end if;

  -- La capa debe provenir del juego CARGAR correcto del manifiesto. Los cuatro
  -- componentes core y el CPG opcional repiten el conteo en metadata.
  select
    pg_catalog.count(*)::integer,
    pg_catalog.count(*) filter (
      where a.metadata ->> 'politica' = 'CARGAR'
        and a.metadata ->> 'registros' ~ '^(0|[1-9][0-9]{0,18})$'
        and (a.metadata ->> 'registros')::numeric <= 9223372036854775807::numeric
    )::integer,
    pg_catalog.min(
      case
        when a.metadata ->> 'registros' ~ '^(0|[1-9][0-9]{0,18})$'
        then (a.metadata ->> 'registros')::numeric
      end
    ),
    pg_catalog.max(
      case
        when a.metadata ->> 'registros' ~ '^(0|[1-9][0-9]{0,18})$'
        then (a.metadata ->> 'registros')::numeric
      end
    ),
    coalesce(
      pg_catalog.array_agg(a.extension order by a.extension),
      '{}'::text[]
    )
    into
      v_componentes,
      v_componentes_validos,
      v_conteo_manifiesto_min,
      v_conteo_manifiesto_max,
      v_extensiones
    from public.cartografia_archivos a
    where a.cartografia_version_id = v_version_id
      and a.producto = v_producto
      and a.capa = p_capa;

  if (v_producto = 'MGS' and v_componentes <> 5)
     or (v_producto = 'BGD' and v_componentes not in (4, 5))
     or v_componentes_validos <> v_componentes
     or not (
       v_extensiones @> array['shp', 'shx', 'dbf', 'prj']::text[]
       and v_extensiones <@ array['shp', 'shx', 'dbf', 'prj', 'cpg']::text[]
       and (v_producto = 'BGD' or v_extensiones @> array['cpg']::text[])
     )
     or v_conteo_manifiesto_min is distinct from v_conteo_manifiesto_max then
    raise exception using
      errcode = '55000',
      message = 'la capa no tiene el juego de componentes CARGAR coherente';
  end if;

  v_conteo_version_text := v_version.conteos_esperados ->> p_capa;
  if v_conteo_version_text is null
     or v_conteo_version_text !~ '^(0|[1-9][0-9]{0,18})$'
     or v_conteo_version_text::numeric > 9223372036854775807::numeric then
    raise exception using
      errcode = '55000',
      message = 'conteo esperado de capa ausente o invalido';
  end if;

  v_conteo_version := v_conteo_version_text::numeric;
  if v_conteo_version is distinct from v_conteo_manifiesto_min then
    raise exception using
      errcode = '55000',
      message = 'conteo esperado no coincide con el manifiesto normalizado';
  end if;
  v_conteo_declarado := v_conteo_version::bigint;

  if v_carga.capa_actual is null then
    v_capa_esperada := territorial_private.importar_siguiente_capa_cartografica(
      v_version.conteos_esperados,
      null
    );
    v_cursor_base := 0;
  elsif p_capa = v_carga.capa_actual then
    v_capa_esperada := v_carga.capa_actual;
    v_cursor_base := v_carga.cursor_confirmado;
  else
    if territorial_private.importar_orden_capa_cartografica(v_carga.capa_actual) is null then
      raise exception using
        errcode = '55000',
        message = 'la carga conserva una capa actual invalida';
    end if;

    v_conteo_version_text := v_version.conteos_esperados ->> v_carga.capa_actual;
    if v_conteo_version_text is null
       or v_conteo_version_text !~ '^(0|[1-9][0-9]{0,18})$'
       or v_conteo_version_text::numeric > 9223372036854775807::numeric then
      raise exception using
        errcode = '55000',
        message = 'el conteo de la capa anterior es invalido';
    end if;
    v_conteo_capa_anterior := v_conteo_version_text::bigint;

    if v_carga.cursor_confirmado <> v_conteo_capa_anterior then
      raise exception using
        errcode = '55000',
        message = 'la capa anterior no ha alcanzado su conteo declarado';
    end if;

    v_capa_esperada := territorial_private.importar_siguiente_capa_cartografica(
      v_version.conteos_esperados,
      v_carga.capa_actual
    );
    v_cursor_base := 0;
  end if;

  if v_capa_esperada is null or p_capa <> v_capa_esperada then
    raise exception using
      errcode = '55000',
      message = 'la capa no respeta el orden declarado del manifiesto';
  end if;

  if p_registro_desde <> v_cursor_base + 1
     or p_registro_hasta > v_conteo_declarado then
    raise exception using
      errcode = '55000',
      message = 'el rango no continua el cursor o excede el conteo declarado';
  end if;

  -- Versiones distintas comparten las identidades estables. Sus llaves se
  -- adquieren en orden canonico para que payloads [A,B] y [B,A] no formen un
  -- ciclo de locks en los indices UNIQUE de los catalogos territoriales.
  for v_lock_identidad in
    select distinct
           territorial_private.importar_clave_lock_identidad_cartografica(
             p_capa, f.valor -> 'clave'
           ) as clave_lock
      from pg_catalog.jsonb_array_elements(p_features) as f(valor)
     order by clave_lock
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'SIPEEM:CARTOGRAFIA:IDENTIDAD:' || v_lock_identidad, 0
      )
    );
  end loop;

  if v_version.estado = 'PREPARADA' then
    update public.cartografia_versiones
       set estado = 'CARGANDO'
     where cartografia_version_id = v_version_id;
  end if;

  if v_carga.estado = 'PREPARADA' then
    update public.cargas_cartograficas
       set estado = 'CARGANDO',
           iniciada_at = coalesce(iniciada_at, pg_catalog.clock_timestamp())
     where carga_id = p_carga_id;
  end if;

  <<feature_loop>>
  for v_index in 0..(v_feature_count - 1) loop
    v_feature := p_features -> v_index;
    v_clave := v_feature -> 'clave';
    v_atributos := v_feature -> 'atributos';
    v_fila := (v_feature ->> 'fila')::bigint;
    v_sha256 := v_feature ->> 'sha256';
    v_entidad := v_clave ->> 'entidad';
    v_municipio := v_clave ->> 'municipio';
    v_id_ine := pg_catalog.btrim(v_clave ->> 'id_ine');
    v_nombre := v_atributos ->> 'nombre';
    v_clave_fuente := p_capa || ':' || v_clave::text;
    v_geom := null;
    v_geom_detalle := null;

    if not territorial_private.importar_objeto_tiene_claves_exactas(
      v_clave,
      case p_capa
        when 'ENTIDAD' then array['entidad']::text[]
        when 'MUNICIPIO' then array['entidad', 'municipio']::text[]
        when 'DISTRITO_LOCAL' then array['entidad', 'distrito_local']::text[]
        when 'DISTRITO_FEDERAL' then array['entidad', 'distrito_federal']::text[]
        when 'SECCION' then array[
          'entidad', 'municipio', 'distrito_local', 'distrito_federal', 'seccion'
        ]::text[]
        when 'COLONIA' then array['entidad', 'municipio', 'id_ine']::text[]
        when 'LOCALIDAD' then array['entidad', 'municipio', 'seccion', 'id_ine']::text[]
        when 'LIMITE_LOCALIDAD' then array['entidad', 'municipio', 'id_ine']::text[]
      end
    ) or pg_catalog.jsonb_typeof(v_clave -> 'entidad') <> 'string'
      or v_entidad !~ '^[0-9]{2}$'
      or v_entidad <> v_version.clave_entidad then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'REFERENCIA_TERRITORIAL_INVALIDA',
        v_clave_fuente, v_fila, 'clave de entidad o forma de clave invalida'
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    if p_capa in ('MUNICIPIO', 'SECCION', 'COLONIA', 'LOCALIDAD', 'LIMITE_LOCALIDAD')
       and (
         pg_catalog.jsonb_typeof(v_clave -> 'municipio') <> 'string'
         or v_municipio !~ '^[0-9]{3}$'
         or v_municipio = '000'
       ) then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'REFERENCIA_TERRITORIAL_INVALIDA',
        v_clave_fuente, v_fila, 'clave municipal invalida'
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    if p_capa in ('COLONIA', 'LOCALIDAD', 'LIMITE_LOCALIDAD')
       and (
         pg_catalog.jsonb_typeof(v_clave -> 'id_ine') <> 'string'
         or nullif(pg_catalog.btrim(v_id_ine), '') is null
       ) then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'REFERENCIA_TERRITORIAL_INVALIDA',
        v_clave_fuente, v_fila, 'id_ine invalido'
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    if p_capa not in ('SECCION', 'LIMITE_LOCALIDAD')
       and (
         pg_catalog.jsonb_typeof(v_atributos -> 'nombre') <> 'string'
         or nullif(pg_catalog.btrim(v_nombre), '') is null
       ) then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'REFERENCIA_TERRITORIAL_INVALIDA',
        v_clave_fuente, v_fila, 'nombre fuente ausente o invalido'
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    if p_capa in ('DISTRITO_LOCAL', 'DISTRITO_FEDERAL', 'SECCION', 'LOCALIDAD') then
      v_numero_text := case p_capa
        when 'DISTRITO_LOCAL' then v_clave ->> 'distrito_local'
        when 'DISTRITO_FEDERAL' then v_clave ->> 'distrito_federal'
        else v_clave ->> 'seccion'
      end;

      if not territorial_private.importar_clave_entero_positivo_valido(
        v_clave,
        case
          when p_capa = 'DISTRITO_LOCAL' then 'distrito_local'
          when p_capa = 'DISTRITO_FEDERAL' then 'distrito_federal'
          else 'seccion'
        end,
        case
          when p_capa in ('DISTRITO_LOCAL', 'DISTRITO_FEDERAL') then 32767::bigint
          else 2147483647::bigint
        end
      )
      or (
        p_capa = 'SECCION'
        and (
          not territorial_private.importar_clave_entero_positivo_valido(
            v_clave, 'distrito_local', 32767
          )
          or not territorial_private.importar_clave_entero_positivo_valido(
            v_clave, 'distrito_federal', 32767
          )
        )
      ) then
        perform territorial_private.importar_registrar_incidencia_cartografica(
          v_version_id, p_carga_id, p_capa, 'REFERENCIA_TERRITORIAL_INVALIDA',
          v_clave_fuente, v_fila, 'numero territorial invalido'
        );
        v_rechazados_lote := v_rechazados_lote + 1;
        continue feature_loop;
      end if;
      v_numero := v_numero_text::integer;
    end if;

    -- La geometria es dato de negocio. Un GeoJSON que no parsea se registra y
    -- confirma como rechazo, sin ocultar excepciones fuera del parser.
    begin
      if pg_catalog.jsonb_typeof(v_feature -> 'geometry') = 'object' then
        v_geom := extensions.st_geomfromgeojson((v_feature -> 'geometry')::text);
      end if;
    exception
      when data_exception then
        v_geom := null;
      when internal_error then
        get stacked diagnostics v_geom_detalle = message_text;
        if v_geom_detalle ~* '(geojson|json[[:space:]]+parse|expected.*offset|unexpected.*offset)' then
          v_geom := null;
        else
          raise;
        end if;
    end;

    if v_geom is null then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'GEOMETRIA_INVALIDA',
        v_clave_fuente, v_fila, 'GeoJSON ausente o no interpretable'
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

  if extensions.st_srid(v_geom) <> 4326 then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'SRID_INESPERADO',
        v_clave_fuente, v_fila,
        pg_catalog.format('SRID recibido: %s; esperado: 4326', extensions.st_srid(v_geom))
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    if extensions.st_ndims(v_geom) <> 2 then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'GEOMETRIA_INVALIDA',
        v_clave_fuente, v_fila,
        pg_catalog.format(
          'dimension geometrica incompatible: %s; esperada: 2',
          extensions.st_ndims(v_geom)
        )
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    v_geom_tipo := extensions.st_geometrytype(v_geom);
    if (p_capa = 'LOCALIDAD' and v_geom_tipo <> 'ST_Point')
       or (p_capa <> 'LOCALIDAD' and v_geom_tipo <> 'ST_MultiPolygon') then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'GEOMETRIA_INVALIDA',
        v_clave_fuente, v_fila,
        pg_catalog.format('tipo geometrico incompatible: %s', v_geom_tipo)
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    if extensions.st_isempty(v_geom) then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'GEOMETRIA_VACIA',
        v_clave_fuente, v_fila, 'la geometria esta vacia'
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    if not extensions.st_isvalid(v_geom) then
      v_geom_detalle := extensions.st_isvalidreason(v_geom);
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'GEOMETRIA_INVALIDA',
        v_clave_fuente, v_fila,
        'geometria invalida: ' || coalesce(v_geom_detalle, 'sin detalle')
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    if not extensions.st_coveredby(
      v_geom,
      extensions.st_makeenvelope(-101, 18, -98, 21, 4326)
    ) then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'GEOMETRIA_INVALIDA',
        v_clave_fuente, v_fila, 'geometria fuera del envelope operativo del Estado de Mexico'
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    if p_capa = 'ENTIDAD' then
      v_cartografia_entidad_id := null;
      insert into public.cartografia_entidades (
        cartografia_version_id, clave_entidad, nombre, atributos_fuente,
        fila_origen, fuente_sha256, geom
      ) values (
        v_version_id, v_entidad, pg_catalog.btrim(v_nombre), v_atributos,
        v_fila, v_sha256, v_geom
      )
      on conflict (cartografia_version_id, clave_entidad) do nothing
      returning cartografia_entidad_id into v_cartografia_entidad_id;

      if v_cartografia_entidad_id is not null then
        v_insertados_lote := v_insertados_lote + 1;
      else
        select e.fuente_sha256
          into v_hash_existente
          from public.cartografia_entidades e
          where e.cartografia_version_id = v_version_id
            and e.clave_entidad = v_entidad;
        if v_hash_existente is distinct from v_sha256 then
          raise exception using errcode = '23505', message = 'ENTIDAD existente con otra huella';
        end if;
        v_repetidos_lote := v_repetidos_lote + 1;
      end if;

    elsif p_capa = 'MUNICIPIO' then
      insert into public.territorios_municipios (
        clave_entidad, clave_municipio, nombre, metadata, activo
      ) values (
        v_entidad, v_municipio, pg_catalog.btrim(v_nombre),
        pg_catalog.jsonb_build_object('creado_por_version', v_version_id), false
      )
      on conflict (clave_entidad, clave_municipio) do nothing;

      select m.municipio_id
        into v_municipio_id
        from public.territorios_municipios m
        where m.clave_entidad = v_entidad
          and m.clave_municipio = v_municipio;

      v_cartografia_municipio_id := null;
      insert into public.cartografia_municipios (
        cartografia_version_id, municipio_id, clave_entidad, clave_municipio,
        nombre, atributos_fuente, fila_origen, fuente_sha256, geom
      ) values (
        v_version_id, v_municipio_id, v_entidad, v_municipio,
        pg_catalog.btrim(v_nombre), v_atributos, v_fila, v_sha256, v_geom
      )
      on conflict (cartografia_version_id, clave_entidad, clave_municipio) do nothing
      returning cartografia_municipio_id into v_cartografia_municipio_id;

      if v_cartografia_municipio_id is not null then
        v_insertados_lote := v_insertados_lote + 1;
      else
        select m.fuente_sha256
          into v_hash_existente
          from public.cartografia_municipios m
          where m.cartografia_version_id = v_version_id
            and m.clave_entidad = v_entidad
            and m.clave_municipio = v_municipio;
        if v_hash_existente is distinct from v_sha256 then
          raise exception using errcode = '23505', message = 'MUNICIPIO existente con otra huella';
        end if;
        v_repetidos_lote := v_repetidos_lote + 1;
      end if;

    elsif p_capa = 'DISTRITO_LOCAL' then
      insert into public.territorios_distritos_locales (
        clave_entidad, numero, nombre, metadata, activo
      ) values (
        v_entidad, v_numero::smallint, pg_catalog.btrim(v_nombre),
        pg_catalog.jsonb_build_object('creado_por_version', v_version_id), false
      )
      on conflict (clave_entidad, numero) do nothing;

      select d.distrito_local_id
        into v_distrito_local_id
        from public.territorios_distritos_locales d
        where d.clave_entidad = v_entidad and d.numero = v_numero;

      v_cartografia_distrito_local_id := null;
      insert into public.cartografia_distritos_locales (
        cartografia_version_id, distrito_local_id, clave_entidad, numero,
        nombre, atributos_fuente, fila_origen, fuente_sha256, geom
      ) values (
        v_version_id, v_distrito_local_id, v_entidad, v_numero,
        pg_catalog.btrim(v_nombre), v_atributos, v_fila, v_sha256, v_geom
      )
      on conflict (cartografia_version_id, clave_entidad, numero) do nothing
      returning cartografia_distrito_local_id into v_cartografia_distrito_local_id;

      if v_cartografia_distrito_local_id is not null then
        v_insertados_lote := v_insertados_lote + 1;
      else
        select d.fuente_sha256
          into v_hash_existente
          from public.cartografia_distritos_locales d
          where d.cartografia_version_id = v_version_id
            and d.clave_entidad = v_entidad and d.numero = v_numero;
        if v_hash_existente is distinct from v_sha256 then
          raise exception using errcode = '23505', message = 'DISTRITO_LOCAL existente con otra huella';
        end if;
        v_repetidos_lote := v_repetidos_lote + 1;
      end if;

    elsif p_capa = 'DISTRITO_FEDERAL' then
      insert into public.territorios_distritos_federales (
        clave_entidad, numero, nombre, metadata, activo
      ) values (
        v_entidad, v_numero::smallint, pg_catalog.btrim(v_nombre),
        pg_catalog.jsonb_build_object('creado_por_version', v_version_id), false
      )
      on conflict (clave_entidad, numero) do nothing;

      select d.distrito_federal_id
        into v_distrito_federal_id
        from public.territorios_distritos_federales d
        where d.clave_entidad = v_entidad and d.numero = v_numero;

      v_cartografia_distrito_federal_id := null;
      insert into public.cartografia_distritos_federales (
        cartografia_version_id, distrito_federal_id, clave_entidad, numero,
        nombre, atributos_fuente, fila_origen, fuente_sha256, geom
      ) values (
        v_version_id, v_distrito_federal_id, v_entidad, v_numero,
        pg_catalog.btrim(v_nombre), v_atributos, v_fila, v_sha256, v_geom
      )
      on conflict (cartografia_version_id, clave_entidad, numero) do nothing
      returning cartografia_distrito_federal_id into v_cartografia_distrito_federal_id;

      if v_cartografia_distrito_federal_id is not null then
        v_insertados_lote := v_insertados_lote + 1;
      else
        select d.fuente_sha256
          into v_hash_existente
          from public.cartografia_distritos_federales d
          where d.cartografia_version_id = v_version_id
            and d.clave_entidad = v_entidad and d.numero = v_numero;
        if v_hash_existente is distinct from v_sha256 then
          raise exception using errcode = '23505', message = 'DISTRITO_FEDERAL existente con otra huella';
        end if;
        v_repetidos_lote := v_repetidos_lote + 1;
      end if;

    elsif p_capa = 'SECCION' then
      select m.cartografia_municipio_id, m.municipio_id
        into v_cartografia_municipio_id, v_municipio_id
        from public.cartografia_municipios m
        where m.cartografia_version_id = v_version_id
          and m.clave_entidad = v_entidad
          and m.clave_municipio = v_municipio;

      select d.cartografia_distrito_local_id, d.distrito_local_id
        into v_cartografia_distrito_local_id, v_distrito_local_id
        from public.cartografia_distritos_locales d
        where d.cartografia_version_id = v_version_id
          and d.clave_entidad = v_entidad
          and d.numero = (v_clave ->> 'distrito_local')::integer;

      select d.cartografia_distrito_federal_id, d.distrito_federal_id
        into v_cartografia_distrito_federal_id, v_distrito_federal_id
        from public.cartografia_distritos_federales d
        where d.cartografia_version_id = v_version_id
          and d.clave_entidad = v_entidad
          and d.numero = (v_clave ->> 'distrito_federal')::integer;

      if v_cartografia_municipio_id is null
         or v_cartografia_distrito_local_id is null
         or v_cartografia_distrito_federal_id is null then
        perform territorial_private.importar_registrar_incidencia_cartografica(
          v_version_id, p_carga_id, p_capa, 'REFERENCIA_TERRITORIAL_INVALIDA',
          v_clave_fuente, v_fila, 'padre versionado de seccion inexistente'
        );
        v_rechazados_lote := v_rechazados_lote + 1;
        continue feature_loop;
      end if;

      insert into public.territorios_secciones (
        clave_entidad, numero, municipio_id, distrito_local_id,
        distrito_federal_id, metadata, activo
      ) values (
        v_entidad, v_numero, v_municipio_id, v_distrito_local_id,
        v_distrito_federal_id,
        pg_catalog.jsonb_build_object('creado_por_version', v_version_id), false
      )
      on conflict (clave_entidad, numero) do nothing;

      select s.seccion_id
        into v_seccion_id
        from public.territorios_secciones s
        where s.clave_entidad = v_entidad and s.numero = v_numero;

      v_cartografia_seccion_id := null;
      insert into public.cartografia_secciones (
        cartografia_version_id, seccion_id, clave_entidad, numero,
        cartografia_municipio_id, municipio_id,
        cartografia_distrito_local_id, distrito_local_id,
        cartografia_distrito_federal_id, distrito_federal_id,
        tipo, atributos_fuente, fila_origen, fuente_sha256, geom
      ) values (
        v_version_id, v_seccion_id, v_entidad, v_numero,
        v_cartografia_municipio_id, v_municipio_id,
        v_cartografia_distrito_local_id, v_distrito_local_id,
        v_cartografia_distrito_federal_id, v_distrito_federal_id,
        nullif(pg_catalog.btrim(v_atributos ->> 'tipo'), ''),
        v_atributos, v_fila, v_sha256, v_geom
      )
      on conflict (cartografia_version_id, clave_entidad, numero) do nothing
      returning cartografia_seccion_id into v_cartografia_seccion_id;

      if v_cartografia_seccion_id is not null then
        v_insertados_lote := v_insertados_lote + 1;
      else
        select s.fuente_sha256
          into v_hash_existente
          from public.cartografia_secciones s
          where s.cartografia_version_id = v_version_id
            and s.clave_entidad = v_entidad and s.numero = v_numero;
        if v_hash_existente is distinct from v_sha256 then
          raise exception using errcode = '23505', message = 'SECCION existente con otra huella';
        end if;
        v_repetidos_lote := v_repetidos_lote + 1;
      end if;

    elsif p_capa = 'COLONIA' then
      select m.cartografia_municipio_id, m.municipio_id
        into v_cartografia_municipio_id, v_municipio_id
        from public.cartografia_municipios m
        where m.cartografia_version_id = v_version_id
          and m.clave_entidad = v_entidad
          and m.clave_municipio = v_municipio;

      if v_cartografia_municipio_id is null then
        perform territorial_private.importar_registrar_incidencia_cartografica(
          v_version_id, p_carga_id, p_capa, 'REFERENCIA_TERRITORIAL_INVALIDA',
          v_clave_fuente, v_fila, 'municipio versionado de colonia inexistente'
        );
        v_rechazados_lote := v_rechazados_lote + 1;
        continue feature_loop;
      end if;

      insert into public.territorios_colonias (
        municipio_id, clave, nombre, metadata, activo
      ) values (
        v_municipio_id, v_id_ine, pg_catalog.btrim(v_nombre),
        pg_catalog.jsonb_build_object('creado_por_version', v_version_id), false
      )
      on conflict do nothing;

      select c.colonia_id
        into v_colonia_id
        from public.territorios_colonias c
        where c.municipio_id = v_municipio_id and c.clave = v_id_ine;

      v_cartografia_colonia_id := null;
      insert into public.cartografia_colonias (
        cartografia_version_id, colonia_id, clave_entidad, id_ine,
        cartografia_municipio_id, municipio_id, nombre, atributos_fuente,
        fila_origen, fuente_sha256, geom
      ) values (
        v_version_id, v_colonia_id, v_entidad, v_id_ine,
        v_cartografia_municipio_id, v_municipio_id, pg_catalog.btrim(v_nombre),
        v_atributos, v_fila, v_sha256, v_geom
      )
      on conflict (cartografia_version_id, clave_entidad, id_ine) do nothing
      returning cartografia_colonia_id into v_cartografia_colonia_id;

      if v_cartografia_colonia_id is not null then
        v_insertados_lote := v_insertados_lote + 1;
      else
        select c.fuente_sha256
          into v_hash_existente
          from public.cartografia_colonias c
          where c.cartografia_version_id = v_version_id
            and c.clave_entidad = v_entidad and c.id_ine = v_id_ine;
        if v_hash_existente is distinct from v_sha256 then
          raise exception using errcode = '23505', message = 'COLONIA existente con otra huella';
        end if;
        v_repetidos_lote := v_repetidos_lote + 1;
      end if;

    elsif p_capa = 'LOCALIDAD' then
      select
        m.cartografia_municipio_id,
        m.municipio_id,
        s.cartografia_seccion_id,
        s.seccion_id
        into
          v_cartografia_municipio_id,
          v_municipio_id,
          v_cartografia_seccion_id,
          v_seccion_id
        from public.cartografia_municipios m
        join public.cartografia_secciones s
          on s.cartografia_version_id = m.cartografia_version_id
         and s.cartografia_municipio_id = m.cartografia_municipio_id
         and s.municipio_id = m.municipio_id
        where m.cartografia_version_id = v_version_id
          and m.clave_entidad = v_entidad
          and m.clave_municipio = v_municipio
          and s.clave_entidad = v_entidad
          and s.numero = v_numero;

      if v_cartografia_municipio_id is null or v_cartografia_seccion_id is null then
        perform territorial_private.importar_registrar_incidencia_cartografica(
          v_version_id, p_carga_id, p_capa, 'REFERENCIA_TERRITORIAL_INVALIDA',
          v_clave_fuente, v_fila, 'municipio o seccion versionada de localidad inexistente'
        );
        v_rechazados_lote := v_rechazados_lote + 1;
        continue feature_loop;
      end if;

      insert into public.territorios_localidades (
        clave_entidad, id_ine, nombre, municipio_id, seccion_id, metadata, activo
      ) values (
        v_entidad, v_id_ine, pg_catalog.btrim(v_nombre), null,
        null, pg_catalog.jsonb_build_object('creado_por_version', v_version_id), false
      )
      on conflict (clave_entidad, id_ine) do nothing;

      select l.localidad_id
        into v_localidad_id
        from public.territorios_localidades l
        where l.clave_entidad = v_entidad and l.id_ine = v_id_ine;

      v_cartografia_localidad_id := null;
      insert into public.cartografia_localidades (
        cartografia_version_id, localidad_id, clave_entidad, id_ine,
        cartografia_municipio_id, municipio_id,
        cartografia_seccion_id, seccion_id,
        nombre, atributos_fuente, fila_origen, fuente_punto_sha256, geom_punto
      ) values (
        v_version_id, v_localidad_id, v_entidad, v_id_ine,
        v_cartografia_municipio_id, v_municipio_id,
        v_cartografia_seccion_id, v_seccion_id,
        pg_catalog.btrim(v_nombre), v_atributos, v_fila, v_sha256, v_geom
      )
      on conflict (cartografia_version_id, clave_entidad, id_ine) do nothing
      returning cartografia_localidad_id into v_cartografia_localidad_id;

      if v_cartografia_localidad_id is not null then
        v_insertados_lote := v_insertados_lote + 1;
      else
        select l.fuente_punto_sha256
          into v_hash_existente
          from public.cartografia_localidades l
          where l.cartografia_version_id = v_version_id
            and l.clave_entidad = v_entidad and l.id_ine = v_id_ine;
        if v_hash_existente is distinct from v_sha256 then
          raise exception using errcode = '23505', message = 'LOCALIDAD existente con otra huella de punto';
        end if;
        v_repetidos_lote := v_repetidos_lote + 1;
      end if;

    elsif p_capa = 'LIMITE_LOCALIDAD' then
      select l.cartografia_localidad_id, l.fuente_limite_sha256
        into v_cartografia_localidad_id, v_hash_existente
        from public.cartografia_localidades l
        join public.cartografia_municipios m
          on m.cartografia_municipio_id = l.cartografia_municipio_id
         and m.cartografia_version_id = l.cartografia_version_id
         and m.municipio_id = l.municipio_id
        where l.cartografia_version_id = v_version_id
          and l.clave_entidad = v_entidad
          and l.id_ine = v_id_ine
          and m.clave_municipio = v_municipio;

      if v_cartografia_localidad_id is null then
        perform territorial_private.importar_registrar_incidencia_cartografica(
          v_version_id, p_carga_id, p_capa, 'REFERENCIA_TERRITORIAL_INVALIDA',
          v_clave_fuente, v_fila, 'localidad versionada para el limite inexistente'
        );
        v_rechazados_lote := v_rechazados_lote + 1;
        continue feature_loop;
      end if;

      if v_hash_existente is null then
        update public.cartografia_localidades
           set atributos_limite_fuente = v_atributos,
               fila_limite_origen = v_fila,
               fuente_limite_sha256 = v_sha256,
               geom_limite = v_geom
         where cartografia_localidad_id = v_cartografia_localidad_id;
        v_insertados_lote := v_insertados_lote + 1;
      elsif v_hash_existente = v_sha256 then
        v_repetidos_lote := v_repetidos_lote + 1;
      else
        raise exception using
          errcode = '23505',
          message = 'LIMITE_LOCALIDAD existente con otra huella';
      end if;
    end if;
  end loop feature_loop;

  v_recibidos_lote := v_feature_count::bigint;
  if v_recibidos_lote <>
     v_insertados_lote + v_repetidos_lote + v_rechazados_lote then
    raise exception using
      errcode = '55000',
      message = 'clasificacion interna incompleta del lote cartografico';
  end if;

  update public.cargas_cartograficas
     set estado = 'CARGANDO',
         capa_actual = p_capa,
         cursor_confirmado = p_registro_hasta,
         recibidos = recibidos + v_recibidos_lote,
         insertados = insertados + v_insertados_lote,
         repetidos = repetidos + v_repetidos_lote,
         rechazados = rechazados + v_rechazados_lote
   where carga_id = p_carga_id
     and cartografia_version_id = v_version_id
   returning * into v_carga;

  v_resultado := pg_catalog.jsonb_build_object(
    'carga_id', v_carga.carga_id,
    'capa', p_capa,
    'registro_confirmado', v_carga.cursor_confirmado,
    'recibidos', v_carga.recibidos,
    'insertados', v_carga.insertados,
    'repetidos', v_carga.repetidos,
    'rechazados', v_carga.rechazados
  );

  insert into public.cargas_cartograficas_lotes (
    carga_id,
    cartografia_version_id,
    capa,
    registro_desde,
    registro_hasta,
    payload_sha256,
    recibidos,
    insertados,
    repetidos,
    rechazados,
    resultado
  ) values (
    p_carga_id,
    v_version_id,
    p_capa,
    p_registro_desde,
    p_registro_hasta,
    v_payload_sha256,
    v_recibidos_lote,
    v_insertados_lote,
    v_repetidos_lote,
    v_rechazados_lote,
    v_resultado
  );

  return v_resultado;
end;
$function$;
revoke all on function public.rpc_importar_lote_cartografico(bigint, text, bigint, bigint, jsonb)
  from public, anon, authenticated;
grant execute on function public.rpc_importar_lote_cartografico(bigint, text, bigint, bigint, jsonb)
  to service_role;
-- Componente de validacion para ensamblar dentro de M16.
-- Requiere que el bloque de control ya haya creado
-- public.validaciones_cartograficas_progreso y ampliado el catalogo de incidencias.

create index cartografia_municipios_version_cursor_idx
  on public.cartografia_municipios (
    cartografia_version_id, cartografia_municipio_id
  );
create index cartografia_secciones_version_cursor_idx
  on public.cartografia_secciones (
    cartografia_version_id, cartografia_seccion_id
  );
create index cartografia_secciones_version_geom_gix
  on public.cartografia_secciones using gist (
    cartografia_version_id, geom
  );
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
           pg_catalog.jsonb_build_object('colonia_id', c.colonia_id, 'id_ine', c.id_ine),
           pg_catalog.jsonb_build_array(c.fuente_sha256)
    from public.cartografia_colonias c
    where c.cartografia_version_id = p_cartografia_version_id
    union all
    select 'LOCALIDAD', l.cartografia_localidad_id,
           pg_catalog.jsonb_build_object('localidad_id', l.localidad_id, 'id_ine', l.id_ine),
           pg_catalog.jsonb_build_array(l.fuente_punto_sha256)
    from public.cartografia_localidades l
    where l.cartografia_version_id = p_cartografia_version_id
    union all
    select 'LIMITE_LOCALIDAD', l.cartografia_localidad_id,
           pg_catalog.jsonb_build_object('localidad_id', l.localidad_id, 'id_ine', l.id_ine),
           pg_catalog.jsonb_build_array(l.fuente_limite_sha256)
    from public.cartografia_localidades l
    where l.cartografia_version_id = p_cartografia_version_id
      and l.geom_limite is not null
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
    'filas', coalesce(
      (select pg_catalog.jsonb_agg(
         pg_catalog.jsonb_build_object(
           'capa', f.capa,
           'identidad_versionada', f.id_versionada,
           'identidad_fuente', f.identidad_fuente,
           'huellas', f.huellas
         ) order by f.capa, f.id_versionada
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
