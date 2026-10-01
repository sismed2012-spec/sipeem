begin;
set local lock_timeout = '10s';
lock table public.eventos_territoriales, public.evento_georreferenciacion
  in access exclusive mode;
do $$
declare
  v_eventos bigint;
  v_resoluciones bigint;
begin
  select pg_catalog.count(*) into v_eventos
  from public.eventos_territoriales;

  select pg_catalog.count(*) into v_resoluciones
  from public.evento_georreferenciacion;

  if v_eventos <> 0 or v_resoluciones <> 0 then
    raise exception using
      errcode = '55000',
      message = pg_catalog.format(
        'M15 exige tablas de eventos vacias: eventos=%s, resoluciones=%s',
        v_eventos,
        v_resoluciones
      );
  end if;
end;
$$;
alter table public.evento_georreferenciacion
  add column cartografia_version_id bigint not null,
  add column cartografia_municipio_id bigint,
  add column cartografia_colonia_id bigint,
  add column cartografia_seccion_id bigint,
  add column cartografia_distrito_local_id bigint,
  add column cartografia_distrito_federal_id bigint;
alter table public.eventos_territoriales
  add column cartografia_version_id bigint,
  add column cartografia_municipio_id bigint,
  add column cartografia_colonia_id bigint,
  add column cartografia_seccion_id bigint,
  add column cartografia_distrito_local_id bigint,
  add column cartografia_distrito_federal_id bigint,
  add column georreferenciacion_elegida_id bigint;
alter table public.cartografia_secciones
  add constraint cartografia_secciones_evento_municipio_uq
    unique (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_municipio_id,
      municipio_id
    ),
  add constraint cartografia_secciones_evento_distrito_local_uq
    unique (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_distrito_local_id,
      distrito_local_id
    ),
  add constraint cartografia_secciones_evento_distrito_federal_uq
    unique (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_distrito_federal_id,
      distrito_federal_id
    );
alter table public.cartografia_colonias
  add constraint cartografia_colonias_evento_municipio_uq
    unique (
      cartografia_colonia_id,
      cartografia_version_id,
      colonia_id,
      cartografia_municipio_id,
      municipio_id
    );
alter table public.eventos_territoriales
  drop constraint eventos_territoriales_seccion_municipio_fk,
  drop constraint eventos_territoriales_seccion_distrito_local_fk,
  drop constraint eventos_territoriales_seccion_distrito_federal_fk,
  drop constraint eventos_territoriales_colonia_municipio_fk;
alter table public.evento_georreferenciacion
  drop constraint evento_georreferenciacion_seccion_municipio_fk,
  drop constraint evento_georreferenciacion_seccion_distrito_local_fk,
  drop constraint evento_georreferenciacion_seccion_distrito_federal_fk,
  drop constraint evento_georreferenciacion_colonia_municipio_fk;
alter table public.evento_georreferenciacion
  add constraint evento_georreferenciacion_cartografia_municipio_par_ck
    check (
      (cartografia_municipio_id is null and municipio_id is null)
      or (cartografia_municipio_id is not null and municipio_id is not null)
    ),
  add constraint evento_georreferenciacion_cartografia_colonia_par_ck
    check (
      (cartografia_colonia_id is null and colonia_id is null)
      or (cartografia_colonia_id is not null and colonia_id is not null)
    ),
  add constraint evento_georreferenciacion_cartografia_seccion_par_ck
    check (
      (cartografia_seccion_id is null and seccion_id is null)
      or (cartografia_seccion_id is not null and seccion_id is not null)
    ),
  add constraint evento_georreferenciacion_cartografia_distrito_local_par_ck
    check (
      (cartografia_distrito_local_id is null and distrito_local_id is null)
      or (
        cartografia_distrito_local_id is not null
        and distrito_local_id is not null
      )
    ),
  add constraint evento_georreferenciacion_cartografia_distrito_federal_par_ck
    check (
      (cartografia_distrito_federal_id is null and distrito_federal_id is null)
      or (
        cartografia_distrito_federal_id is not null
        and distrito_federal_id is not null
      )
    ),
  add constraint evento_georreferenciacion_cartografia_contexto_ck
    check (
      (
        cartografia_seccion_id is null
        or (
          cartografia_municipio_id is not null
          and cartografia_distrito_local_id is not null
          and cartografia_distrito_federal_id is not null
        )
      )
      and (
        cartografia_colonia_id is null
        or cartografia_municipio_id is not null
      )
    );
