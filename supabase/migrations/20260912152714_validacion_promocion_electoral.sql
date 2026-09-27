create function territorial_private.normalizar_codigo_fuerza(p_valor text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  v_codigo text;
begin
  v_codigo := pg_catalog.upper(pg_catalog.btrim(p_valor));
  v_codigo := pg_catalog.translate(v_codigo, 'ÁÉÍÓÚÜÑ', 'AEIOUUN');
  v_codigo := pg_catalog.regexp_replace(v_codigo, '[^A-Z0-9]+', '_', 'g');
  v_codigo := pg_catalog.regexp_replace(v_codigo, '_+', '_', 'g');
  return pg_catalog.btrim(v_codigo, '_');
end;
$$;

create table public.resultados_municipales_oficiales (
  resultado_municipal_id bigint generated always as identity primary key,
  eleccion_id bigint not null references public.elecciones(eleccion_id),
  municipio_id bigint not null references public.territorios_municipios(municipio_id),
  lista_nominal integer,
  votos_validos integer,
  votos_no_registrados integer,
  votos_nulos integer,
  total_votos integer,
  participacion_porcentaje numeric(9, 4),
  ganador_original text,
  ganador_codigo_normalizado text,
  ganador_fuerza_id bigint,
  ganador_votos integer,
  ganador_porcentaje numeric(9, 4),
  segundo_lugar_original text,
  segundo_lugar_codigo_normalizado text,
  segundo_lugar_votos integer,
  segundo_lugar_porcentaje numeric(9, 4),
  fuente text,
  ruta_acta text,
  carga_id uuid not null references public.cargas_electorales(carga_id),
  proyecto_origen text not null,
  tabla_origen text not null,
  id_origen bigint not null,
  payload_origen jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resultados_municipales_oficiales_ganador_eleccion_fk
    foreign key (ganador_fuerza_id, eleccion_id)
    references public.fuerzas_electorales(fuerza_id, eleccion_id),
  constraint resultados_municipales_oficiales_conteos_ck check (
    (lista_nominal is null or lista_nominal >= 0)
    and (votos_validos is null or votos_validos >= 0)
    and (votos_no_registrados is null or votos_no_registrados >= 0)
    and (votos_nulos is null or votos_nulos >= 0)
    and (total_votos is null or total_votos >= 0)
    and (ganador_votos is null or ganador_votos >= 0)
    and (segundo_lugar_votos is null or segundo_lugar_votos >= 0)
  ),
  constraint resultados_municipales_oficiales_ganador_codigo_ck check (
    ganador_codigo_normalizado is null
    or (
      ganador_codigo_normalizado = upper(ganador_codigo_normalizado)
      and ganador_codigo_normalizado ~ '^[A-Z0-9_]+$'
    )
  ),
  constraint resultados_municipales_oficiales_segundo_codigo_ck check (
    segundo_lugar_codigo_normalizado is null
    or (
      segundo_lugar_codigo_normalizado = upper(segundo_lugar_codigo_normalizado)
      and segundo_lugar_codigo_normalizado ~ '^[A-Z0-9_]+$'
    )
  ),
  constraint resultados_municipales_oficiales_tabla_formato_ck
    check (tabla_origen ~ '^[a-z][a-z0-9_]*$'),
  constraint resultados_municipales_oficiales_id_origen_ck check (id_origen > 0),
  constraint resultados_municipales_oficiales_payload_objeto_ck
    check (jsonb_typeof(payload_origen) = 'object'),
  constraint resultados_municipales_oficiales_metadata_objeto_ck
    check (jsonb_typeof(metadata) = 'object'),
  constraint resultados_municipales_oficiales_eleccion_municipio_uq
    unique (eleccion_id, municipio_id)
);

create table public.resultados_municipales_oficiales_fuerzas (
  detalle_id bigint generated always as identity primary key,
  resultado_municipal_id bigint not null
    references public.resultados_municipales_oficiales(resultado_municipal_id)
    on delete cascade,
  fuerza_id bigint not null references public.fuerzas_electorales(fuerza_id),
  votos integer not null,
  porcentaje numeric(9, 4),
  resultado_staging_id bigint
    references public.staging_electoral_resultados(resultado_staging_id),
  payload_origen jsonb not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resultados_municipales_oficiales_fuerzas_votos_ck
    check (votos >= 0),
  constraint resultados_municipales_oficiales_fuerzas_payload_objeto_ck
    check (jsonb_typeof(payload_origen) = 'object'),
  constraint resultados_municipales_oficiales_fuerzas_metadata_objeto_ck
    check (jsonb_typeof(metadata) = 'object'),
  constraint resultados_municipales_oficiales_fuerzas_resultado_fuerza_uq
    unique (resultado_municipal_id, fuerza_id)
);

create trigger resultados_municipales_oficiales_set_updated_at
  before update on public.resultados_municipales_oficiales
  for each row execute function territorial_private.set_updated_at();
create trigger resultados_municipales_oficiales_fuerzas_set_updated_at
  before update on public.resultados_municipales_oficiales_fuerzas
  for each row execute function territorial_private.set_updated_at();

create index resultados_municipales_oficiales_carga_idx
  on public.resultados_municipales_oficiales (carga_id);
create index resultados_municipales_oficiales_municipio_idx
  on public.resultados_municipales_oficiales (municipio_id, eleccion_id);
create index resultados_municipales_oficiales_ganador_fuerza_idx
  on public.resultados_municipales_oficiales (ganador_fuerza_id, eleccion_id)
  where ganador_fuerza_id is not null;
create index resultados_municipales_oficiales_fuerzas_fuerza_idx
  on public.resultados_municipales_oficiales_fuerzas (fuerza_id);
create index resultados_municipales_oficiales_fuerzas_staging_idx
  on public.resultados_municipales_oficiales_fuerzas (resultado_staging_id)
  where resultado_staging_id is not null;

create view public.v_staging_electoral_promovibilidad
with (security_invoker = true)
as
with evaluacion as (
  select
    registro.*,
    not exists (
      select 1
      from public.staging_electoral_registros version_nueva
      where version_nueva.proyecto_origen = registro.proyecto_origen
        and version_nueva.tabla_origen = registro.tabla_origen
        and version_nueva.id_origen = registro.id_origen
        and (version_nueva.capturado_at, version_nueva.registro_staging_id)
            > (registro.capturado_at, registro.registro_staging_id)
    ) as es_version_vigente,
    not exists (
      select 1
      from public.staging_electoral_incidencias incidencia
      where incidencia.registro_staging_id = registro.registro_staging_id
        and incidencia.carga_id = registro.carga_id
        and not incidencia.resuelta
        and incidencia.severidad = 'ERROR'
    ) as sin_errores_abiertos,
    not exists (
      select 1
      from public.staging_electoral_resultados resultado
      where resultado.registro_staging_id = registro.registro_staging_id
        and resultado.carga_id = registro.carga_id
        and resultado.fuerza_id is null
    ) as fuerzas_resueltas
  from public.staging_electoral_registros registro
)
select
  evaluacion.*,
  (
    evaluacion.es_version_vigente
    and evaluacion.grano = 'MUNICIPIO'
    and evaluacion.estado_validacion in ('VALIDO', 'OBSERVADO')
    and evaluacion.eleccion_id is not null
    and evaluacion.municipio_id is not null
    and evaluacion.sin_errores_abiertos
    and evaluacion.fuerzas_resueltas
  ) as promovible_municipal,
  (
    evaluacion.es_version_vigente
    and evaluacion.grano = 'SECCION'
    and evaluacion.estado_validacion in ('VALIDO', 'OBSERVADO')
    and evaluacion.eleccion_id is not null
    and evaluacion.municipio_id is not null
    and evaluacion.seccion_id is not null
    and evaluacion.sin_errores_abiertos
    and evaluacion.fuerzas_resueltas
  ) as promovible_seccional
from evaluacion;

create function public.rpc_validar_carga_electoral(p_carga_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_registros bigint;
  v_resultados bigint;
  v_validos bigint;
  v_observados bigint;
  v_cuarentena bigint;
  v_incidencias bigint;
begin
  if p_carga_id is null then
    raise exception 'carga_id es obligatorio' using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_carga_id::text, 0)
  );

  perform 1
  from public.cargas_electorales carga
  where carga.carga_id = p_carga_id
  for update;

  if not found then
    raise exception 'No existe la carga electoral %', p_carga_id
      using errcode = 'P0002';
  end if;

  update public.staging_electoral_resultados resultado
  set fuerza_codigo_normalizado = nullif(
        territorial_private.normalizar_codigo_fuerza(resultado.fuerza_original),
        ''
      ),
      fuerza_id = null
  where resultado.carga_id = p_carga_id;

  with vinculos as (
    select
      resultado.resultado_staging_id,
      (
        select registro.registro_staging_id
        from public.staging_electoral_registros registro
        where registro.carga_id = resultado.carga_id
          and registro.proyecto_origen = resultado.proyecto_origen
          and registro.tabla_origen = resultado.tabla_padre_origen
          and registro.id_origen = resultado.id_padre_origen
        order by
          registro.capturado_at desc,
          registro.registro_staging_id desc
        limit 1
      ) as registro_staging_id
    from public.staging_electoral_resultados resultado
    where resultado.carga_id = p_carga_id
  )
  update public.staging_electoral_resultados resultado
  set registro_staging_id = vinculo.registro_staging_id
  from vinculos vinculo
  where resultado.resultado_staging_id = vinculo.resultado_staging_id
    and resultado.registro_staging_id is distinct from vinculo.registro_staging_id;

  update public.staging_electoral_registros registro
  set eleccion_id = (
        select eleccion.eleccion_id
        from public.elecciones eleccion
        where eleccion.clave = registro.eleccion_clave
      ),
      municipio_id = (
        select municipio.municipio_id
        from public.territorios_municipios municipio
        where municipio.clave_entidad = registro.clave_entidad
          and municipio.clave_municipio = registro.clave_municipio_origen
      )
  where registro.carga_id = p_carga_id;

  update public.staging_electoral_registros registro
  set seccion_id = case
        when registro.grano = 'MUNICIPIO' then null
        else (
          select seccion.seccion_id
          from public.territorios_secciones seccion
          where seccion.clave_entidad = registro.clave_entidad
            and seccion.numero = registro.seccion_numero
            and (
              registro.municipio_id is null
              or seccion.municipio_id = registro.municipio_id
            )
          order by seccion.seccion_id
          limit 1
        )
      end
  where registro.carga_id = p_carga_id;

  update public.staging_electoral_resultados resultado
  set fuerza_id = (
        select fuerza.fuerza_id
        from public.staging_electoral_registros registro
        join public.fuerzas_electorales fuerza
          on fuerza.eleccion_id = registro.eleccion_id
         and fuerza.codigo = resultado.fuerza_codigo_normalizado
        where registro.registro_staging_id = resultado.registro_staging_id
          and registro.carga_id = resultado.carga_id
      )
  where resultado.carga_id = p_carga_id;

  delete from public.staging_electoral_incidencias incidencia
  where incidencia.carga_id = p_carga_id
    and not incidencia.resuelta;

  insert into public.staging_electoral_incidencias (
    carga_id, registro_staging_id, codigo, severidad, detalle
  )
  select
    registro.carga_id,
    registro.registro_staging_id,
    'DUPLICADO_ORIGEN',
    'OBSERVACION',
    jsonb_build_object(
      'proyecto_origen', registro.proyecto_origen,
      'tabla_origen', registro.tabla_origen,
      'id_origen', registro.id_origen,
      'payload_sha256', registro.payload_sha256
    )
  from public.staging_electoral_registros registro
  where registro.carga_id = p_carga_id
    and exists (
      select 1
      from public.staging_electoral_registros version_nueva
      where version_nueva.proyecto_origen = registro.proyecto_origen
        and version_nueva.tabla_origen = registro.tabla_origen
        and version_nueva.id_origen = registro.id_origen
        and (version_nueva.capturado_at, version_nueva.registro_staging_id)
            > (registro.capturado_at, registro.registro_staging_id)
    );

  insert into public.staging_electoral_incidencias (
    carga_id, registro_staging_id, resultado_staging_id,
    codigo, severidad, detalle
  )
  select
    resultado.carga_id,
    resultado.registro_staging_id,
    resultado.resultado_staging_id,
    'DUPLICADO_ORIGEN',
    'OBSERVACION',
    jsonb_build_object(
      'proyecto_origen', resultado.proyecto_origen,
      'tabla_origen', resultado.tabla_origen,
      'id_origen', resultado.id_origen,
      'payload_sha256', resultado.payload_sha256
    )
  from public.staging_electoral_resultados resultado
  where resultado.carga_id = p_carga_id
    and exists (
      select 1
      from public.staging_electoral_resultados version_nueva
      where version_nueva.proyecto_origen = resultado.proyecto_origen
        and version_nueva.tabla_origen = resultado.tabla_origen
        and version_nueva.id_origen = resultado.id_origen
        and (version_nueva.capturado_at, version_nueva.resultado_staging_id)
            > (resultado.capturado_at, resultado.resultado_staging_id)
    );

  insert into public.staging_electoral_incidencias (
    carga_id, resultado_staging_id, codigo, severidad, detalle
  )
  select
    resultado.carga_id,
    resultado.resultado_staging_id,
    'REGISTRO_HIJO_HUERFANO',
    'ERROR',
    jsonb_build_object(
      'tabla_padre_origen', resultado.tabla_padre_origen,
      'id_padre_origen', resultado.id_padre_origen
    )
  from public.staging_electoral_resultados resultado
  where resultado.carga_id = p_carga_id
    and resultado.registro_staging_id is null;

  insert into public.staging_electoral_incidencias (
    carga_id, registro_staging_id, codigo, severidad, detalle
  )
  select
    registro.carga_id,
    registro.registro_staging_id,
    'MUNICIPIO_NO_RESUELTO',
    'ERROR',
    jsonb_build_object(
      'clave_entidad', registro.clave_entidad,
      'clave_municipio_origen', registro.clave_municipio_origen
    )
  from public.staging_electoral_registros registro
  where registro.carga_id = p_carga_id
    and registro.municipio_id is null;

  insert into public.staging_electoral_incidencias (
    carga_id, registro_staging_id, codigo, severidad, detalle
  )
  select
    registro.carga_id,
    registro.registro_staging_id,
    'SECCION_PENDIENTE_CARTOGRAFIA',
    'OBSERVACION',
    jsonb_build_object(
      'clave_entidad', registro.clave_entidad,
      'seccion_numero', registro.seccion_numero
    )
  from public.staging_electoral_registros registro
  where registro.carga_id = p_carga_id
    and registro.grano = 'SECCION'
    and registro.seccion_id is null;

  insert into public.staging_electoral_incidencias (
    carga_id, registro_staging_id, resultado_staging_id,
    codigo, severidad, detalle
  )
  select
    resultado.carga_id,
    resultado.registro_staging_id,
    resultado.resultado_staging_id,
    'FUERZA_NO_CLASIFICADA',
    'OBSERVACION',
    jsonb_build_object('fuerza_original', resultado.fuerza_original)
  from public.staging_electoral_resultados resultado
  where resultado.carga_id = p_carga_id
    and resultado.fuerza_codigo_normalizado is null;

  insert into public.staging_electoral_incidencias (
    carga_id, registro_staging_id, resultado_staging_id,
    codigo, severidad, detalle
  )
  select
    resultado.carga_id,
    resultado.registro_staging_id,
    resultado.resultado_staging_id,
    'FUERZA_NO_RESUELTA',
    'ERROR',
    jsonb_build_object(
      'fuerza_original', resultado.fuerza_original,
      'fuerza_codigo_normalizado', resultado.fuerza_codigo_normalizado
    )
  from public.staging_electoral_resultados resultado
  where resultado.carga_id = p_carga_id
    and resultado.fuerza_codigo_normalizado is not null
    and resultado.fuerza_id is null;

  insert into public.staging_electoral_incidencias (
    carga_id, registro_staging_id, codigo, severidad, detalle
  )
  select
    registro.carga_id,
    registro.registro_staging_id,
    'TOTAL_NO_COINCIDE_COMPONENTES',
    'ERROR',
    jsonb_build_object(
      'votos_validos', registro.votos_validos,
      'votos_no_registrados', registro.votos_no_registrados,
      'votos_nulos', registro.votos_nulos,
      'total_votos', registro.total_votos
    )
  from public.staging_electoral_registros registro
  where registro.carga_id = p_carga_id
    and registro.total_votos is not null
    and coalesce(registro.votos_validos, 0)
        + coalesce(registro.votos_no_registrados, 0)
        + coalesce(registro.votos_nulos, 0)
        <> registro.total_votos;

  insert into public.staging_electoral_incidencias (
    carga_id, registro_staging_id, codigo, severidad, detalle
  )
  select
    registro.carga_id,
    registro.registro_staging_id,
    'TOTAL_SUPERA_LISTA_NOMINAL',
    'ERROR',
    jsonb_build_object(
      'lista_nominal', registro.lista_nominal,
      'total_votos', registro.total_votos
    )
  from public.staging_electoral_registros registro
  where registro.carga_id = p_carga_id
    and registro.lista_nominal is not null
    and registro.total_votos is not null
    and registro.total_votos > registro.lista_nominal;

  insert into public.staging_electoral_incidencias (
    carga_id, registro_staging_id, codigo, severidad, detalle
  )
  select
    registro.carga_id,
    registro.registro_staging_id,
    'RESULTADOS_NO_COINCIDEN_VALIDOS',
    'ERROR',
    jsonb_build_object(
      'votos_validos', registro.votos_validos,
      'suma_resultados', coalesce((
        select sum(resultado.votos)
        from public.staging_electoral_resultados resultado
        where resultado.registro_staging_id = registro.registro_staging_id
          and resultado.carga_id = registro.carga_id
      ), 0)
    )
  from public.staging_electoral_registros registro
  where registro.carga_id = p_carga_id
    and registro.votos_validos is not null
    and coalesce((
      select sum(resultado.votos)
      from public.staging_electoral_resultados resultado
      where resultado.registro_staging_id = registro.registro_staging_id
        and resultado.carga_id = registro.carga_id
    ), 0) <> registro.votos_validos;

  with candidatos as (
    select
      registro.*,
      territorial_private.normalizar_codigo_fuerza(
        registro.ganador_siglas
      ) as ganador_normalizado
    from public.staging_electoral_registros registro
    where registro.carga_id = p_carga_id
      and registro.grano = 'MUNICIPIO'
      and registro.ganador_siglas is not null
  ),
  resueltos as (
    select
      candidato.*,
      coalesce(
        (
          select alias.fuerza_id
          from public.fuerzas_electorales_aliases alias
          where alias.eleccion_id = candidato.eleccion_id
            and alias.tabla_origen = candidato.tabla_origen
            and alias.campo_origen = 'ganador_siglas'
            and alias.alias_normalizado = candidato.ganador_normalizado
            and (
              alias.municipio_id = candidato.municipio_id
              or alias.municipio_id is null
            )
          order by (alias.municipio_id is not null) desc, alias.alias_id
          limit 1
        ),
        (
          select fuerza.fuerza_id
          from public.fuerzas_electorales fuerza
          where fuerza.eleccion_id = candidato.eleccion_id
            and fuerza.codigo = candidato.ganador_normalizado
        )
      ) as ganador_fuerza_id,
      (
        select max(resultado.votos)
        from public.staging_electoral_resultados resultado
        where resultado.registro_staging_id = candidato.registro_staging_id
          and resultado.carga_id = candidato.carga_id
      ) as maximo_votos
    from candidatos candidato
  )
  insert into public.staging_electoral_incidencias (
    carga_id, registro_staging_id, codigo, severidad, detalle
  )
  select
    resuelto.carga_id,
    resuelto.registro_staging_id,
    'GANADOR_NO_COINCIDE_RESULTADOS',
    'OBSERVACION',
    jsonb_build_object(
      'ganador_original', resuelto.ganador_siglas,
      'ganador_normalizado', resuelto.ganador_normalizado,
      'ganador_fuerza_id', resuelto.ganador_fuerza_id,
      'maximo_votos', resuelto.maximo_votos,
      'motivo', case
        when resuelto.ganador_fuerza_id is null then 'GANADOR_NO_RESUELTO'
        when resuelto.maximo_votos is null then 'SIN_RESULTADOS'
        else 'FUERZA_NO_TIENE_MAXIMO'
      end
    )
  from resueltos resuelto
  where resuelto.ganador_fuerza_id is null
     or resuelto.maximo_votos is null
     or not exists (
       select 1
       from public.staging_electoral_resultados resultado
       where resultado.registro_staging_id = resuelto.registro_staging_id
         and resultado.carga_id = resuelto.carga_id
         and resultado.fuerza_id = resuelto.ganador_fuerza_id
         and resultado.votos = resuelto.maximo_votos
     );

  update public.staging_electoral_resultados resultado
  set estado_validacion = case
        when exists (
          select 1
          from public.staging_electoral_incidencias incidencia
          where incidencia.resultado_staging_id = resultado.resultado_staging_id
            and not incidencia.resuelta
            and incidencia.severidad = 'ERROR'
        ) then 'CUARENTENA'
        when exists (
          select 1
          from public.staging_electoral_incidencias incidencia
          where incidencia.resultado_staging_id = resultado.resultado_staging_id
            and not incidencia.resuelta
        ) then 'OBSERVADO'
        else 'VALIDO'
      end,
      validado_at = statement_timestamp()
  where resultado.carga_id = p_carga_id;

  update public.staging_electoral_registros registro
  set estado_validacion = case
        when exists (
          select 1
          from public.staging_electoral_incidencias incidencia
          where incidencia.registro_staging_id = registro.registro_staging_id
            and not incidencia.resuelta
            and incidencia.severidad = 'ERROR'
        ) then 'CUARENTENA'
        when exists (
          select 1
          from public.staging_electoral_incidencias incidencia
          where incidencia.registro_staging_id = registro.registro_staging_id
            and not incidencia.resuelta
        ) then 'OBSERVADO'
        else 'VALIDO'
      end,
      validado_at = statement_timestamp()
  where registro.carga_id = p_carga_id;

  select count(*) into v_registros
  from public.staging_electoral_registros registro
  where registro.carga_id = p_carga_id;

  select count(*) into v_resultados
  from public.staging_electoral_resultados resultado
  where resultado.carga_id = p_carga_id;

  select
    count(*) filter (where registro.estado_validacion = 'VALIDO'),
    count(*) filter (where registro.estado_validacion = 'OBSERVADO'),
    count(*) filter (where registro.estado_validacion = 'CUARENTENA')
  into v_validos, v_observados, v_cuarentena
  from public.staging_electoral_registros registro
  where registro.carga_id = p_carga_id;

  select count(*) into v_incidencias
  from public.staging_electoral_incidencias incidencia
  where incidencia.carga_id = p_carga_id
    and not incidencia.resuelta;

  update public.cargas_electorales carga
  set estado = 'VALIDADA',
      registros_recibidos = v_registros,
      resultados_recibidos = v_resultados,
      registros_validos = v_validos,
      registros_observados = v_observados,
      registros_cuarentena = v_cuarentena,
      iniciada_at = coalesce(carga.iniciada_at, carga.created_at),
      finalizada_at = statement_timestamp(),
      detalle_error = null
  where carga.carga_id = p_carga_id;

  return jsonb_build_object(
    'carga_id', p_carga_id,
    'registros', v_registros,
    'resultados', v_resultados,
    'validos', v_validos,
    'observados', v_observados,
    'cuarentena', v_cuarentena,
    'incidencias', v_incidencias
  );
