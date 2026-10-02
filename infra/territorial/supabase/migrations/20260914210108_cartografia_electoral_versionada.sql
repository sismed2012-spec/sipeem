begin;
lock table
  public.staging_electoral_registros,
  public.resultados_electorales,
  public.listas_nominales,
  public.participacion_electoral
in share row exclusive mode;
do $barrera_bloqueada$
begin
  if exists (select 1 from public.resultados_electorales)
     or exists (select 1 from public.listas_nominales)
     or exists (select 1 from public.participacion_electoral)
     or exists (
       select 1
       from public.staging_electoral_registros
       where seccion_id is not null
     ) then
    raise exception using
      errcode = '55000',
      message = 'M14 requiere tablas canónicas vacías y staging seccional sin vínculos previos';
  end if;
end;
$barrera_bloqueada$;
alter table public.elecciones
  add column cartografia_version_id bigint;
alter table public.elecciones
  add constraint elecciones_cartografia_version_fk
    foreign key (cartografia_version_id)
    references public.cartografia_versiones (cartografia_version_id)
    on update no action
    on delete restrict
    not deferrable,
  add constraint elecciones_id_cartografia_version_uq
    unique (eleccion_id, cartografia_version_id);
create index elecciones_cartografia_version_idx
  on public.elecciones (cartografia_version_id);
alter table public.staging_electoral_registros
  add column cartografia_version_id bigint,
  add column cartografia_seccion_id bigint;
alter table public.staging_electoral_registros
  add constraint staging_electoral_registros_resolucion_cartografica_ck
    check (
      (seccion_id is null
       and cartografia_version_id is null
       and cartografia_seccion_id is null)
      or
      (seccion_id is not null
       and cartografia_version_id is not null
       and cartografia_seccion_id is not null)
    ),
  add constraint staging_electoral_registros_eleccion_cartografia_fk
    foreign key (eleccion_id, cartografia_version_id)
    references public.elecciones (eleccion_id, cartografia_version_id)
    on update no action
    on delete restrict
    not deferrable,
  add constraint staging_electoral_registros_seccion_cartografia_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    )
    on update no action
    on delete restrict
    not deferrable;
create index staging_electoral_registros_eleccion_cartografia_idx
  on public.staging_electoral_registros (
    eleccion_id,
    cartografia_version_id
  );
create index staging_electoral_registros_seccion_cartografia_idx
  on public.staging_electoral_registros (
    cartografia_seccion_id,
    cartografia_version_id,
    seccion_id
  );
alter table public.resultados_electorales
  add column cartografia_version_id bigint not null,
  add column cartografia_seccion_id bigint not null;
alter table public.listas_nominales
  add column cartografia_version_id bigint not null,
  add column cartografia_seccion_id bigint not null;
alter table public.participacion_electoral
  add column cartografia_version_id bigint not null,
  add column cartografia_seccion_id bigint not null;
alter table public.participacion_electoral
  drop constraint participacion_electoral_lista_nominal_fk;
alter table public.resultados_electorales
  drop constraint resultados_electorales_eleccion_seccion_fuerza_uq;
alter table public.listas_nominales
  drop constraint listas_nominales_eleccion_seccion_uq;
alter table public.participacion_electoral
  drop constraint participacion_electoral_eleccion_seccion_uq;
alter table public.resultados_electorales
  add constraint resultados_electorales_eleccion_cartografia_seccion_fuerza_uq
    unique (
      eleccion_id,
      cartografia_version_id,
      cartografia_seccion_id,
      fuerza_id
    ),
  add constraint resultados_electorales_eleccion_cartografia_fk
    foreign key (eleccion_id, cartografia_version_id)
    references public.elecciones (eleccion_id, cartografia_version_id)
    on update no action
    on delete restrict
    not deferrable,
  add constraint resultados_electorales_seccion_cartografia_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    )
    on update no action
    on delete restrict
    not deferrable;
alter table public.listas_nominales
  add constraint listas_nominales_eleccion_cartografia_seccion_uq
    unique (
      eleccion_id,
      cartografia_version_id,
      cartografia_seccion_id
    ),
  add constraint listas_nominales_eleccion_cartografia_fk
    foreign key (eleccion_id, cartografia_version_id)
    references public.elecciones (eleccion_id, cartografia_version_id)
    on update no action
    on delete restrict
    not deferrable,
  add constraint listas_nominales_seccion_cartografia_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    )
    on update no action
    on delete restrict
    not deferrable;
