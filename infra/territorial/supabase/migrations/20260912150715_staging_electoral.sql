create table public.cargas_electorales (
  carga_id uuid primary key default extensions.gen_random_uuid(),
  clave_carga text not null,
  proyecto_origen text not null,
  nombre text not null,
  estado text not null default 'PREPARADA',
  registros_esperados integer,
  resultados_esperados integer,
  registros_recibidos integer not null default 0,
  resultados_recibidos integer not null default 0,
  registros_validos integer not null default 0,
  registros_observados integer not null default 0,
  registros_cuarentena integer not null default 0,
  huella_origen text,
  metadata jsonb not null default '{}'::jsonb,
  iniciada_at timestamptz,
  finalizada_at timestamptz,
  detalle_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cargas_electorales_clave_formato_ck
    check (clave_carga = upper(clave_carga) and clave_carga ~ '^[A-Z0-9_]+$'),
  constraint cargas_electorales_proyecto_ck
    check (length(btrim(proyecto_origen)) > 0),
  constraint cargas_electorales_nombre_ck
    check (length(btrim(nombre)) > 0),
  constraint cargas_electorales_estado_ck
    check (estado in ('PREPARADA', 'CARGANDO', 'CARGADA', 'VALIDADA', 'FALLIDA')),
  constraint cargas_electorales_conteos_ck check (
    (registros_esperados is null or registros_esperados >= 0)
    and (resultados_esperados is null or resultados_esperados >= 0)
    and registros_recibidos >= 0
    and resultados_recibidos >= 0
    and registros_validos >= 0
    and registros_observados >= 0
    and registros_cuarentena >= 0
  ),
  constraint cargas_electorales_metadata_objeto_ck
    check (jsonb_typeof(metadata) = 'object'),
  constraint cargas_electorales_proyecto_clave_uq
    unique (proyecto_origen, clave_carga)
);

create table public.staging_electoral_registros (
  registro_staging_id bigint generated always as identity primary key,
  carga_id uuid not null
    references public.cargas_electorales(carga_id) on delete cascade,
  proyecto_origen text not null,
  tabla_origen text not null,
  id_origen bigint not null,
  grano text not null,
  eleccion_clave text not null,
  anio smallint not null,
  fecha_eleccion date,
  ambito text not null,
  cargo text not null,
  municipio_origen_id bigint,
  clave_entidad text,
  clave_municipio_origen text,
  municipio_nombre_original text,
  municipio_nombre_normalizado text,
  seccion_numero integer,
  distrito_local_numero smallint,
  distrito_federal_numero smallint,
  casillas_instaladas integer,
  casillas_computadas integer,
  lista_nominal integer,
  votos_validos integer,
  votos_no_registrados integer,
  votos_nulos integer,
  total_votos integer,
  participacion_porcentaje numeric(9, 4),
  ganador_siglas text,
  ganador_nombre text,
  ganador_votos integer,
  ganador_porcentaje numeric(9, 4),
  segundo_lugar_siglas text,
  segundo_lugar_nombre text,
  segundo_lugar_votos integer,
  segundo_lugar_porcentaje numeric(9, 4),
  fuente text,
  ruta_acta text,
  eleccion_id bigint references public.elecciones(eleccion_id),
  municipio_id bigint references public.territorios_municipios(municipio_id),
  seccion_id bigint references public.territorios_secciones(seccion_id),
  payload_origen jsonb not null,
  payload_sha256 text generated always as (
    pg_catalog.encode(
      extensions.digest(payload_origen::text, 'sha256'),
      'hex'
    )
  ) stored,
  estado_validacion text not null default 'PENDIENTE',
  capturado_at timestamptz not null default now(),
  validado_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staging_electoral_registros_tabla_formato_ck
    check (tabla_origen ~ '^[a-z][a-z0-9_]*$'),
  constraint staging_electoral_registros_id_origen_ck check (id_origen > 0),
  constraint staging_electoral_registros_grano_ck
    check (grano in ('MUNICIPIO', 'SECCION')),
  constraint staging_electoral_registros_grano_seccion_ck check (
    (grano = 'MUNICIPIO' and seccion_numero is null)
    or (grano = 'SECCION' and seccion_numero > 0)
  ),
  constraint staging_electoral_registros_eleccion_clave_ck check (
    eleccion_clave = upper(eleccion_clave)
    and eleccion_clave ~ '^[A-Z0-9_]+$'
  ),
  constraint staging_electoral_registros_anio_ck check (anio between 1900 and 2200),
  constraint staging_electoral_registros_ambito_ck
    check (ambito in ('FEDERAL', 'ESTATAL', 'MUNICIPAL')),
  constraint staging_electoral_registros_cargo_ck
    check (cargo = upper(cargo) and cargo ~ '^[A-Z0-9_]+$'),
  constraint staging_electoral_registros_distritos_ck check (
    (distrito_local_numero is null or distrito_local_numero > 0)
    and (distrito_federal_numero is null or distrito_federal_numero > 0)
  ),
  constraint staging_electoral_registros_conteos_ck check (
    (casillas_instaladas is null or casillas_instaladas >= 0)
    and (casillas_computadas is null or casillas_computadas >= 0)
    and (lista_nominal is null or lista_nominal >= 0)
    and (votos_validos is null or votos_validos >= 0)
    and (votos_no_registrados is null or votos_no_registrados >= 0)
    and (votos_nulos is null or votos_nulos >= 0)
    and (total_votos is null or total_votos >= 0)
    and (ganador_votos is null or ganador_votos >= 0)
    and (segundo_lugar_votos is null or segundo_lugar_votos >= 0)
  ),
  constraint staging_electoral_registros_payload_objeto_ck
    check (jsonb_typeof(payload_origen) = 'object'),
  constraint staging_electoral_registros_estado_ck
    check (estado_validacion in ('PENDIENTE', 'VALIDO', 'OBSERVADO', 'CUARENTENA')),
  constraint staging_electoral_registros_metadata_objeto_ck
    check (jsonb_typeof(metadata) = 'object'),
  constraint staging_electoral_registros_origen_version_uq
    unique (proyecto_origen, tabla_origen, id_origen, payload_sha256),
  constraint staging_electoral_registros_id_carga_uq
    unique (registro_staging_id, carga_id)
);

