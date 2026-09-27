do $roles$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end
$roles$;

create table public.demografia_fuentes (
  demografia_fuente_id bigint primary key,
  proveedor text not null,
  conjunto text not null,
  anio_censal integer not null,
  estado text not null,
  published_at timestamptz
);

create table public.cartografia_versiones (
  cartografia_version_id bigint primary key,
  clave text not null,
  estado text not null,
  es_predeterminada boolean not null,
  fecha_corte date not null
);

create table public.demografia_localidades (
  demografia_localidad_id bigint primary key,
  demografia_fuente_id bigint not null,
  clave_entidad text not null,
  clave_municipio text not null,
  clave_localidad text not null,
  nombre_municipio text not null,
  nombre_localidad text not null,
  pobtot bigint,
  latitud numeric not null,
  longitud numeric not null
);

create table public.demografia_localidad_correspondencias (
  demografia_localidad_correspondencia_id bigint primary key,
  demografia_fuente_id bigint not null,
  demografia_localidad_id bigint not null,
  cartografia_version_id bigint not null,
  cartografia_localidad_id bigint,
  estado text not null,
  metodo text not null,
  secciones_candidatas integer not null,
  cobertura_estricta boolean not null,
  distancia_metros numeric,
  similitud_nombre numeric,
  confianza numeric not null,
  evidencia jsonb not null
);

create table public.cartografia_localidades (
  cartografia_localidad_id bigint primary key,
  cartografia_version_id bigint not null,
  nombre text not null
);

create table public.cartografia_municipios (
  cartografia_municipio_id bigint primary key,
  cartografia_version_id bigint not null,
  municipio_id bigint not null,
  clave_municipio text not null,
  nombre text not null
);

create table public.cartografia_secciones (
  cartografia_seccion_id bigint primary key,
  cartografia_version_id bigint not null,
  seccion_id bigint not null,
  numero integer not null,
  cartografia_municipio_id bigint not null,
  municipio_id bigint not null
);

create table public.demografia_localidad_correspondencia_secciones (
  demografia_localidad_correspondencia_id bigint not null,
  cartografia_seccion_id bigint not null,
  cartografia_version_id bigint not null,
  seccion_id bigint not null,
  tipo_contacto text not null,
  area_interseccion numeric not null,
  proporcion_localidad numeric not null,
  evidencia jsonb not null
);

grant select on all tables in schema public to service_role;

insert into public.demografia_fuentes values
  (1, 'INEGI', 'CPV2020_ITER', 2020, 'PUBLICADA', '2026-09-26T00:00:00Z');

insert into public.cartografia_versiones values
  (4025, 'INE_EDOMEX_2026', 'PUBLICADA', true, '2026-09-01'),
  (4024, 'INE_EDOMEX_2025', 'ARCHIVADA', false, '2025-09-01');

insert into public.demografia_localidades values
  (77, 1, '15', '091', '0001', 'TENANGO DEL VALLE', 'SAN MIGUEL', 6404, 19.10, -99.59),
  (78, 1, '15', '091', '0002', 'TENANGO DEL VALLE', 'LA LOMA', 350, 19.11, -99.58),
  (79, 1, '15', '091', '0003', 'TENANGO DEL VALLE', 'SIN COINCIDENCIA', 200, 19.12, -99.57),
  (80, 1, '15', '091', '0004', 'TENANGO DEL VALLE', 'DIRECTA', 100, 19.13, -99.56);

insert into public.cartografia_localidades values
  (7001, 4025, 'SAN MIGUEL CARTOGRAFICO');

insert into public.cartografia_municipios values
  (5001, 4025, 150, '091', 'TENANGO DEL VALLE');

insert into public.cartografia_secciones values
  (8216, 4025, 8397, 4488, 5001, 150),
  (8217, 4025, 8398, 4489, 5001, 150);

insert into public.demografia_localidad_correspondencias values
  (99, 1, 77, 4025, 7001, 'MULTISECCION', 'ESPACIAL', 2, false, 14.25, 0.91, 0.75, '{"weighted":false}'),
  (100, 1, 78, 4025, null, 'REVISION_MANUAL', 'NOMBRE_COORDENADA', 1, false, 50, 0.74, 0.60, '{}'),
  (101, 1, 79, 4025, null, 'SIN_CORRESPONDENCIA', 'SIN_MATCH', 0, false, null, null, 0, '{}'),
  (102, 1, 80, 4025, 7001, 'DIRECTA', 'ESPACIAL', 1, true, 0, 1, 1, '{}'),
  (103, 1, 79, 4024, null, 'SIN_CORRESPONDENCIA', 'SIN_MATCH', 0, false, null, null, 0, '{}');

insert into public.demografia_localidad_correspondencia_secciones values
  (99, 8216, 4025, 8397, 'AREA', 125.5, 0.65, '{"weighted":false}'),
  (99, 8217, 4025, 8398, 'BORDE', 0, 0, '{"weighted":false}'),
  (100, 8216, 4025, 8397, 'AREA', 25, 0.25, '{}');
