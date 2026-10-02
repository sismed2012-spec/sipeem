begin;
create table public.cartografia_versiones (
  cartografia_version_id bigint generated always as identity primary key,
  clave text not null,
  proveedor text not null,
  clave_entidad text not null,
  estado text not null default 'PREPARADA',
  fecha_corte date not null,
  fecha_publicacion date,
  fecha_publicacion_esperada date,
  vigente_desde date,
  vigente_hasta date,
  recibida_at timestamptz not null,
  srid_origen integer not null,
  srid_destino integer not null default 4326,
  es_predeterminada boolean not null default false,
  conteos_esperados jsonb not null default '{}'::jsonb,
  conteos_validados jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  publicada_at timestamptz,
  archivada_at timestamptz,
  restauracion_validada_at timestamptz,
  restauracion_validada_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartografia_versiones_clave_uq unique (clave),
  constraint cartografia_versiones_clave_ck check (clave ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  constraint cartografia_versiones_proveedor_ck check (btrim(proveedor) <> ''),
  constraint cartografia_versiones_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint cartografia_versiones_estado_ck check (
    estado in ('PREPARADA', 'CARGANDO', 'FALLIDA', 'VALIDADA', 'PUBLICADA', 'ARCHIVADA')
  ),
  constraint cartografia_versiones_srid_origen_ck check (srid_origen > 0),
  constraint cartografia_versiones_srid_destino_ck check (srid_destino = 4326),
  constraint cartografia_versiones_conteos_esperados_objeto_ck check (
    jsonb_typeof(conteos_esperados) = 'object'
  ),
  constraint cartografia_versiones_conteos_validados_objeto_ck check (
    jsonb_typeof(conteos_validados) = 'object'
  ),
  constraint cartografia_versiones_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint cartografia_versiones_vigencia_ck check (
    vigente_hasta is null or vigente_desde is null or vigente_hasta >= vigente_desde
  ),
  constraint cartografia_versiones_predeterminada_publicada_ck check (
    not es_predeterminada or estado = 'PUBLICADA'
  ),
  constraint cartografia_versiones_restauracion_auditada_ck check (
    (restauracion_validada_at is null) = (restauracion_validada_por is null)
  )
);
create unique index cartografia_versiones_predeterminada_uq
  on public.cartografia_versiones (clave_entidad)
  where es_predeterminada;
create table public.cartografia_archivos (
  cartografia_archivo_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  producto text not null,
  capa text not null,
  nombre text not null,
  extension text not null,
  sha256 text not null,
  bytes bigint not null,
  registros_declarados bigint,
  tipo_geometria text,
  proyeccion text not null,
  fecha_tecnica date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint cartografia_archivos_version_fk
    foreign key (cartografia_version_id)
    references public.cartografia_versiones(cartografia_version_id)
    on delete restrict,
  constraint cartografia_archivos_producto_ck check (producto in ('MGS', 'BGD')),
  constraint cartografia_archivos_capa_ck check (capa ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  constraint cartografia_archivos_nombre_ck check (
    btrim(nombre) <> '' and nombre !~ '[/\\]'
  ),
  constraint cartografia_archivos_extension_ck check (extension in ('shp', 'shx', 'dbf', 'prj', 'cpg')),
  constraint cartografia_archivos_sha256_ck check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint cartografia_archivos_bytes_ck check (bytes > 0),
  constraint cartografia_archivos_registros_ck check (
    registros_declarados is null or registros_declarados >= 0
  ),
  constraint cartografia_archivos_tipo_geometria_ck check (
    tipo_geometria is null or btrim(tipo_geometria) <> ''
  ),
  constraint cartografia_archivos_proyeccion_ck check (btrim(proyeccion) <> ''),
  constraint cartografia_archivos_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint cartografia_archivos_componente_uq unique (
    cartografia_version_id, producto, capa, extension
  )
);
create table public.cargas_cartograficas (
  carga_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  estado text not null default 'PREPARADA',
  mgs_sha256 text not null,
  bgd_sha256 text not null,
  manifiesto_sha256 text not null,
  capa_actual text,
  cursor_confirmado bigint not null default 0,
  recibidos bigint not null default 0,
  insertados bigint not null default 0,
  repetidos bigint not null default 0,
  rechazados bigint not null default 0,
  codigo_fallo text,
  detalle_fallo text,
  reanudable boolean not null default false,
  iniciada_at timestamptz,
  finalizada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cargas_cartograficas_version_fk
    foreign key (cartografia_version_id)
    references public.cartografia_versiones(cartografia_version_id)
    on delete restrict,
  constraint cargas_cartograficas_version_uq unique (cartografia_version_id),
  constraint cargas_cartograficas_id_version_uq unique (carga_id, cartografia_version_id),
  constraint cargas_cartograficas_estado_ck check (
    estado in ('PREPARADA', 'CARGANDO', 'VALIDANDO', 'COMPLETA', 'FALLIDA')
  ),
  constraint cargas_cartograficas_mgs_sha256_ck check (mgs_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cargas_cartograficas_bgd_sha256_ck check (bgd_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cargas_cartograficas_manifiesto_sha256_ck check (manifiesto_sha256 ~ '^[0-9a-f]{64}$'),
  constraint cargas_cartograficas_capa_ck check (
    capa_actual is null or capa_actual ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'
  ),
  constraint cargas_cartograficas_conteos_ck check (
    cursor_confirmado >= 0 and recibidos >= 0 and insertados >= 0
    and repetidos >= 0 and rechazados >= 0
  ),
  constraint cargas_cartograficas_codigo_fallo_ck check (
    (
      estado = 'FALLIDA'
      and codigo_fallo in (
        'HTTP_TRANSITORIO', 'TIMEOUT_TRANSITORIO', 'CONEXION_INTERRUMPIDA',
        'RESPUESTA_INVALIDA', 'CONFLICTO_HASH', 'FUENTE_INVALIDA', 'VALIDACION_FALLIDA'
      )
    )
    or (estado <> 'FALLIDA' and codigo_fallo is null)
  ),
  constraint cargas_cartograficas_reanudable_ck check (
    not reanudable
    or codigo_fallo is null
    or codigo_fallo in ('HTTP_TRANSITORIO', 'TIMEOUT_TRANSITORIO', 'CONEXION_INTERRUMPIDA')
  )
);
create table public.cartografia_incidencias (
  cartografia_incidencia_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  carga_id bigint,
  severidad text not null,
  codigo text not null,
  capa text not null,
  clave_fuente text,
  fila_fuente bigint,
  clave_idempotencia text not null,
  detalle text not null,
  justificacion text,
  resuelta_at timestamptz,
  resuelta_por uuid,
  resolucion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cartografia_incidencias_version_fk
    foreign key (cartografia_version_id)
    references public.cartografia_versiones(cartografia_version_id)
    on delete restrict,
  constraint cartografia_incidencias_carga_version_fk
    foreign key (carga_id, cartografia_version_id)
    references public.cargas_cartograficas(carga_id, cartografia_version_id)
    on delete restrict,
  constraint cartografia_incidencias_severidad_ck check (severidad in ('ADVERTENCIA', 'ERROR')),
  constraint cartografia_incidencias_codigo_ck check (
    codigo in (
      'ARCHIVO_REQUERIDO_AUSENTE', 'HUELLA_INESPERADA', 'CONTEO_NO_COINCIDE',
      'CLAVE_DUPLICADA', 'REFERENCIA_TERRITORIAL_INVALIDA', 'SRID_INESPERADO',
      'GEOMETRIA_VACIA', 'GEOMETRIA_INVALIDA', 'PERTENENCIA_ESPACIAL_NO_COINCIDE',
      'CAPA_MGS_BGD_DIFIERE', 'SECCION_ELECTORAL_SIN_MAPA', 'EQUIVALENCIA_NO_OFICIAL'
    )
  ),
  constraint cartografia_incidencias_capa_ck check (capa ~ '^[A-Z0-9]+(?:_[A-Z0-9]+)*$'),
  constraint cartografia_incidencias_fila_ck check (fila_fuente is null or fila_fuente > 0),
  constraint cartografia_incidencias_clave_idempotencia_ck check (
    clave_idempotencia ~ '^[0-9a-f]{64}$'
  ),
  constraint cartografia_incidencias_detalle_ck check (btrim(detalle) <> ''),
  constraint cartografia_incidencias_resolucion_auditada_ck check (
    (resuelta_at is null and resuelta_por is null and resolucion is null)
    or (resuelta_at is not null and resuelta_por is not null and btrim(resolucion) <> '')
  ),
  constraint cartografia_incidencias_idempotencia_uq unique (
    cartografia_version_id, clave_idempotencia
  )
);
create table public.cartografia_versiones_bitacora (
  bitacora_id bigint generated always as identity primary key,
  cartografia_version_id bigint not null,
  carga_id bigint,
  evento text not null,
  estado_anterior text,
  estado_nuevo text,
  detalle jsonb not null default '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz not null default now(),
  constraint cartografia_versiones_bitacora_version_fk
    foreign key (cartografia_version_id)
    references public.cartografia_versiones(cartografia_version_id)
    on delete restrict,
  constraint cartografia_versiones_bitacora_carga_version_fk
    foreign key (carga_id, cartografia_version_id)
    references public.cargas_cartograficas(carga_id, cartografia_version_id)
    on delete restrict,
  constraint cartografia_versiones_bitacora_evento_ck check (btrim(evento) <> ''),
  constraint cartografia_versiones_bitacora_estado_anterior_ck check (
    estado_anterior is null
    or estado_anterior in ('PREPARADA', 'CARGANDO', 'FALLIDA', 'VALIDADA', 'PUBLICADA', 'ARCHIVADA')
  ),
  constraint cartografia_versiones_bitacora_estado_nuevo_ck check (
    estado_nuevo is null
    or estado_nuevo in ('PREPARADA', 'CARGANDO', 'FALLIDA', 'VALIDADA', 'PUBLICADA', 'ARCHIVADA')
  ),
  constraint cartografia_versiones_bitacora_detalle_objeto_ck check (jsonb_typeof(detalle) = 'object')
);
create table public.territorios_localidades (
  localidad_id bigint generated always as identity primary key,
  clave_entidad text not null,
  id_ine text not null,
  nombre text not null,
  municipio_id bigint,
  seccion_id bigint,
  geom_punto extensions.geometry(Point, 4326),
  geom_limite extensions.geometry(MultiPolygon, 4326),
  metadata jsonb not null default '{}'::jsonb,
  activo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint territorios_localidades_clave_entidad_ck check (clave_entidad ~ '^[0-9]{2}$'),
  constraint territorios_localidades_id_ine_ck check (btrim(id_ine) <> ''),
  constraint territorios_localidades_nombre_ck check (btrim(nombre) <> ''),
  constraint territorios_localidades_metadata_objeto_ck check (jsonb_typeof(metadata) = 'object'),
  constraint territorios_localidades_municipio_entidad_fk
    foreign key (municipio_id, clave_entidad)
    references public.territorios_municipios(municipio_id, clave_entidad)
    on delete restrict,
  constraint territorios_localidades_seccion_municipio_fk
    foreign key (seccion_id, municipio_id)
    references public.territorios_secciones(seccion_id, municipio_id)
    on delete restrict,
  constraint territorios_localidades_clave_uq unique (clave_entidad, id_ine),
  constraint territorios_localidades_geom_punto_ck check (
    geom_punto is null or (
      not extensions.st_isempty(geom_punto)
      and extensions.st_isvalid(geom_punto)
      and extensions.st_srid(geom_punto) = 4326
      and extensions.st_coveredby(
        geom_punto,
        extensions.st_makeenvelope(-180, -90, 180, 90, 4326)
      )
    )
  ),
  constraint territorios_localidades_geom_limite_ck check (
    geom_limite is null or (
      not extensions.st_isempty(geom_limite)
      and extensions.st_isvalid(geom_limite)
      and extensions.st_srid(geom_limite) = 4326
      and extensions.st_coveredby(
        geom_limite,
        extensions.st_makeenvelope(-180, -90, 180, 90, 4326)
      )
    )
  )
);
create index cartografia_incidencias_carga_version_idx
  on public.cartografia_incidencias (carga_id, cartografia_version_id)
  where carga_id is not null;
create index cartografia_versiones_bitacora_version_idx
  on public.cartografia_versiones_bitacora (cartografia_version_id);
create index cartografia_versiones_bitacora_carga_version_idx
  on public.cartografia_versiones_bitacora (carga_id, cartografia_version_id)
  where carga_id is not null;
create index territorios_localidades_municipio_entidad_idx
  on public.territorios_localidades (municipio_id, clave_entidad)
  where municipio_id is not null;
create index territorios_localidades_seccion_municipio_idx
  on public.territorios_localidades (seccion_id, municipio_id)
  where seccion_id is not null;
create index territorios_localidades_geom_punto_gix
  on public.territorios_localidades using gist (geom_punto)
  where geom_punto is not null;
create index territorios_localidades_geom_limite_gix
  on public.territorios_localidades using gist (geom_limite)
  where geom_limite is not null;
create function territorial_private.validar_transicion_version_cartografica()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado is not distinct from old.estado then
    return new;
  end if;

  if old.estado = 'PREPARADA' and new.estado in ('CARGANDO', 'FALLIDA') then
    return new;
  elsif old.estado = 'CARGANDO' and new.estado in ('VALIDADA', 'FALLIDA') then
    return new;
  elsif old.estado = 'FALLIDA' and new.estado = 'CARGANDO' then
    if not exists (
      select 1
      from public.cargas_cartograficas c
      where c.cartografia_version_id = old.cartografia_version_id
        and c.reanudable is true
        and c.mgs_sha256 is not null
        and c.bgd_sha256 is not null
        and c.manifiesto_sha256 is not null
    ) then
      raise exception using
        errcode = '55000',
        message = 'una version FALLIDA solo reanuda con carga reanudable y hashes identicos';
    end if;
    return new;
  elsif old.estado = 'FALLIDA' and new.estado = 'ARCHIVADA' then
    return new;
  elsif old.estado = 'VALIDADA' and new.estado in ('PUBLICADA', 'ARCHIVADA') then
    return new;
  elsif old.estado = 'PUBLICADA' and new.estado = 'ARCHIVADA' then
    if old.es_predeterminada then
      raise exception using
        errcode = '55000',
        message = 'una version predeterminada no puede archivarse';
    end if;
    return new;
  elsif old.estado = 'ARCHIVADA' and new.estado = 'PUBLICADA' then
    if new.restauracion_validada_at is null
       or new.restauracion_validada_por is null
       or new.restauracion_validada_at is not distinct from old.restauracion_validada_at then
      raise exception using
        errcode = '55000',
        message = 'restauracion administrativa no validada';
    end if;
    return new;
  end if;

  raise exception using
    errcode = '55000',
    message = pg_catalog.format(
      'transicion cartografica invalida: %s -> %s', old.estado, new.estado
    );
end;
$$;
create function territorial_private.proteger_fuente_version_cartografica()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado in ('VALIDADA', 'PUBLICADA', 'ARCHIVADA')
     and (
       new.clave is distinct from old.clave
       or new.proveedor is distinct from old.proveedor
       or new.clave_entidad is distinct from old.clave_entidad
       or new.fecha_corte is distinct from old.fecha_corte
       or new.fecha_publicacion is distinct from old.fecha_publicacion
       or new.fecha_publicacion_esperada is distinct from old.fecha_publicacion_esperada
       or new.vigente_desde is distinct from old.vigente_desde
       or new.vigente_hasta is distinct from old.vigente_hasta
       or new.recibida_at is distinct from old.recibida_at
       or new.srid_origen is distinct from old.srid_origen
       or new.srid_destino is distinct from old.srid_destino
       or new.conteos_esperados is distinct from old.conteos_esperados
       or new.conteos_validados is distinct from old.conteos_validados
       or new.metadata is distinct from old.metadata
     ) then
    raise exception using
      errcode = '55000',
      message = 'campos fuente inmutables despues de VALIDADA';
  end if;
  return new;
end;
$$;
create function territorial_private.validar_transicion_carga_cartografica()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado = 'FALLIDA' and new.estado = 'CARGANDO' then
    if old.reanudable is not true
       or new.reanudable is not true
       or new.mgs_sha256 is distinct from old.mgs_sha256
       or new.bgd_sha256 is distinct from old.bgd_sha256
       or new.manifiesto_sha256 is distinct from old.manifiesto_sha256 then
      raise exception using
        errcode = '55000',
        message = 'una reanudacion exige los mismos hashes';
    end if;
    return new;
  end if;

  if new.mgs_sha256 is distinct from old.mgs_sha256
     or new.bgd_sha256 is distinct from old.bgd_sha256
     or new.manifiesto_sha256 is distinct from old.manifiesto_sha256 then
    raise exception using
      errcode = '55000',
      message = 'los hashes de una carga son inmutables';
  end if;

  if new.estado is not distinct from old.estado then
    return new;
  elsif old.estado = 'PREPARADA' and new.estado in ('CARGANDO', 'FALLIDA') then
    return new;
  elsif old.estado = 'CARGANDO' and new.estado in ('VALIDANDO', 'FALLIDA') then
    return new;
  elsif old.estado = 'VALIDANDO' and new.estado in ('COMPLETA', 'FALLIDA') then
    return new;
  end if;

  raise exception using
    errcode = '55000',
    message = pg_catalog.format(
      'transicion de carga cartografica invalida: %s -> %s', old.estado, new.estado
    );
end;
$$;
create function territorial_private.calcular_clave_idempotencia_incidencia_cartografica()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.clave_idempotencia := pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'version', new.cartografia_version_id,
          'carga', coalesce(new.carga_id::text, '<SIN_CARGA>'),
          'capa', new.capa,
          'codigo', new.codigo,
          'clave_fuente', coalesce(new.clave_fuente, '<SIN_CLAVE>'),
          'fila_fuente', coalesce(new.fila_fuente::text, '<SIN_FILA>')
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  return new;
end;
$$;
create function territorial_private.proteger_bitacora_cartografica()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'la bitacora cartografica es append-only';
end;
$$;
revoke execute on function territorial_private.validar_transicion_version_cartografica()
  from public, anon, authenticated;
revoke execute on function territorial_private.proteger_fuente_version_cartografica()
  from public, anon, authenticated;
revoke execute on function territorial_private.validar_transicion_carga_cartografica()
  from public, anon, authenticated;
revoke execute on function territorial_private.calcular_clave_idempotencia_incidencia_cartografica()
  from public, anon, authenticated;
revoke execute on function territorial_private.proteger_bitacora_cartografica()
  from public, anon, authenticated;
create trigger cartografia_versiones_validar_transicion
  before update on public.cartografia_versiones
  for each row execute function territorial_private.validar_transicion_version_cartografica();
create trigger cartografia_versiones_proteger_fuente
  before update on public.cartografia_versiones
  for each row execute function territorial_private.proteger_fuente_version_cartografica();
create trigger cartografia_versiones_set_updated_at
  before update on public.cartografia_versiones
  for each row execute function territorial_private.set_updated_at();
create trigger cargas_cartograficas_validar_transicion
  before update on public.cargas_cartograficas
  for each row execute function territorial_private.validar_transicion_carga_cartografica();
create trigger cargas_cartograficas_set_updated_at
  before update on public.cargas_cartograficas
  for each row execute function territorial_private.set_updated_at();
create trigger cartografia_incidencias_clave_idempotencia
  before insert or update of cartografia_version_id, carga_id, capa, codigo, clave_fuente, fila_fuente
  on public.cartografia_incidencias
  for each row execute function territorial_private.calcular_clave_idempotencia_incidencia_cartografica();
create trigger cartografia_incidencias_set_updated_at
  before update on public.cartografia_incidencias
  for each row execute function territorial_private.set_updated_at();
create trigger cartografia_versiones_bitacora_append_only
  before update or delete on public.cartografia_versiones_bitacora
  for each row execute function territorial_private.proteger_bitacora_cartografica();
create trigger territorios_localidades_set_updated_at
  before update on public.territorios_localidades
  for each row execute function territorial_private.set_updated_at();
alter table public.cartografia_versiones enable row level security;
alter table public.cartografia_archivos enable row level security;
alter table public.cargas_cartograficas enable row level security;
alter table public.cartografia_incidencias enable row level security;
alter table public.cartografia_versiones_bitacora enable row level security;
alter table public.territorios_localidades enable row level security;
revoke all on table
  public.cartografia_versiones,
  public.cartografia_archivos,
  public.cargas_cartograficas,
  public.cartografia_incidencias,
  public.cartografia_versiones_bitacora,
  public.territorios_localidades
from public, anon, authenticated, service_role;
grant select, insert, update on table public.cartografia_versiones to service_role;
grant select, insert on table public.cartografia_archivos to service_role;
grant select, insert, update on table public.cargas_cartograficas to service_role;
grant select, insert, update on table public.cartografia_incidencias to service_role;
grant select, insert on table public.cartografia_versiones_bitacora to service_role;
grant select, insert, update on table public.territorios_localidades to service_role;
revoke all on sequence
  public.cartografia_versiones_cartografia_version_id_seq,
  public.cartografia_archivos_cartografia_archivo_id_seq,
  public.cargas_cartograficas_carga_id_seq,
  public.cartografia_incidencias_cartografia_incidencia_id_seq,
  public.cartografia_versiones_bitacora_bitacora_id_seq,
  public.territorios_localidades_localidad_id_seq
from public, anon, authenticated, service_role;
grant usage, select on sequence
  public.cartografia_versiones_cartografia_version_id_seq,
  public.cartografia_archivos_cartografia_archivo_id_seq,
  public.cargas_cartograficas_carga_id_seq,
  public.cartografia_incidencias_cartografia_incidencia_id_seq,
  public.cartografia_versiones_bitacora_bitacora_id_seq,
  public.territorios_localidades_localidad_id_seq
to service_role;
comment on table public.cartografia_versiones is
  'Control de instantaneas cartograficas INE inmutables y su ciclo de publicacion.';
comment on table public.cartografia_archivos is
  'Manifiesto verificable de componentes fuente por version cartografica.';
comment on table public.cargas_cartograficas is
  'Carga canonica unica, reanudable por hashes y cursor confirmado.';
comment on table public.cartografia_incidencias is
  'Incidencias cartograficas idempotentes con resolucion auditada.';
comment on table public.cartografia_versiones_bitacora is
  'Bitacora administrativa append-only de versiones e intentos de carga.';
comment on table public.territorios_localidades is
  'Identidad estable de localidades INE y proyeccion compatible de la version predeterminada.';
commit;
