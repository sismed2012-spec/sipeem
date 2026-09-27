begin;
create extension if not exists btree_gist with schema extensions;
set local search_path = pg_catalog, public, extensions;
alter table public.cartografia_secciones_equivalencias
  add constraint cartografia_equivalencias_tipo_excl
  exclude using gist (
    cartografia_version_origen_id extensions.gist_int8_ops with =,
    cartografia_seccion_origen_id extensions.gist_int8_ops with =,
    cartografia_version_destino_id extensions.gist_int8_ops with =,
    ((tipo = 'SIN_EQUIVALENCIA')) extensions.gist_bool_ops with <>
  ) not deferrable;
commit;
