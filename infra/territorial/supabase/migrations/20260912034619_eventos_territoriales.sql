create table public.eventos_territoriales (
  evento_id bigint generated always as identity primary key,
  evento_uuid uuid not null default gen_random_uuid() unique,
  fuente_evento_id smallint not null references public.cat_fuentes_evento(fuente_evento_id),
  estado_evento_id smallint not null references public.cat_estados_evento(estado_evento_id),
  estado_geo_id smallint not null references public.cat_estados_georreferenciacion(estado_geo_id),
  id_externo text,
  ocurrido_en timestamptz not null,
  recibido_en timestamptz not null default now(),
  titulo text,
  contenido_original text not null,
  payload_original jsonb not null default '{}'::jsonb,
  geom extensions.geometry(Point, 4326),
  municipio_id bigint references public.territorios_municipios(municipio_id),
  colonia_id bigint references public.territorios_colonias(colonia_id),
  seccion_id bigint references public.territorios_secciones(seccion_id),
  distrito_local_id bigint references public.territorios_distritos_locales(distrito_local_id),
  distrito_federal_id bigint references public.territorios_distritos_federales(distrito_federal_id),
  confianza_geo numeric(5, 4),
  calidad_dato numeric(5, 2),
  nivel_sensibilidad smallint not null default 1 references public.cat_niveles_sensibilidad(nivel),
  requiere_atencion boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint eventos_territoriales_contenido_ck check (length(btrim(contenido_original)) > 0),
  constraint eventos_territoriales_payload_objeto_ck check (jsonb_typeof(payload_original) = 'object'),
  constraint eventos_territoriales_confianza_geo_ck check (confianza_geo is null or confianza_geo between 0 and 1),
  constraint eventos_territoriales_calidad_dato_ck check (calidad_dato is null or calidad_dato between 0 and 100),
  constraint eventos_territoriales_geom_valida_ck check (
    geom is null or (
      not extensions.st_isempty(geom)
      and extensions.st_isvalid(geom)
      and extensions.st_coveredby(
        geom,
        extensions.st_makeenvelope(-180, -90, 180, 90, 4326)
      )
    )
  ),
  constraint eventos_territoriales_seccion_municipio_ck check (
    seccion_id is null or municipio_id is not null
  ),
  constraint eventos_territoriales_colonia_municipio_ck check (
    colonia_id is null or municipio_id is not null
  ),
  constraint eventos_territoriales_seccion_municipio_fk
    foreign key (seccion_id, municipio_id)
    references public.territorios_secciones(seccion_id, municipio_id),
  constraint eventos_territoriales_seccion_distrito_local_fk
    foreign key (seccion_id, distrito_local_id)
    references public.territorios_secciones(seccion_id, distrito_local_id),
  constraint eventos_territoriales_seccion_distrito_federal_fk
    foreign key (seccion_id, distrito_federal_id)
    references public.territorios_secciones(seccion_id, distrito_federal_id),
  constraint eventos_territoriales_colonia_municipio_fk
    foreign key (colonia_id, municipio_id)
    references public.territorios_colonias(colonia_id, municipio_id)
);

create table public.evento_evidencias (
  evidencia_id bigint generated always as identity primary key,
  evento_id bigint not null references public.eventos_territoriales(evento_id) on delete cascade,
  tipo text not null,
  uri text not null,
  storage_bucket text,
  storage_path text,
  mime_type text,
  sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint evento_evidencias_tipo_formato_ck check (tipo = upper(tipo) and tipo ~ '^[A-Z0-9_]+$'),
  constraint evento_evidencias_sha256_ck check (sha256 is null or sha256 ~ '^[0-9A-Fa-f]{64}$'),
  constraint evento_evidencias_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object')
);

create table public.evento_actores (
  evento_actor_id bigint generated always as identity primary key,
  evento_id bigint not null references public.eventos_territoriales(evento_id) on delete cascade,
  nombre text not null,
  tipo_actor text,
  rol text,
  identificador_externo text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint evento_actores_nombre_ck check (length(btrim(nombre)) > 0),
  constraint evento_actores_tipo_formato_ck check (tipo_actor is null or (tipo_actor = upper(tipo_actor) and tipo_actor ~ '^[A-Z0-9_]+$')),
  constraint evento_actores_rol_formato_ck check (rol is null or (rol = upper(rol) and rol ~ '^[A-Z0-9_]+$')),
  constraint evento_actores_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object')
);