create table public.staging_electoral_resultados (
  resultado_staging_id bigint generated always as identity primary key,
  carga_id uuid not null
    references public.cargas_electorales(carga_id) on delete cascade,
  proyecto_origen text not null,
  tabla_origen text not null,
  id_origen bigint not null,
  tabla_padre_origen text not null,
  id_padre_origen bigint not null,
  registro_staging_id bigint,
  fuerza_original text not null,
  fuerza_codigo_normalizado text,
  votos integer,
  porcentaje numeric(9, 4),
  fuerza_id bigint references public.fuerzas_electorales(fuerza_id),
  payload_origen jsonb not null,
  payload_sha256 text generated always as (
    pg_catalog.encode(
      extensions.digest(payload_origen::text, 'sha256'),
      'hex'
    )
  ) stored,
  estado_validacion text not null default 'PENDIENTE',
  capturado_at timestamptz not null default now(),
  validado_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staging_electoral_resultados_padre_carga_fk
    foreign key (registro_staging_id, carga_id)
    references public.staging_electoral_registros(registro_staging_id, carga_id)
    on delete cascade,
  constraint staging_electoral_resultados_tabla_formato_ck
    check (tabla_origen ~ '^[a-z][a-z0-9_]*$'),
  constraint staging_electoral_resultados_tabla_padre_formato_ck
    check (tabla_padre_origen ~ '^[a-z][a-z0-9_]*$'),
  constraint staging_electoral_resultados_ids_origen_ck
    check (id_origen > 0 and id_padre_origen > 0),
  constraint staging_electoral_resultados_fuerza_original_ck
    check (length(btrim(fuerza_original)) > 0),
  constraint staging_electoral_resultados_fuerza_codigo_ck check (
    fuerza_codigo_normalizado is null
    or (
      fuerza_codigo_normalizado = upper(fuerza_codigo_normalizado)
      and fuerza_codigo_normalizado ~ '^[A-Z0-9_]+$'
    )
  ),
  constraint staging_electoral_resultados_votos_ck
    check (votos is null or votos >= 0),
  constraint staging_electoral_resultados_payload_objeto_ck
    check (jsonb_typeof(payload_origen) = 'object'),
  constraint staging_electoral_resultados_estado_ck
    check (estado_validacion in ('PENDIENTE', 'VALIDO', 'OBSERVADO', 'CUARENTENA')),
  constraint staging_electoral_resultados_metadata_objeto_ck
    check (jsonb_typeof(metadata) = 'object'),
  constraint staging_electoral_resultados_origen_version_uq
    unique (proyecto_origen, tabla_origen, id_origen, payload_sha256),
  constraint staging_electoral_resultados_id_carga_uq
    unique (resultado_staging_id, carga_id)
);

create table public.staging_electoral_incidencias (
  incidencia_id bigint generated always as identity primary key,
  carga_id uuid not null
    references public.cargas_electorales(carga_id) on delete cascade,
  registro_staging_id bigint,
  resultado_staging_id bigint,
  codigo text not null,
  severidad text not null,
  detalle jsonb not null default '{}'::jsonb,
  resuelta boolean not null default false,
  comentario_resolucion text,
  resuelta_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint staging_electoral_incidencias_registro_carga_fk
    foreign key (registro_staging_id, carga_id)
    references public.staging_electoral_registros(registro_staging_id, carga_id)
    on delete cascade,
  constraint staging_electoral_incidencias_resultado_carga_fk
    foreign key (resultado_staging_id, carga_id)
    references public.staging_electoral_resultados(resultado_staging_id, carga_id)
    on delete cascade,
  constraint staging_electoral_incidencias_objeto_ck
    check (registro_staging_id is not null or resultado_staging_id is not null),
  constraint staging_electoral_incidencias_codigo_ck
    check (codigo = upper(codigo) and codigo ~ '^[A-Z0-9_]+$'),
  constraint staging_electoral_incidencias_severidad_ck
    check (severidad in ('AVISO', 'OBSERVACION', 'ERROR')),
  constraint staging_electoral_incidencias_detalle_objeto_ck
    check (jsonb_typeof(detalle) = 'object'),
  constraint staging_electoral_incidencias_resolucion_ck check (
    (not resuelta and resuelta_at is null)
    or (resuelta and resuelta_at is not null)
  )
);

