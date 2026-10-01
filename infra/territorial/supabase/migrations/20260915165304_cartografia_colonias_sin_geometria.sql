begin;
-- This new migration extends the applied M14/M16/M17/M18 schema. Their files
-- and cartografia_colonias.geom NOT NULL remain unchanged.
do $check$
begin
  if exists (
    select 1
    from public.cartografia_colonias
    group by cartografia_version_id, fila_origen
    having count(*) > 1
  ) then
    raise exception using errcode = '23505',
      message = 'cartografia_colonias tiene filas origen duplicadas por version';
  end if;
end;
$check$;
create unique index cartografia_colonias_fila_version_uq
  on public.cartografia_colonias (cartografia_version_id, fila_origen);
create table public.cartografia_colonias_sin_geometria (
  cartografia_colonia_sin_geometria_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  colonia_id bigint not null,
  clave_entidad text not null,
  id_ine text not null,
  cartografia_municipio_id bigint not null,
  municipio_id bigint not null,
  nombre text not null,
  atributos_fuente jsonb not null default '{}'::jsonb,
  fila_origen bigint not null,
  fuente_sha256 text not null,
  motivo text not null default 'GEOMETRIA_NULA_ORIGEN',
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint cartografia_colonias_sin_geometria_version_entidad_fk
    foreign key (cartografia_version_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad)
    on delete restrict,
  constraint cartografia_colonias_sin_geometria_estable_fk
    foreign key (colonia_id)
    references public.territorios_colonias (colonia_id)
    on delete restrict,
  constraint cartografia_colonias_sin_geometria_municipio_version_fk
    foreign key (cartografia_municipio_id, cartografia_version_id, municipio_id)
    references public.cartografia_municipios
      (cartografia_municipio_id, cartografia_version_id, municipio_id)
    on delete restrict,
  constraint cartografia_colonias_sin_geometria_version_id_ine_uq
    unique (cartografia_version_id, clave_entidad, id_ine),
  constraint cartografia_colonias_sin_geometria_version_fila_uq
    unique (cartografia_version_id, fila_origen),
  constraint cartografia_colonias_sin_geometria_clave_entidad_ck
    check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_colonias_sin_geometria_id_ine_ck
    check (pg_catalog.btrim(id_ine) <> ''),
  constraint cartografia_colonias_sin_geometria_nombre_ck
    check (pg_catalog.btrim(nombre) <> ''),
  constraint cartografia_colonias_sin_geometria_atributos_objeto_ck
    check (pg_catalog.jsonb_typeof(atributos_fuente) = 'object'),
  constraint cartografia_colonias_sin_geometria_fila_origen_ck
    check (fila_origen > 0),
  constraint cartografia_colonias_sin_geometria_fuente_sha256_ck
    check (fuente_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cartografia_colonias_sin_geometria_motivo_ck
    check (motivo = 'GEOMETRIA_NULA_ORIGEN')
);
create index cartografia_colonias_sin_geometria_colonia_fk_idx
  on public.cartografia_colonias_sin_geometria (colonia_id);
create index cartografia_colonias_sin_geometria_municipio_fk_idx
  on public.cartografia_colonias_sin_geometria
    (cartografia_municipio_id, cartografia_version_id, municipio_id);
create index cartografia_colonias_sin_geometria_version_municipio_idx
  on public.cartografia_colonias_sin_geometria
    (cartografia_version_id, cartografia_municipio_id);
create index cartografia_colonias_sin_geometria_version_municipio_estable_idx
  on public.cartografia_colonias_sin_geometria
    (cartografia_version_id, municipio_id);
create table public.cartografia_cobertura_colonias_recibos (
  carga_id bigint primary key,
  cartografia_version_id bigint not null unique,
  evidencia jsonb not null,
  evidencia_sha256 text not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint cartografia_cobertura_colonias_recibos_carga_version_fk
    foreign key (carga_id, cartografia_version_id)
    references public.cargas_cartograficas (carga_id, cartografia_version_id)
    on delete restrict,
  constraint cartografia_cobertura_colonias_recibos_evidencia_objeto_ck
    check (pg_catalog.jsonb_typeof(evidencia) = 'object'),
  constraint cartografia_cobertura_colonias_recibos_sha256_ck
    check (evidencia_sha256 ~ '^[0-9a-f]{64}$')
);
create function territorial_private.rechazar_cambio_recibo_cobertura()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  raise exception using errcode = '55000',
    message = 'recibo de cobertura cartografica inmutable';
end;
$function$;
create trigger cartografia_colonias_sin_geometria_proteger
  before insert or update or delete on public.cartografia_colonias_sin_geometria
  for each row execute function territorial_private.proteger_geometria_cartografica();
create trigger cartografia_colonias_sin_geometria_set_updated_at
  before update on public.cartografia_colonias_sin_geometria
  for each row execute function territorial_private.set_updated_at();
create trigger cartografia_cobertura_colonias_recibos_inmutable
  before update or delete on public.cartografia_cobertura_colonias_recibos
  for each row execute function territorial_private.rechazar_cambio_recibo_cobertura();
revoke all on function territorial_private.rechazar_cambio_recibo_cobertura()
  from public, anon, authenticated;
alter table public.cartografia_colonias_sin_geometria enable row level security;
alter table public.cartografia_cobertura_colonias_recibos enable row level security;
revoke all on table public.cartografia_colonias_sin_geometria,
  public.cartografia_cobertura_colonias_recibos
  from public, anon, authenticated, service_role;
grant select on table public.cartografia_colonias_sin_geometria,
  public.cartografia_cobertura_colonias_recibos to service_role;
comment on table public.cartografia_colonias_sin_geometria is
  'Atributos versionados de COLONIA con geometry:null en el SHP original; no hay geometria derivada.';
comment on table public.cartografia_cobertura_colonias_recibos is
  'Recibo de cobertura BGD/COLONIA por carga, sin permiso INSERT hasta la RPC y guard posteriores.';
commit;
