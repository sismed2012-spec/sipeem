create table public.validaciones_electorales_progreso (
  carga_id uuid primary key
    references public.cargas_electorales(carga_id) on delete cascade,
  fase text not null default 'VINCULAR_REGISTROS',
  cursor_id bigint not null default 0,
  snapshot_entrada jsonb not null,
  filas_procesadas bigint not null default 0,
  iniciada_at timestamptz not null default now(),
  completada_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint validaciones_electorales_progreso_fase_ck check (
    fase in (
      'VINCULAR_REGISTROS',
      'VINCULAR_RESULTADOS',
      'VALIDAR_REGISTROS',
      'FINALIZAR',
      'COMPLETA'
    )
  ),
  constraint validaciones_electorales_progreso_cursor_ck
    check (cursor_id >= 0),
  constraint validaciones_electorales_progreso_filas_ck
    check (filas_procesadas >= 0),
  constraint validaciones_electorales_progreso_snapshot_ck
    check (jsonb_typeof(snapshot_entrada) = 'object'),
  constraint validaciones_electorales_progreso_metadata_ck
    check (jsonb_typeof(metadata) = 'object'),
  constraint validaciones_electorales_progreso_completa_ck check (
    (fase = 'COMPLETA' and completada_at is not null)
    or (fase <> 'COMPLETA' and completada_at is null)
  )
);

create trigger validaciones_electorales_progreso_set_updated_at
  before update on public.validaciones_electorales_progreso
  for each row execute function territorial_private.set_updated_at();

create index validaciones_electorales_progreso_pendientes_idx
  on public.validaciones_electorales_progreso (fase, carga_id)
  where fase <> 'COMPLETA';

create index staging_electoral_registros_carga_cursor_idx
  on public.staging_electoral_registros (carga_id, registro_staging_id);

create index staging_electoral_resultados_carga_cursor_idx
  on public.staging_electoral_resultados (carga_id, resultado_staging_id);

alter table public.validaciones_electorales_progreso enable row level security;

revoke all on table public.validaciones_electorales_progreso
  from public, anon, authenticated;
grant select, insert, update, delete
  on table public.validaciones_electorales_progreso
  to service_role;