alter table public.eventos_territoriales
  add constraint eventos_territoriales_cartografia_municipio_par_ck
    check (
      (cartografia_municipio_id is null and municipio_id is null)
      or (cartografia_municipio_id is not null and municipio_id is not null)
    ),
  add constraint eventos_territoriales_cartografia_colonia_par_ck
    check (
      (cartografia_colonia_id is null and colonia_id is null)
      or (cartografia_colonia_id is not null and colonia_id is not null)
    ),
  add constraint eventos_territoriales_cartografia_seccion_par_ck
    check (
      (cartografia_seccion_id is null and seccion_id is null)
      or (cartografia_seccion_id is not null and seccion_id is not null)
    ),
  add constraint eventos_territoriales_cartografia_distrito_local_par_ck
    check (
      (cartografia_distrito_local_id is null and distrito_local_id is null)
      or (
        cartografia_distrito_local_id is not null
        and distrito_local_id is not null
      )
    ),
  add constraint eventos_territoriales_cartografia_distrito_federal_par_ck
    check (
      (cartografia_distrito_federal_id is null and distrito_federal_id is null)
      or (
        cartografia_distrito_federal_id is not null
        and distrito_federal_id is not null
      )
    ),
  add constraint eventos_territoriales_cartografia_contexto_ck
    check (
      (
        georreferenciacion_elegida_id is null
        and cartografia_version_id is null
        and cartografia_municipio_id is null
        and municipio_id is null
        and cartografia_colonia_id is null
        and colonia_id is null
        and cartografia_seccion_id is null
        and seccion_id is null
        and cartografia_distrito_local_id is null
        and distrito_local_id is null
        and cartografia_distrito_federal_id is null
        and distrito_federal_id is null
        and geom is null
        and confianza_geo is null
      )
      or (
        georreferenciacion_elegida_id is not null
        and cartografia_version_id is not null
        and cartografia_municipio_id is not null
        and municipio_id is not null
        and cartografia_seccion_id is not null
        and seccion_id is not null
        and cartografia_distrito_local_id is not null
        and distrito_local_id is not null
        and cartografia_distrito_federal_id is not null
        and distrito_federal_id is not null
        and geom is not null
        and (
          (cartografia_colonia_id is null and colonia_id is null)
          or (
            cartografia_colonia_id is not null
            and colonia_id is not null
          )
        )
      )
    );
alter table public.evento_georreferenciacion
  add constraint evento_georreferenciacion_cartografia_version_fk
    foreign key (cartografia_version_id)
    references public.cartografia_versiones (cartografia_version_id)
    on delete restrict,
  add constraint evento_georreferenciacion_cartografia_municipio_fk
    foreign key (
      cartografia_municipio_id,
      cartografia_version_id,
      municipio_id
    )
    references public.cartografia_municipios (
      cartografia_municipio_id,
      cartografia_version_id,
      municipio_id
    ) on delete restrict,
  add constraint evento_georreferenciacion_cartografia_colonia_fk
    foreign key (
      cartografia_colonia_id,
      cartografia_version_id,
      colonia_id
    )
    references public.cartografia_colonias (
      cartografia_colonia_id,
      cartografia_version_id,
      colonia_id
    ) on delete restrict,
  add constraint evento_georreferenciacion_cartografia_seccion_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    ) on delete restrict,
  add constraint evento_georreferenciacion_cartografia_distrito_local_fk
    foreign key (
      cartografia_distrito_local_id,
      cartografia_version_id,
      distrito_local_id
    )
    references public.cartografia_distritos_locales (
      cartografia_distrito_local_id,
      cartografia_version_id,
      distrito_local_id
    ) on delete restrict,
  add constraint evento_georreferenciacion_cartografia_distrito_federal_fk
    foreign key (
      cartografia_distrito_federal_id,
      cartografia_version_id,
      distrito_federal_id
    )
    references public.cartografia_distritos_federales (
      cartografia_distrito_federal_id,
      cartografia_version_id,
      distrito_federal_id
    ) on delete restrict,
  add constraint evento_georreferenciacion_seccion_municipio_version_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_municipio_id,
      municipio_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_municipio_id,
      municipio_id
    ) on delete restrict,
  add constraint evento_georreferenciacion_seccion_distrito_local_version_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_distrito_local_id,
      distrito_local_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_distrito_local_id,
      distrito_local_id
    ) on delete restrict,
  add constraint evento_georreferenciacion_seccion_distrito_federal_version_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_distrito_federal_id,
      distrito_federal_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_distrito_federal_id,
      distrito_federal_id
    ) on delete restrict,
  add constraint evento_georreferenciacion_colonia_municipio_version_fk
    foreign key (
      cartografia_colonia_id,
      cartografia_version_id,
      colonia_id,
      cartografia_municipio_id,
      municipio_id
    )
    references public.cartografia_colonias (
      cartografia_colonia_id,
      cartografia_version_id,
      colonia_id,
      cartografia_municipio_id,
      municipio_id
    ) on delete restrict,
  add constraint evento_georreferenciacion_id_evento_version_uq
    unique (georreferenciacion_id, evento_id, cartografia_version_id);