alter table public.participacion_electoral
  add constraint participacion_electoral_eleccion_cartografia_seccion_uq
    unique (
      eleccion_id,
      cartografia_version_id,
      cartografia_seccion_id
    ),
  add constraint participacion_electoral_eleccion_cartografia_fk
    foreign key (eleccion_id, cartografia_version_id)
    references public.elecciones (eleccion_id, cartografia_version_id)
    on update no action
    on delete restrict
    not deferrable,
  add constraint participacion_electoral_seccion_cartografia_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    )
    on update no action
    on delete restrict
    not deferrable,
  add constraint participacion_electoral_lista_nominal_fk
    foreign key (
      eleccion_id,
      cartografia_version_id,
      cartografia_seccion_id
    )
    references public.listas_nominales (
      eleccion_id,
      cartografia_version_id,
      cartografia_seccion_id
    )
    on update no action
    on delete restrict
    not deferrable;
create index resultados_electorales_seccion_cartografia_idx
  on public.resultados_electorales (
    cartografia_seccion_id,
    cartografia_version_id,
    seccion_id
  );
create index listas_nominales_seccion_cartografia_idx
  on public.listas_nominales (
    cartografia_seccion_id,
    cartografia_version_id,
    seccion_id
  );
create index participacion_electoral_seccion_cartografia_idx
  on public.participacion_electoral (
    cartografia_seccion_id,
    cartografia_version_id,
    seccion_id
  );
create function territorial_private.validar_eleccion_cartografia_integridad()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $$
declare
  v_estado text;
begin
  if new.cartografia_version_id is null then
    return new;
  end if;

  select version.estado
  into v_estado
  from public.cartografia_versiones version
  where version.cartografia_version_id = new.cartografia_version_id;

  if not found then
    return new;
  end if;

  if v_estado not in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA') then
    raise exception
      'La versión cartográfica % no está habilitada para elecciones',
      new.cartografia_version_id
      using errcode = '55000';
  end if;

  return new;
end;
$$;
create function territorial_private.bloquear_escritura_electoral_canonica()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'SIPEEM:ELECTORAL_CANONICA:ESCRITURA',
      0
    )
  );

  return null;
end;
$$;
create or replace function territorial_private.validar_lista_nominal_integridad()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $$
declare
  v_votos_emitidos integer;
  v_lock_nuevo bigint;
  v_lock_anterior bigint;
begin
  v_lock_nuevo := pg_catalog.hashtextextended(
    new.eleccion_id::text || ':' ||
    new.cartografia_version_id::text || ':' ||
    new.cartografia_seccion_id::text,
    0
  );

  if tg_op = 'UPDATE' then
    v_lock_anterior := pg_catalog.hashtextextended(
      old.eleccion_id::text || ':' ||
      old.cartografia_version_id::text || ':' ||
      old.cartografia_seccion_id::text,
      0
    );
    perform pg_catalog.pg_advisory_xact_lock(
      least(v_lock_nuevo, v_lock_anterior)
    );
    if v_lock_nuevo <> v_lock_anterior then
      perform pg_catalog.pg_advisory_xact_lock(
        greatest(v_lock_nuevo, v_lock_anterior)
      );
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_lock_nuevo);
  end if;

  select participacion.votos_emitidos
  into v_votos_emitidos
  from public.participacion_electoral participacion
  where participacion.eleccion_id = new.eleccion_id
    and participacion.cartografia_version_id = new.cartografia_version_id
    and participacion.cartografia_seccion_id = new.cartografia_seccion_id;

  if v_votos_emitidos is not null and v_votos_emitidos > new.total then
    raise exception
      'La lista nominal (%) no puede ser menor a los votos emitidos (%)',
      new.total,
      v_votos_emitidos
      using errcode = '23514';
  end if;

  return new;
end;
$$;
create or replace function territorial_private.validar_participacion_integridad()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $$
declare
  v_lista_nominal integer;
  v_resultados_total bigint;
  v_lock_nuevo bigint;
  v_lock_anterior bigint;
