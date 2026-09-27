begin;
alter table public.cartografia_versiones
  add constraint cartografia_versiones_id_entidad_uq
  unique (cartografia_version_id, clave_entidad);
alter table public.territorios_secciones
  add constraint territorios_secciones_id_entidad_uq
  unique (seccion_id, clave_entidad);
alter table public.territorios_localidades
  add constraint territorios_localidades_id_entidad_uq
  unique (localidad_id, clave_entidad);
alter table public.cartografia_versiones_bitacora
  drop constraint cartografia_versiones_bitacora_estado_anterior_ck,
  drop constraint cartografia_versiones_bitacora_estado_nuevo_ck;
alter table public.cartografia_versiones_bitacora
  add constraint cartografia_versiones_bitacora_estado_anterior_ck check (
    estado_anterior is null or estado_anterior in (
      'PREPARADA', 'CARGANDO', 'FALLIDA', 'VALIDADA', 'PUBLICADA', 'ARCHIVADA',
      'VALIDANDO', 'COMPLETA'
    )
  ),
  add constraint cartografia_versiones_bitacora_estado_nuevo_ck check (
    estado_nuevo is null or estado_nuevo in (
      'PREPARADA', 'CARGANDO', 'FALLIDA', 'VALIDADA', 'PUBLICADA', 'ARCHIVADA',
      'VALIDANDO', 'COMPLETA'
    )
  );