alter table public.eventos_territoriales
  add constraint eventos_territoriales_cartografia_version_fk
    foreign key (cartografia_version_id)
    references public.cartografia_versiones (cartografia_version_id)
    on delete restrict,
  add constraint eventos_territoriales_cartografia_municipio_fk
    foreign key (
      cartografia_municipio_id,
      cartografia_version_id,
      municipio_id
    )
    references public.cartografia_municipios (
      cartografia_municipio_id,
      cartografia_version_id,
      municipio_id
    ) on delete restrict,
  add constraint eventos_territoriales_cartografia_colonia_fk
    foreign key (
      cartografia_colonia_id,
      cartografia_version_id,
      colonia_id
    )
    references public.cartografia_colonias (
      cartografia_colonia_id,
      cartografia_version_id,
      colonia_id
    ) on delete restrict,
  add constraint eventos_territoriales_cartografia_seccion_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id
    ) on delete restrict,
  add constraint eventos_territoriales_cartografia_distrito_local_fk
    foreign key (
      cartografia_distrito_local_id,
      cartografia_version_id,
      distrito_local_id
    )
    references public.cartografia_distritos_locales (
      cartografia_distrito_local_id,
      cartografia_version_id,
      distrito_local_id
    ) on delete restrict,
  add constraint eventos_territoriales_cartografia_distrito_federal_fk
    foreign key (
      cartografia_distrito_federal_id,
      cartografia_version_id,
      distrito_federal_id
    )
    references public.cartografia_distritos_federales (
      cartografia_distrito_federal_id,
      cartografia_version_id,
      distrito_federal_id
    ) on delete restrict,
  add constraint eventos_territoriales_seccion_municipio_version_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_municipio_id,
      municipio_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_municipio_id,
      municipio_id
    ) on delete restrict,
  add constraint eventos_territoriales_seccion_distrito_local_version_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_distrito_local_id,
      distrito_local_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_distrito_local_id,
      distrito_local_id
    ) on delete restrict,
  add constraint eventos_territoriales_seccion_distrito_federal_version_fk
    foreign key (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_distrito_federal_id,
      distrito_federal_id
    )
    references public.cartografia_secciones (
      cartografia_seccion_id,
      cartografia_version_id,
      seccion_id,
      cartografia_distrito_federal_id,
      distrito_federal_id
    ) on delete restrict,
  add constraint eventos_territoriales_colonia_municipio_version_fk
    foreign key (
      cartografia_colonia_id,
      cartografia_version_id,
      colonia_id,
      cartografia_municipio_id,
      municipio_id
    )
    references public.cartografia_colonias (
      cartografia_colonia_id,
      cartografia_version_id,
      colonia_id,
      cartografia_municipio_id,
      municipio_id
    ) on delete restrict;