begin
  v_lock_nuevo := pg_catalog.hashtextextended(
    new.eleccion_id::text || ':' ||
    new.cartografia_version_id::text || ':' ||
    new.cartografia_seccion_id::text,
    0
  );

  if tg_op = 'UPDATE' then
    v_lock_anterior := pg_catalog.hashtextextended(
      old.eleccion_id::text || ':' ||
      old.cartografia_version_id::text || ':' ||
      old.cartografia_seccion_id::text,
      0
    );
    perform pg_catalog.pg_advisory_xact_lock(
      least(v_lock_nuevo, v_lock_anterior)
    );
    if v_lock_nuevo <> v_lock_anterior then
      perform pg_catalog.pg_advisory_xact_lock(
        greatest(v_lock_nuevo, v_lock_anterior)
      );
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_lock_nuevo);
  end if;

  select lista.total
  into v_lista_nominal
  from public.listas_nominales lista
  where lista.eleccion_id = new.eleccion_id
    and lista.cartografia_version_id = new.cartografia_version_id
    and lista.cartografia_seccion_id = new.cartografia_seccion_id;

  if v_lista_nominal is not null and new.votos_emitidos > v_lista_nominal then
    raise exception 'Los votos emitidos (%) superan la lista nominal (%)',
      new.votos_emitidos,
      v_lista_nominal
      using errcode = '23514';
  end if;

  select coalesce(pg_catalog.sum(resultado.votos), 0)
  into v_resultados_total
  from public.resultados_electorales resultado
  where resultado.eleccion_id = new.eleccion_id
    and resultado.cartografia_version_id = new.cartografia_version_id
    and resultado.cartografia_seccion_id = new.cartografia_seccion_id;

  if v_resultados_total > new.votos_validos then
    raise exception
      'Los resultados por partido (%) superan los votos válidos (%)',
      v_resultados_total,
      new.votos_validos
      using errcode = '23514';
  end if;

  return new;
end;
$$;
create or replace function territorial_private.validar_resultado_electoral_integridad()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $$
declare
  v_votos_validos integer;
  v_resultados_total bigint;
  v_lock_nuevo bigint;
  v_lock_anterior bigint;
begin
  v_lock_nuevo := pg_catalog.hashtextextended(
    new.eleccion_id::text || ':' ||
    new.cartografia_version_id::text || ':' ||
    new.cartografia_seccion_id::text,
    0
  );

  if tg_op = 'UPDATE' then
    v_lock_anterior := pg_catalog.hashtextextended(
      old.eleccion_id::text || ':' ||
      old.cartografia_version_id::text || ':' ||
      old.cartografia_seccion_id::text,
      0
    );
    perform pg_catalog.pg_advisory_xact_lock(
      least(v_lock_nuevo, v_lock_anterior)
    );
    if v_lock_nuevo <> v_lock_anterior then
      perform pg_catalog.pg_advisory_xact_lock(
        greatest(v_lock_nuevo, v_lock_anterior)
      );
    end if;
  else
    perform pg_catalog.pg_advisory_xact_lock(v_lock_nuevo);
  end if;

  select participacion.votos_validos
  into v_votos_validos
  from public.participacion_electoral participacion
  where participacion.eleccion_id = new.eleccion_id
    and participacion.cartografia_version_id = new.cartografia_version_id
    and participacion.cartografia_seccion_id = new.cartografia_seccion_id;

  if v_votos_validos is null then
    return new;
  end if;

  select coalesce(pg_catalog.sum(resultado.votos), 0)
  into v_resultados_total
  from public.resultados_electorales resultado
  where resultado.eleccion_id = new.eleccion_id
    and resultado.cartografia_version_id = new.cartografia_version_id
    and resultado.cartografia_seccion_id = new.cartografia_seccion_id
    and (tg_op <> 'UPDATE' or resultado.resultado_id <> old.resultado_id);

  if v_resultados_total + new.votos > v_votos_validos then
    raise exception
      'Los resultados por partido (%) superan los votos válidos (%)',
      v_resultados_total + new.votos,
      v_votos_validos
      using errcode = '23514';
  end if;

  return new;
end;
$$;
alter function territorial_private.validar_lista_nominal_integridad()
  owner to postgres;
