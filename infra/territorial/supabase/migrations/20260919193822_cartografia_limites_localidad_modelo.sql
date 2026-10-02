begin;
alter table public.cartografia_localidades
  add column clave_localidad_fuente text;
update public.cartografia_localidades
   set clave_localidad_fuente = pg_catalog.btrim(atributos_fuente ->> 'LOCALIDAD');
do $backfill$
begin
  if exists (
    select 1
    from public.cartografia_localidades
    where nullif(pg_catalog.btrim(clave_localidad_fuente), '') is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'LOCALIDAD fuente faltante durante backfill';
  end if;
end;
$backfill$;
alter table public.cartografia_localidades
  alter column clave_localidad_fuente set not null,
  add constraint cartografia_localidades_clave_fuente_ck
    check (
      nullif(pg_catalog.btrim(atributos_fuente ->> 'LOCALIDAD'), '') is not null
      and clave_localidad_fuente = pg_catalog.btrim(atributos_fuente ->> 'LOCALIDAD')
    ),
  add constraint cartografia_localidades_puente_uq unique (
    cartografia_localidad_id,
    cartografia_version_id,
    localidad_id,
    clave_entidad,
    cartografia_municipio_id,
    municipio_id,
    clave_localidad_fuente
  );
create index cartografia_localidades_version_municipio_clave_fuente_idx
  on public.cartografia_localidades (
    cartografia_version_id,
    cartografia_municipio_id,
    clave_localidad_fuente
  );
create function territorial_private.asignar_clave_localidad_fuente()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.clave_localidad_fuente is null then
    new.clave_localidad_fuente := nullif(
      pg_catalog.btrim(new.atributos_fuente ->> 'LOCALIDAD'),
      ''
    );
  end if;
  return new;
end;
$$;
revoke all on function territorial_private.asignar_clave_localidad_fuente()
  from public, anon, authenticated;
create trigger cartografia_localidades_asignar_clave_fuente
  before insert or update of atributos_fuente, clave_localidad_fuente
  on public.cartografia_localidades
  for each row execute function territorial_private.asignar_clave_localidad_fuente();
create table public.cartografia_limites_localidad (
  cartografia_limite_localidad_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  clave_entidad text not null,
  cartografia_municipio_id bigint not null,
  municipio_id bigint not null,
  id_fuente_limite text not null,
  clave_localidad_fuente text not null,
  nombre text not null,
  tipo smallint not null,
  cabecera smallint,
  atributos_fuente jsonb not null default '{}'::jsonb,
  fila_origen bigint not null,
  fuente_sha256 text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint cartografia_limites_localidad_version_entidad_fk
    foreign key (cartografia_version_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad)
    on delete restrict,
  constraint cartografia_limites_localidad_municipio_version_fk
    foreign key (cartografia_municipio_id, cartografia_version_id, municipio_id)
    references public.cartografia_municipios (
      cartografia_municipio_id,
      cartografia_version_id,
      municipio_id
    )
    on delete restrict,
  constraint cartografia_limites_localidad_version_identidad_uq
    unique (cartografia_version_id, clave_entidad, id_fuente_limite),
  constraint cartografia_limites_localidad_version_fila_uq
    unique (cartografia_version_id, fila_origen),
  constraint cartografia_limites_localidad_puente_uq unique (
    cartografia_limite_localidad_id,
    cartografia_version_id,
    clave_entidad,
    cartografia_municipio_id,
    municipio_id,
    clave_localidad_fuente
  ),
  constraint cartografia_limites_localidad_clave_entidad_ck
    check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_limites_localidad_id_fuente_ck
    check (pg_catalog.btrim(id_fuente_limite) <> ''),
  constraint cartografia_limites_localidad_clave_fuente_ck
    check (pg_catalog.btrim(clave_localidad_fuente) <> ''),
  constraint cartografia_limites_localidad_nombre_ck
    check (pg_catalog.btrim(nombre) <> ''),
  constraint cartografia_limites_localidad_tipo_ck
    check (tipo > 0),
  constraint cartografia_limites_localidad_cabecera_ck
    check (cabecera is null or cabecera > 0),
  constraint cartografia_limites_localidad_atributos_objeto_ck
    check (pg_catalog.jsonb_typeof(atributos_fuente) = 'object'),
  constraint cartografia_limites_localidad_fila_origen_ck
    check (fila_origen > 0),
  constraint cartografia_limites_localidad_fuente_sha256_ck
    check (fuente_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cartografia_limites_localidad_geom_ck check (
    not extensions.st_isempty(geom)
    and extensions.st_isvalid(geom)
    and extensions.st_srid(geom) = 4326
    and extensions.st_geometrytype(geom) = 'ST_MultiPolygon'
    and extensions.st_coveredby(
      geom,
      extensions.st_makeenvelope(-101, 18, -98, 21, 4326)
    )
  )
);
create table public.cartografia_limites_localidad_puntos (
  cartografia_limite_localidad_id bigint not null,
  cartografia_localidad_id bigint not null,
  localidad_id bigint not null,
  cartografia_version_id bigint not null,
  clave_entidad text not null,
  cartografia_municipio_id bigint not null,
  municipio_id bigint not null,
  clave_localidad_fuente text not null,
  metodo text not null default 'CLAVE_FUENTE_EXACTA',
  created_at timestamptz not null default pg_catalog.now(),
  constraint cartografia_limites_localidad_puntos_pk primary key (
    cartografia_limite_localidad_id,
    cartografia_localidad_id
  ),
  constraint cartografia_limites_localidad_puntos_limite_fk foreign key (
    cartografia_limite_localidad_id,
    cartografia_version_id,
    clave_entidad,
    cartografia_municipio_id,
    municipio_id,
    clave_localidad_fuente
  ) references public.cartografia_limites_localidad (
    cartografia_limite_localidad_id,
    cartografia_version_id,
    clave_entidad,
    cartografia_municipio_id,
    municipio_id,
    clave_localidad_fuente
  ) on delete restrict,
  constraint cartografia_limites_localidad_puntos_localidad_fk foreign key (
    cartografia_localidad_id,
    cartografia_version_id,
    localidad_id,
    clave_entidad,
    cartografia_municipio_id,
    municipio_id,
    clave_localidad_fuente
  ) references public.cartografia_localidades (
    cartografia_localidad_id,
    cartografia_version_id,
    localidad_id,
    clave_entidad,
    cartografia_municipio_id,
    municipio_id,
    clave_localidad_fuente
  ) on delete restrict,
  constraint cartografia_limites_localidad_puntos_clave_entidad_ck
    check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_limites_localidad_puntos_clave_fuente_ck
    check (pg_catalog.btrim(clave_localidad_fuente) <> ''),
  constraint cartografia_limites_localidad_puntos_metodo_ck
    check (metodo = 'CLAVE_FUENTE_EXACTA')
);
create index cartografia_limites_localidad_municipio_version_idx
  on public.cartografia_limites_localidad (
    cartografia_municipio_id,
    cartografia_version_id,
    municipio_id
  );
create index cartografia_limites_localidad_version_municipio_clave_idx
  on public.cartografia_limites_localidad (
    cartografia_version_id,
    cartografia_municipio_id,
    clave_localidad_fuente
  );
create index cartografia_limites_localidad_version_tipo_idx
  on public.cartografia_limites_localidad (cartografia_version_id, tipo);
create index cartografia_limites_localidad_geom_gix
  on public.cartografia_limites_localidad using gist (geom);
create index cartografia_limites_localidad_puntos_localidad_contexto_idx
  on public.cartografia_limites_localidad_puntos (
    cartografia_localidad_id,
    cartografia_version_id,
    localidad_id,
    clave_entidad,
    cartografia_municipio_id,
    municipio_id,
    clave_localidad_fuente
  );
create index cartografia_limites_localidad_puntos_limite_contexto_idx
  on public.cartografia_limites_localidad_puntos (
    cartografia_limite_localidad_id,
    cartografia_version_id,
    clave_entidad,
    cartografia_municipio_id,
    municipio_id,
    clave_localidad_fuente
  );
create index cartografia_limites_localidad_puntos_version_municipio_idx
  on public.cartografia_limites_localidad_puntos (
    cartografia_version_id,
    cartografia_municipio_id,
    clave_localidad_fuente
  );
create trigger cartografia_limites_localidad_proteger_geometria
  before insert or update or delete on public.cartografia_limites_localidad
  for each row execute function territorial_private.proteger_geometria_cartografica();
create trigger cartografia_limites_localidad_puntos_proteger_geometria
  before insert or update or delete on public.cartografia_limites_localidad_puntos
  for each row execute function territorial_private.proteger_geometria_cartografica();
create trigger cartografia_limites_localidad_set_updated_at
  before update on public.cartografia_limites_localidad
  for each row execute function territorial_private.set_updated_at();
alter table public.cartografia_limites_localidad enable row level security;
alter table public.cartografia_limites_localidad_puntos enable row level security;
revoke all on table
  public.cartografia_limites_localidad,
  public.cartografia_limites_localidad_puntos
from public, anon, authenticated, service_role;
grant select on table
  public.cartografia_limites_localidad,
  public.cartografia_limites_localidad_puntos
to service_role;
do $sequence_privileges$
declare
  v_sequence text;
begin
  v_sequence := pg_catalog.pg_get_serial_sequence(
    'public.cartografia_limites_localidad',
    'cartografia_limite_localidad_id'
  );
  if v_sequence is null then
    raise exception 'secuencia identity de cartografia_limites_localidad no encontrada';
  end if;
  execute pg_catalog.format(
    'revoke all on sequence %s from public, anon, authenticated, service_role',
    v_sequence
  );
end;
$sequence_privileges$;
commit;