drop index public.evento_georreferenciacion_actual_uq;
drop index public.eventos_territoriales_seccion_municipio_idx;
drop index public.eventos_territoriales_seccion_distrito_local_coherencia_idx;
drop index public.eventos_territoriales_seccion_distrito_federal_coherencia_idx;
drop index public.eventos_territoriales_colonia_municipio_idx;
drop index public.evento_geo_seccion_municipio_idx;
drop index public.evento_geo_seccion_distrito_local_idx;
drop index public.evento_geo_seccion_distrito_federal_idx;
drop index public.evento_geo_colonia_municipio_idx;
drop index public.evento_georreferenciacion_evento_fecha_idx;
create unique index evento_georreferenciacion_actual_uq
  on public.evento_georreferenciacion (evento_id, cartografia_version_id)
  where es_actual;
create index eventos_territoriales_cartografia_version_idx
  on public.eventos_territoriales (cartografia_version_id)
  where cartografia_version_id is not null;
create index eventos_territoriales_cartografia_municipio_idx
  on public.eventos_territoriales (
    cartografia_municipio_id,
    cartografia_version_id,
    municipio_id
  ) where cartografia_municipio_id is not null;
create index eventos_territoriales_cartografia_distrito_local_idx
  on public.eventos_territoriales (
    cartografia_distrito_local_id,
    cartografia_version_id,
    distrito_local_id
  ) where cartografia_distrito_local_id is not null;
create index eventos_territoriales_cartografia_distrito_federal_idx
  on public.eventos_territoriales (
    cartografia_distrito_federal_id,
    cartografia_version_id,
    distrito_federal_id
  ) where cartografia_distrito_federal_id is not null;
create index eventos_territoriales_georreferenciacion_elegida_idx
  on public.eventos_territoriales (
    georreferenciacion_elegida_id,
    evento_id,
    cartografia_version_id
  ) where georreferenciacion_elegida_id is not null;
create index eventos_territoriales_seccion_municipio_idx
  on public.eventos_territoriales (
    cartografia_seccion_id,
    cartografia_version_id,
    seccion_id,
    cartografia_municipio_id,
    municipio_id
  ) where cartografia_seccion_id is not null;
create index eventos_territoriales_seccion_distrito_local_coherencia_idx
  on public.eventos_territoriales (
    cartografia_seccion_id,
    cartografia_version_id,
    seccion_id,
    cartografia_distrito_local_id,
    distrito_local_id
  ) where cartografia_seccion_id is not null;
create index eventos_territoriales_seccion_distrito_federal_coherencia_idx
  on public.eventos_territoriales (
    cartografia_seccion_id,
    cartografia_version_id,
    seccion_id,
    cartografia_distrito_federal_id,
    distrito_federal_id
  ) where cartografia_seccion_id is not null;
create index eventos_territoriales_colonia_municipio_idx
  on public.eventos_territoriales (
    cartografia_colonia_id,
    cartografia_version_id,
    colonia_id,
    cartografia_municipio_id,
    municipio_id
  ) where cartografia_colonia_id is not null;
create index evento_georreferenciacion_cartografia_version_idx
  on public.evento_georreferenciacion (cartografia_version_id);
create index evento_georreferenciacion_cartografia_municipio_idx
  on public.evento_georreferenciacion (
    cartografia_municipio_id,
    cartografia_version_id,
    municipio_id
  ) where cartografia_municipio_id is not null;
create index evento_georreferenciacion_cartografia_distrito_local_idx
  on public.evento_georreferenciacion (
    cartografia_distrito_local_id,
    cartografia_version_id,
    distrito_local_id
  ) where cartografia_distrito_local_id is not null;
create index evento_georreferenciacion_cartografia_distrito_federal_idx
  on public.evento_georreferenciacion (
    cartografia_distrito_federal_id,
    cartografia_version_id,
    distrito_federal_id
  ) where cartografia_distrito_federal_id is not null;
create index evento_geo_seccion_municipio_idx
  on public.evento_georreferenciacion (
    cartografia_seccion_id,
    cartografia_version_id,
    seccion_id,
    cartografia_municipio_id,
    municipio_id
  ) where cartografia_seccion_id is not null;
create index evento_geo_seccion_distrito_local_idx
  on public.evento_georreferenciacion (
    cartografia_seccion_id,
    cartografia_version_id,
    seccion_id,
    cartografia_distrito_local_id,
    distrito_local_id
  ) where cartografia_seccion_id is not null;
create index evento_geo_seccion_distrito_federal_idx
  on public.evento_georreferenciacion (
    cartografia_seccion_id,
    cartografia_version_id,
    seccion_id,
    cartografia_distrito_federal_id,
    distrito_federal_id
  ) where cartografia_seccion_id is not null;