alter function territorial_private.validar_participacion_integridad()
  owner to postgres;
alter function territorial_private.validar_resultado_electoral_integridad()
  owner to postgres;
revoke all on function territorial_private.validar_lista_nominal_integridad()
  from public, anon, authenticated, service_role;
revoke all on function territorial_private.validar_participacion_integridad()
  from public, anon, authenticated, service_role;
revoke all on function territorial_private.validar_resultado_electoral_integridad()
  from public, anon, authenticated, service_role;
grant execute on function territorial_private.validar_lista_nominal_integridad()
  to postgres;
grant execute on function territorial_private.validar_participacion_integridad()
  to postgres;
grant execute on function territorial_private.validar_resultado_electoral_integridad()
  to postgres;
alter function territorial_private.validar_eleccion_cartografia_integridad()
  owner to postgres;
alter function territorial_private.bloquear_escritura_electoral_canonica()
  owner to postgres;
revoke all on function
  territorial_private.validar_eleccion_cartografia_integridad()
from public, anon, authenticated, service_role;
revoke all on function
  territorial_private.bloquear_escritura_electoral_canonica()
from public, anon, authenticated, service_role;
grant execute on function
  territorial_private.validar_eleccion_cartografia_integridad()
to postgres;
grant execute on function
  territorial_private.bloquear_escritura_electoral_canonica()
to postgres;
comment on function
  territorial_private.validar_eleccion_cartografia_integridad()
is 'Impide asignar a una elección una versión cartográfica todavía mutable.';
comment on function
  territorial_private.bloquear_escritura_electoral_canonica()