create table public.cartografia_entidades (
  cartografia_entidad_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  clave_entidad text not null,
  nombre text not null,
  atributos_fuente jsonb not null default '{}'::jsonb,
  fila_origen bigint not null,
  fuente_sha256 text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartografia_entidades_version_entidad_fk foreign key (cartografia_version_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad) on delete restrict,
  constraint cartografia_entidades_version_entidad_uq unique (cartografia_version_id, clave_entidad),
  constraint cartografia_entidades_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_entidades_nombre_ck check (btrim(nombre) <> ''),
  constraint cartografia_entidades_atributos_objeto_ck check (jsonb_typeof(atributos_fuente) = 'object'),
  constraint cartografia_entidades_fila_origen_ck check (fila_origen > 0),
  constraint cartografia_entidades_fuente_sha256_ck check (fuente_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cartografia_entidades_geom_ck check (
    not extensions.st_isempty(geom) and extensions.st_isvalid(geom)
    and extensions.st_srid(geom) = 4326
    and extensions.st_coveredby(geom, extensions.st_makeenvelope(-101, 18, -98, 21, 4326))
  )
);
create table public.cartografia_municipios (
  cartografia_municipio_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  municipio_id bigint not null,
  clave_entidad text not null,
  clave_municipio text not null,
  nombre text not null,
  atributos_fuente jsonb not null default '{}'::jsonb,
  fila_origen bigint not null,
  fuente_sha256 text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartografia_municipios_version_entidad_fk foreign key (cartografia_version_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad) on delete restrict,
  constraint cartografia_municipios_estable_entidad_fk foreign key (municipio_id, clave_entidad)
    references public.territorios_municipios (municipio_id, clave_entidad) on delete restrict,
  constraint cartografia_municipios_version_clave_uq unique (cartografia_version_id, clave_entidad, clave_municipio),
  constraint cartografia_municipios_id_version_municipio_uq unique (cartografia_municipio_id, cartografia_version_id, municipio_id),
  constraint cartografia_municipios_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_municipios_clave_ck check (btrim(clave_municipio) <> ''),
  constraint cartografia_municipios_nombre_ck check (btrim(nombre) <> ''),
  constraint cartografia_municipios_atributos_objeto_ck check (jsonb_typeof(atributos_fuente) = 'object'),
  constraint cartografia_municipios_fila_origen_ck check (fila_origen > 0),
  constraint cartografia_municipios_fuente_sha256_ck check (fuente_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cartografia_municipios_geom_ck check (
    not extensions.st_isempty(geom) and extensions.st_isvalid(geom)
    and extensions.st_srid(geom) = 4326
    and extensions.st_coveredby(geom, extensions.st_makeenvelope(-101, 18, -98, 21, 4326))
  )
);
create table public.cartografia_distritos_locales (
  cartografia_distrito_local_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  distrito_local_id bigint not null,
  clave_entidad text not null,
  numero integer not null,
  nombre text not null,
  atributos_fuente jsonb not null default '{}'::jsonb,
  fila_origen bigint not null,
  fuente_sha256 text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartografia_distritos_locales_version_entidad_fk foreign key (cartografia_version_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad) on delete restrict,
  constraint cartografia_distritos_locales_estable_entidad_fk foreign key (distrito_local_id, clave_entidad)
    references public.territorios_distritos_locales (distrito_local_id, clave_entidad) on delete restrict,
  constraint cartografia_distritos_locales_version_numero_uq unique (cartografia_version_id, clave_entidad, numero),
  constraint cartografia_distritos_locales_id_version_distrito_uq unique (cartografia_distrito_local_id, cartografia_version_id, distrito_local_id),
  constraint cartografia_distritos_locales_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_distritos_locales_numero_ck check (numero > 0),
  constraint cartografia_distritos_locales_nombre_ck check (btrim(nombre) <> ''),
  constraint cartografia_distritos_locales_atributos_objeto_ck check (jsonb_typeof(atributos_fuente) = 'object'),
  constraint cartografia_distritos_locales_fila_origen_ck check (fila_origen > 0),
  constraint cartografia_distritos_locales_fuente_sha256_ck check (fuente_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cartografia_distritos_locales_geom_ck check (
    not extensions.st_isempty(geom) and extensions.st_isvalid(geom)
    and extensions.st_srid(geom) = 4326
    and extensions.st_coveredby(geom, extensions.st_makeenvelope(-101, 18, -98, 21, 4326))
  )
);
create table public.cartografia_distritos_federales (
  cartografia_distrito_federal_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  distrito_federal_id bigint not null,
  clave_entidad text not null,
  numero integer not null,
  nombre text not null,
  atributos_fuente jsonb not null default '{}'::jsonb,
  fila_origen bigint not null,
  fuente_sha256 text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartografia_distritos_federales_version_entidad_fk foreign key (cartografia_version_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad) on delete restrict,
  constraint cartografia_distritos_federales_estable_entidad_fk foreign key (distrito_federal_id, clave_entidad)
    references public.territorios_distritos_federales (distrito_federal_id, clave_entidad) on delete restrict,
  constraint cartografia_distritos_federales_version_numero_uq unique (cartografia_version_id, clave_entidad, numero),
  constraint cartografia_distritos_federales_id_version_distrito_uq unique (cartografia_distrito_federal_id, cartografia_version_id, distrito_federal_id),
  constraint cartografia_distritos_federales_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_distritos_federales_numero_ck check (numero > 0),
  constraint cartografia_distritos_federales_nombre_ck check (btrim(nombre) <> ''),
  constraint cartografia_distritos_federales_atributos_objeto_ck check (jsonb_typeof(atributos_fuente) = 'object'),
  constraint cartografia_distritos_federales_fila_origen_ck check (fila_origen > 0),
  constraint cartografia_distritos_federales_fuente_sha256_ck check (fuente_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cartografia_distritos_federales_geom_ck check (
    not extensions.st_isempty(geom) and extensions.st_isvalid(geom)
    and extensions.st_srid(geom) = 4326
    and extensions.st_coveredby(geom, extensions.st_makeenvelope(-101, 18, -98, 21, 4326))
  )
);
create table public.cartografia_secciones (
  cartografia_seccion_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  seccion_id bigint not null,
  clave_entidad text not null,
  numero integer not null,
  cartografia_municipio_id bigint not null,
  municipio_id bigint not null,
  cartografia_distrito_local_id bigint not null,
  distrito_local_id bigint not null,
  cartografia_distrito_federal_id bigint not null,
  distrito_federal_id bigint not null,
  tipo text,
  atributos_fuente jsonb not null default '{}'::jsonb,
  fila_origen bigint not null,
  fuente_sha256 text not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartografia_secciones_version_entidad_fk foreign key (cartografia_version_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad) on delete restrict,
  constraint cartografia_secciones_estable_entidad_fk foreign key (seccion_id, clave_entidad)
    references public.territorios_secciones (seccion_id, clave_entidad) on delete restrict,
  constraint cartografia_secciones_municipio_version_fk foreign key (cartografia_municipio_id, cartografia_version_id, municipio_id)
    references public.cartografia_municipios (cartografia_municipio_id, cartografia_version_id, municipio_id) on delete restrict,
  constraint cartografia_secciones_distrito_local_version_fk foreign key (cartografia_distrito_local_id, cartografia_version_id, distrito_local_id)
    references public.cartografia_distritos_locales (cartografia_distrito_local_id, cartografia_version_id, distrito_local_id) on delete restrict,
  constraint cartografia_secciones_distrito_federal_version_fk foreign key (cartografia_distrito_federal_id, cartografia_version_id, distrito_federal_id)
    references public.cartografia_distritos_federales (cartografia_distrito_federal_id, cartografia_version_id, distrito_federal_id) on delete restrict,
  constraint cartografia_secciones_version_numero_uq unique (cartografia_version_id, clave_entidad, numero),
  constraint cartografia_secciones_id_version_seccion_uq unique (cartografia_seccion_id, cartografia_version_id, seccion_id),
  constraint cartografia_secciones_id_version_entidad_seccion_uq unique (cartografia_seccion_id, cartografia_version_id, clave_entidad, seccion_id),
  constraint cartografia_secciones_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_secciones_numero_ck check (numero > 0),
  constraint cartografia_secciones_tipo_ck check (tipo is null or btrim(tipo) <> ''),
  constraint cartografia_secciones_atributos_objeto_ck check (jsonb_typeof(atributos_fuente) = 'object'),
  constraint cartografia_secciones_fila_origen_ck check (fila_origen > 0),
  constraint cartografia_secciones_fuente_sha256_ck check (fuente_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cartografia_secciones_geom_ck check (
    not extensions.st_isempty(geom) and extensions.st_isvalid(geom)
    and extensions.st_srid(geom) = 4326
    and extensions.st_coveredby(geom, extensions.st_makeenvelope(-101, 18, -98, 21, 4326))
  )
);
create table public.cartografia_colonias (
  cartografia_colonia_id bigint generated always as identity primary key,
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
  geom extensions.geometry(MultiPolygon, 4326) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartografia_colonias_version_entidad_fk foreign key (cartografia_version_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad) on delete restrict,
  constraint cartografia_colonias_estable_fk foreign key (colonia_id)
    references public.territorios_colonias (colonia_id) on delete restrict,
  constraint cartografia_colonias_municipio_version_fk foreign key (cartografia_municipio_id, cartografia_version_id, municipio_id)
    references public.cartografia_municipios (cartografia_municipio_id, cartografia_version_id, municipio_id) on delete restrict,
  constraint cartografia_colonias_version_id_ine_uq unique (cartografia_version_id, clave_entidad, id_ine),
  constraint cartografia_colonias_id_version_colonia_uq unique (cartografia_colonia_id, cartografia_version_id, colonia_id),
  constraint cartografia_colonias_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_colonias_id_ine_ck check (btrim(id_ine) <> ''),
  constraint cartografia_colonias_nombre_ck check (btrim(nombre) <> ''),
  constraint cartografia_colonias_atributos_objeto_ck check (jsonb_typeof(atributos_fuente) = 'object'),
  constraint cartografia_colonias_fila_origen_ck check (fila_origen > 0),
  constraint cartografia_colonias_fuente_sha256_ck check (fuente_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cartografia_colonias_geom_ck check (
    not extensions.st_isempty(geom) and extensions.st_isvalid(geom)
    and extensions.st_srid(geom) = 4326
    and extensions.st_coveredby(geom, extensions.st_makeenvelope(-101, 18, -98, 21, 4326))
  )
);
create table public.cartografia_localidades (
  cartografia_localidad_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  localidad_id bigint not null,
  clave_entidad text not null,
  id_ine text not null,
  cartografia_municipio_id bigint not null,
  municipio_id bigint not null,
  cartografia_seccion_id bigint not null,
  seccion_id bigint not null,
  nombre text not null,
  atributos_fuente jsonb not null default '{}'::jsonb,
  fila_origen bigint not null,
  fuente_punto_sha256 text not null,
  geom_punto extensions.geometry(Point, 4326) not null,
  atributos_limite_fuente jsonb,
  fila_limite_origen bigint,
  fuente_limite_sha256 text,
  geom_limite extensions.geometry(MultiPolygon, 4326),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartografia_localidades_version_entidad_fk foreign key (cartografia_version_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad) on delete restrict,
  constraint cartografia_localidades_estable_entidad_fk foreign key (localidad_id, clave_entidad)
    references public.territorios_localidades (localidad_id, clave_entidad) on delete restrict,
  constraint cartografia_localidades_municipio_version_fk foreign key (cartografia_municipio_id, cartografia_version_id, municipio_id)
    references public.cartografia_municipios (cartografia_municipio_id, cartografia_version_id, municipio_id) on delete restrict,
  constraint cartografia_localidades_seccion_version_fk foreign key (cartografia_seccion_id, cartografia_version_id, seccion_id)
    references public.cartografia_secciones (cartografia_seccion_id, cartografia_version_id, seccion_id) on delete restrict,
  constraint cartografia_localidades_version_id_ine_uq unique (cartografia_version_id, clave_entidad, id_ine),
  constraint cartografia_localidades_id_version_localidad_uq unique (cartografia_localidad_id, cartografia_version_id, localidad_id),
  constraint cartografia_localidades_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_localidades_id_ine_ck check (btrim(id_ine) <> ''),
  constraint cartografia_localidades_nombre_ck check (btrim(nombre) <> ''),
  constraint cartografia_localidades_atributos_objeto_ck check (jsonb_typeof(atributos_fuente) = 'object'),
  constraint cartografia_localidades_fila_origen_ck check (fila_origen > 0),
  constraint cartografia_localidades_fuente_punto_sha256_ck check (fuente_punto_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cartografia_localidades_geom_punto_ck check (
    not extensions.st_isempty(geom_punto) and extensions.st_isvalid(geom_punto)
    and extensions.st_srid(geom_punto) = 4326
    and extensions.st_coveredby(geom_punto, extensions.st_makeenvelope(-101, 18, -98, 21, 4326))
  ),
  constraint cartografia_localidades_limite_conjunto_ck check (
    (
      (atributos_limite_fuente is null and fila_limite_origen is null and fuente_limite_sha256 is null and geom_limite is null)
      or (
        jsonb_typeof(atributos_limite_fuente) = 'object' and fila_limite_origen > 0
        and fuente_limite_sha256 ~ '^[0-9a-f]{64}$'
        and not extensions.st_isempty(geom_limite) and extensions.st_isvalid(geom_limite)
        and extensions.st_srid(geom_limite) = 4326
        and extensions.st_coveredby(geom_limite, extensions.st_makeenvelope(-101, 18, -98, 21, 4326))
      )
    ) is true
  )
);
create table public.cartografia_secciones_equivalencias (
  cartografia_seccion_equivalencia_id bigint generated always as identity primary key,
  cartografia_version_origen_id bigint not null,
  cartografia_seccion_origen_id bigint not null,
  seccion_origen_id bigint not null,
  cartografia_version_destino_id bigint not null,
  cartografia_seccion_destino_id bigint,
  seccion_destino_id bigint,
  clave_entidad text not null,
  tipo text not null,
  metodo text not null,
  proporcion_geometrica numeric,
  referencia_documental text,
  estado text not null default 'PROPUESTA',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartografia_equivalencias_version_origen_entidad_fk foreign key (cartografia_version_origen_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad) on delete restrict,
  constraint cartografia_equivalencias_version_destino_entidad_fk foreign key (cartografia_version_destino_id, clave_entidad)
    references public.cartografia_versiones (cartografia_version_id, clave_entidad) on delete restrict,
  constraint cartografia_equivalencias_seccion_origen_fk foreign key (cartografia_seccion_origen_id, cartografia_version_origen_id, clave_entidad, seccion_origen_id)
    references public.cartografia_secciones (cartografia_seccion_id, cartografia_version_id, clave_entidad, seccion_id) on delete restrict,
  constraint cartografia_equivalencias_seccion_destino_fk foreign key (cartografia_seccion_destino_id, cartografia_version_destino_id, clave_entidad, seccion_destino_id)
    references public.cartografia_secciones (cartografia_seccion_id, cartografia_version_id, clave_entidad, seccion_id) on delete restrict,
  constraint cartografia_equivalencias_versiones_distintas_ck check (cartografia_version_origen_id <> cartografia_version_destino_id),
  constraint cartografia_equivalencias_tipo_ck check (tipo in ('MISMA', 'DIVIDIDA_EN', 'INTEGRADA_DE', 'AJUSTADA', 'SIN_EQUIVALENCIA')),
  constraint cartografia_equivalencias_metodo_ck check (metodo in ('OFICIAL', 'GEOMETRICO', 'MANUAL')),
  constraint cartografia_equivalencias_estado_ck check (estado in ('PROPUESTA', 'VALIDADA')),
  constraint cartografia_equivalencias_proporcion_ck check (proporcion_geometrica is null or proporcion_geometrica between 0 and 1),
  constraint cartografia_equivalencias_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint cartografia_equivalencias_destino_nulo_ck check (
    (tipo = 'SIN_EQUIVALENCIA' and cartografia_seccion_destino_id is null and seccion_destino_id is null)
    or (tipo <> 'SIN_EQUIVALENCIA' and cartografia_seccion_destino_id is not null and seccion_destino_id is not null)
  )
);
create unique index cartografia_equivalencias_pareja_uq
  on public.cartografia_secciones_equivalencias (
    cartografia_version_origen_id, cartografia_seccion_origen_id,
    cartografia_version_destino_id, cartografia_seccion_destino_id
  ) where cartografia_seccion_destino_id is not null;
create unique index cartografia_equivalencias_sin_destino_uq
  on public.cartografia_secciones_equivalencias (
    cartografia_version_origen_id, cartografia_seccion_origen_id, cartografia_version_destino_id
  ) where tipo = 'SIN_EQUIVALENCIA';
create index cartografia_municipios_municipio_entidad_idx on public.cartografia_municipios (municipio_id, clave_entidad);
create index cartografia_distritos_locales_distrito_entidad_idx on public.cartografia_distritos_locales (distrito_local_id, clave_entidad);
create index cartografia_distritos_federales_distrito_entidad_idx on public.cartografia_distritos_federales (distrito_federal_id, clave_entidad);
create index cartografia_secciones_seccion_entidad_idx on public.cartografia_secciones (seccion_id, clave_entidad);
create index cartografia_secciones_municipio_version_idx on public.cartografia_secciones (cartografia_municipio_id, cartografia_version_id, municipio_id);
create index cartografia_secciones_distrito_local_version_idx on public.cartografia_secciones (cartografia_distrito_local_id, cartografia_version_id, distrito_local_id);
create index cartografia_secciones_distrito_federal_version_idx on public.cartografia_secciones (cartografia_distrito_federal_id, cartografia_version_id, distrito_federal_id);
create index cartografia_colonias_estable_idx on public.cartografia_colonias (colonia_id);
create index cartografia_colonias_municipio_version_idx on public.cartografia_colonias (cartografia_municipio_id, cartografia_version_id, municipio_id);
create index cartografia_localidades_estable_entidad_idx on public.cartografia_localidades (localidad_id, clave_entidad);
create index cartografia_localidades_municipio_version_idx on public.cartografia_localidades (cartografia_municipio_id, cartografia_version_id, municipio_id);
create index cartografia_localidades_seccion_version_idx on public.cartografia_localidades (cartografia_seccion_id, cartografia_version_id, seccion_id);
create index cartografia_equivalencias_version_origen_entidad_idx on public.cartografia_secciones_equivalencias (cartografia_version_origen_id, clave_entidad);
create index cartografia_equivalencias_version_destino_entidad_idx on public.cartografia_secciones_equivalencias (cartografia_version_destino_id, clave_entidad);
create index cartografia_equivalencias_seccion_origen_idx on public.cartografia_secciones_equivalencias (cartografia_seccion_origen_id, cartografia_version_origen_id, clave_entidad, seccion_origen_id);
create index cartografia_equivalencias_seccion_destino_idx on public.cartografia_secciones_equivalencias (cartografia_seccion_destino_id, cartografia_version_destino_id, clave_entidad, seccion_destino_id) where cartografia_seccion_destino_id is not null;
create index cartografia_entidades_geom_gix on public.cartografia_entidades using gist (geom);
create index cartografia_municipios_geom_gix on public.cartografia_municipios using gist (geom);
create index cartografia_distritos_locales_geom_gix on public.cartografia_distritos_locales using gist (geom);
create index cartografia_distritos_federales_geom_gix on public.cartografia_distritos_federales using gist (geom);
create index cartografia_secciones_geom_gix on public.cartografia_secciones using gist (geom);
create index cartografia_colonias_geom_gix on public.cartografia_colonias using gist (geom);
create index cartografia_localidades_geom_punto_gix on public.cartografia_localidades using gist (geom_punto);
create index cartografia_localidades_geom_limite_gix on public.cartografia_localidades using gist (geom_limite) where geom_limite is not null;
create function territorial_private.proteger_geometria_cartografica()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version_id bigint;
  v_version record;
  v_carga record;
begin
  for v_version_id in
    select distinct x.version_id
    from unnest(array[
      case when tg_op in ('UPDATE', 'DELETE') then old.cartografia_version_id end,
      case when tg_op in ('UPDATE', 'INSERT') then new.cartografia_version_id end
    ]) as x(version_id)
    where x.version_id is not null
    order by x.version_id
  loop
    select v.cartografia_version_id, v.estado
      into v_version
      from public.cartografia_versiones v
      where v.cartografia_version_id = v_version_id
      for update;

    if v_version.estado in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA') then
      raise exception using errcode = '55000', message = 'geometria cartografica sellada por version';
    end if;

    select c.carga_id, c.estado, c.reanudable
      into v_carga
      from public.cargas_cartograficas c
      where c.cartografia_version_id = v_version_id
      for update;

    if found and (
      v_carga.estado in ('VALIDANDO', 'COMPLETA')
      or (v_carga.estado = 'FALLIDA' and v_carga.reanudable is not true)
    ) then
      raise exception using errcode = '55000', message = 'geometria cartografica sellada por carga';
    end if;
  end loop;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create function territorial_private.proteger_cache_territorial()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000', message = 'el cache territorial no permite DELETE directo';
  end if;
  if pg_catalog.current_setting('territorial_private.sincronizando_cache', true) = 'on' then
    return new;
  end if;
  if (tg_table_name in ('territorios_municipios', 'territorios_distritos_locales', 'territorios_distritos_federales', 'territorios_secciones', 'territorios_colonias')
      and (pg_catalog.to_jsonb(new)->'geom') is distinct from (pg_catalog.to_jsonb(old)->'geom'))
     or (tg_table_name = 'territorios_localidades'
      and ((pg_catalog.to_jsonb(new)->'geom_punto') is distinct from (pg_catalog.to_jsonb(old)->'geom_punto')
        or (pg_catalog.to_jsonb(new)->'geom_limite') is distinct from (pg_catalog.to_jsonb(old)->'geom_limite')))
     or (new.activo is distinct from old.activo) then
    raise exception using errcode = '55000', message = 'el cache territorial solo se sincroniza con marca transaccional';
  end if;
  if tg_table_name = 'territorios_secciones'
     and ((pg_catalog.to_jsonb(new)->'municipio_id') is distinct from (pg_catalog.to_jsonb(old)->'municipio_id')
       or (pg_catalog.to_jsonb(new)->'distrito_local_id') is distinct from (pg_catalog.to_jsonb(old)->'distrito_local_id')
       or (pg_catalog.to_jsonb(new)->'distrito_federal_id') is distinct from (pg_catalog.to_jsonb(old)->'distrito_federal_id')) then
    raise exception using errcode = '55000', message = 'la adscripcion de seccion requiere sincronizacion';
  end if;
  if tg_table_name = 'territorios_colonias'
     and (pg_catalog.to_jsonb(new)->'municipio_id') is distinct from (pg_catalog.to_jsonb(old)->'municipio_id') then
    raise exception using errcode = '55000', message = 'la adscripcion de colonia requiere sincronizacion';
  end if;
  if tg_table_name = 'territorios_localidades'
     and ((pg_catalog.to_jsonb(new)->'municipio_id') is distinct from (pg_catalog.to_jsonb(old)->'municipio_id')
       or (pg_catalog.to_jsonb(new)->'seccion_id') is distinct from (pg_catalog.to_jsonb(old)->'seccion_id')) then
    raise exception using errcode = '55000', message = 'la adscripcion de localidad requiere sincronizacion';
  end if;
  return new;
end;
$$;
create function territorial_private.validar_equivalencia_seccional()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_equivalencia_id bigint;
begin
  if tg_op = 'DELETE' then
    if old.estado = 'VALIDADA' then
      raise exception using errcode = '55000', message = 'una equivalencia VALIDADA no se borra';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.estado = 'VALIDADA' then
    raise exception using errcode = '55000', message = 'una equivalencia VALIDADA no se modifica';
  end if;

  for v_equivalencia_id in
    select e.cartografia_seccion_equivalencia_id
    from public.cartografia_secciones_equivalencias e
    where e.cartografia_version_origen_id = new.cartografia_version_origen_id
      and e.cartografia_seccion_origen_id = new.cartografia_seccion_origen_id
      and e.cartografia_version_destino_id = new.cartografia_version_destino_id
      and e.cartografia_seccion_equivalencia_id is distinct from new.cartografia_seccion_equivalencia_id
    for update
  loop
    if new.tipo = 'SIN_EQUIVALENCIA' then
      if exists (
        select 1 from public.cartografia_secciones_equivalencias e
        where e.cartografia_seccion_equivalencia_id = v_equivalencia_id and e.tipo <> 'SIN_EQUIVALENCIA'
      ) then
        raise exception using errcode = '23514', message = 'SIN_EQUIVALENCIA no coexiste con relacion normal';
      end if;
    elsif exists (
      select 1 from public.cartografia_secciones_equivalencias e
      where e.cartografia_seccion_equivalencia_id = v_equivalencia_id and e.tipo = 'SIN_EQUIVALENCIA'
    ) then
      raise exception using errcode = '23514', message = 'relacion normal no coexiste con SIN_EQUIVALENCIA';
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function territorial_private.proteger_geometria_cartografica() from public, anon, authenticated;
revoke all on function territorial_private.proteger_cache_territorial() from public, anon, authenticated;
revoke all on function territorial_private.validar_equivalencia_seccional() from public, anon, authenticated;
create trigger cartografia_entidades_proteger_geometria before insert or update or delete on public.cartografia_entidades for each row execute function territorial_private.proteger_geometria_cartografica();
create trigger cartografia_municipios_proteger_geometria before insert or update or delete on public.cartografia_municipios for each row execute function territorial_private.proteger_geometria_cartografica();
create trigger cartografia_distritos_locales_proteger_geometria before insert or update or delete on public.cartografia_distritos_locales for each row execute function territorial_private.proteger_geometria_cartografica();
create trigger cartografia_distritos_federales_proteger_geometria before insert or update or delete on public.cartografia_distritos_federales for each row execute function territorial_private.proteger_geometria_cartografica();
create trigger cartografia_secciones_proteger_geometria before insert or update or delete on public.cartografia_secciones for each row execute function territorial_private.proteger_geometria_cartografica();
create trigger cartografia_colonias_proteger_geometria before insert or update or delete on public.cartografia_colonias for each row execute function territorial_private.proteger_geometria_cartografica();
create trigger cartografia_localidades_proteger_geometria before insert or update or delete on public.cartografia_localidades for each row execute function territorial_private.proteger_geometria_cartografica();
create trigger territorios_municipios_proteger_cache before update or delete on public.territorios_municipios for each row execute function territorial_private.proteger_cache_territorial();
create trigger territorios_distritos_locales_proteger_cache before update or delete on public.territorios_distritos_locales for each row execute function territorial_private.proteger_cache_territorial();
create trigger territorios_distritos_federales_proteger_cache before update or delete on public.territorios_distritos_federales for each row execute function territorial_private.proteger_cache_territorial();
create trigger territorios_secciones_proteger_cache before update or delete on public.territorios_secciones for each row execute function territorial_private.proteger_cache_territorial();
create trigger territorios_colonias_proteger_cache before update or delete on public.territorios_colonias for each row execute function territorial_private.proteger_cache_territorial();
create trigger territorios_localidades_proteger_cache before update or delete on public.territorios_localidades for each row execute function territorial_private.proteger_cache_territorial();
create trigger cartografia_equivalencias_validar before insert or update or delete on public.cartografia_secciones_equivalencias for each row execute function territorial_private.validar_equivalencia_seccional();
create trigger cartografia_entidades_set_updated_at before update on public.cartografia_entidades for each row execute function territorial_private.set_updated_at();
create trigger cartografia_municipios_set_updated_at before update on public.cartografia_municipios for each row execute function territorial_private.set_updated_at();
create trigger cartografia_distritos_locales_set_updated_at before update on public.cartografia_distritos_locales for each row execute function territorial_private.set_updated_at();
create trigger cartografia_distritos_federales_set_updated_at before update on public.cartografia_distritos_federales for each row execute function territorial_private.set_updated_at();
create trigger cartografia_secciones_set_updated_at before update on public.cartografia_secciones for each row execute function territorial_private.set_updated_at();
create trigger cartografia_colonias_set_updated_at before update on public.cartografia_colonias for each row execute function territorial_private.set_updated_at();
create trigger cartografia_localidades_set_updated_at before update on public.cartografia_localidades for each row execute function territorial_private.set_updated_at();
create trigger cartografia_secciones_equivalencias_set_updated_at before update on public.cartografia_secciones_equivalencias for each row execute function territorial_private.set_updated_at();
alter table public.cartografia_entidades enable row level security;
alter table public.cartografia_municipios enable row level security;
alter table public.cartografia_distritos_locales enable row level security;
alter table public.cartografia_distritos_federales enable row level security;
alter table public.cartografia_secciones enable row level security;
alter table public.cartografia_colonias enable row level security;
alter table public.cartografia_localidades enable row level security;
alter table public.cartografia_secciones_equivalencias enable row level security;
revoke all on table public.cartografia_entidades, public.cartografia_municipios, public.cartografia_distritos_locales, public.cartografia_distritos_federales, public.cartografia_secciones, public.cartografia_colonias, public.cartografia_localidades, public.cartografia_secciones_equivalencias from public, anon, authenticated, service_role;
grant select, insert, update on table public.cartografia_entidades, public.cartografia_municipios, public.cartografia_distritos_locales, public.cartografia_distritos_federales, public.cartografia_secciones, public.cartografia_colonias, public.cartografia_localidades, public.cartografia_secciones_equivalencias to service_role;
do $$
declare
  v_tabla text;
  v_columna text;
  v_secuencia text;
begin
  for v_tabla, v_columna in
    values
      ('cartografia_entidades', 'cartografia_entidad_id'),
      ('cartografia_municipios', 'cartografia_municipio_id'),
      ('cartografia_distritos_locales', 'cartografia_distrito_local_id'),
      ('cartografia_distritos_federales', 'cartografia_distrito_federal_id'),
      ('cartografia_secciones', 'cartografia_seccion_id'),
      ('cartografia_colonias', 'cartografia_colonia_id'),
      ('cartografia_localidades', 'cartografia_localidad_id'),
      ('cartografia_secciones_equivalencias', 'cartografia_seccion_equivalencia_id')
  loop
    v_secuencia := pg_catalog.pg_get_serial_sequence(
      pg_catalog.format('public.%I', v_tabla), v_columna
    );
    if v_secuencia is null then
      raise exception using errcode = '55000', message = 'secuencia de identidad M13 ausente';
    end if;
    execute pg_catalog.format(
      'revoke all on sequence %s from public, anon, authenticated, service_role',
      v_secuencia::regclass
    );
    execute pg_catalog.format(
      'grant usage, select on sequence %s to service_role', v_secuencia::regclass
    );
  end loop;
end;
$$;
commit;