create table public.evento_georreferenciacion (
  georreferenciacion_id bigint generated always as identity primary key,
  evento_id bigint not null references public.eventos_territoriales(evento_id) on delete cascade,
  estado_geo_id smallint not null references public.cat_estados_georreferenciacion(estado_geo_id),
  metodo text not null,
  entrada_original text,
  geom extensions.geometry(Point, 4326),
  municipio_id bigint references public.territorios_municipios(municipio_id),
  colonia_id bigint references public.territorios_colonias(colonia_id),
  seccion_id bigint references public.territorios_secciones(seccion_id),
  distrito_local_id bigint references public.territorios_distritos_locales(distrito_local_id),
  distrito_federal_id bigint references public.territorios_distritos_federales(distrito_federal_id),
  confianza numeric(5, 4),
  es_actual boolean not null default true,
  detalle jsonb not null default '{}'::jsonb,
  resuelto_en timestamptz not null default now(),
  constraint evento_georreferenciacion_metodo_formato_ck check (metodo = upper(metodo) and metodo ~ '^[A-Z0-9_]+$'),
  constraint evento_georreferenciacion_confianza_ck check (confianza is null or confianza between 0 and 1),
  constraint evento_georreferenciacion_detalle_objeto_ck check (jsonb_typeof(detalle) = 'object'),
  constraint evento_georreferenciacion_geom_valida_ck check (
    geom is null or (
      not extensions.st_isempty(geom)
      and extensions.st_isvalid(geom)
      and extensions.st_coveredby(
        geom,
        extensions.st_makeenvelope(-180, -90, 180, 90, 4326)
      )
    )
  ),
  constraint evento_georreferenciacion_seccion_municipio_ck check (
    seccion_id is null or municipio_id is not null
  ),
  constraint evento_georreferenciacion_colonia_municipio_ck check (
    colonia_id is null or municipio_id is not null
  ),
  constraint evento_georreferenciacion_seccion_municipio_fk
    foreign key (seccion_id, municipio_id)
    references public.territorios_secciones(seccion_id, municipio_id),
  constraint evento_georreferenciacion_seccion_distrito_local_fk
    foreign key (seccion_id, distrito_local_id)
    references public.territorios_secciones(seccion_id, distrito_local_id),
  constraint evento_georreferenciacion_seccion_distrito_federal_fk
    foreign key (seccion_id, distrito_federal_id)
    references public.territorios_secciones(seccion_id, distrito_federal_id),
  constraint evento_georreferenciacion_colonia_municipio_fk
    foreign key (colonia_id, municipio_id)
    references public.territorios_colonias(colonia_id, municipio_id)
);

create table public.evento_historial (
  evento_historial_id bigint generated always as identity primary key,
  evento_id bigint not null references public.eventos_territoriales(evento_id) on delete cascade,
  accion text not null,
  estado_anterior_id smallint references public.cat_estados_evento(estado_evento_id),
  estado_nuevo_id smallint references public.cat_estados_evento(estado_evento_id),
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  realizado_por uuid,
  origen text,
  created_at timestamptz not null default now(),
  constraint evento_historial_accion_formato_ck check (accion = upper(accion) and accion ~ '^[A-Z0-9_]+$'),
  constraint evento_historial_datos_anteriores_ck check (datos_anteriores is null or jsonb_typeof(datos_anteriores) = 'object'),
  constraint evento_historial_datos_nuevos_ck check (datos_nuevos is null or jsonb_typeof(datos_nuevos) = 'object')
);

create or replace function territorial_private.validar_evento_id_externo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requiere_id_externo boolean;
begin
  new.id_externo := nullif(btrim(new.id_externo), '');

  select fuente.requiere_id_externo
    into v_requiere_id_externo
  from public.cat_fuentes_evento as fuente
  where fuente.fuente_evento_id = new.fuente_evento_id;

  if coalesce(v_requiere_id_externo, false) and new.id_externo is null then
    raise exception using
      errcode = '23514',
      message = 'La fuente del evento requiere un identificador externo no vacío';
  end if;

  return new;
end;
$$;

create or replace function territorial_private.validar_coherencia_entidad_evento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_entidad_municipio text;
  v_entidad_distrito_local text;
  v_entidad_distrito_federal text;
