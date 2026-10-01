create table public.demografia_fuentes (
  demografia_fuente_id bigint generated always as identity primary key,
  proveedor text not null,
  conjunto text not null,
  anio_censal smallint not null,
  clave_entidad text not null,
  archivo_nombre text not null,
  archivo_sha256 text not null,
  codificaciones jsonb not null default '{}'::jsonb,
  filas_total integer not null,
  columnas_total smallint not null,
  metadatos jsonb not null default '{}'::jsonb,
  estado text not null default 'PREPARADA',
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  validated_at timestamptz,
  published_at timestamptz,
  constraint demografia_fuentes_identidad_uk unique (
    proveedor, conjunto, anio_censal, clave_entidad, archivo_sha256
  ),
  constraint demografia_fuentes_proveedor_ck check (proveedor = pg_catalog.upper(proveedor)),
  constraint demografia_fuentes_conjunto_ck check (conjunto = pg_catalog.upper(conjunto)),
  constraint demografia_fuentes_anio_ck check (anio_censal between 1900 and 2200),
  constraint demografia_fuentes_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint demografia_fuentes_sha_ck check (archivo_sha256 ~ '^[0-9a-f]{64}$'),
  constraint demografia_fuentes_codificaciones_ck check (pg_catalog.jsonb_typeof(codificaciones) = 'object'),
  constraint demografia_fuentes_conteos_ck check (filas_total > 0 and columnas_total > 0),
  constraint demografia_fuentes_metadatos_ck check (pg_catalog.jsonb_typeof(metadatos) = 'object'),
  constraint demografia_fuentes_estado_ck check (
    estado in ('PREPARADA', 'CARGANDO', 'VALIDADA', 'PUBLICADA', 'ERROR')
  ),
  constraint demografia_fuentes_fechas_ck check (
    (validated_at is null or validated_at >= created_at)
    and (published_at is null or (validated_at is not null and published_at >= validated_at))
  )
);

create table public.demografia_indicadores (
  demografia_indicador_id bigint generated always as identity primary key,
  demografia_fuente_id bigint not null
    references public.demografia_fuentes(demografia_fuente_id) on delete cascade,
  mnemonico text not null,
  nombre text not null,
  descripcion text,
  tipo_logico text not null,
  unidad text,
  categoria text,
  regla_reserva jsonb not null default '{}'::jsonb,
  exponer_resumen boolean not null default false,
  orden smallint not null,
  created_at timestamptz not null default pg_catalog.now(),
  constraint demografia_indicadores_fuente_mnemonico_uk unique (
    demografia_fuente_id, mnemonico
  ),
  constraint demografia_indicadores_mnemonico_ck check (mnemonico ~ '^[A-Z][A-Z0-9_]*$'),
  constraint demografia_indicadores_tipo_ck check (
    tipo_logico in ('ENTERO', 'DECIMAL', 'TEXTO')
  ),
  constraint demografia_indicadores_reserva_ck check (
    pg_catalog.jsonb_typeof(regla_reserva) = 'object'
  ),
  constraint demografia_indicadores_orden_ck check (orden >= 0)
);

create table public.demografia_cargas_lotes (
  demografia_carga_lote_id bigint generated always as identity primary key,
  demografia_fuente_id bigint not null
    references public.demografia_fuentes(demografia_fuente_id) on delete cascade,
  etapa text not null,
  rango_inicio integer not null,
  rango_fin integer not null,
  filas_esperadas integer not null,
  filas_procesadas integer not null default 0,
  checksum text not null,
  estado text not null default 'PENDIENTE',
  started_at timestamptz,
  completed_at timestamptz,
  error_detalle text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint demografia_cargas_lotes_identidad_uk unique (
    demografia_fuente_id, etapa, rango_inicio, rango_fin, checksum
  ),
  constraint demografia_cargas_lotes_etapa_ck check (
    etapa in ('FUENTE', 'INDICADORES', 'LOCALIDADES', 'CORRESPONDENCIAS', 'AGREGACION')
  ),
  constraint demografia_cargas_lotes_rango_ck check (
    rango_inicio > 0
    and rango_fin >= rango_inicio
    and filas_esperadas = rango_fin - rango_inicio + 1
  ),
  constraint demografia_cargas_lotes_filas_ck check (
    filas_procesadas between 0 and filas_esperadas
  ),
  constraint demografia_cargas_lotes_checksum_ck check (checksum ~ '^[0-9a-f]{64}$'),
  constraint demografia_cargas_lotes_estado_ck check (
    estado in ('PENDIENTE', 'EN_PROCESO', 'CONFIRMADO', 'FALLIDO')
  ),
  constraint demografia_cargas_lotes_transicion_ck check (
    (estado = 'PENDIENTE'
      and filas_procesadas = 0
      and started_at is null
      and completed_at is null
      and error_detalle is null)
    or
    (estado = 'EN_PROCESO'
      and started_at is not null
      and completed_at is null
      and error_detalle is null)
    or
    (estado = 'CONFIRMADO'
      and filas_procesadas = filas_esperadas
      and started_at is not null
      and completed_at is not null
      and completed_at >= started_at
      and error_detalle is null)
    or
    (estado = 'FALLIDO'
      and started_at is not null
      and completed_at is not null
      and completed_at >= started_at
      and error_detalle is not null)
  )
);