is 'Serializa por transacción las escrituras sobre las tres tablas electorales canónicas.';
create trigger elecciones_validar_cartografia_integridad
before insert or update on public.elecciones
for each row
execute function territorial_private.validar_eleccion_cartografia_integridad();
create trigger resultados_electorales_bloquear_escritura_canonica
before insert or update or delete on public.resultados_electorales
for each statement
execute function territorial_private.bloquear_escritura_electoral_canonica();
create trigger listas_nominales_bloquear_escritura_canonica
before insert or update or delete on public.listas_nominales
for each statement
execute function territorial_private.bloquear_escritura_electoral_canonica();
create trigger participacion_electoral_bloquear_escritura_canonica
before insert or update or delete on public.participacion_electoral
for each statement
execute function territorial_private.bloquear_escritura_electoral_canonica();
create or replace function territorial_private.rpc_validar_carga_electoral_lote_core(
  p_carga_id uuid,
  p_lote integer default 500
)
returns jsonb
language plpgsql
volatile
parallel unsafe
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

  perform eleccion.eleccion_id
  from public.elecciones eleccion
  where exists (
    select 1
    from public.staging_electoral_registros registro
    where registro.carga_id = p_carga_id
      and registro.eleccion_clave = eleccion.clave
  )
  order by eleccion.eleccion_id
  for update;

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
    ), 0),
    'elecciones', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'eleccion_clave', clave.eleccion_clave,
          'eleccion_id', eleccion.eleccion_id,
          'cartografia_version_id', eleccion.cartografia_version_id
        )
        order by clave.eleccion_clave
      )
      from (
        select distinct registro.eleccion_clave
        from public.staging_electoral_registros registro
        where registro.carga_id = p_carga_id
      ) clave
      left join public.elecciones eleccion
        on eleccion.clave = clave.eleccion_clave
    ), '[]'::jsonb)
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
    v_snapshot_guardada := v_snapshot;
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

    with decisiones as (
      select
        decision.eleccion_clave,
        decision.eleccion_id,
        decision.cartografia_version_id
      from pg_catalog.jsonb_to_recordset(
        v_snapshot_guardada -> 'elecciones'
      ) as decision(
        eleccion_clave text,
        eleccion_id bigint,
        cartografia_version_id bigint
      )
    ),
    base as (
      select
        registro.registro_staging_id,
        registro.grano,
        registro.clave_entidad,
        registro.seccion_numero,
        decision.eleccion_id,
        decision.cartografia_version_id,
        (
          select municipio.municipio_id
          from public.territorios_municipios municipio
          where municipio.clave_entidad = registro.clave_entidad
            and municipio.clave_municipio =
                registro.clave_municipio_origen
        ) as municipio_id
      from public.staging_electoral_registros registro
      left join decisiones decision
        on decision.eleccion_clave = registro.eleccion_clave
      where registro.registro_staging_id = any(v_ids)
        and registro.carga_id = p_carga_id
    ),
    candidatos as (
      select
        base.registro_staging_id,
        base.grano,
        base.eleccion_id,
        base.cartografia_version_id,
        base.municipio_id,
        seccion.cartografia_seccion_id,
        seccion.seccion_id
      from base
      left join public.cartografia_secciones seccion
        on base.grano = 'SECCION'
       and base.cartografia_version_id is not null
       and seccion.cartografia_version_id = base.cartografia_version_id
       and seccion.clave_entidad = base.clave_entidad
       and seccion.numero = base.seccion_numero
       and (
         base.municipio_id is null
         or seccion.municipio_id = base.municipio_id
       )
    ),
    resolucion as (
      select
        candidato.registro_staging_id,
        candidato.grano,
        candidato.eleccion_id,
        candidato.cartografia_version_id,
        candidato.municipio_id,
        count(candidato.cartografia_seccion_id) as candidatos,
        min(candidato.cartografia_seccion_id) as cartografia_seccion_id,
        min(candidato.seccion_id) as seccion_id
      from candidatos candidato
      group by
        candidato.registro_staging_id,
        candidato.grano,
        candidato.eleccion_id,
        candidato.cartografia_version_id,
        candidato.municipio_id
    )
    update public.staging_electoral_registros registro
    set eleccion_id = resolucion.eleccion_id,
        municipio_id = resolucion.municipio_id,
        seccion_id = case
          when resolucion.grano = 'SECCION'
           and resolucion.candidatos = 1
            then resolucion.seccion_id
          else null
        end,
        cartografia_version_id = case
          when resolucion.grano = 'SECCION'
           and resolucion.candidatos = 1
            then resolucion.cartografia_version_id
          else null
        end,
        cartografia_seccion_id = case
          when resolucion.grano = 'SECCION'
           and resolucion.candidatos = 1
            then resolucion.cartografia_seccion_id
          else null
        end
    from resolucion
    where registro.registro_staging_id = resolucion.registro_staging_id
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
      'ELECCION_NO_RESUELTA',
      'ERROR',
      jsonb_build_object(
        'eleccion_clave', registro.eleccion_clave,
        'anio', registro.anio,
        'fecha_eleccion', registro.fecha_eleccion,
        'grano', registro.grano
      )
    from public.staging_electoral_registros registro
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id
      and registro.eleccion_id is null;

    with decisiones as (
      select
        decision.eleccion_clave,
        decision.eleccion_id,
        decision.cartografia_version_id
      from pg_catalog.jsonb_to_recordset(
        v_snapshot_guardada -> 'elecciones'
      ) as decision(
        eleccion_clave text,
        eleccion_id bigint,
        cartografia_version_id bigint
      )
    )
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
      'ELECCION_SIN_VERSION_CARTOGRAFICA',
      'OBSERVACION',
      jsonb_build_object(
        'eleccion_clave', registro.eleccion_clave,
        'eleccion_id', decision.eleccion_id,
        'clave_entidad', registro.clave_entidad,
        'seccion_numero', registro.seccion_numero
      )
    from public.staging_electoral_registros registro
    join decisiones decision
      on decision.eleccion_clave = registro.eleccion_clave
    where registro.registro_staging_id = any(v_ids)
      and registro.carga_id = p_carga_id
      and registro.grano = 'SECCION'
      and decision.eleccion_id is not null
      and decision.cartografia_version_id is null;

    with decisiones as (
      select
        decision.eleccion_clave,
        decision.eleccion_id,
        decision.cartografia_version_id
      from pg_catalog.jsonb_to_recordset(
        v_snapshot_guardada -> 'elecciones'
      ) as decision(
        eleccion_clave text,
        eleccion_id bigint,
        cartografia_version_id bigint
      )
    ),
    evaluacion as (
      select
        registro.carga_id,
        registro.registro_staging_id,
        registro.eleccion_clave,
        registro.clave_entidad,
        registro.seccion_numero,
        registro.municipio_id,
        decision.eleccion_id,
        decision.cartografia_version_id,
        (
          select count(*)
          from public.cartografia_secciones seccion
          where seccion.cartografia_version_id =
                decision.cartografia_version_id
            and seccion.clave_entidad = registro.clave_entidad
            and seccion.numero = registro.seccion_numero
            and (
              registro.municipio_id is null
              or seccion.municipio_id = registro.municipio_id
            )
        ) as candidatos
      from public.staging_electoral_registros registro
      join decisiones decision
        on decision.eleccion_clave = registro.eleccion_clave
      where registro.registro_staging_id = any(v_ids)
        and registro.carga_id = p_carga_id
        and registro.grano = 'SECCION'
        and decision.eleccion_id is not null
        and decision.cartografia_version_id is not null
    )
    insert into public.staging_electoral_incidencias (
      carga_id,
      registro_staging_id,
      codigo,
      severidad,
      detalle
    )
    select
      evaluacion.carga_id,
      evaluacion.registro_staging_id,
      case
        when evaluacion.candidatos = 0
          then 'SECCION_NO_EXISTE_EN_VERSION'
        else 'SECCION_AMBIGUA_EN_VERSION'
      end,
      'OBSERVACION',
      jsonb_build_object(
        'eleccion_clave', evaluacion.eleccion_clave,
        'eleccion_id', evaluacion.eleccion_id,
        'cartografia_version_id', evaluacion.cartografia_version_id,
        'clave_entidad', evaluacion.clave_entidad,
        'seccion_numero', evaluacion.seccion_numero,
        'municipio_id', evaluacion.municipio_id,
        'candidatos', evaluacion.candidatos
      )
    from evaluacion
    where evaluacion.candidatos <> 1;

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
alter function territorial_private.rpc_validar_carga_electoral_lote_core(
  uuid,
  integer
) owner to postgres;
revoke all on function
  territorial_private.rpc_validar_carga_electoral_lote_core(uuid, integer)