create index evento_geo_colonia_municipio_idx
  on public.evento_georreferenciacion (
    cartografia_colonia_id,
    cartografia_version_id,
    colonia_id,
    cartografia_municipio_id,
    municipio_id
  ) where cartografia_colonia_id is not null;
create index evento_georreferenciacion_evento_fecha_idx
  on public.evento_georreferenciacion (
    evento_id,
    cartografia_version_id,
    resuelto_en desc,
    georreferenciacion_id desc
  );
create function territorial_private.bloquear_escritura_eventos_versionados()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(19013, 20260915);
  return null;
end;
$$;
create function territorial_private.validar_version_georreferenciacion_evento()
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
  select version.estado
    into v_estado
  from public.cartografia_versiones as version
  where version.cartografia_version_id = new.cartografia_version_id;

  if found and v_estado not in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA') then
    raise exception using
      errcode = '55000',
      message = 'la georreferenciacion exige una version cartografica sellada';
  end if;

  return new;
end;
$$;
create function territorial_private.proteger_georreferenciacion_evento()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $$
begin
  if (pg_catalog.to_jsonb(new) - 'es_actual')
     is distinct from (pg_catalog.to_jsonb(old) - 'es_actual') then
    raise exception using
      errcode = '55000',
      message = 'una georreferenciacion registrada es inmutable';
  end if;

  return new;
end;
$$;
create function territorial_private.marcar_georreferenciacion_actual_evento()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $$
begin
  if new.es_actual is not true then
    return new;
  end if;

  perform 1
  from public.eventos_territoriales as evento
  where evento.evento_id = new.evento_id
  for update;

  update public.evento_georreferenciacion as anterior
  set es_actual = false
  where anterior.evento_id = new.evento_id
    and anterior.cartografia_version_id = new.cartografia_version_id
    and anterior.georreferenciacion_id is distinct from new.georreferenciacion_id
    and anterior.es_actual;

  return new;
end;
$$;
create function territorial_private.proteger_proyeccion_evento()
returns trigger
language plpgsql
volatile
parallel unsafe
security definer
set search_path = ''
as $$
declare
  v_cambio_proyeccion boolean;
begin
  if tg_op = 'INSERT' then
    if new.geom is not null
       or new.confianza_geo is not null
       or new.municipio_id is not null
       or new.colonia_id is not null
       or new.seccion_id is not null
       or new.distrito_local_id is not null
       or new.distrito_federal_id is not null
       or new.cartografia_version_id is not null
       or new.cartografia_municipio_id is not null
       or new.cartografia_colonia_id is not null
       or new.cartografia_seccion_id is not null
       or new.cartografia_distrito_local_id is not null
       or new.cartografia_distrito_federal_id is not null
       or new.georreferenciacion_elegida_id is not null then
      raise exception using
        errcode = '55000',
        message = 'un evento nuevo debe iniciar sin proyeccion territorial';
    end if;
    return new;
  end if;

  v_cambio_proyeccion :=
    new.estado_geo_id is distinct from old.estado_geo_id
    or extensions.st_asewkb(new.geom)
       is distinct from extensions.st_asewkb(old.geom)
    or new.confianza_geo is distinct from old.confianza_geo
    or new.municipio_id is distinct from old.municipio_id
    or new.colonia_id is distinct from old.colonia_id
    or new.seccion_id is distinct from old.seccion_id
    or new.distrito_local_id is distinct from old.distrito_local_id
    or new.distrito_federal_id is distinct from old.distrito_federal_id
    or new.cartografia_version_id is distinct from old.cartografia_version_id
    or new.cartografia_municipio_id is distinct from old.cartografia_municipio_id
    or new.cartografia_colonia_id is distinct from old.cartografia_colonia_id
    or new.cartografia_seccion_id is distinct from old.cartografia_seccion_id
    or new.cartografia_distrito_local_id is distinct from old.cartografia_distrito_local_id
    or new.cartografia_distrito_federal_id is distinct from old.cartografia_distrito_federal_id
    or new.georreferenciacion_elegida_id is distinct from old.georreferenciacion_elegida_id;

  if v_cambio_proyeccion
     and pg_catalog.current_setting(
           'territorial_private.seleccionando_georreferenciacion',
           true
         ) is distinct from 'on' then
    raise exception using
      errcode = '55000',
      message = 'la proyeccion territorial solo cambia mediante su RPC';
  end if;

  return new;