begin
  if new.municipio_id is not null then
    select m.clave_entidad into v_entidad_municipio
    from public.territorios_municipios m
    where m.municipio_id = new.municipio_id;
  end if;

  if new.distrito_local_id is not null then
    select dl.clave_entidad into v_entidad_distrito_local
    from public.territorios_distritos_locales dl
    where dl.distrito_local_id = new.distrito_local_id;
  end if;

  if new.distrito_federal_id is not null then
    select df.clave_entidad into v_entidad_distrito_federal
    from public.territorios_distritos_federales df
    where df.distrito_federal_id = new.distrito_federal_id;
  end if;

  if v_entidad_municipio is not null and v_entidad_distrito_local is not null
     and v_entidad_municipio <> v_entidad_distrito_local then
    raise exception using errcode = '23514', message = 'Municipio y distrito local pertenecen a entidades distintas';
  end if;

  if v_entidad_municipio is not null and v_entidad_distrito_federal is not null
     and v_entidad_municipio <> v_entidad_distrito_federal then
    raise exception using errcode = '23514', message = 'Municipio y distrito federal pertenecen a entidades distintas';
  end if;

  if v_entidad_distrito_local is not null and v_entidad_distrito_federal is not null
     and v_entidad_distrito_local <> v_entidad_distrito_federal then
    raise exception using errcode = '23514', message = 'Los distritos local y federal pertenecen a entidades distintas';
  end if;

  return new;
end;
$$;

revoke all on function territorial_private.validar_evento_id_externo() from public, anon, authenticated;
revoke all on function territorial_private.validar_coherencia_entidad_evento() from public, anon, authenticated;

create trigger eventos_territoriales_validar_id_externo_trg
before insert or update of fuente_evento_id, id_externo
on public.eventos_territoriales
for each row execute function territorial_private.validar_evento_id_externo();

create trigger eventos_territoriales_validar_entidad_trg
before insert or update of municipio_id, distrito_local_id, distrito_federal_id
on public.eventos_territoriales
for each row execute function territorial_private.validar_coherencia_entidad_evento();

create trigger evento_georreferenciacion_validar_entidad_trg
before insert or update of municipio_id, distrito_local_id, distrito_federal_id
on public.evento_georreferenciacion
for each row execute function territorial_private.validar_coherencia_entidad_evento();

create trigger eventos_territoriales_set_updated_at_trg
before update on public.eventos_territoriales
for each row execute function territorial_private.set_updated_at();

create unique index eventos_territoriales_fuente_externo_uq
  on public.eventos_territoriales (fuente_evento_id, id_externo)
  where id_externo is not null;
create index eventos_territoriales_geom_gix
  on public.eventos_territoriales using gist (geom)
  where geom is not null;
create index eventos_territoriales_seccion_fecha_idx
  on public.eventos_territoriales (seccion_id, ocurrido_en desc)
  where seccion_id is not null;
create index eventos_territoriales_municipio_fecha_idx
  on public.eventos_territoriales (municipio_id, ocurrido_en desc)
  where municipio_id is not null;
create index eventos_territoriales_fuente_fecha_idx
  on public.eventos_territoriales (fuente_evento_id, ocurrido_en desc);
create index eventos_territoriales_estado_fecha_idx
  on public.eventos_territoriales (estado_evento_id, ocurrido_en desc);
create index eventos_territoriales_estado_geo_idx
  on public.eventos_territoriales (estado_geo_id);
create index eventos_territoriales_colonia_idx
  on public.eventos_territoriales (colonia_id)
  where colonia_id is not null;
create index eventos_territoriales_distrito_local_idx
  on public.eventos_territoriales (distrito_local_id)
  where distrito_local_id is not null;
create index eventos_territoriales_distrito_federal_idx
  on public.eventos_territoriales (distrito_federal_id)
  where distrito_federal_id is not null;
create index eventos_territoriales_nivel_sensibilidad_idx
  on public.eventos_territoriales (nivel_sensibilidad);
create index eventos_territoriales_payload_gin
  on public.eventos_territoriales using gin (payload_original jsonb_path_ops);
create index eventos_territoriales_seccion_municipio_idx
  on public.eventos_territoriales (seccion_id, municipio_id)
  where seccion_id is not null;