create function public.rpc_validar_carga_electoral_lote(
  p_carga_id uuid,
  p_lote integer default 500
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado_carga text;
  v_snapshot jsonb;
  v_snapshot_guardada jsonb;
  v_fase text;
  v_cursor bigint;
  v_ids bigint[];
  v_ultimo bigint;
  v_procesados bigint;
  v_total_procesado bigint;
  v_metadata jsonb;
  v_registros bigint;
  v_resultados bigint;
  v_validos bigint;
  v_observados bigint;
  v_cuarentena bigint;
  v_incidencias bigint;
  v_resumen jsonb;
begin
  if p_carga_id is null then
    raise exception 'carga_id es obligatorio' using errcode = '22004';
  end if;

  if p_lote is null or p_lote < 1 or p_lote > 1000 then
    raise exception 'p_lote debe estar entre 1 y 1000'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_carga_id::text, 0)
  );

  select carga.estado
  into v_estado_carga
  from public.cargas_electorales carga
  where carga.carga_id = p_carga_id
  for update;

  if not found then
    raise exception 'No existe la carga electoral %', p_carga_id
      using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'registros', (
      select count(*)
      from public.staging_electoral_registros registro
      where registro.carga_id = p_carga_id
    ),
    'registro_max', coalesce((
      select max(registro.registro_staging_id)
      from public.staging_electoral_registros registro
      where registro.carga_id = p_carga_id
    ), 0),
    'resultados', (
      select count(*)
      from public.staging_electoral_resultados resultado
      where resultado.carga_id = p_carga_id
    ),
    'resultado_max', coalesce((
      select max(resultado.resultado_staging_id)
      from public.staging_electoral_resultados resultado
      where resultado.carga_id = p_carga_id
    ), 0)
  )
  into v_snapshot;

  insert into public.validaciones_electorales_progreso (
    carga_id,
    fase,
    cursor_id,
    snapshot_entrada
  )
  values (
    p_carga_id,
    'VINCULAR_REGISTROS',
    0,
    v_snapshot
  )
  on conflict (carga_id) do nothing;

  select
    progreso.fase,
    progreso.cursor_id,
    progreso.snapshot_entrada,
    progreso.filas_procesadas,
    progreso.metadata
  into
    v_fase,
    v_cursor,
    v_snapshot_guardada,
    v_total_procesado,
    v_metadata
  from public.validaciones_electorales_progreso progreso
  where progreso.carga_id = p_carga_id
  for update;

  if v_snapshot_guardada is distinct from v_snapshot then
    update public.validaciones_electorales_progreso progreso
    set fase = 'VINCULAR_REGISTROS',
        cursor_id = 0,
        snapshot_entrada = v_snapshot,
        filas_procesadas = 0,
        iniciada_at = statement_timestamp(),
        completada_at = null,
        metadata = '{}'::jsonb
    where progreso.carga_id = p_carga_id;

    v_fase := 'VINCULAR_REGISTROS';
    v_cursor := 0;
    v_total_procesado := 0;
    v_metadata := '{}'::jsonb;
  end if;

  if v_fase <> 'COMPLETA' and v_estado_carga <> 'CARGADA' then
    update public.cargas_electorales carga
    set estado = 'CARGADA',
        finalizada_at = null,
        detalle_error = null
    where carga.carga_id = p_carga_id;
  end if;

  if v_fase = 'COMPLETA' then
    return jsonb_build_object(
      'carga_id', p_carga_id,
      'completa', true,
      'fase', 'COMPLETA',
      'cursor', 0,
      'procesados', 0
    ) || coalesce(v_metadata -> 'resumen', '{}'::jsonb);
  end if;

  if v_fase = 'VINCULAR_REGISTROS' then
    select
      coalesce(array_agg(lote.id order by lote.id), '{}'::bigint[]),
      count(*),
      coalesce(max(lote.id), 0)
    into v_ids, v_procesados, v_ultimo
    from (
      select registro.registro_staging_id as id
      from public.staging_electoral_registros registro
      where registro.carga_id = p_carga_id
        and registro.registro_staging_id > v_cursor
      order by registro.registro_staging_id
      limit p_lote
    ) lote;

    if v_procesados = 0 then
      update public.validaciones_electorales_progreso progreso
      set fase = 'VINCULAR_RESULTADOS',
          cursor_id = 0
      where progreso.carga_id = p_carga_id;

      return jsonb_build_object(
        'carga_id', p_carga_id,
        'completa', false,
        'fase', 'VINCULAR_RESULTADOS',
        'cursor', 0,
        'procesados', 0
      );
    end if;

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
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id;

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
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id;

    update public.validaciones_electorales_progreso progreso
    set cursor_id = v_ultimo,
        filas_procesadas = progreso.filas_procesadas + v_procesados
    where progreso.carga_id = p_carga_id;

    return jsonb_build_object(
      'carga_id', p_carga_id,
      'completa', false,
      'fase', v_fase,
      'cursor', v_ultimo,
      'procesados', v_procesados
    );
  end if;

  if v_fase = 'VINCULAR_RESULTADOS' then
    select
      coalesce(array_agg(lote.id order by lote.id), '{}'::bigint[]),
      count(*),
      coalesce(max(lote.id), 0)
    into v_ids, v_procesados, v_ultimo
    from (
      select resultado.resultado_staging_id as id
      from public.staging_electoral_resultados resultado
      where resultado.carga_id = p_carga_id
        and resultado.resultado_staging_id > v_cursor
      order by resultado.resultado_staging_id
      limit p_lote
    ) lote;

    if v_procesados = 0 then
      update public.validaciones_electorales_progreso progreso
      set fase = 'VALIDAR_REGISTROS',
          cursor_id = 0
      where progreso.carga_id = p_carga_id;

      return jsonb_build_object(
        'carga_id', p_carga_id,
        'completa', false,
        'fase', 'VALIDAR_REGISTROS',
        'cursor', 0,
        'procesados', 0
      );
    end if;

    update public.staging_electoral_resultados resultado
    set fuerza_codigo_normalizado = nullif(
          territorial_private.normalizar_codigo_fuerza(
            resultado.fuerza_original
          ),
          ''
        ),
        fuerza_id = null
    where resultado.resultado_staging_id = any(v_ids)
      and resultado.carga_id = p_carga_id;

    with vinculos as (
      select
        resultado.resultado_staging_id,
        case
          when exists (
            select 1
            from public.staging_electoral_resultados version_nueva
            where version_nueva.proyecto_origen = resultado.proyecto_origen
              and version_nueva.tabla_origen = resultado.tabla_origen
              and version_nueva.id_origen = resultado.id_origen
              and (
                version_nueva.capturado_at,
                version_nueva.resultado_staging_id
              ) > (
                resultado.capturado_at,
                resultado.resultado_staging_id
              )
          ) then null
          else (
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
          )
        end as registro_staging_id
      from public.staging_electoral_resultados resultado
      where resultado.resultado_staging_id = any(v_ids)
        and resultado.carga_id = p_carga_id
    )
    update public.staging_electoral_resultados resultado
    set registro_staging_id = vinculo.registro_staging_id
    from vinculos vinculo
    where resultado.resultado_staging_id = vinculo.resultado_staging_id
      and resultado.registro_staging_id
          is distinct from vinculo.registro_staging_id;

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
    where resultado.resultado_staging_id = any(v_ids)
      and resultado.carga_id = p_carga_id;

    delete from public.staging_electoral_incidencias incidencia
    where incidencia.carga_id = p_carga_id
      and not incidencia.resuelta
      and incidencia.resultado_staging_id = any(v_ids);

    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      resultado_staging_id,
      codigo,
      severidad,
      detalle
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
    where resultado.resultado_staging_id = any(v_ids)
      and resultado.carga_id = p_carga_id
      and exists (
        select 1
        from public.staging_electoral_resultados version_nueva
        where version_nueva.proyecto_origen = resultado.proyecto_origen
          and version_nueva.tabla_origen = resultado.tabla_origen
          and version_nueva.id_origen = resultado.id_origen
          and (
            version_nueva.capturado_at,
            version_nueva.resultado_staging_id
          ) > (
            resultado.capturado_at,
            resultado.resultado_staging_id
          )
      );

    insert into public.staging_electoral_incidencias (
      carga_id,
      resultado_staging_id,
      codigo,
      severidad,
      detalle
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
    where resultado.resultado_staging_id = any(v_ids)
      and resultado.carga_id = p_carga_id
      and resultado.registro_staging_id is null
      and not exists (
        select 1
        from public.staging_electoral_resultados version_nueva
        where version_nueva.proyecto_origen = resultado.proyecto_origen
          and version_nueva.tabla_origen = resultado.tabla_origen
          and version_nueva.id_origen = resultado.id_origen
          and (
            version_nueva.capturado_at,
            version_nueva.resultado_staging_id
          ) > (
            resultado.capturado_at,
            resultado.resultado_staging_id
          )
      );

    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      resultado_staging_id,
      codigo,
      severidad,
      detalle
    )
    select
      resultado.carga_id,
      resultado.registro_staging_id,
      resultado.resultado_staging_id,
      'FUERZA_NO_CLASIFICADA',
      'OBSERVACION',
      jsonb_build_object('fuerza_original', resultado.fuerza_original)
    from public.staging_electoral_resultados resultado
    where resultado.resultado_staging_id = any(v_ids)
      and resultado.carga_id = p_carga_id
      and resultado.fuerza_codigo_normalizado is null;

    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      resultado_staging_id,
      codigo,
      severidad,
      detalle
    )
    select
      resultado.carga_id,
      resultado.registro_staging_id,
      resultado.resultado_staging_id,
      'FUERZA_NO_RESUELTA',
      'ERROR',
      jsonb_build_object(
        'fuerza_original', resultado.fuerza_original,
        'fuerza_codigo_normalizado',
        resultado.fuerza_codigo_normalizado
      )
    from public.staging_electoral_resultados resultado
    where resultado.resultado_staging_id = any(v_ids)
      and resultado.carga_id = p_carga_id
      and resultado.registro_staging_id is not null
      and resultado.fuerza_codigo_normalizado is not null
      and resultado.fuerza_id is null;

    update public.staging_electoral_resultados resultado
    set estado_validacion = case
          when exists (
            select 1
            from public.staging_electoral_incidencias incidencia
            where incidencia.resultado_staging_id =
                  resultado.resultado_staging_id
              and not incidencia.resuelta
              and incidencia.severidad = 'ERROR'
          ) then 'CUARENTENA'
          when exists (
            select 1
            from public.staging_electoral_incidencias incidencia
            where incidencia.resultado_staging_id =
                  resultado.resultado_staging_id
              and not incidencia.resuelta
          ) then 'OBSERVADO'
          else 'VALIDO'
        end,
        validado_at = statement_timestamp()
    where resultado.resultado_staging_id = any(v_ids)
      and resultado.carga_id = p_carga_id;

    update public.validaciones_electorales_progreso progreso
    set cursor_id = v_ultimo,
        filas_procesadas = progreso.filas_procesadas + v_procesados
    where progreso.carga_id = p_carga_id;

    return jsonb_build_object(
      'carga_id', p_carga_id,
      'completa', false,
      'fase', v_fase,
      'cursor', v_ultimo,
      'procesados', v_procesados
    );
  end if;

  if v_fase = 'VALIDAR_REGISTROS' then
    select
      coalesce(array_agg(lote.id order by lote.id), '{}'::bigint[]),
      count(*),
      coalesce(max(lote.id), 0)
    into v_ids, v_procesados, v_ultimo
    from (
      select registro.registro_staging_id as id
      from public.staging_electoral_registros registro
      where registro.carga_id = p_carga_id
        and registro.registro_staging_id > v_cursor
      order by registro.registro_staging_id
      limit p_lote
    ) lote;

    if v_procesados = 0 then
      update public.validaciones_electorales_progreso progreso
      set fase = 'FINALIZAR',
          cursor_id = 0
      where progreso.carga_id = p_carga_id;

      return jsonb_build_object(
        'carga_id', p_carga_id,
        'completa', false,
        'fase', 'FINALIZAR',
        'cursor', 0,
        'procesados', 0
      );
    end if;

    delete from public.staging_electoral_incidencias incidencia
    where incidencia.carga_id = p_carga_id
      and not incidencia.resuelta
      and incidencia.resultado_staging_id is null
      and incidencia.registro_staging_id = any(v_ids);

    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      codigo,
      severidad,
      detalle
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
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id
      and exists (
        select 1
        from public.staging_electoral_registros version_nueva
        where version_nueva.proyecto_origen = registro.proyecto_origen
          and version_nueva.tabla_origen = registro.tabla_origen
          and version_nueva.id_origen = registro.id_origen
          and (
            version_nueva.capturado_at,
            version_nueva.registro_staging_id
          ) > (
            registro.capturado_at,
            registro.registro_staging_id
          )
      );

    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      codigo,
      severidad,
      detalle
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
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id
      and registro.municipio_id is null;

    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      codigo,
      severidad,
      detalle
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
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id
      and registro.grano = 'SECCION'
      and registro.seccion_id is null;

    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      codigo,
      severidad,
      detalle
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
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id
      and registro.total_votos is not null
      and coalesce(registro.votos_validos, 0)
          + coalesce(registro.votos_no_registrados, 0)
          + coalesce(registro.votos_nulos, 0)
          <> registro.total_votos;

    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      codigo,
      severidad,
      detalle
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
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id
      and registro.lista_nominal is not null
      and registro.total_votos is not null
      and registro.total_votos > registro.lista_nominal;

    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      codigo,
      severidad,
      detalle
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
          where resultado.registro_staging_id =
                registro.registro_staging_id
            and resultado.carga_id = registro.carga_id
        ), 0)
      )
    from public.staging_electoral_registros registro
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id
      and registro.votos_validos is not null
      and coalesce((
        select sum(resultado.votos)
        from public.staging_electoral_resultados resultado
        where resultado.registro_staging_id =
              registro.registro_staging_id
          and resultado.carga_id = registro.carga_id
      ), 0) <> registro.votos_validos;

    with candidatos as (
      select
        registro.*,
        territorial_private.normalizar_codigo_fuerza(
          registro.ganador_siglas
        ) as ganador_normalizado
      from public.staging_electoral_registros registro
      where registro.registro_staging_id = any(v_ids)
        and registro.carga_id = p_carga_id
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
              and alias.alias_normalizado =
                  candidato.ganador_normalizado
              and (
                alias.municipio_id = candidato.municipio_id
                or alias.municipio_id is null
              )
            order by
              (alias.municipio_id is not null) desc,
              alias.alias_id
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
          where resultado.registro_staging_id =
                candidato.registro_staging_id
            and resultado.carga_id = candidato.carga_id
        ) as maximo_votos
      from candidatos candidato
    )
    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      codigo,
      severidad,
      detalle
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
          when resuelto.ganador_fuerza_id is null
            then 'GANADOR_NO_RESUELTO'
          when resuelto.maximo_votos is null
            then 'SIN_RESULTADOS'
          else 'FUERZA_NO_TIENE_MAXIMO'
        end
      )
    from resueltos resuelto
    where resuelto.ganador_fuerza_id is null
       or resuelto.maximo_votos is null
       or not exists (
         select 1
         from public.staging_electoral_resultados resultado
         where resultado.registro_staging_id =
               resuelto.registro_staging_id
           and resultado.carga_id = resuelto.carga_id
           and resultado.fuerza_id = resuelto.ganador_fuerza_id
           and resultado.votos = resuelto.maximo_votos
       );

    update public.staging_electoral_registros registro
    set estado_validacion = case
          when exists (
            select 1
            from public.staging_electoral_incidencias incidencia
            where incidencia.registro_staging_id =
                  registro.registro_staging_id
              and not incidencia.resuelta
              and incidencia.severidad = 'ERROR'
          ) then 'CUARENTENA'
          when exists (
            select 1
            from public.staging_electoral_incidencias incidencia
            where incidencia.registro_staging_id =
                  registro.registro_staging_id
              and not incidencia.resuelta
          ) then 'OBSERVADO'
          else 'VALIDO'
        end,
        validado_at = statement_timestamp()
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id;

    update public.validaciones_electorales_progreso progreso
    set cursor_id = v_ultimo,
        filas_procesadas = progreso.filas_procesadas + v_procesados
    where progreso.carga_id = p_carga_id;

    return jsonb_build_object(
      'carga_id', p_carga_id,
      'completa', false,
      'fase', v_fase,
      'cursor', v_ultimo,
      'procesados', v_procesados
    );
  end if;

  if v_fase = 'FINALIZAR' then
    select count(*)
    into v_registros
    from public.staging_electoral_registros registro
    where registro.carga_id = p_carga_id;

    select count(*)
    into v_resultados
    from public.staging_electoral_resultados resultado
    where resultado.carga_id = p_carga_id;

    select
      count(*) filter (where registro.estado_validacion = 'VALIDO'),
      count(*) filter (where registro.estado_validacion = 'OBSERVADO'),
      count(*) filter (where registro.estado_validacion = 'CUARENTENA')
    into v_validos, v_observados, v_cuarentena
    from public.staging_electoral_registros registro
    where registro.carga_id = p_carga_id;

    select count(*)
    into v_incidencias
    from public.staging_electoral_incidencias incidencia
    where incidencia.carga_id = p_carga_id
      and not incidencia.resuelta;

    v_resumen := jsonb_build_object(
      'registros', v_registros,
      'resultados', v_resultados,
      'validos', v_validos,
      'observados', v_observados,
      'cuarentena', v_cuarentena,
      'incidencias', v_incidencias
    );

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

    update public.validaciones_electorales_progreso progreso
    set fase = 'COMPLETA',
        cursor_id = 0,
        completada_at = statement_timestamp(),
        metadata = jsonb_build_object('resumen', v_resumen)
    where progreso.carga_id = p_carga_id;

    return jsonb_build_object(
      'carga_id', p_carga_id,
      'completa', true,
      'fase', 'COMPLETA',
      'cursor', 0,
      'procesados', 0
    ) || v_resumen;
  end if;

  raise exception 'Fase de validación no soportada: %', v_fase
    using errcode = 'P0001';
