create table public.cartografia_versiones (
  cartografia_version_id bigint primary key
);

create table public.territorios_secciones (
  seccion_id bigint primary key
);

create table public.cartografia_secciones (
  cartografia_seccion_id bigint primary key,
  cartografia_version_id bigint not null,
  seccion_id bigint not null,
  geom extensions.geometry(MultiPolygon, 4326) not null,
  unique (cartografia_seccion_id, cartografia_version_id, seccion_id)
);

create table public.cartografia_localidades (
  cartografia_localidad_id bigint primary key
);

create table public.cartografia_limites_localidad (
  cartografia_limite_localidad_id bigint primary key
);