end;
$$;

create function public.rpc_promover_municipales_oficiales(p_carga_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_municipios bigint;
  v_fuerzas bigint;
begin
  if p_carga_id is null then
    raise exception 'carga_id es obligatorio' using errcode = '22004';
  end if;

  perform public.rpc_validar_carga_electoral(p_carga_id);

  with candidatos as (
    select distinct on (registro.eleccion_id, registro.municipio_id)
      registro.*
    from public.v_staging_electoral_promovibilidad registro
    where registro.carga_id = p_carga_id
      and registro.promovible_municipal
    order by
      registro.eleccion_id,
      registro.municipio_id,
      registro.capturado_at desc,
      registro.registro_staging_id desc
  ),
  normalizados as (
    select
      candidato.*,
      territorial_private.normalizar_codigo_fuerza(
        candidato.ganador_siglas
      ) as ganador_normalizado,
      territorial_private.normalizar_codigo_fuerza(
        candidato.segundo_lugar_siglas
      ) as segundo_normalizado
    from candidatos candidato
  ),
  preparados as (
    select
      normalizado.*,
      coalesce(
        (
          select alias.fuerza_id
          from public.fuerzas_electorales_aliases alias
          where alias.eleccion_id = normalizado.eleccion_id
            and alias.tabla_origen = normalizado.tabla_origen
            and alias.campo_origen = 'ganador_siglas'
            and alias.alias_normalizado = normalizado.ganador_normalizado
            and (
              alias.municipio_id = normalizado.municipio_id
              or alias.municipio_id is null
            )
          order by (alias.municipio_id is not null) desc, alias.alias_id
          limit 1
        ),
        (
          select fuerza.fuerza_id
          from public.fuerzas_electorales fuerza
          where fuerza.eleccion_id = normalizado.eleccion_id
            and fuerza.codigo = normalizado.ganador_normalizado
        )
      ) as ganador_fuerza_resuelta
    from normalizados normalizado
  )
  insert into public.resultados_municipales_oficiales (
    eleccion_id,
    municipio_id,
    lista_nominal,
    votos_validos,
    votos_no_registrados,
    votos_nulos,
    total_votos,
    participacion_porcentaje,
    ganador_original,
    ganador_codigo_normalizado,
    ganador_fuerza_id,
    ganador_votos,
    ganador_porcentaje,
    segundo_lugar_original,
    segundo_lugar_codigo_normalizado,
    segundo_lugar_votos,
    segundo_lugar_porcentaje,
    fuente,
    ruta_acta,
    carga_id,
    proyecto_origen,
    tabla_origen,
    id_origen,
    payload_origen,
    metadata
  )
  select
    preparado.eleccion_id,
    preparado.municipio_id,
    preparado.lista_nominal,
    preparado.votos_validos,
    preparado.votos_no_registrados,
    preparado.votos_nulos,
    preparado.total_votos,
    preparado.participacion_porcentaje,
    preparado.ganador_siglas,
    preparado.ganador_normalizado,
    preparado.ganador_fuerza_resuelta,
    preparado.ganador_votos,
    preparado.ganador_porcentaje,
    preparado.segundo_lugar_siglas,
    preparado.segundo_normalizado,
    preparado.segundo_lugar_votos,
    preparado.segundo_lugar_porcentaje,
    preparado.fuente,
    preparado.ruta_acta,
    preparado.carga_id,
    preparado.proyecto_origen,
    preparado.tabla_origen,
    preparado.id_origen,
    preparado.payload_origen,
    jsonb_build_object(
      'registro_staging_id', preparado.registro_staging_id,
      'payload_sha256', preparado.payload_sha256
    )
  from preparados preparado
  on conflict (eleccion_id, municipio_id) do update
  set lista_nominal = excluded.lista_nominal,
      votos_validos = excluded.votos_validos,
      votos_no_registrados = excluded.votos_no_registrados,
      votos_nulos = excluded.votos_nulos,
      total_votos = excluded.total_votos,
      participacion_porcentaje = excluded.participacion_porcentaje,
      ganador_original = excluded.ganador_original,
      ganador_codigo_normalizado = excluded.ganador_codigo_normalizado,
      ganador_fuerza_id = excluded.ganador_fuerza_id,
      ganador_votos = excluded.ganador_votos,
      ganador_porcentaje = excluded.ganador_porcentaje,
      segundo_lugar_original = excluded.segundo_lugar_original,
      segundo_lugar_codigo_normalizado = excluded.segundo_lugar_codigo_normalizado,
      segundo_lugar_votos = excluded.segundo_lugar_votos,
      segundo_lugar_porcentaje = excluded.segundo_lugar_porcentaje,
      fuente = excluded.fuente,
      ruta_acta = excluded.ruta_acta,
      carga_id = excluded.carga_id,
      proyecto_origen = excluded.proyecto_origen,
      tabla_origen = excluded.tabla_origen,
      id_origen = excluded.id_origen,
      payload_origen = excluded.payload_origen,
      metadata = excluded.metadata;

  get diagnostics v_municipios = row_count;

  with candidatos as (
    select distinct on (registro.eleccion_id, registro.municipio_id)
      registro.*
    from public.v_staging_electoral_promovibilidad registro
    where registro.carga_id = p_carga_id
      and registro.promovible_municipal
    order by
      registro.eleccion_id,
      registro.municipio_id,
      registro.capturado_at desc,
      registro.registro_staging_id desc
  )
  insert into public.resultados_municipales_oficiales_fuerzas (
    resultado_municipal_id,
    fuerza_id,
    votos,
    porcentaje,
    resultado_staging_id,
    payload_origen,
    metadata
  )
  select
    oficial.resultado_municipal_id,
    resultado.fuerza_id,
    resultado.votos,
    resultado.porcentaje,
    resultado.resultado_staging_id,
    resultado.payload_origen,
    jsonb_build_object(
      'payload_sha256', resultado.payload_sha256,
      'fuerza_original', resultado.fuerza_original,
      'fuerza_codigo_normalizado', resultado.fuerza_codigo_normalizado
    )
  from candidatos candidato
  join public.resultados_municipales_oficiales oficial
    on oficial.eleccion_id = candidato.eleccion_id
   and oficial.municipio_id = candidato.municipio_id
  join public.staging_electoral_resultados resultado
    on resultado.registro_staging_id = candidato.registro_staging_id
   and resultado.carga_id = candidato.carga_id
  where resultado.fuerza_id is not null
    and resultado.votos is not null
  on conflict (resultado_municipal_id, fuerza_id) do update
  set votos = excluded.votos,
      porcentaje = excluded.porcentaje,
      resultado_staging_id = excluded.resultado_staging_id,
      payload_origen = excluded.payload_origen,
      metadata = excluded.metadata;

  get diagnostics v_fuerzas = row_count;

  return jsonb_build_object(
    'carga_id', p_carga_id,
    'municipios_promovidos', v_municipios,
    'fuerzas_promovidas', v_fuerzas
  );
end;
$$;

alter table public.resultados_municipales_oficiales enable row level security;
alter table public.resultados_municipales_oficiales_fuerzas enable row level security;

revoke all on table
  public.resultados_municipales_oficiales,
  public.resultados_municipales_oficiales_fuerzas,
  public.v_staging_electoral_promovibilidad
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.resultados_municipales_oficiales,
  public.resultados_municipales_oficiales_fuerzas
to service_role;
grant select on table public.v_staging_electoral_promovibilidad to service_role;

revoke all on sequence
  public.resultados_municipales_oficiales_resultado_municipal_id_seq,
  public.resultados_municipales_oficiales_fuerzas_detalle_id_seq
from public, anon, authenticated;

grant usage, select on sequence
  public.resultados_municipales_oficiales_resultado_municipal_id_seq,
  public.resultados_municipales_oficiales_fuerzas_detalle_id_seq
to service_role;

grant usage on schema territorial_private to service_role;
revoke all on function territorial_private.normalizar_codigo_fuerza(text)
  from public, anon, authenticated;
grant execute on function territorial_private.normalizar_codigo_fuerza(text)
  to service_role;

revoke all on function public.rpc_validar_carga_electoral(uuid)
  from public, anon, authenticated;
revoke all on function public.rpc_promover_municipales_oficiales(uuid)
  from public, anon, authenticated;
grant execute on function public.rpc_validar_carga_electoral(uuid)
  to service_role;
grant execute on function public.rpc_promover_municipales_oficiales(uuid)
  to service_role;

comment on function territorial_private.normalizar_codigo_fuerza(text) is
  'Normaliza únicamente tipografía y separadores; no infiere alianzas ni equivalencias.';
comment on function public.rpc_validar_carga_electoral(uuid) is
  'Enlaza, evalúa y clasifica una carga de staging sin modificar su evidencia original.';
comment on view public.v_staging_electoral_promovibilidad is
  'Expone barreras de promoción por versión, vínculos, incidencias y cartografía.';
comment on table public.resultados_municipales_oficiales is
  'Agregado municipal oficial independiente de cualquier suma seccional.';
comment on table public.resultados_municipales_oficiales_fuerzas is
  'Detalle de votación por fuerza dentro del agregado municipal oficial.';
comment on function public.rpc_promover_municipales_oficiales(uuid) is
  'Valida y promueve idempotentemente sólo agregados municipales elegibles.';

;