create table public.demografia_localidades (
  demografia_localidad_id bigint generated always as identity primary key,
  demografia_fuente_id bigint not null
    references public.demografia_fuentes(demografia_fuente_id) on delete cascade,
  clave_entidad text not null,
  clave_municipio text not null,
  clave_localidad text not null,
  nombre_entidad text not null,
  nombre_municipio text not null,
  nombre_localidad text not null,
  longitud numeric(11, 7) not null,
  latitud numeric(10, 7) not null,
  altitud integer,
  geom_punto extensions.geometry(Point, 4326) not null,
  fila_origen integer not null,
  registro_sha256 text not null,
  pobtot bigint,
  pobfem bigint,
  pobmas bigint,
  pob0_14 bigint,
  pob15_64 bigint,
  pob65_mas bigint,
  p_18ymas bigint,
  pea bigint,
  pocupada bigint,
  p15ym_an bigint,
  graproes numeric(8, 3),
  pder_ss bigint,
  pcon_disc bigint,
  p3ym_hli bigint,
  pob_afro bigint,
  tvivhab bigint,
  vph_aguadv bigint,
  vph_drenaj bigint,
  vph_c_elec bigint,
  vph_cel bigint,
  vph_pc bigint,
  vph_inter bigint,
  indicadores jsonb not null default '{}'::jsonb,
  estados_dato jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint demografia_localidades_clave_uk unique (
    demografia_fuente_id, clave_entidad, clave_municipio, clave_localidad
  ),
  constraint demografia_localidades_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint demografia_localidades_municipio_ck check (clave_municipio ~ '^[0-9]{3}$'),
  constraint demografia_localidades_localidad_ck check (
    clave_localidad ~ '^[0-9]{4}$' and clave_localidad not in ('0000', '9998', '9999')
  ),
  constraint demografia_localidades_coordenadas_ck check (
    longitud between -180 and 180 and latitud between -90 and 90
  ),
  constraint demografia_localidades_geom_ck check (
    not extensions.st_isempty(geom_punto)
    and extensions.st_isvalid(geom_punto)
    and extensions.st_srid(geom_punto) = 4326
    and extensions.st_x(geom_punto) = longitud::double precision
    and extensions.st_y(geom_punto) = latitud::double precision
  ),
  constraint demografia_localidades_fila_ck check (fila_origen > 1),
  constraint demografia_localidades_sha_ck check (registro_sha256 ~ '^[0-9a-f]{64}$'),
  constraint demografia_localidades_conteos_ck check (
    (pobtot is null or pobtot >= 0)
    and (pobfem is null or pobfem >= 0)
    and (pobmas is null or pobmas >= 0)
    and (pob0_14 is null or pob0_14 >= 0)
    and (pob15_64 is null or pob15_64 >= 0)
    and (pob65_mas is null or pob65_mas >= 0)
    and (p_18ymas is null or p_18ymas >= 0)
    and (pea is null or pea >= 0)
    and (pocupada is null or pocupada >= 0)
    and (p15ym_an is null or p15ym_an >= 0)
    and (graproes is null or graproes >= 0)
    and (pder_ss is null or pder_ss >= 0)
    and (pcon_disc is null or pcon_disc >= 0)
    and (p3ym_hli is null or p3ym_hli >= 0)
    and (pob_afro is null or pob_afro >= 0)
    and (tvivhab is null or tvivhab >= 0)
    and (vph_aguadv is null or vph_aguadv >= 0)
    and (vph_drenaj is null or vph_drenaj >= 0)
    and (vph_c_elec is null or vph_c_elec >= 0)
    and (vph_cel is null or vph_cel >= 0)
    and (vph_pc is null or vph_pc >= 0)
    and (vph_inter is null or vph_inter >= 0)
  ),
  constraint demografia_localidades_indicadores_ck check (
    pg_catalog.jsonb_typeof(indicadores) = 'object'
  ),
  constraint demografia_localidades_estados_ck check (
    pg_catalog.jsonb_typeof(estados_dato) = 'object'
  )
);

create index demografia_indicadores_fuente_idx
  on public.demografia_indicadores (demografia_fuente_id, orden);

create index demografia_cargas_lotes_fuente_estado_idx
  on public.demografia_cargas_lotes (demografia_fuente_id, etapa, estado);

create index demografia_localidades_fuente_municipio_idx
  on public.demografia_localidades (
    demografia_fuente_id, clave_entidad, clave_municipio
  );

create index demografia_localidades_geom_punto_gix
  on public.demografia_localidades using gist (geom_punto);

alter table public.demografia_fuentes enable row level security;
alter table public.demografia_indicadores enable row level security;
alter table public.demografia_cargas_lotes enable row level security;
alter table public.demografia_localidades enable row level security;

revoke all on table
  public.demografia_fuentes,
  public.demografia_indicadores,
  public.demografia_cargas_lotes,
  public.demografia_localidades
from public, anon, authenticated, service_role;

grant select, insert, update, delete on table
  public.demografia_fuentes,
  public.demografia_indicadores,
  public.demografia_cargas_lotes,
  public.demografia_localidades
to service_role;

revoke all on sequence
  public.demografia_fuentes_demografia_fuente_id_seq,
  public.demografia_indicadores_demografia_indicador_id_seq,
  public.demografia_cargas_lotes_demografia_carga_lote_id_seq,
  public.demografia_localidades_demografia_localidad_id_seq
from public, anon, authenticated, service_role;

grant usage, select on sequence
  public.demografia_fuentes_demografia_fuente_id_seq,
  public.demografia_indicadores_demografia_indicador_id_seq,
  public.demografia_cargas_lotes_demografia_carga_lote_id_seq,
  public.demografia_localidades_demografia_localidad_id_seq
to service_role;