from public, anon, authenticated, service_role;
grant execute on function
  territorial_private.rpc_validar_carga_electoral_lote_core(uuid, integer)
to postgres, service_role;
comment on function
  territorial_private.rpc_validar_carga_electoral_lote_core(uuid, integer)
is 'Implementación interna versionada de la validación electoral reanudable por lotes.';
create or replace function public.rpc_validar_carga_electoral(p_carga_id uuid)
returns jsonb
language plpgsql
volatile
parallel unsafe
security invoker
set search_path = ''
as $$
declare
  v_respuesta jsonb;
begin
  if p_carga_id is null then
    raise exception 'carga_id es obligatorio' using errcode = '22004';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_carga_id::text, 0)
  );

  delete from public.validaciones_electorales_progreso progreso
  where progreso.carga_id = p_carga_id;

  loop
    v_respuesta :=
      territorial_private.rpc_validar_carga_electoral_lote_core(
        p_carga_id,
        1000
      );

    exit when coalesce((v_respuesta ->> 'completa')::boolean, false);
  end loop;

  return jsonb_build_object(
    'carga_id', p_carga_id,
    'registros', (v_respuesta ->> 'registros')::bigint,
    'resultados', (v_respuesta ->> 'resultados')::bigint,
    'validos', (v_respuesta ->> 'validos')::bigint,
    'observados', (v_respuesta ->> 'observados')::bigint,
    'cuarentena', (v_respuesta ->> 'cuarentena')::bigint,
    'incidencias', (v_respuesta ->> 'incidencias')::bigint
  );
end;
$$;
alter function public.rpc_validar_carga_electoral(uuid)
  owner to postgres;