create index eventos_territoriales_seccion_distrito_local_coherencia_idx
  on public.eventos_territoriales (seccion_id, distrito_local_id)
  where seccion_id is not null and distrito_local_id is not null;
create index eventos_territoriales_seccion_distrito_federal_coherencia_idx
  on public.eventos_territoriales (seccion_id, distrito_federal_id)
  where seccion_id is not null and distrito_federal_id is not null;
create index eventos_territoriales_colonia_municipio_idx
  on public.eventos_territoriales (colonia_id, municipio_id)
  where colonia_id is not null;

create index evento_evidencias_evento_idx on public.evento_evidencias (evento_id);
create index evento_actores_evento_idx on public.evento_actores (evento_id);
create index evento_georreferenciacion_evento_fecha_idx
  on public.evento_georreferenciacion (evento_id, resuelto_en desc);
create unique index evento_georreferenciacion_actual_uq
  on public.evento_georreferenciacion (evento_id)
  where es_actual;
create index evento_georreferenciacion_geom_gix
  on public.evento_georreferenciacion using gist (geom)
  where geom is not null;
create index evento_georreferenciacion_estado_geo_idx
  on public.evento_georreferenciacion (estado_geo_id);
create index evento_georreferenciacion_municipio_idx
  on public.evento_georreferenciacion (municipio_id) where municipio_id is not null;
create index evento_georreferenciacion_colonia_idx
  on public.evento_georreferenciacion (colonia_id) where colonia_id is not null;
create index evento_georreferenciacion_seccion_idx
  on public.evento_georreferenciacion (seccion_id) where seccion_id is not null;
create index evento_georreferenciacion_distrito_local_idx
  on public.evento_georreferenciacion (distrito_local_id) where distrito_local_id is not null;
create index evento_georreferenciacion_distrito_federal_idx
  on public.evento_georreferenciacion (distrito_federal_id) where distrito_federal_id is not null;
create index evento_geo_seccion_municipio_idx
  on public.evento_georreferenciacion (seccion_id, municipio_id)
  where seccion_id is not null;
create index evento_geo_seccion_distrito_local_idx
  on public.evento_georreferenciacion (seccion_id, distrito_local_id)
  where seccion_id is not null and distrito_local_id is not null;
create index evento_geo_seccion_distrito_federal_idx
  on public.evento_georreferenciacion (seccion_id, distrito_federal_id)
  where seccion_id is not null and distrito_federal_id is not null;
create index evento_geo_colonia_municipio_idx
  on public.evento_georreferenciacion (colonia_id, municipio_id)
  where colonia_id is not null;
create index evento_historial_evento_fecha_idx
  on public.evento_historial (evento_id, created_at desc);
create index evento_historial_estado_anterior_idx
  on public.evento_historial (estado_anterior_id) where estado_anterior_id is not null;
create index evento_historial_estado_nuevo_idx
  on public.evento_historial (estado_nuevo_id) where estado_nuevo_id is not null;

alter table public.eventos_territoriales enable row level security;
alter table public.evento_evidencias enable row level security;
alter table public.evento_actores enable row level security;
alter table public.evento_georreferenciacion enable row level security;
alter table public.evento_historial enable row level security;

revoke all on table
  public.eventos_territoriales,
  public.evento_evidencias,
  public.evento_actores,
  public.evento_georreferenciacion,
  public.evento_historial
from anon, authenticated;

grant select, insert, update, delete on table
  public.eventos_territoriales,
  public.evento_evidencias,
  public.evento_actores,
  public.evento_georreferenciacion,
  public.evento_historial
to service_role;

revoke all on sequence
  public.eventos_territoriales_evento_id_seq,
  public.evento_evidencias_evidencia_id_seq,
  public.evento_actores_evento_actor_id_seq,
  public.evento_georreferenciacion_georreferenciacion_id_seq,
  public.evento_historial_evento_historial_id_seq
from anon, authenticated;

grant usage, select on sequence
  public.eventos_territoriales_evento_id_seq,
  public.evento_evidencias_evidencia_id_seq,
  public.evento_actores_evento_actor_id_seq,
  public.evento_georreferenciacion_georreferenciacion_id_seq,
  public.evento_historial_evento_historial_id_seq
to service_role;

comment on table public.eventos_territoriales is
  'Evento normalizado; conserva el contenido y payload originales separados de cualquier interpretación de IA.';

;
