begin;
set local lock_timeout = '10s';
-- M19: conservar la firma, locks, acuses y limites de M16; abrir solamente
-- la ruta null COLONIA con recibo de cobertura y disyuncion verificable.
create or replace function public.rpc_importar_lote_cartografico(
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
  v_null_origen boolean := false;
  v_cartografia_colonia_sin_geometria_id bigint;
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
    v_null_origen := p_capa = 'COLONIA'
      and pg_catalog.jsonb_typeof(v_feature -> 'geometry') = 'null';
    if v_null_origen and not exists (
      select 1 from public.cartografia_cobertura_colonias_recibos r
      cross join lateral pg_catalog.jsonb_array_elements(
        r.evidencia -> 'filas_sin_geometria') as f(valor)
      where r.carga_id = p_carga_id
        and (f.valor ->> 'fila_origen')::bigint = v_fila
        and f.valor ->> 'id_ine' = v_id_ine
        and f.valor ->> 'fuente_sha256' = v_sha256
    ) then
      raise exception using errcode = '22023',
        message = 'null COLONIA fuera del recibo de cobertura';
    end if;

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

    if v_geom is null and not v_null_origen then
      perform territorial_private.importar_registrar_incidencia_cartografica(
        v_version_id, p_carga_id, p_capa, 'GEOMETRIA_INVALIDA',
        v_clave_fuente, v_fila, 'GeoJSON ausente o no interpretable'
      );
      v_rechazados_lote := v_rechazados_lote + 1;
      continue feature_loop;
    end if;

    if not v_null_origen then
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

      if v_null_origen then
        if exists (
          select 1 from public.cartografia_colonias c
          where c.cartografia_version_id = v_version_id
            and ((c.clave_entidad = v_entidad and c.id_ine = v_id_ine)
              or c.fila_origen = v_fila)
        ) then
          raise exception using errcode = '23505',
            message = 'COLONIA ya existe en la ruta espacial';
        end if;

        v_cartografia_colonia_sin_geometria_id := null;
        insert into public.cartografia_colonias_sin_geometria (
          cartografia_version_id, colonia_id, clave_entidad, id_ine,
          cartografia_municipio_id, municipio_id, nombre, atributos_fuente,
          fila_origen, fuente_sha256
        ) values (
          v_version_id, v_colonia_id, v_entidad, v_id_ine,
          v_cartografia_municipio_id, v_municipio_id, pg_catalog.btrim(v_nombre),
          v_atributos, v_fila, v_sha256
        )
        on conflict (cartografia_version_id, clave_entidad, id_ine) do nothing
        returning cartografia_colonia_sin_geometria_id
          into v_cartografia_colonia_sin_geometria_id;

        if v_cartografia_colonia_sin_geometria_id is not null then
          v_insertados_lote := v_insertados_lote + 1;
        else
          select c.fuente_sha256 into v_hash_existente
            from public.cartografia_colonias_sin_geometria c
            where c.cartografia_version_id = v_version_id
              and c.clave_entidad = v_entidad and c.id_ine = v_id_ine;
          if v_hash_existente is distinct from v_sha256 then
            raise exception using errcode = '23505',
              message = 'COLONIA sin geometria existente con otra huella';
          end if;
          v_repetidos_lote := v_repetidos_lote + 1;
        end if;
      else
        if exists (
          select 1 from public.cartografia_colonias_sin_geometria c
          where c.cartografia_version_id = v_version_id
            and ((c.clave_entidad = v_entidad and c.id_ine = v_id_ine)
              or c.fila_origen = v_fila)
        ) then
          raise exception using errcode = '23505',
            message = 'COLONIA ya existe en la ruta no espacial';
        end if;
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
-- El trigger cubre tambien INSERT/UPDATE directos y comparte el orden
-- de locks de la RPC de importacion.
create function territorial_private.asegurar_colonias_rutas_disjuntas()
returns trigger language plpgsql volatile security invoker set search_path = ''
as $function$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'SIPEEM:CARTOGRAFIA:VERSION:' || new.cartografia_version_id::text,0));
  perform 1 from public.cartografia_versiones v
    where v.cartografia_version_id = new.cartografia_version_id for update;

  if tg_table_name = 'cartografia_colonias' then
    if exists (
      select 1 from public.cartografia_colonias_sin_geometria c
      where c.cartografia_version_id = new.cartografia_version_id
        and ((c.clave_entidad = new.clave_entidad and c.id_ine = new.id_ine)
          or c.fila_origen = new.fila_origen)
    ) then
      raise exception using errcode = '23505',
        message = 'COLONIA duplicada entre rutas';
    end if;
  elsif tg_table_name = 'cartografia_colonias_sin_geometria' then
    if exists (
      select 1 from public.cartografia_colonias c
      where c.cartografia_version_id = new.cartografia_version_id
        and ((c.clave_entidad = new.clave_entidad and c.id_ine = new.id_ine)
          or c.fila_origen = new.fila_origen)
    ) then
      raise exception using errcode = '23505',
        message = 'COLONIA duplicada entre rutas';
    end if;
  else
    raise exception using errcode = '55000',
      message = 'trigger de disyuncion vinculado a tabla inesperada';
  end if;
  return new;
end;
$function$;
revoke all on function territorial_private.asegurar_colonias_rutas_disjuntas()
  from public, anon, authenticated, service_role;
grant execute on function territorial_private.asegurar_colonias_rutas_disjuntas()
  to service_role;
create trigger cartografia_colonias_rutas_disjuntas
  before insert or update on public.cartografia_colonias
  for each row execute function territorial_private.asegurar_colonias_rutas_disjuntas();
create trigger cartografia_colonias_sin_geometria_rutas_disjuntas
  before insert or update on public.cartografia_colonias_sin_geometria
  for each row execute function territorial_private.asegurar_colonias_rutas_disjuntas();
grant insert on table public.cartografia_colonias_sin_geometria to service_role;
do $grant$
declare v_sequence text;
begin
  v_sequence := pg_catalog.pg_get_serial_sequence(
    'public.cartografia_colonias_sin_geometria',
    'cartografia_colonia_sin_geometria_id');
  if v_sequence is null then
    raise exception 'identity sequence de colonias sin geometria ausente';
  end if;
  execute pg_catalog.format('grant usage, select on sequence %s to service_role',
    v_sequence);
end;
$grant$;
revoke all on function public.rpc_importar_lote_cartografico(
  bigint,text,bigint,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.rpc_importar_lote_cartografico(
  bigint,text,bigint,bigint,jsonb) to service_role;
commit;