end;
$$;
create function public.rpc_seleccionar_georreferenciacion_evento(
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

  -- La fila del evento ya está bloqueada. Si selección y proyección coinciden
  -- exactamente, devolver el mismo contrato sin ejecutar UPDATE ni activar los
  -- triggers de auditoría/updated_at. Una diferencia cualquiera continúa al
  -- UPDATE inferior y repara la proyección completa de forma atómica.
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
      'evento_id', p_evento_id,
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
    'evento_id', p_evento_id,
    'georreferenciacion_elegida_id', p_georreferenciacion_id,
    'cartografia_version_id', v_georreferenciacion.cartografia_version_id
  );
end;
$$;
alter function territorial_private.bloquear_escritura_eventos_versionados()
  owner to postgres;
alter function territorial_private.validar_version_georreferenciacion_evento()
  owner to postgres;
alter function territorial_private.proteger_georreferenciacion_evento()
  owner to postgres;
alter function territorial_private.marcar_georreferenciacion_actual_evento()
  owner to postgres;
alter function territorial_private.proteger_proyeccion_evento()
  owner to postgres;
alter function public.rpc_seleccionar_georreferenciacion_evento(bigint, bigint)
  owner to postgres;
revoke all on function territorial_private.bloquear_escritura_eventos_versionados()
  from public, anon, authenticated, service_role;
revoke all on function territorial_private.validar_version_georreferenciacion_evento()
  from public, anon, authenticated, service_role;
revoke all on function territorial_private.proteger_georreferenciacion_evento()
  from public, anon, authenticated, service_role;
revoke all on function territorial_private.marcar_georreferenciacion_actual_evento()
  from public, anon, authenticated, service_role;
revoke all on function territorial_private.proteger_proyeccion_evento()
  from public, anon, authenticated, service_role;
revoke all on function public.rpc_seleccionar_georreferenciacion_evento(bigint, bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.rpc_seleccionar_georreferenciacion_evento(bigint, bigint)
  to service_role;
create trigger evento_georreferenciacion_bloquear_escritura_trg
before insert or update or delete on public.evento_georreferenciacion
for each statement
execute function territorial_private.bloquear_escritura_eventos_versionados();
create trigger eventos_territoriales_bloquear_escritura_trg
before update or delete on public.eventos_territoriales
for each statement
execute function territorial_private.bloquear_escritura_eventos_versionados();
create trigger evento_georreferenciacion_validar_version_trg
before insert or update on public.evento_georreferenciacion
for each row
execute function territorial_private.validar_version_georreferenciacion_evento();
create trigger evento_georreferenciacion_proteger_inmutabilidad_trg
before update on public.evento_georreferenciacion
for each row
execute function territorial_private.proteger_georreferenciacion_evento();
create trigger evento_georreferenciacion_marcar_actual_trg
before insert or update on public.evento_georreferenciacion
for each row
execute function territorial_private.marcar_georreferenciacion_actual_evento();
create trigger eventos_territoriales_proteger_proyeccion_trg
before insert or update on public.eventos_territoriales
for each row
execute function territorial_private.proteger_proyeccion_evento();
alter table public.eventos_territoriales
  add constraint eventos_territoriales_georreferenciacion_elegida_fk
    foreign key (
      georreferenciacion_elegida_id,
      evento_id,
      cartografia_version_id
    )
    references public.evento_georreferenciacion (
      georreferenciacion_id,
      evento_id,
      cartografia_version_id
    )
    on delete no action
    deferrable initially deferred;
comment on column public.evento_georreferenciacion.cartografia_version_id is
  'Instantánea INE sellada con la que se resolvió territorialmente el evento.';
comment on column public.eventos_territoriales.georreferenciacion_elegida_id is
  'Resolución seleccionada explícitamente como proyección operativa del evento.';
comment on function public.rpc_seleccionar_georreferenciacion_evento(bigint, bigint) is
  'Selecciona una resolución actual sellada y copia de forma atómica su proyección al evento.';
commit;
