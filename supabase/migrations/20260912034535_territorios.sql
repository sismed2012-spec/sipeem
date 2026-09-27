create table public.territorios_municipios (
  municipio_id bigint generated always as identity primary key,
  clave_entidad text not null,
  clave_municipio text not null,
  nombre text not null,
  nombre_normalizado text,
  geom extensions.geometry(MultiPolygon, 4326),
  metadata jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territorios_municipios_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint territorios_municipios_clave_municipio_ck check (clave_municipio ~ '^[0-9]{3}$'),
  constraint territorios_municipios_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint territorios_municipios_geom_valida_ck check (
    geom is null or (
      not extensions.st_isempty(geom)
      and extensions.st_isvalid(geom)
      and extensions.st_coveredby(geom, extensions.st_makeenvelope(-180, -90, 180, 90, 4326))
    )
  ),
  constraint territorios_municipios_clave_uq unique (clave_entidad, clave_municipio),
  constraint territorios_municipios_id_entidad_uq unique (municipio_id, clave_entidad)
);

create table public.territorios_distritos_locales (
  distrito_local_id bigint generated always as identity primary key,
  clave_entidad text not null,
  numero smallint not null,
  nombre text,
  geom extensions.geometry(MultiPolygon, 4326),
  metadata jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territorios_distritos_locales_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint territorios_distritos_locales_numero_ck check (numero > 0),
  constraint territorios_distritos_locales_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint territorios_distritos_locales_geom_valida_ck check (
    geom is null or (
      not extensions.st_isempty(geom)
      and extensions.st_isvalid(geom)
      and extensions.st_coveredby(geom, extensions.st_makeenvelope(-180, -90, 180, 90, 4326))
    )
  ),
  constraint territorios_distritos_locales_clave_uq unique (clave_entidad, numero),
  constraint territorios_distritos_locales_id_entidad_uq unique (distrito_local_id, clave_entidad)
);

create table public.territorios_distritos_federales (
  distrito_federal_id bigint generated always as identity primary key,
  clave_entidad text not null,
  numero smallint not null,
  nombre text,
  geom extensions.geometry(MultiPolygon, 4326),
  metadata jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territorios_distritos_federales_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint territorios_distritos_federales_numero_ck check (numero > 0),
  constraint territorios_distritos_federales_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint territorios_distritos_federales_geom_valida_ck check (
    geom is null or (
      not extensions.st_isempty(geom)
      and extensions.st_isvalid(geom)
      and extensions.st_coveredby(geom, extensions.st_makeenvelope(-180, -90, 180, 90, 4326))
    )
  ),
  constraint territorios_distritos_federales_clave_uq unique (clave_entidad, numero),
  constraint territorios_distritos_federales_id_entidad_uq unique (distrito_federal_id, clave_entidad)
);

create table public.territorios_secciones (
  seccion_id bigint generated always as identity primary key,
  clave_entidad text not null,
  numero integer not null,
  municipio_id bigint not null,
  distrito_local_id bigint,
  distrito_federal_id bigint,
  geom extensions.geometry(MultiPolygon, 4326),
  metadata jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territorios_secciones_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint territorios_secciones_numero_ck check (numero > 0),
  constraint territorios_secciones_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint territorios_secciones_geom_valida_ck check (
    geom is null or (
      not extensions.st_isempty(geom)
      and extensions.st_isvalid(geom)
      and extensions.st_coveredby(geom, extensions.st_makeenvelope(-180, -90, 180, 90, 4326))
    )
  ),
  constraint territorios_secciones_municipio_entidad_fk
    foreign key (municipio_id, clave_entidad)
    references public.territorios_municipios(municipio_id, clave_entidad),
  constraint territorios_secciones_distrito_local_entidad_fk
    foreign key (distrito_local_id, clave_entidad)
    references public.territorios_distritos_locales(distrito_local_id, clave_entidad),
  constraint territorios_secciones_distrito_federal_entidad_fk
    foreign key (distrito_federal_id, clave_entidad)
    references public.territorios_distritos_federales(distrito_federal_id, clave_entidad),
  constraint territorios_secciones_clave_uq unique (clave_entidad, numero),
  constraint territorios_secciones_id_municipio_uq unique (seccion_id, municipio_id),
  constraint territorios_secciones_id_distrito_local_uq unique (seccion_id, distrito_local_id),
  constraint territorios_secciones_id_distrito_federal_uq unique (seccion_id, distrito_federal_id)
);