create trigger cargas_electorales_set_updated_at
  before update on public.cargas_electorales
  for each row execute function territorial_private.set_updated_at();
create trigger staging_electoral_registros_set_updated_at
  before update on public.staging_electoral_registros
  for each row execute function territorial_private.set_updated_at();
create trigger staging_electoral_resultados_set_updated_at
  before update on public.staging_electoral_resultados
  for each row execute function territorial_private.set_updated_at();
create trigger staging_electoral_incidencias_set_updated_at
  before update on public.staging_electoral_incidencias
  for each row execute function territorial_private.set_updated_at();

create index staging_electoral_registros_carga_estado_idx
  on public.staging_electoral_registros (carga_id, estado_validacion);
create index staging_electoral_registros_ubicacion_idx
  on public.staging_electoral_registros (
    anio,
    clave_municipio_origen,
    seccion_numero
  );
create index staging_electoral_registros_origen_actual_idx
  on public.staging_electoral_registros (
    proyecto_origen,
    tabla_origen,
    id_origen,
    capturado_at desc,
    registro_staging_id desc
  );
create index staging_electoral_registros_eleccion_idx
  on public.staging_electoral_registros (eleccion_id)
  where eleccion_id is not null;
create index staging_electoral_registros_municipio_idx
  on public.staging_electoral_registros (municipio_id)
  where municipio_id is not null;
create index staging_electoral_registros_seccion_idx
  on public.staging_electoral_registros (seccion_id)
  where seccion_id is not null;

create index staging_electoral_resultados_carga_estado_idx
  on public.staging_electoral_resultados (carga_id, estado_validacion);
create index staging_electoral_resultados_padre_idx
  on public.staging_electoral_resultados (
    proyecto_origen,
    tabla_padre_origen,
    id_padre_origen,
    carga_id
  );
create index staging_electoral_resultados_registro_idx
  on public.staging_electoral_resultados (registro_staging_id, carga_id)
  where registro_staging_id is not null;
create index staging_electoral_resultados_fuerza_codigo_idx
  on public.staging_electoral_resultados (fuerza_codigo_normalizado)
  where fuerza_codigo_normalizado is not null;
create index staging_electoral_resultados_fuerza_idx
  on public.staging_electoral_resultados (fuerza_id)
  where fuerza_id is not null;
create unique index staging_electoral_resultados_padre_fuerza_uq
  on public.staging_electoral_resultados (
    registro_staging_id,
    fuerza_codigo_normalizado
  )
  where registro_staging_id is not null
    and fuerza_codigo_normalizado is not null;

create index staging_electoral_incidencias_abiertas_idx
  on public.staging_electoral_incidencias (
    carga_id,
    severidad,
    codigo,
    created_at
  )
  where not resuelta;
create index staging_electoral_incidencias_registro_idx
  on public.staging_electoral_incidencias (registro_staging_id, carga_id)
  where registro_staging_id is not null;
create index staging_electoral_incidencias_resultado_idx
  on public.staging_electoral_incidencias (resultado_staging_id, carga_id)
  where resultado_staging_id is not null;

alter table public.cargas_electorales enable row level security;
alter table public.staging_electoral_registros enable row level security;
alter table public.staging_electoral_resultados enable row level security;
alter table public.staging_electoral_incidencias enable row level security;

revoke all on table
  public.cargas_electorales,
  public.staging_electoral_registros,
  public.staging_electoral_resultados,
  public.staging_electoral_incidencias
from public, anon, authenticated;

grant select, insert, update, delete on table
  public.cargas_electorales,
  public.staging_electoral_registros,
  public.staging_electoral_resultados,
  public.staging_electoral_incidencias
to service_role;

revoke all on sequence
  public.staging_electoral_registros_registro_staging_id_seq,
  public.staging_electoral_resultados_resultado_staging_id_seq,
  public.staging_electoral_incidencias_incidencia_id_seq
from public, anon, authenticated;

grant usage, select on sequence
  public.staging_electoral_registros_registro_staging_id_seq,
  public.staging_electoral_resultados_resultado_staging_id_seq,
  public.staging_electoral_incidencias_incidencia_id_seq
to service_role;

comment on table public.cargas_electorales is
  'Control reanudable y conciliable de cada extracción electoral.';
comment on table public.staging_electoral_registros is
  'Cabeceras electorales fieles al origen, versionadas por la huella canónica del payload.';
comment on table public.staging_electoral_resultados is
  'Líneas de votación fieles al origen; pueden ingresar antes de enlazar su cabecera.';
comment on table public.staging_electoral_incidencias is
  'Observaciones reproducibles de calidad sin alterar la evidencia importada.';

;