end;
$$;

create or replace function public.rpc_promover_municipales_oficiales(
  p_carga_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado_carga text;
  v_municipios bigint;
  v_fuerzas bigint;
begin
  if p_carga_id is null then
    raise exception 'carga_id es obligatorio' using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_carga_id::text, 0)
  );

  select carga.estado
  into v_estado_carga
  from public.cargas_electorales carga
  where carga.carga_id = p_carga_id
  for update;

  if not found then
    raise exception 'No existe la carga electoral %', p_carga_id
      using errcode = 'P0002';
  end if;

  if v_estado_carga <> 'VALIDADA' then
    raise exception 'La carga debe estar VALIDADA antes de promover'
      using errcode = '55000';
  end if;

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
          order by
            (alias.municipio_id is not null) desc,
            alias.alias_id
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
      segundo_lugar_codigo_normalizado =
        excluded.segundo_lugar_codigo_normalizado,
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
      'fuerza_codigo_normalizado',
      resultado.fuerza_codigo_normalizado
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

revoke all on function public.rpc_validar_carga_electoral_lote(uuid, integer)
  from public, anon, authenticated;
grant execute
  on function public.rpc_validar_carga_electoral_lote(uuid, integer)
  to service_role;

comment on table public.validaciones_electorales_progreso is
  'Checkpoint transaccional y reanudable de la validación electoral por lotes.';
comment on function public.rpc_validar_carga_electoral_lote(uuid, integer) is
  'Procesa una fase acotada de validación y persiste su cursor en la misma transacción.';
comment on function public.rpc_promover_municipales_oficiales(uuid) is
  'Promueve idempotentemente una carga ya VALIDADA sin ejecutar validación monolítica.';

;