create table public.territorios_colonias (
  colonia_id bigint generated always as identity primary key,
  municipio_id bigint not null references public.territorios_municipios(municipio_id),
  tipo_asentamiento_id smallint references public.cat_tipos_asentamiento(tipo_asentamiento_id),
  clave text,
  nombre text not null,
  nombre_normalizado text,
  codigo_postal text,
  geom extensions.geometry(MultiPolygon, 4326),
  metadata jsonb not null default '{}'::jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territorios_colonias_codigo_postal_ck check (codigo_postal is null or codigo_postal ~ '^[0-9]{5}$'),
  constraint territorios_colonias_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint territorios_colonias_geom_valida_ck check (
    geom is null or (
      not extensions.st_isempty(geom)
      and extensions.st_isvalid(geom)
      and extensions.st_coveredby(geom, extensions.st_makeenvelope(-180, -90, 180, 90, 4326))
    )
  ),
  constraint territorios_colonias_id_municipio_uq unique (colonia_id, municipio_id)
);

create trigger territorios_municipios_set_updated_at
  before update on public.territorios_municipios
  for each row execute function territorial_private.set_updated_at();
create trigger territorios_distritos_locales_set_updated_at
  before update on public.territorios_distritos_locales
  for each row execute function territorial_private.set_updated_at();
create trigger territorios_distritos_federales_set_updated_at
  before update on public.territorios_distritos_federales
  for each row execute function territorial_private.set_updated_at();
create trigger territorios_secciones_set_updated_at
  before update on public.territorios_secciones
  for each row execute function territorial_private.set_updated_at();
create trigger territorios_colonias_set_updated_at
  before update on public.territorios_colonias
  for each row execute function territorial_private.set_updated_at();

create unique index territorios_colonias_municipio_clave_uq
  on public.territorios_colonias (municipio_id, clave)
  where clave is not null;

create index territorios_secciones_municipio_idx
  on public.territorios_secciones (municipio_id, clave_entidad);
create index territorios_secciones_distrito_local_idx
  on public.territorios_secciones (distrito_local_id, clave_entidad)
  where distrito_local_id is not null;
create index territorios_secciones_distrito_federal_idx
  on public.territorios_secciones (distrito_federal_id, clave_entidad)
  where distrito_federal_id is not null;
create index territorios_colonias_municipio_idx
  on public.territorios_colonias (municipio_id);
create index territorios_colonias_tipo_asentamiento_idx
  on public.territorios_colonias (tipo_asentamiento_id)
  where tipo_asentamiento_id is not null;

create index territorios_municipios_geom_gix
  on public.territorios_municipios using gist (geom)
  where geom is not null;
create index territorios_distritos_locales_geom_gix
  on public.territorios_distritos_locales using gist (geom)
  where geom is not null;
create index territorios_distritos_federales_geom_gix
  on public.territorios_distritos_federales using gist (geom)
  where geom is not null;
create index territorios_secciones_geom_gix
  on public.territorios_secciones using gist (geom)
  where geom is not null;
create index territorios_colonias_geom_gix
  on public.territorios_colonias using gist (geom)
  where geom is not null;

alter table public.territorios_municipios enable row level security;
alter table public.territorios_distritos_locales enable row level security;
alter table public.territorios_distritos_federales enable row level security;
alter table public.territorios_secciones enable row level security;
alter table public.territorios_colonias enable row level security;

revoke all on table
  public.territorios_municipios,
  public.territorios_distritos_locales,
  public.territorios_distritos_federales,
  public.territorios_secciones,
  public.territorios_colonias
from anon, authenticated;

grant select, insert, update, delete on table
  public.territorios_municipios,
  public.territorios_distritos_locales,
  public.territorios_distritos_federales,
  public.territorios_secciones,
  public.territorios_colonias
to service_role;

revoke all on sequence
  public.territorios_municipios_municipio_id_seq,
  public.territorios_distritos_locales_distrito_local_id_seq,
  public.territorios_distritos_federales_distrito_federal_id_seq,
  public.territorios_secciones_seccion_id_seq,
  public.territorios_colonias_colonia_id_seq
from anon, authenticated;

grant usage, select on sequence
  public.territorios_municipios_municipio_id_seq,
  public.territorios_distritos_locales_distrito_local_id_seq,
  public.territorios_distritos_federales_distrito_federal_id_seq,
  public.territorios_secciones_seccion_id_seq,
  public.territorios_colonias_colonia_id_seq
to service_role;

comment on table public.territorios_secciones is
  'Unidad territorial analítica que vincula cartografía, elecciones, eventos y operación.';

;