revoke all on function public.rpc_validar_carga_electoral(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_validar_carga_electoral(uuid)
  to postgres, service_role;
comment on function public.rpc_validar_carga_electoral(uuid) is
  'Valida de forma completa una carga electoral con resolución cartográfica versionada.';
drop view public.v_staging_electoral_promovibilidad;
create view public.v_staging_electoral_promovibilidad
with (security_invoker = true)
as
with evaluacion as (
  select
    registro.registro_staging_id,
    registro.carga_id,
    registro.proyecto_origen,
    registro.tabla_origen,
    registro.id_origen,
    registro.grano,
    registro.eleccion_clave,
    registro.anio,
    registro.fecha_eleccion,
    registro.ambito,
    registro.cargo,
    registro.municipio_origen_id,
    registro.clave_entidad,
    registro.clave_municipio_origen,
    registro.municipio_nombre_original,
    registro.municipio_nombre_normalizado,
    registro.seccion_numero,
    registro.distrito_local_numero,
    registro.distrito_federal_numero,
    registro.casillas_instaladas,
    registro.casillas_computadas,
    registro.lista_nominal,
    registro.votos_validos,
    registro.votos_no_registrados,
    registro.votos_nulos,
    registro.total_votos,
    registro.participacion_porcentaje,
    registro.ganador_siglas,
    registro.ganador_nombre,
    registro.ganador_votos,
    registro.ganador_porcentaje,
    registro.segundo_lugar_siglas,
    registro.segundo_lugar_nombre,
    registro.segundo_lugar_votos,
    registro.segundo_lugar_porcentaje,
    registro.fuente,
    registro.ruta_acta,
    registro.eleccion_id,
    registro.municipio_id,
    registro.seccion_id,
    registro.payload_origen,
    registro.payload_sha256,
    registro.estado_validacion,
    registro.capturado_at,
    registro.validado_at,
    registro.metadata,
    registro.created_at,
    registro.updated_at,
    registro.cartografia_version_id,
    registro.cartografia_seccion_id,
    not exists (
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
  evaluacion.registro_staging_id,
  evaluacion.carga_id,
  evaluacion.proyecto_origen,
  evaluacion.tabla_origen,
  evaluacion.id_origen,
  evaluacion.grano,
  evaluacion.eleccion_clave,
  evaluacion.anio,
  evaluacion.fecha_eleccion,
  evaluacion.ambito,
  evaluacion.cargo,
  evaluacion.municipio_origen_id,
  evaluacion.clave_entidad,
  evaluacion.clave_municipio_origen,
  evaluacion.municipio_nombre_original,
  evaluacion.municipio_nombre_normalizado,
  evaluacion.seccion_numero,
  evaluacion.distrito_local_numero,
  evaluacion.distrito_federal_numero,
  evaluacion.casillas_instaladas,
  evaluacion.casillas_computadas,
  evaluacion.lista_nominal,
  evaluacion.votos_validos,
  evaluacion.votos_no_registrados,
  evaluacion.votos_nulos,
  evaluacion.total_votos,
  evaluacion.participacion_porcentaje,
  evaluacion.ganador_siglas,
  evaluacion.ganador_nombre,
  evaluacion.ganador_votos,
  evaluacion.ganador_porcentaje,
  evaluacion.segundo_lugar_siglas,
  evaluacion.segundo_lugar_nombre,
  evaluacion.segundo_lugar_votos,
  evaluacion.segundo_lugar_porcentaje,
  evaluacion.fuente,
  evaluacion.ruta_acta,
  evaluacion.eleccion_id,
  evaluacion.municipio_id,
  evaluacion.seccion_id,
  evaluacion.payload_origen,
  evaluacion.payload_sha256,
  evaluacion.estado_validacion,
  evaluacion.capturado_at,
  evaluacion.validado_at,
  evaluacion.metadata,
  evaluacion.created_at,
  evaluacion.updated_at,
  evaluacion.es_version_vigente,
  evaluacion.sin_errores_abiertos,
  evaluacion.fuerzas_resueltas,
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
    and evaluacion.cartografia_version_id is not null
    and evaluacion.cartografia_seccion_id is not null
    and evaluacion.sin_errores_abiertos
    and evaluacion.fuerzas_resueltas
  ) as promovible_seccional,
  evaluacion.cartografia_version_id,
  evaluacion.cartografia_seccion_id
from evaluacion;
alter view public.v_staging_electoral_promovibilidad
  owner to postgres;
comment on view public.v_staging_electoral_promovibilidad is
  'Expone barreras de promoción por versión, vínculos, incidencias y cartografía.';
revoke all on table public.v_staging_electoral_promovibilidad
  from public, anon, authenticated, service_role;
grant select on table public.v_staging_electoral_promovibilidad
  to service_role;
commit;
